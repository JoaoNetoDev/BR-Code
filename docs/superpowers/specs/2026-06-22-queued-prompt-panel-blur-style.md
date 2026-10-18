# Estilo de Blur do Painel de Prompts Enfileirados

## Contexto

O painel de fila fica acima do composer e forma uma sobreposição com a caixa de entrada por meio de `-mb-7 pb-7`. O estilo antigo usava `shadow-xl/5` para reforçar a hierarquia, mas no tema escuro isso fazia o painel de fila e a caixa de entrada parecerem dois cartões independentes.

## Objetivo

- O painel de fila deixa de usar sombra para criar hierarquia.
- O painel de fila mantém `rounded-t-2xl` e a sobreposição existente; na migração para a v4, adota o `bg-surface backdrop-blur-md` do painel de fila do repositório antigo, deixando o fundo do painel com uma camada de blur, mas sem depender de sombra.
- Não modificar outros painéis inferiores, como composer, permission, elicitation, quota e error banner.

## Restrições de Compatibilidade

- Desktop e Web no celular usam o mesmo estilo de painel de fila.
- Os temas claro/escuro continuam usando tokens surface semânticos, sem adicionar cores hardcoded.
- Não alterar a ordenação, o envio imediato, a edição ou a remoção dos prompts enfileirados.