# Start Plan Preview Entitlements

## Problema

`client/configs.configs.startPlanPreview.entitlements` retorna um entitlement por modelo. Anteriormente, o cartão do
plano Trial colapsava essas entradas em um único resumo de cota e em uma string de modelos unidos por barra, de modo que
um plano trial com vários modelos podia esconder parte do detalhe dos entitlements.

## Comportamento esperado

- A entrada Start Plan continua visível para usuários desconectados, mas o cartão do plano Trial só é exibido quando `client/configs.configs.startPlanPreview` existe e contém entitlements exibíveis.
- O cartão do plano Trial usa o `startPlanPreview.name` remoto como título.
- O título do cartão de status do Start Plan comprado permanece `Start Plan` quando o nome do entitlement ativo é um entitlement Start, como `Start` ou `ZCode V3 Start Plan`.
- Se um entitlement Coding Plan pago for temporariamente renderizado pelo branch do provider Start Plan, o título do cartão de status usa o nome do entitlement/produto em vez do `Start Plan` fixo, para que usuários de Coding Plan pago vejam o nome real do seu plano.
- Todo entitlement `model_usage` exibível com `grantUnits` positivo e `showName` não vazio contribui com o nome do seu modelo para a lista de modelos suportados.
- A cota do hero é a soma de todos os `grantUnits` dos entitlements exibidos com a mesma unidade e período, e é exibida uma única vez como o total do plano Trial. O hero em inglês usa uma formulação compacta longa como `5 Million tokens per day`; o hero em chinês permanece localizado e compacto, como `500万 tokens/日`.
- A frase de detalhe mantém unidades de token compactas e agrupa modelos por `grantUnits` iguais: em inglês, se todos os modelos tiverem a mesma cota, mostrar `Daily quota · GLM-5.2 / GLM-5-Turbo 10M each`; se um modelo diferir, mostrar `Daily quota · GLM-5.2 30M · GLM-5-Turbo 10M`; o chinês usa `万` / `亿`.
- Se o `startPlanPreview` remoto estiver ausente, o cartão do plano Trial não é renderizado e nenhum texto local de cota fixo é usado.

## Compatibilidade

- Isso é apenas UI e não altera o comportamento de provider, stream, runtime ou controle remoto.
- O layout deve quebrar naturalmente no desktop e na web mobile, e continuar usando tokens semânticos de tema de `DESIGN.md`.