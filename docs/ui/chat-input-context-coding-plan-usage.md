# Uso do Coding Plan no Context da Caixa de Entrada do Chat

## Contexto

A camada flutuante de uso de context da caixa de entrada do chat pode exibir simultaneamente o uso de contexto da tarefa atual, o saldo diário do Start Plan e a quota restante do Coding Plan. O footer da barra lateral não exibe mais Usage Remaining, para evitar duplicar a entrada com a página Usage e o context da caixa de entrada.

A camada da caixa de entrada é diferente: ela fica próxima do modelo usado no envio da mensagem atual, portanto a quota restante do Coding Plan exibida precisa acompanhar o model provider atualmente selecionado pelo usuário, e não pode aparecer só porque existe outro entitlement de Coding Plan na conta.

## Regras

- Quando o model provider selecionado é `builtin:zai-coding-plan`, a camada de context usage pode exibir a quota restante do Z.ai Coding Plan.
- Quando o model provider selecionado é `builtin:bigmodel-coding-plan`, a camada de context usage pode exibir a quota restante do BigModel Coding Plan.
- Quando o método de conexão do family BigModel atual tem `team-plan:builtin:bigmodel-coding-plan:*` selecionado, a camada de context usage deve exibir a quota restante do projeto de equipe desse Team Plan; a ausência de entitlement no Coding Plan pessoal não pode fazer a entrada da camada do Team Plan desaparecer.
- Quando o model provider selecionado é Start Plan, uma API Key comum, um provider personalizado ou qualquer outro provider que não seja Coding Plan, a quota restante do Coding Plan pago não é exibida.
- O Start Plan continua usando seu painel de saldo independente, sem reutilizar a exibição de quota do Coding Plan pago.
- O footer da barra lateral mantém apenas a entrada de upgrade/renovação e o badge de plano ao lado da conta; os detalhes de quota restante são vistos na página Usage ou no context da caixa de entrada.

## Restrições de Implementação

- O Coding Plan provider do context usage é resolvido a partir do valor do modelo atual ou da custom supplier key.
- O resultado da resolução aceita apenas provider id de Coding Plan pago; o Start Plan não é mapeado de volta para o Coding Plan pago da mesma marca.
- O BigModel Team Plan não é um novo provider id; ele reutiliza o catálogo de modelos `builtin:bigmodel-coding-plan`, mas expressa o projeto de equipe específico pela team source key em `modelProviderFamilySelectedKeys.bigmodel`.
- A consulta de quota do Team Plan deve enviar o `organizationId` / `projectId` correspondente, para que a camada de serviço copie e use a API Key do projeto de equipe; não pode usar apenas o contexto pessoal/default de `builtin:bigmodel-coding-plan`.
- O provider e o entitlement passados ao context panel devem ser filtrados para o Coding Plan provider pago correspondente ao modelo atual ou para a team source do Team Plan, evitando que `resolveCodingPlanUsageRemainingState` caia automaticamente em outro provider com entitlement.

## Layout da Camada de Quota

- A camada de context usage usa fixamente `w-80` (320px) e não pode ser alargada pela chegada da quota do MCP de servidor oficial.
- 5 horas, Weekly, Tool calls e o Server MCP oficial compartilham uma grade de quota com no máximo três colunas: quando há menos de três quotas principais, o MCP entra na mesma linha e, conforme o total de cartões, usa de uma a três colunas; quando já existem três quotas principais, o MCP ocupa a linha seguinte atravessando as três colunas.
- Quando MCP e quotas principais estão na mesma linha, usa-se a mesma estrutura vertical de cartão: título com ícone de info, percentual restante com data de reset e barra de progresso; quando atravessa a linha inteira, a ordem compacta é `ZCode MCP → percentual restante · data de reset → barra de progresso`.
- O percentual e a barra de progresso da linha do MCP continuam usando a leitura de "restante"; a barra de progresso reaproveita o amarelo quente `--color-usage-chart-5` da paleta de gráficos, e não se mantém mais uma variável de cor específica do MCP. É permitido truncar quando falta espaço para a data, e a barra de progresso preserva prioritariamente uma largura legível.
- Quando já existem 3 quotas principais, a largura da barra de progresso da linha completa do MCP deve ser igual à barra de progresso de um cartão individual acima, seguindo a mesma métrica de `(100% - 16px) / 3` e a grade `gap-2`.
- A linha completa do MCP não usa um contêiner de fundo próprio; ela é separada das três quotas acima pela linha `border-border` no topo. Cartões na mesma linha não recebem divisor adicional, mantendo o mesmo ritmo de grade das quotas vizinhas.
- O nome `ZCode MCP` é consistente com os títulos "5 horas / semanal" acima, usa `text-foreground-subtle` e não recebe negrito adicional; não há gradiente dourado nem efeito de brilho, e o amarelo fica somente na barra de progresso.
- O nome `ZCode MCP` é seguido de imediato pelo ícone de info; ao passar o mouse ou focar pelo teclado, o `ControlHintTooltip` unificado exibe "quota diária total dos plugins MCP pré-instalados do ZCode". O texto explicativo precisa suportar internacionalização em chinês e inglês, e o ícone não pode comprimir o espaço do percentual restante e da barra de progresso à direita.
- Desktop e Web mobile compartilham o mesmo layout compacto, sem adicionar ramificações de largura específicas de uma única plataforma.