# Model Provider Context Window Badge

A lista de modelos da página de configurações de provedores de modelo exibe a capacidade da janela de contexto embutida à direita do campo de entrada de ID do modelo.

## Regras de exibição

- Usa o formato compacto de capacidade em tokens: em inglês, como `128K`, `200K`, `1M`, `1.5M`; em chinês, como `12.8万`, `20万`, `100万`, `150万`.
- O formato de capacidade em tokens é localizado conforme o locale; o inglês usa `K` / `M` / `B` e o chinês usa `万` / `亿`.
- Modelos com o sufixo `[1m]` seguem a regra de runtime que força a janela de contexto de 1.000.000; a unidade exibida continua acompanhando o locale.
- O significado completo é exposto por um rótulo acessível como `Janela de contexto: {value}` / `Context window: {value}`.

## Regras de layout

- O pill de capacidade permanece dentro do campo de entrada de ID do modelo, evitando adicionar largura de coluna à lista.
- Reserva-se espaço fixo à direita do campo de entrada; IDs de modelo longos ainda fazem o próprio campo encolher.
- Usa tokens semânticos: `bg-surface`, `border-border`, `text-foreground-subtle`, compatíveis com os temas claro e escuro.