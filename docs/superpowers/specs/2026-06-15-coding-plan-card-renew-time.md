# Tempo de Renovação do Plan Card do Coding Plan

## Contexto

O plan card do Coding Plan já comprado em Model Settings exibe três cartões de cota restante — 5h, 1w e MCP —, mas não mostra o tempo de renew/reset de cada bucket de cota. O painel "cota restante" da Sidebar já exibe esse mesmo tipo de tempo via `UsageQuotaLimit.nextResetTime`, o que faz a mesma informação de cota aparecer de forma inconsistente em dois pontos de entrada.

## Objetivos

- Os cartões de cota restante 5h, 1w e MCP do plan card do Coding Plan precisam exibir o tempo de renew.
- O tempo de renew é exibido à direita da porcentagem restante, na mesma linha da porcentagem, evitando adicionar uma linha extra de informação abaixo da barra de progresso.
- A origem do tempo é o `UsageQuotaLimit.nextResetTime` correspondente, e não é derivado do tempo de renovação da assinatura ou do tempo de expiração.
- O formato reaproveita o da cota restante da sidebar:
  - 5h usa dateTime: dentro do dia mostra apenas a hora, caso contrário mostra mês/dia e hora.
  - 1w usa date.
  - MCP usa date.
- Quando `nextResetTime` não é retornado ou o tempo é inválido, nenhum placeholder de tempo de renew é exibido.

## Não objetivos

- Não alterar a estrutura de campos do cartão de status da navegação lateral.
- Não alterar o cartão de saldo de modelos do Start Plan.
- Não adicionar novos campos de servidor nem de protocolo.

## Aceitação

- Na página de detalhes do Coding Plan já comprado, os três cartões de uso 5h, 1w e MCP exibem o tempo de renew correspondente quando há `nextResetTime`.
- O tempo de renew fica à direita da porcentagem; em telas pequenas ou idiomas longos, é permitido truncar dentro da mesma linha flex, sem esticar o cartão.
- O formato de exibição é consistente com o da cota restante da sidebar.
- `pnpm typecheck` e `pnpm lint` passam.