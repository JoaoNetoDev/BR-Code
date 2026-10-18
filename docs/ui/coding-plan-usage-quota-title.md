# Coding Plan Usage Layout

## Contexto

O painel Coding Plan da página de Usage exibe três cartões de cota: de 5 horas, semanal e de MCP. O corpo dos cartões mostra o percentual de cota restante e o horário de reset, não a cota total; por isso o título e o nome dos cartões precisam expressar claramente "restante" ou a semântica do tipo de cota.

A mesma página também exibe as séries temporais de Model Usage e Tool Usage. `today / 7d / 30d` afeta apenas esses dois grupos de tendência de uso e não pode cobrir visualmente o `Quota Remaining`, senão o usuário pode achar que trocar a faixa de tempo também filtra a cota restante.

## Especificação

- No cartão de plano do Model Provider, as linhas de subtítulo de 5 horas, semanal, tool calls e ZCode MCP usam uniformemente `min-h-6` (mínimo de 24px, crescendo com o conteúdo em fontes maiores), com texto, entrada de reset e ícone de info centralizados verticalmente; desktop e Web no celular compartilham essa altura.
- O painel de uso do Coding Plan exibe o título principal "Cota restante" acima do grupo de cartões de quota e, na mesma linha de título, o Coding Plan provider atual.
- O texto do título precisa passar pela internacionalização, sem hardcode direto no componente.
- `Quota Remaining` e `Usage Trends` usam um nível de título mais forte que Model Usage / Tool Usage.
- Os nomes dos cartões de quota expressam o período ou o tipo de cota restante: restante de 5 horas, restante semanal, tool calls.
- Os cartões de quota mantêm as fontes de dados e a lógica de cálculo existentes, continuando a exibir o percentual restante e o horário de reset.
- Model Usage e Tool Usage são agrupados na mesma região `Usage Trends`.
- `today / 7d / 30d` e o botão de atualização ficam na linha de título de `Usage Trends`, indicando que controlam os dados de tendência.
- A área do provedor não é mais exibida separadamente no topo; o nome do provider ou a entrada de troca entre múltiplos providers é incorporada à linha de título de `Quota Remaining`.
- `Quota Remaining` prioriza o snapshot de entitlement quota, sem depender do range snapshot de `Usage Trends`.
- Ao abrir `Settings -> Usage -> Coding Plan`, a página precisa corrigir ativamente o entitlement quota do provider atual; os dados de tendência da mesma página continuam sendo solicitados na montagem da página.
- O botão de atualização na linha de título de `Usage Trends` precisa atualizar tanto os dados de tendência quanto o entitlement quota do provider atual, evitando que os gráficos abaixo sejam atualizados enquanto `Quota Remaining` ainda exibe um snapshot antigo.
- Ao trocar `today / 7d / 30d` no mesmo provider, o snapshot de tendência anterior é preservado para evitar que o conteúdo da página pisque vazio.
- O desktop pode continuar com múltiplas colunas; em telas estreitas é preciso cair automaticamente para uma única coluna, evitando que os três cartões fiquem apertados no Web do celular.

## Aceitação

- Quando há qualquer cartão de quota a exibir, o grupo de cartões exibe acima dele o título principal de cota restante e o provider atual.
- Quando não há cartão de quota, a região de quota inteira ainda não é renderizada.
- Acima de Model Usage e Tool Usage aparece o título principal `Usage Trends`.
- O controle de troca `today / 7d / 30d` fica na linha de título de `Usage Trends`, e não na linha de provider do topo da página.
- Trocar `today / 7d / 30d` não faz a região `Quota Remaining` esvaziar nem piscar.
- Depois de entrar na página de Coding Plan Usage, o `Quota Remaining` faz uma correção ignorando o TTL compartilhado; após clicar no botão de atualizar, o `Quota Remaining` e os gráficos de tendência são atualizados juntos.
- Tanto a interface em inglês quanto em chinês exibem o texto de cota correspondente; a cota mensal de ferramentas MCP dentro do plano é exibida uniformemente como "tool calls / 工具调用", sem mais usar "MCP quota / MCP 额度"; a cota diária do Server MCP oficial e independente continua exibindo o nome de marca "ZCode MCP".
- Tanto nos usage stats quanto no cartão de plano do Model Provider, o título `ZCode MCP` é seguido de um ícone de info; ao passar o mouse ou focar pelo teclado, reaproveita `ControlHintTooltip` e `sidebar.usage.plan.zcodeMcpDescription`, garantindo consistência com a explicação de cota do contexto da caixa de entrada.