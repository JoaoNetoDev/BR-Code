# Política de execução flexível de ferramentas do agente

## Contexto

A análise de logs de 2026-06-29 mostrou que a primeira causa das falhas consecutivas de subagent não foi a rejeição de chamadas de ferramenta `Agent` do mesmo tipo, mas sim:

- `TodoWriteInputSchema` rejeitando múltiplos todos `in_progress` na camada de schema, fazendo `TodoWrite` falhar;
- `executeToolSchedule` gerando resultados skipped para os grupos de agendamento seguintes e interrompendo a execução após ver uma falha em uma ferramenta anterior que não era `concurrentSafe`.

As duas políticas truncam prematuramente as chamadas de ferramenta seguintes que o modelo produziu de uma só vez. Para que o agente possa continuar executando os tool calls que o modelo já enfileirou, esta alteração flexibiliza as duas políticas locais.

## Comportamento

- `TodoWrite` não rejeita mais múltiplos todos `in_progress` de forma rígida na camada de schema de runtime. `summary.inProgress` continua contando a quantidade real.
- A description visível ao provider de `TodoWrite` permanece igual, sem incentive ativo ao modelo para escrever vários `in_progress`.
- O agendamento de ferramentas é executado na ordem dos `parallelGroups` já existente. Depois que um grupo tem uma falha comum, os grupos seguintes não são mais pulados automaticamente; se as ferramentas seguintes podem rodar continua dependendo de suas próprias permissões, do sinal de cancelamento, de erros no handler e do agrupamento de agendamento.
- `turnControl.stopTurnAfterResult` é uma fronteira explícita de turn. Quando o resultado de uma ferramenta pede para parar o turn atual, os grupos de agendamento seguintes não executam handlers reais e geram resultados de cancelamento para fechar o histórico de tool calls visível ao provider.

## Não objetivos

- Não modificar a estrutura de armazenamento dos todos nem introduzir um task store baseado em id.
- Não estender a política de exibição de resumo na UI/TUI; se a interface hoje destaca apenas um `in_progress`, essa semântica de exibição não muda nesta alteração.
- Não remover o código das políticas antigas. As validações e os ramos de skip antigos são mantidos como comentários, para facilitar comparações futuras ou rollback.

## Aceitação

- Um `TodoWrite` com vários `in_progress` é gravado com sucesso e lido de volta.
- No plan mode, quando uma ferramenta de escrita anterior é rejeitada por permissão, as ferramentas somente leitura seguintes ainda são executadas e o resultado real é devolvido ao modelo.