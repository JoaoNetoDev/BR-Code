# Renderização de ferramentas Shell não classificadas

## Feature/change summary

| Campo                 | Valor                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| Mudança                | Corrige a oscilação na conversa v4, em que a ferramenta Shell é exibida primeiro como Bash/Shell comum, antes de o command chegar, e depois é fundida em "Explorar" |
| Superfícies visíveis ao usuário | Itens de trabalho de conversa `desktop-continuous` do desktop, Web comum e `web-remote-replayable` do `/remote` no celular |
| Dono do estado           | A projection do CLI v4 mantém o `ToolCallRow`; o renderer apenas deriva se a row atual está visível e se pertence a Explore |
| Fora de escopo          | Não modificar o protocolo de tool input, o ritmo dos deltas, o momento de execução das ferramentas, permission, relay/main nem o schema de snapshot |

## Log de esclarecimentos

| Rodada | Pergunta | Resposta do usuário | Limite fixado | Necessita acompanhamento |
| ----- | ------------------------------------------------ | --------------- | ------------------------------------------------------------- | ---------------- |
| 1     | Tratar apenas de Bash ou de toda a família Shell | Todos os tipos de Shell | Tratamento unificado por `resolveToolCallIdentity(...).family === "shell"` | no |
| 1     | Exibir quando falha em definitivo ou é recusada e nunca teve command | Exibir | Resultados de erro/recusa têm prioridade sobre a regra de ocultação por classificação pendente | no |
| 1     | desktop continuous e mobile replayable são iguais | Igual | Os dois delivery profiles usam o mesmo contrato de visibilidade do renderer | no |

## Escopo do domínio e mapa de conceitos

| Domínio/conceito | Dono | Contrato |
| ----------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| Comportamento de conversa/sessão | CLI ProductProjection | `tool_input_start` pode gerar primeiro um `ToolCallRow` apenas com o nome da ferramenta, sem command |
| Renderização/performance | renderer `buildAssistantWorkRenderItems` | Shell não classificado é um estado de entrada temporário, não a classificação final de produto de um Shell comum |
| Permission/ferramenta | shared tool identity | Todas as ferramentas Shell convergem pela family; ferramentas não Shell como Read/Write não são afetadas |
| Mobile replayable | delivery profile + renderer | replayable pode filtrar deltas `inputText` ao vivo, mas usa as mesmas regras de classificação depois que o upsert/snapshot final chega |

```text
tool_input_start { toolName: Shell, command: absent }
  -> ToolCallRow(inputStreaming)
  -> renderer: defer

tool input becomes classifiable
  |-- readonly command -> Explore group
  `-- other command    -> Execute group

tool reaches error/denied without command
  -> visible error row
```

## Dimensões e decisões candidatas

| ID do candidato | Estado da row | Entrada Shell | Efeito esperado | Status |
| ------------ | ------------------------------------------ | -------------------- | ------------------------------------------------------- | -------- |
| USR01 | `inputStreaming` / `running` | command ausente | Não gera item de trabalho visível, aguardando atualizações posteriores da row | accepted |
| USR02 | nonterminal | command readonly | Entra imediatamente no grupo Explore pelas regras já existentes | accepted |
| USR03 | nonterminal | command não-readonly | Entra imediatamente no grupo Execute | accepted |
| USR04 | `error` / resultado recusado | command ausente | Exibe a row de erro do Shell, sem engolir o corpo do erro | accepted |
| USR05 | desktop continuous / web remote replayable | Qualquer um dos estados terminais acima | A mesma entrada de row produz o mesmo resultado visível; sem alterar a semântica de delivery de cada um | accepted |

## Decisões de poda

| ID da decisão | Combinações podadas | Guard/invariante | Cobertura representativa |
| ----------- | -------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------- |
| USR-P01 | Todas as permutações de nomes de ferramentas como Bash/execute/shell | `resolveToolCallIdentity` já os converge para a family Shell | Caso representativo de family + testes de identity já existentes |
| USR-P02 | Tipos de theme/locale/OS/workspace | O guard é uma derivação pura de row, sem texto, sem layout e sem dependência de plataforma | focused renderer unit test |
| USR-P03 | Todas as permutações de rede continuous/replayable | Esta mudança não modifica o transport; o contrato de renderer da row final é o mesmo | renderer unit + teste de fechamento do profile STIP03 já existente |
| USR-P04 | Comportamento da UI de permission | permission/elicitation tem sua própria superfície de bloqueio; esta mudança decide apenas o item de trabalho da conversa | Testes de permission já existentes |

## Casos aceitos e evidências

| ID do caso | Setup | Ação | Asserções | Camadas de evidência | Status do E2E |
| ------- | --------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------- |
| STIP04 | Turno v4 em execução recebe `tool_input_start` de Shell, e input/inputText ainda não têm command | O renderer constrói os work items; em seguida são adicionados um command readonly e um command comum | O primeiro frame não tem Bash/Shell; após a atualização readonly só aparece Explore; após a atualização com command comum só aparece o grupo Execute | Derivação de row da UI + ordenação no runtime log | partial (focused unit) |
| STIP05 | Row de Shell sem command e com estado de error/denied | O renderer constrói os work items | A row de erro fica visível e o corpo do erro continua sendo exibido pela superfície de tool error | Adaptador de UI + renderização de tool error | partial (focused unit) |

## Handoff de E2E

- Nesta rodada não se adiciona E2E de conversa; o guard central é uma função determinística pura de row para item de render, coberta primeiro por focused unit tests.
- Se mais tarde o E2E oficial for ampliado, usar a fixture `controlled-stream` para enviar `tool_input_start` e o delta do command separadamente e afirmar simultaneamente que o texto Bash não existe no primeiro frame e que, após a classificação, aparece apenas um item de trabalho estável.
- A recuperação real de gap/snapshot no celular continua conforme STIP03, sem usar fixture desktop continuous para fingir prova de replayable físico.