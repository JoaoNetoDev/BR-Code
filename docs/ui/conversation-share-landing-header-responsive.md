# Layout responsivo do Header da página de compartilhamento

## Objetivo

Ao ajustar a largura do navegador entre telas estreitas e largas, a landing page de compartilhamento mantém `ZCode`, o título do compartilhamento e o botão「去 ZCode 继续」movendo-se na mesma trilha contínua. A altura da barra superior, a elipse em linha única do título e a usabilidade do botão permanecem estáveis durante a transição, sem saltos ao passar do layout estreito para o largo.

## Contrato de layout

A barra superior usa um shell de largura total com altura fixa. Marca, título e botão de continuar estão sempre montados e são controlados pelas mesmas variáveis geométricas de posição:

```text
Tela estreita p=0            Transição p∈(0,1)                Tela larga p=1
arranjo em linha na área      marca/botão se deslocam          marca/botão encostam
de conteúdo                    continuamente para as bordas     nas bordas da viewport
```

`p` é calculado a partir da largura útil realmente medida, sem usar um único breakpoint de CSS. Cada lado avalia seu próprio espaço seguro: quando a gutter esquerda comporta `ZCode`, a margem e o espaçamento seguro, a marca permanece ancorada no lado esquerdo da viewport; só quando a gutter esquerda é insuficiente a marca recolhe ao longo da trilha para a área de conteúdo. O CTA da direita usa a mesma regra independente. O limite esquerdo do título interpola entre o espaçamento seguro à direita da marca e a borda esquerda da área de conteúdo do corpo; o limite direito do título é o menor entre a borda direita da área de conteúdo do corpo e o espaçamento seguro à esquerda do botão.

O título é sempre exibido em uma única linha com ellipsis nativo. Durante o redimensionamento da janela apenas a largura disponível do título muda, nunca a altura do Header, e marca, título e botão de continuar não são remontados ou desmontados via `display: none`.

## Proteção para janelas extremamente estreitas

Dentro da faixa estreita coberta pelas capturas de tela, o botão de continuar mantém o texto completo e a área de clique. Somente quando a largura real fica abaixo da largura mínima segura do botão entra no estado compacto; o estado compacto preserva o nome acessível e a área de clique, sendo obtido pela redução do texto, sem remover o botão instantaneamente do layout.

## Contrato de troca de tema

O Header mantém à direita um botão de tema com ícone, localizado antes de「去 ZCode 继续」; mesmo sem botão de continuar no compartilhamento somente leitura, o botão de tema continua exibido. O botão mostra ícone de sol ou lua conforme o tema atualmente resolvido e descreve a próxima ação por meio de `aria-label` e `title`.

- O ponto de entrada do compartilhamento lê primeiro `zcode-theme`, com padrão `zai-light` quando não há preferência salva; `system` continua sendo resolvido conforme a preferência do sistema.
- Clicar no botão de tema alterna o tema resolvido atual para um `zai-light` ou `zai-dark` explícito, sincronizando a classe de tema do nó raiz, os metadados de tema do navegador e o valor persistido em `zcode-theme`.
- O botão de continuar usa apenas `bg-primary text-primary-foreground`: tema claro é fundo preto com texto branco, tema escuro é fundo branco com texto preto.
- O botão de tema e o botão de continuar participam juntos da medição geométrica direita; não podem espremer o título nem ficar ocultos em telas estreitas.

## Restrições de implementação

- `ResizeObserver` atualiza apenas valores geométricos contínuos ou custom properties CSS, sem alternar enums de layout discretos a cada mudança de largura.
- Durante a transição a posição é guiada por transform ou variáveis CSS, evitando que marca e CTA voltem a participar do layout flex e empurrem o título.
- O Header usa `text-ui-*`, cores semânticas e o espaçamento de rail existente; não introduz tamanhos de fonte arbitrários nem cores hardcoded.
- Os CTAs em chinês e em inglês participam da medição com suas larguras intrínsecas reais.
- Quando o compartilhamento somente leitura não tem botão de continuar, a trilha direita permanece vazia, mas marca e título continuam usando o mesmo conjunto de cálculos geométricos.
- Esta mudança pertence apenas à camada de apresentação da landing page de compartilhamento web e não altera o protocolo de compartilhamento, deep links, o continuous do Desktop, `/remote` no celular ou o comportamento de workspace remoto.

## Aceitação

- Sem overflow horizontal nas larguras 320px, 768px, 1280px, 1920px e 2560px.
- Ao arrastar a janela continuamente de estreito para largo e de largo para estreito, as coordenadas horizontais da marca e do CTA variam de forma monótona; permanecem ancoradas por fora enquanto houver espaço do lado correspondente e só começam a recolher para a área de conteúdo quando o espaço for insuficiente.
- A altura e o centro vertical do Header permanecem estáveis; o título não cobre o CTA e o CTA não cobre o título.
- Passam: chinês, inglês, título longo, título curto, compartilhamento somente leitura, compartilhamento importável, temas claro e escuro.
- Sem preferência de tema a abertura é clara; após clicar no botão de tema a página, o conteúdo Markdown e o estilo dos botões trocam em conjunto, e a escolha é mantida após o refresh.
- Sob `prefers-reduced-motion` não há easing adicional, mas as posições geométricas continuam sendo atualizadas continuamente.