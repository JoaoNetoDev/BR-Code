# Primeiro envio do rascunho: a lista de tarefas e o detalhe são enviados juntos

## Comportamento e motivo

Decisão do usuário (2026-09-15): quando o rascunho é enviado, no fim do giro de sucesso a
tarefa já existe e está selecionada à esquerda, e a direita entra no detalhe da mesma tarefa.
Reaproveita o ciclo de vida de primeiro envio já existente, sem adicionar campos de ACK ao
protocolo, novos estados de tarefa nem compensação por timeout.

Medido em campo, o primeiro envio já retornou `accepted`, enquanto a inicialização e o hook
SessionStart ainda estavam rodando. O evento de título do primeiro input ocorreu antes da
elevação deferida e foi filtrado pelo publicador de lista do CLI; o resumo seguinte, embora já
persistido, ainda podia ter `phase` = `draft` e foi filtrado pelo Host. A barra lateral
antiga ainda iniciava uma leitura da árvore inteira a cada quadro ativo e descartava
resultados em trânsito, amplificando a latência.

## Donos e ordem

```text
CommandInbox aceita o input → elevação deferred existente → publishCurrentSummaryToIndex
                                               ↓
                        ingestão de task-facts → commit em tasks-index → task_created
                                               ↓
                 ProjectDirectoryProvider aceita readTree com as linhas reais
                                               ↓
              mesmo commit da UI: atualiza o diretório + handleDraftSessionCreated
                                               ↓
                    Promise de primeiro envio conclui, o composer sai de pending
```

- A persistência do CLI decide se um rascunho ainda não foi submetido; a `phase` do runtime
  expressa apenas o estado de execução. O pré-aquecimento não submetido não é publicado no
  `sessions-index`; um resumo já submetido mas sem `TurnStarted` pode cair no índice do Host.
- O `task-facts` continua sendo a entrada de ingestão de fatos do CLI, e o Host de projeto
  continua sendo o dono de `projectId`/pin/archive. Depois que o primeiro resumo vai para o
  banco, `task_created` é publicado diretamente, sem ler a sessão completa para completar a
  linha nem esperar pelo modelo/Hook.
- O diretório compartilhado só aceita linhas reais vindas do `readTree` do Host. O callback de
  primeiro envio espera a correspondência completa de `workspaceKey` + `taskId`; o diretório e a
  navegação original são atualizados no mesmo commit do React; nenhuma linha de projeto
  otimista é construída.
- A atualização do diretório funde requisições sobrepostas e, durante uma requisição em
  trânsito, uma notificação de invalidação received acrescenta apenas mais uma leitura. A
  leitura atual pode ser submetida e não passa fome mesmo com atividade contínua; trocar de
  service/attachment ou desmontar invalida os resultados antigos.
- O callback de `accepted` é apenas o trabalho de UI em trânsito concluído, não uma segunda
  fila de inputs. Falhas de leitura são reportadas a quem chamou; sair do pane original cancela
  a navegação; nada disso reenvia automaticamente um input já aceito. Notificações repetidas não
  repetem a navegação nem geram tarefa.
- O desktop continuous e o celular replayable compartilham essa cadeia de UI/fatos; preserva-se
  o owner/lease original, a deduplicação do CommandInbox e a restauração por replay gap/snapshot,
  sem mexer em main/relay nem no caminho de criação do runtime. A correspondência remota usa
  `workspaceIdentity`, carregando o `remoteSessionId` original.
- Sem migração de banco. Não altera o envio de tarefas já existente, o fork, a abertura de
  histórico, a atribuição de projeto nem a política de ordenação.

## Aceitação

