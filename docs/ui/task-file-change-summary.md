# Resumo de Alterações de Arquivos da Tarefa

## Objetivo

Ao final da tarefa, consolidar no subtítulo da tarefa e abaixo dos itens da tarefa as alterações de arquivos envolvidos nesta tarefa, mantendo ao mesmo tempo as informações de turno necessárias para a futura integração do recurso de rollback.

## Fluxo de Dados

1. O runtime do Agent continua registrando apenas o `fileChanges` original nas escritas de arquivo
   - O rastreador de arquivos da sessão está em `packages/services/src/session/fileChangeTracker.ts`
   - Cada escrita registra `beforeContent` / `afterContent` no session file change tracker

2. O resumo da tarefa é agrega dinamicamente ao ler a lista de tarefas
   - Implementação da agregação: `packages/services/src/session/taskChangeSummary.ts`
   - Ponto de injeção: `packages/services/src/session/zcodeTaskService.ts`
   - O campo de resumo fica em `ZCodeTaskMeta.changeSummary`

3. A UI apenas consome o resumo, sem varrer diretamente o snapshot completo
   - Implementação da formatação: `packages/ui/src/lib/taskChangeSummary.ts`
   - Lista de tarefas: `packages/ui/src/TaskList.tsx`
   - Título superior: `packages/ui/src/App.tsx`

## Estrutura do Resumo

- `fileCount`: número de arquivos únicos envolvidos na tarefa
- `added` / `removed`: total de linhas agregado pelo resultado final da tarefa
- `files[]`
  - `path`
  - `added` / `removed`
  - `writeCount`
  - `lastTurnIndex`

## Reserva para Rollback

- O rollback real continua dependendo apenas de `fileChanges`
- `changeSummary.files[].lastTurnIndex` é apenas um ponto de entrada rápido da UI para localização
- Se mais adiante for feito "rollback da tarefa inteira" ou "rollback de um único arquivo", reutilizar diretamente a capacidade de rewind/truncate do session file change tracker

## Planejamento de Resumo de Arquivos por Turno e Desfazer Arquivo no v4

A conversa v4 não reutiliza as antigas entradas `session/previewFileRewind` / `session/applyFileRewind`; o resumo de arquivos por turno e o desfazer passam pela projeção v4 e pela fronteira de comandos/consultas. A semântica de produto é fixa como "desfazer somente as modificações de arquivos do workspace": após o sucesso do desfazer, não se deleta, não se trunca e não se reescreve o histórico do chat, apenas marcando o estado dos arquivos do turno correspondente como desfeito.

### Cadeia de Estado e Eventos

```text
Write/Edit 等文件工具
  -> core 写入 workspace checkpoint artifact
  -> SessionEvent.CheckpointCreated(snapshotRef/diffRef/messageId/targetMessageId/toolMessageId)
  -> 同步写入既有 session_entry(runtime/workspace_checkpoint)，冷恢复时重建 checkpoint event
  -> v4 ProductProjection 按 stable messageId/turnId 归属到 turnHeader
  -> TurnHeader.fileChanges = { files, additions, deletions }
  -> UI 在该轮尾部显示文件摘要

用户点击撤销文件
  -> previewFileRewind(turn/message target)
  -> core previewWorkspaceFileRewind 做 hash 安全检查
  -> UI 弹窗展示 safe / unsafe / ignored 文件
  -> applyFileRewind
  -> core applyWorkspaceFileRewind 写回或删除文件
  -> SessionEvent.RewindTriggered(scope=workspace, reason=file_summary_rewind)
  -> 同步写入既有 session_entry(runtime/workspace_file_rewind)，冷恢复时重建撤销事件
  -> v4 ProductProjection 标记该轮文件已撤销，不触发 row.removed
```

### Fronteira de Projeção

- `turnHeader.fileChanges` carrega apenas um resumo leve: número de arquivos, total de linhas adicionadas, total de linhas removidas e o estado de desfazer necessário depois; não coloque o patch completo nem o conteúdo before/after no replayable snapshot.
- Detalhes de arquivo, patch de diff somente-leitura e a lista safe/unsafe do preview são consultados do host/core sob demanda; o painel expandido ou o clique em desfazer lê o checkpoint artifact.
- O event store de `CheckpointCreated` é o livro-razão em memória do runtime; o payload do checkpoint também precisa ser escrito no `session_entry` existente, e na cold recovery de child/main runtime o evento é reconstruído antes de executar preview/apply. Essa persistência reaproveita a tabela existente, sem criar nova tabela nem migration; o artifact continua sendo a única fonte dos objetos grandes de conteúdo before/after.
- O `RewindTriggered` de workspace-only também é escrito no `session_entry` existente; caso contrário, ao fechar os detalhes ou reiniciar, um turno já desfeito seria projetado novamente como active. Quando o detached child cold resume gera um novo raw event epoch, o gateway raw cursor é redefinido com `SessionResumed`, mas a sequência de transport continua crescendo monotonicamente.
- Quando o mesmo arquivo é alterado várias vezes no mesmo turno, o resumo é calculado do before inicial do turno até o after final; checkpoints intermediários servem apenas para a ordem segura de desfazer, sem acumular novamente as linhas exibidas.
- Atribuição e alvo de desfazer priorizam o `messageId` / `turnId` / checkpoint id estáveis; `turnIndex` só pode servir como fallback de compatibilidade para dados antigos, não como o principal mecanismo de localização do novo protocolo.
- `CheckpointCreated(scope=workspace|both)` pode contribuir com o resumo de arquivos; checkpoint de shell/bash, se o core os classificar como ignored, aparecem no preview de desfazer apenas como ignored e não como arquivos seguros para gravação.

