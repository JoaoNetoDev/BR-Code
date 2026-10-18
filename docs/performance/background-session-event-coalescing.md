# Redução de frequência de eventos de session em segundo plano

## Contexto

Quando tarefas de busca profunda são executadas em paralelo, múltiplas tasks em segundo plano continuam produzindo `model.streaming`, `tool.updated:progress` e eventos de progresso de recuperação. Mesmo que a interface atual exiba apenas uma task, o renderer continua sendo acordado por cada evento de protocolo de tarefas em segundo plano, seguindo com projection, escritas no Zustand e atualizações do React, o que provoca um aumento perceptível do CPU do renderer com 5 tarefas concorrentes.

## Estratégia

- A task ativa continua usando a assinatura em tempo real `desktop-continuous`, preservando a sensação de streaming do corpo, do raciocínio e das chamadas de ferramenta.
- O monitor em segundo plano das tasks inativas declara o modo de coalescing `background-summary` ao assinar session events `desktop-continuous`.
- A task desktop inativa entra no modo de conteúdo tombstone: o monitor em segundo plano mantém apenas estado de execução, título, permissões, usage, plan, fila, não lidas e estado final, sem continuar escrevendo chunks de corpo/pensamento/progresso de ferramentas na árvore de mensagens do React.
- O coalescing acontece apenas no lado do assinante: não altera o emitter compartilhado, não altera a fonte factual de eventos do agent/runtime e não altera a semântica de recuperação por snapshot/gap do `web-remote-replayable` do celular `/remote`.
- Eventos que podem ser coalescidos em segundo plano:
  - `model.streaming:text_delta`
  - `model.streaming:reasoning_delta`
  - `model.streaming:tool_input_delta`
  - `tool.updated:progress`
  - `streamRecovery.updated`
- Eventos em segundo plano que não podem ser atrasados devem fazer flush dos eventos já coalescidos e então ser entregues imediatamente:
  - início / estado final do turn
  - tool scheduled / started / result / error / batch
  - permission / user input
  - snapshot / state update / provider runtime headers
  - mudanças estruturadas de session como title, mode, target

## Objetivo

As tasks em segundo plano continuam mantendo estado de execução, solicitações de permissão, estado final, status de não lidas e a capacidade de recuperação ao voltar para elas, mas tasks invisíveis não conduzem mais o renderer na frequência de token/progresso de ferramentas. Quando o usuário alterna para uma task, a assinatura em primeiro plano retoma o controle da UI completa via snapshot/live stream; o coalescing em segundo plano carrega apenas o resumo de baixa frequência e não serve como fronteira de recuperação replayable.

## Modo de conteúdo tombstone

- Quando uma task desktop em segundo plano recebe `agent_message_chunk`, `agent_thought_chunk`, `tool_call` e `tool_call_update` normal, ela não chama mais `updateTaskMessages`.
- `tool_call_update:completed` ainda completa de forma leve o todo plan com o título da ferramenta; por exemplo, quando `Write/Edit <path>` corresponde ao nome de arquivo de um plan step, aquele step é marcado como completed.
- `task_complete` / `task_error` para tasks desktop invisíveis apenas fecham runtime, usage, erro, não lidas e fila, sem buscar ativamente um snapshot residual para escrever uma mensagem grande.
- `task_snapshot_updated` para tasks desktop invisíveis serve apenas como aviso de recuperação; salvo motivos explícitos de liberação como arquivamento/exclusão, não se lê o conjunto completo de mensagens em segundo plano.
- A task ativa atual, a janela de fallback anterior ao estabelecimento da assinatura em primeiro plano da task ativa e o mirror `web-remote-replayable` do celular não usam tombstone e mantêm a semântica original de tempo real/recuperação.
- O teste de carga de session em lote não muda automaticamente para a última task bem-sucedida após o disparo; essas tasks permanecem em tombstone em segundo plano e o conteúdo completo é restaurado quando o usuário as abre explicitamente.
- A primeira session do teste de carga em lote é iniciada com um pequeno escalonamento de 1000ms, com atraso máximo de 5s; assim, 5 execuções concorrentes entram todas em estado de execução em 4s e 10 execuções concluem o disparo em 5s, sem jogar criação de task, assinatura e escrita de estado de execução todas no mesmo segundo contra o renderer.
- As primeiras tasks em segundo plano geradas pelo teste de carga em lote usam inicialização leve: inserção na lista de tasks, meta otimista, runtime=`streaming`, `activeInputId` e vinculação ao provider são fundidos em uma única escrita no Zustand, sem escrever mensagens otimistas de usuário/assistant de primeira entrega para tasks invisíveis.
- O tratamento de um evento individual no monitor em segundo plano é envolvido em React batched updates, reduzindo o número de commits do React quando runtime, usage, não lidas e permissões são atualizados juntos no estado final.
- O `session_info_update` title-only de tasks desktop invisíveis é gravado de volta no cache de tasks com coalescing de 2s; atualizações de goal/status com `target` e eventos de estado final fazem flush do title pendente antes de continuar notificando e fechando.
- Logs de diagnóstico como amostragem da projeção de entrada de ferramenta, amostragem de escrita de mensagens e breakdown de usage em segundo plano devem passar por `debug`, evitando serializações repetidas de objetos grandes no renderer e gravação de logs de produção durante buscas profundas.

## Limites

- O limite de `clientMode` / `deliveryKind` não se espalha: esta estratégia só é ativada nos parâmetros de assinatura `desktop-continuous` do monitor de UI em segundo plano.
- O replayable do controle remoto do celular não usa esse modo de coalescing; a recuperação continua garantida por `seq`, gap recovery e snapshot.
- O protocolo app-agent `@zcode/protocol` não ganha campos novos; o parâmetro de coalescing é uma estratégia interna de assinante dos services e não é passado para o runtime zcode-cli.
