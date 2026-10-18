# Logo do Estado Vazio de Nova Task

## Contexto

O título do estado vazio de New Task é a primeira dica de tela que o usuário vê ao entrar no projeto e começar a criar tarefas, e precisa ganhar a marca ZCode sem prejudicar a legibilidade do texto nem a estabilidade do layout.

## Abordagem

- Adicionar um logo SVG decorativo do ZCode atrás do texto de `ChatViewEmptyState`.
- O logo mantém a proporção original de `400x320px` e, no mobile, encolhe de forma adaptativa via `min(72vw, 25rem)`, evitando overflow horizontal.
- O contorno do logo usa `currentColor`, herdando a cor semântica `foreground-subtlest` do contêiner externo, com `opacity-70` sobreposto — um nível abaixo do `foreground` do corpo do texto —, adaptando-se automaticamente aos temas claro e escuro.
- O contêiner externo do logo fixa a proporção `400:320` e, por meio de arbitrary properties do Tailwind, define uma máscara CSS padrão e `-webkit-mask-image`, com o desvanecimento indo do topo até ficar completamente transparente na altura de `70%`, compatível com o caminho de renderização Electron/Chromium e evitando escrever a máscara diretamente no elemento SVG.
- O logo é deslocado para cima em relação ao centro do título por `-mt-10`, fazendo com que a figura decorativa fique principalmente atrás e acima do título, reduzindo a interferência visual da área de desvanecimento inferior na região de entrada.
- O logo usa `aria-hidden` e `pointer-events-none`, não participa da leitura de acessibilidade e não intercepta a entrada.
- O texto usa um nível mais alto, sobreposto por cima do logo, com fonte serifada `text-3xl` para reforçar a identidade de marca do estado vazio, mantendo inalterados os textos de internacionalização e o layout atuais.