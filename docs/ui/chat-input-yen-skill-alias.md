# Alias de skill com yen no input do chat

## Contexto

O campo de entrada do chat usa `$` para disparar o mention de skill. Em ambientes de entrada em chinês e japonês, o usuário pode digitar `¥` ou `￥` com mais facilidade, o que impede a exibição do painel de skills.

## Objetivos

- Quando o usuário digitar `¥` ou `￥` no campo de entrada do chat, tratá-los como alias de disparo de `$` para abrir o painel de mention de skill.
- O alias afeta apenas a semântica de reconhecimento do trigger; não reescreve para `$` o caractere digitado manualmente pelo usuário antes de a entrada entrar no editor.
- Após a seleção de um candidato, continua reutilizando a lógica existente de inserção do token de mention de skill `$` e de parsing de envio.
- O comportamento é consistente nos campos de entrada do desktop, da Web local e do controle remoto do celular.

## Limites

- A camada de extração do trigger reconhece `¥` / `￥` e os normaliza para o branch existente de trigger de skill `$`.
- Não é criado um novo tipo de trigger `¥`, nem um painel separado, nem alterada a origem dos candidatos de `$`.
- Não se modificam o protocolo nem a camada de parsing do agent; após a seleção do candidato, o markdown do mention continua usando a semântica `$skill` existente.

## Compatibilidade

- A lógica fica na camada de parsing de prompt trigger de `packages/ui`; desktop, Web local e controle remoto do celular reutilizam o mesmo componente de entrada e a mesma lógica de painel.
- Não envolve `@zcode/protocol` nem afeta session, fluxo de mensagens em tempo real continuous/replayable, snapshot do controle remoto ou task command queue.
- O comportamento original de `$` em digitação, correspondência, filtro e inserção de mention permanece inalterado.

## Aceitação

- Após digitar `¥`, o painel de mention de skill abre como o trigger de skill com query vazia do `$`.
- Após digitar `￥code`, os candidatos de skill são filtrados como em `$code`.
- Após selecionar o candidato, `¥code` / `￥code` é substituído pelo token de mention de skill existente, com markdown ainda equivalente a `$skill`.
- O conteúdo do editor não é reescrito para `$` no instante em que o usuário digita `¥`.
- O comportamento existente de normalização de `、` no início do texto inteiro para `/` permanece inalterado.