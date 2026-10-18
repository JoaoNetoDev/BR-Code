# Retorno contínuo de tasks vinculadas ao chat privado

## Comportamento e limites

Após vincular uma task ao chat privado do Feishu/Lark, Telegram ou WeChat iLink, toda saída de IA produzida pelo IM, desktop e celular é retornada ao usuário vinculado no momento. Segue-se o `replyMode` do canal, sem retransmitir adicionalmente o corpo do input vindo do desktop. Aprovação/perguntas mantêm a autorização de origem do input original, sem ampliar permissões por causa da assinatura permanente.

O fim de uma rodada (concluída, com falha ou parada) limpa apenas o estado daquela rodada e não libera a assinatura do vínculo. Trocar de task, workspace, usuário, identidade de robô, ou desabilitar/excluir invalida o destino anterior; requisições de rede já enviadas não podem ser revertidas. Ao habilitar, iniciar e ao restaurar workspaces já conectados, a assinatura passa a receber eventos subsequentes, sem replay de histórico e sem conectar ativamente a destinos remotos para a restauração.

O backend verifica a cada 10 segundos as conexões remotas existentes e restaura assinaturas disponíveis, sem reconectar ativamente; assinaturas já estabelecidas continuam usando eventos contínuos em tempo real.

O mesmo `workspaceIdentity` (com fallback local para `workspacePath`) e a mesma task compartilham uma única fonte de eventos contínua do Bot; cada destino de recebimento é processado de forma independente e serial, e a falha de um não bloqueia os outros. Tarefas automáticas são combinadas com o `runId` despachado pelo Host para aquela rodada e continuam usando o resumo de estado final, mescladas ao retorno comum do mesmo destino sem envio duplicado. A admissão de input e o estado de execução continuam pertencendo ao task owner existente, sem nova fila de aceitação; os limites de continuous no desktop e replayable no celular permanecem inalterados.

```mermaid
sequenceDiagram
  participant UI as Desktop/Celular/IM
  participant Task as task owner
  participant Bots as BotsService
  participant IM as Canal
  UI->>Task: Comandos de input existentes
  Task->>Bots: evento de saída bot-channel-continuous
  Bots->>Bots: valida o vínculo atual, reseta/encerra por rodada
  Bots->>IM: envia a resposta do destino correspondente
  Note over Bots,IM: ao fim da rodada a assinatura é mantida; após trocar o vínculo o destino antigo não pode continuar enviando
```

## WeChat e tratamento de falhas

Depois que a autorização de entrada é aprovada, o `context_token` mais recente é salvo no CredentialService por conta de robô e por usuário; no envio, o valor mais recente é lido, permitindo reutilização após restart e sem assumir prazo de validade fixo. É proibido imprimir o token em logs ou em `getBotStates`. Quando a credencial está ausente ou a plataforma recusa, a falha e as instruções para reenviar a mensagem no WeChat são exibidas via `deliveryError` existente, e a saída da task é preservada. Atualizar o token apenas restaura os envios seguintes, sem reenviar automaticamente respostas antigas.

O processo atual mantém, por robô, a última resposta com falha de cada rodada, e o usuário pode reenviar explicitamente o corpo completo como texto; a interface avisa que o conteúdo já recebido pode aparecer duplicado. O conteúdo pendente de retry é invalidado ao trocar o vínculo e não sobrevive a um restart do processo. Quando o resultado é desconhecido, não há reenvio automático, para evitar mensagens duplicadas. Limites de envio e erros de negócio devem ser preservados: não se pode tratar sucesso HTTP como entrega bem-sucedida na plataforma.

## Aceitação

- Três canais: após a primeira rodada no IM, desktop e celular recebem uma resposta em duas rodadas consecutivas, sem contaminação pelo corpo ou cartão da rodada anterior.
- Quando várias task de destino compartilham a mesma task, apenas uma assinatura subjacente é criada e cada destino recebe a resposta de forma independente; a falha de um destino não afeta o outro.
- Tarefas automáticas no mesmo destino enviam apenas o resumo de estado final, sem duplicação; depois, o input comum retoma o `replyMode` configurado.
- Trocar de task, workspace, desvincular, desabilitar e excluir bloqueiam outputs atrasados; reabilitar restaura a assinatura. Caminhos iguais com `workspaceIdentity` diferentes não fazem crosstalk.
- O restart restaura vínculos válidos sem reenviar histórico; desconexões remotas não conectam ativamente e a assinatura é restaurada após reconectar.
- Substituição do token mais recente do WeChat, leitura após restart, isolamento por usuário/robô, falhas visíveis de credencial ausente ou inválida; input não autorizado não pode sobrescrever o token.
- As duas rodadas de cartão em streaming no Feishu são independentes; recusa, limitação de taxa ou falha de fallback de formato no Telegram não podem ser reportadas como sucesso.
- Permissões e perguntas disparadas por desktop/celular não podem ganhar novas vias de autorização acionáveis no IM por causa da assinatura de chat privado.

## Evidências

2026-09-17:

- Serviço/provider/UI: `botsService.privateSync.test.ts` cobre múltiplas rodadas contínuas, múltiplos destinos, isolamento por runId de tarefas automáticas, atualização de credencial WeChat e leitura após restart do serviço, troca de vínculo, retry explícito de falha e mirror batch; as demais regressões de Bot e a interação de retry da UI foram executadas juntas: 28 arquivos, 432 casos passando.
- Runner de desktop: caso controlled-stream de três canais `BOT-E2E-PS-01` aprovado (artefato `desktop-e2e-20260917035142993-p91509-fab905c1e30482ae`), comprovando serviço → HTTP e origem de input sintética de desktop/mobile, sem se passar por input real de celular/CLI. Também foram reexecutados, junto, os casos de entrega de tarefa automática e cartão em streaming do Feishu: 3 specs, todas aprovadas.
- Typecheck raiz, typecheck de E2E e verificação de arquitetura passaram; lint com 0 error e 48 warnings preexistentes.
- Preview real de componente no navegador: 390px/1280px, tema claro e escuro Zai, zh e en; após sucesso o botão é ocultado, após falha é possível operar de novo, sem overflow horizontal e sem console error. O CLI agent-browser não está instalado; foi usado o navegador embutido.
- Contas reais de IM, ausência prolongada de mensagens de entrada no WeChat, Windows/Linux, celular real e reconexão remota ainda não foram testados; os novos E2E permanecem pending, sem promoção nem entrada no CI.