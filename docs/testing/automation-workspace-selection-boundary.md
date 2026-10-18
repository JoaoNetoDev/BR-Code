# Limite de seleção de workspace em tarefas agendadas

## Resumo da funcionalidade/mudança

A criação manual de tarefa agendada precisa estar vinculada a um projeto real. `AutomationEditView` pode reutilizar o menu de workspace do rascunho de sessão comum, mas não pode herdar a entrada "alternar para um workspace que não é projeto". Esta correção apenas fecha o limite de capacidade do chamador, sem alterar workspace, session, stream, queue ou o protocolo de controle remoto.

## Registro de esclarecimentos

| Questão                                                                                  | Confirmação do usuário | Limite fixado                                                             |
| --------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------- |
| O `X` da captura de tela deve ser ocultado globalmente ou apenas em tarefas agendadas?    | Apenas em tarefas agendadas | Sessões comuns mantêm a interação original de substituição em hover/focus |
| O menu suspenso de tarefa agendada permite "trabalhar fora do projeto"?                    | Não                    | Tarefa agendada não pode entrar no conversation backing workspace          |
| Outras entradas devem acompanhar a mudança?                                            | Os demais pontos permanecem normais | Sessões comuns continuam exibindo `X` e o item de menu   |

## Escopo de domínio e responsáveis pelo estado

| Domínio                                             | Responsável pelo estado                                        | Tratamento nesta rodada                                       |
| --------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------- |
| UI shell / seletor de workspace                     | props de `ChatEmptyWorkspacePreviewMenu` + estado de render do renderer | Acrescenta guarda completa de capacidade de seleção de conversation-workspace |
| Formulário de automação                             | `AutomationEditView`                                           | Desliga explicitamente essa capacidade                        |
| Workspace de conversa                               | `WorkspaceShellLayout` + purpose da aba                         | Mantém o padrão ligado, sem mudar a lógica de troca de alvo    |
| Host / Agent / protocolo / persistência             | autoridade já existente de workspace/session                    | Sem mudança; a desativação da entrada ocorre antes da admissão na UI do renderer |

## Sequência de estado e eventos

```text
rascunho comum                         formulário manual de automação
      |                                         |
      | capability = enabled                    | capability = disabled
      v                                         v
hover/focus no chip do projeto           hover/focus no chip do projeto
      |                                         |
      +-> ícone do projeto desvanece           +-> ícone do projeto permanece
      +-> X de desvinculação aparece           +-> nenhum X de desvinculação
      +-> menu tem trabalhar-fora-do-projeto    +-> menu omite trabalhar-fora-do-projeto
```

## Combinações candidatas e poda

| Candidato | Superfície                    | Capacidade    | Resultado esperado                                                    | Status                              |
| --------- | ----------------------------- | ------------- | -------------------------------------------------------------------- | ----------------------------------- |
| AWS01     | rascunho comum de projeto     | enabled       | `X` e "trabalhar fora do projeto" disponíveis; ícone do projeto desvanece em hover/focus | accepted |
| AWS02     | criação manual de tarefa agendada | disabled  | `X` e "trabalhar fora do projeto" ausentes; ícone do projeto sempre visível | accepted |
| AWS03     | edição de tarefa agendada existente | workspace travado | Continua usando botão desabilitado, sem entrar no menu reutilizado | pruned: guarda de edição existente |

Tema, locale e sistema operacional não alteram se a entrada existe; isso é coberto pelo contrato compartilhado de class/i18n, sem produto cartesiano. O seletor de tarefa agendada já desligou a entrada remota, portanto não se combina com SSH/WSL/Docker, `workspaceIdentity` ou restauração mobile replayable. O isolamento de identidade remota das sessões comuns continua coberto por CWP07/CWP08.

## Casos aceitos e evidências

| Caso         | Configuração                              | Ação                                | Asserções                                                          | Evidência                                                                        | Status E2E                                          |
| ------------ | ----------------------------------------- | ----------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------- | --------------------------------------------------- |
| CWP11 / AWS01 | rascunho comum de projeto                 | hover/focus no chip, abrir o menu   | classe de desvanecimento do ícone presente; desvinculação e item de menu presentes | focused render test + contrato de DOM                                           | partial-unit                                        |
| CWP11 / AWS02 | capacidade de criação manual de tarefa agendada | hover/focus no chip, abrir o menu | classe de desvanecimento ausente; desvinculação e item de menu ausentes | focused render test + fiação de capacidade de `AutomationEditView`            | partial-unit; falta caso representativo de GUI desktop |

## Handoff para E2E

O caso representativo seguinte de GUI desktop basta abrir "Tarefa agendada → criar manualmente" e inspecionar o chip de workspace e o menu expandido; esse caminho não envia prompt, então a política de requisição ao provider deve ser declarada como `none`. Não são necessários fixture de provider, workspace remoto ou timing de SSE.