| Case | Cenário/ação | Deve afirmar | Camada de verificação |
| --- | --- | --- | --- |
| FSV01 | primeiro envio de um rascunho pré-aquecido, com a inicialização sem produzir o próximo evento | antes do `accepted` o resumo elevado já foi publicado; um rascunho não submetido ainda não entra na lista | teste unitário do CLI |
| FSV02 | recebe um resumo já persistido, com `phase=draft` | linha de tarefa real + `task_created`; zero `readSession`/`resumeSession`; resumos repetidos não repetem o broadcast de criação | teste unitário do Host |
| FSV03 | primeiro envio concluído com uma leitura de diretório em trânsito e notificações de invalidação contínuas | sem empilhamento concorrente e sem passar fome; diretório com linhas e vínculo do detalhe no mesmo commit; mesmo `cwd` com `identity` diferente não corresponde | teste unitário de UI |
| FSV04 | troca de service/desmontagem, erro de diretório | respostas antigas não navegam, o erro é observável, o input não é reenviado | teste unitário de UI |
| FSV05 | envio real de um rascunho no desktop | amostragem por quadro: no primeiro quadro de detalhe já há linha na barra lateral e ela está selecionada; o CLI/Host têm o fato correspondente; enquanto não houve primeiro envio não há linha de tarefa | E2E pendente |

Texto e anexos compartilham o callback de primeiro envio, preservando respectivamente os
caminhos originais de `prewarm` e `createSession(firstInput)`. O mobile cobre a fiação com
componentes compartilhados e teste unitário de identidade; o resultado da regressão em
aparelho real é registrado separadamente. A consulta ao codegraph falhou por causa da tabela
`unresolved_refs` ausente; a superfície de impacto foi rastreada pelo código-fonte e a varredura
do grafo não foi concluída.

## Registro de verificação (2026-09-15)

- CLI `sessions-index`: 21/21; syncer do Host: 68/68; UI de primeiro envio/identidade/cancelamento/troca de service, atualização e estabilização do diretório: 9/9; continuidade original do composer: 8/8.
- Replay de desktop `desktop-e2e-20260915132619485-p5768-b01dc2cd458ba130`: primeiro envio global e dentro do projeto 2/2. Foram registrados quadro a quadro 231/49 quadros; o primeiro quadro de detalhe foi sempre uma linha nova, visível e selecionada, e os quadros de rascunho anteriores tiveram 0 linhas novas. Ao mesmo tempo foram verificados `projectId` do Host/data de criação do CLI, a mensagem real do usuário, a resposta e o estado `idle`; as duas requisições principais e as duas requisições de título retornaram 200.
- `pnpm typecheck`, `pnpm lint` (47 warnings existentes, 0 error), `typecheck:e2e` do desktop, `typecheck` do bootstrap e `e2e:fixture:check` deste case passaram. Não foi feita regressão em aparelho real de celular, Windows ou Linux; a interface e a semântica de transporte dessas pontas não foram alteradas.
- O gate de arquitetura, antes e depois da alteração, mostrou apenas o `unmanaged-new-file` já existente de `root/resolveConversationWorkspaceTarget.ts`; esta correção não acrescentou nenhuma violação. Os 19 erros de `max-lines` já existentes do lint scoped do bootstrap (incluindo o arquivo grande `gateway`) não foram tratados.
- Ao rodar os 93 casos do gateway em amplitude ampliada, houve uma falha já existente: após o ACK de admissão do Core, a repetição com revisão antiga/file rewind esperava `stale`, mas obteve `executionFailed`. Removendo temporariamente as alterações do gateway feitas nesta correção e rodando de novo, a falha persiste, e os outros 92 passam.
- A auditoria completa de cobertura de cases segue bloqueada pelos 28 fixtures pendentes já existentes, pelas abreviações D19/I74/I75 e pela contagem desatualizada dos documentos gerados; a checagem de fixture deste case passou e não promove automaticamente para formal.
- Execução anterior de dupla entrada: o fluxo global passou; no case de projeto, a repetição da inicialização levou à falha de espera pelo workspace padrão, e foi alterado para clicar na entrada real de novo projeto; uma build encontrou `ENOTEMPTY` no diretório de saída compartilhado antes do case iniciar. Por fim, recompilou-se usando a opção `KEEP_BUILD_CACHE` existente e o runner copiou para o diretório de app independente deste ciclo, passando sem pular a build do código-fonte.