### Fronteira de Desfazer

- O desfazer de arquivos só é permitido quando a sessão está ociosa; em estados ativos como running, compacting, permission/elicitation, a entrada fica disabled ou o comando é rejeitado, evitando competir com o tool loop que está escrevendo arquivos.
- Se na fase de preview algum arquivo tiver modificação externa, checkpoint ausente, checkpoint ilegível ou patch não suportado, o botão de confirmação fica disabled; o apply não faz gravação parcial.
- Após o apply bem-sucedido, a linha da conversa permanece inalterada, apenas exibindo o estado desfeito no painel de resumo de arquivos do turno correspondente, e a entrada de diff review pode ser mantida.
- O desfazer de arquivos de Subagent usa apenas o gate `canRewindFiles` da projeção do child; não se adiciona guard de nível pai para saber se a task pai ainda está em execução. Modificações no mesmo arquivo pela task pai ou por processos externos continuam sendo julgadas como unsafe pelo hash preview existente.
- O detalhe do child no lado direito mantém a conversa somente leitura, usando preview/apply apenas como capability explícita de workspace; não se abre por isso o composer, nem edit/retry/fork/stop, nem resposta de permission/elicitation.
- Um detached live child sem bootstrap record direto pode, no primeiro preview, fazer cold resume do child record já persistido, mas não deve iniciar um novo turno; o apply subsequente continua usando `childSessionId` como session do comando.
- O apply apenas restaura o workspace real e marca o turno alvo do child como desfeito, sem reescrever a linha do Agent pai, o diretório, o aggregate da task pai ou qualquer histórico de chat.
- No desktop, `desktop-continuous` atualiza resumo e estado de desfazer via live delta; no celular, `/remote` com `web-remote-replayable` recupera pelo mesmo host projection/snapshot, sem afundar estado de session/task/stream/file no relay ou no processo main.
- O workspace remoto deve manter `workspaceIdentity` / `remoteSessionId` de forma consistente através de bridge, snapshot, alvo de desfazer e cache key; o isolamento de identidade usa `workspaceKey = workspaceIdentity?.trim() || workspacePath`.

### Forma da UI

- O resumo de arquivos de cada turno é exibido no fim da área de trabalho do assistant daquele turno, no formato `N files changed +A -D`; no celular a mesma informação é mantida, mas botões e linhas de arquivo são mais compactos.
- Após expandir, mostra o caminho relativo de cada arquivo e as linhas `+/-`, sem exibir a contagem de escritas/modificações; clicar na linha do arquivo ou em Review abre o diff no code viewer.
- A contagem de escritas/modificações só é exibida no diálogo de pré-verificação do desfazer de arquivos, para explicar a fronteira da operação de desfazer, e não como informação da linha de resumo.
- O botão de desfazer primeiro abre um diálogo de preview; o diálogo distingue arquivos safe, unsafe e ignored, e o motivo do unsafe deve estar visível.
- O controle remoto do celular continua ocultando o dropdown "选择 App 打开", mantendo apenas o diff review dentro do app e a capacidade de desfazer arquivos.

## Interação do Resumo de Alterações Dentro da Mensagem

- O resumo de alterações dentro da mensagem expande por padrão apenas até a lista de arquivos, sem suporte a expandir inline diff dentro da linha de um único arquivo
- Clicar na linha de um único arquivo, apertar Enter ou Space tem o mesmo comportamento do botão `Review` da linha: abre a pré-visualização do diff no code viewer à direita
- O botão `Review` mantém a entrada de texto, sem exibir ícone, para evitar duplicar a ênfase visual com a entrada de clique na linha inteira
- A linha do arquivo mantém a entrada normal de abrir arquivo; o controle remoto do celular continua ocultando o dropdown "选择 App 打开", mantendo apenas a pré-visualização dentro do app
- A origem da pré-visualização do diff continua priorizando o patch somente-leitura; sem patch, usa o snapshot before/after do checkpoint daquele turno

## Correções Adicionais

- `task_error` agora também persiste o `fileChanges` do turno
- Assim, mesmo tarefas com falha conseguem exibir o resumo de arquivos, sem perder os dados necessários para o rollback posterior