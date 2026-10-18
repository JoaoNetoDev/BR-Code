# Single Owner Stream Rendering

> Status: atualmente descreve apenas a filtragem de conteúdo não-owner em assinaturas replayable.
>
> A assinatura `continuous` do desktop ainda consome eventos do direct dynamic stream e não passa pela estratégia de
> batch vazio para observadores descrita aqui. Só a assinatura `replayable` do controle remoto Web no celular precisa
> dessa estratégia para reduzir o risco de entrelaçamento entre recuperação de desconexão e alinhamento por snapshot.

## Contexto

Depois do compartilhamento do host process, o desktop e o celular continuam sendo dois renderers independentes. O navegador
do celular pode ficar longos períodos em segundo plano, se desconectar ou ser descartado pelo sistema. Se todos os
renderers consumirem diretamente os mesmos chunks de streaming de um turno, a recuperação após desconexão tende a se
entrelçar com o alinhamento por snapshot, gerando caudas de chunk duplicadas ou divergência de estado de execução.

## Solução

Cada turno de prompt é gerado pelo renderer de envio, que transmite o `clientId`. O host process continua sendo o único
runtime ZCode e a fonte de verdade de persistência; `task_stream_mirror_batch` carrega o `ownerClientId`.

Assinaturas replayable filtram batches de conteúdo comum pelo `clientId` do assinante:

- O emissor cujo `ownerClientId` corresponde recebe os `ops` completos de streaming e é responsável pela renderização em
  tempo real do corpo, de tool, permissões e demais estados granulares.
- Outros renderers replayable podem filtrar corpo comum, thought e chunks de tool para evitar renderização duplicada.
- `permission_request`, `elicitation_request`, as responses correspondentes, `task_complete` / `task_error` e a invalidação
  de snapshot não podem ser engolidos pela filtragem comum de conteúdo owner-only; eles precisam ser visíveis aos clientes
  online da mesma task ou disparar o alinhamento por snapshot.
- Mensagem final, alterações de arquivos e metadados da task continuam alinhados por `getTaskSnapshot()`.

## Limites de estabilidade

Isso garante que o observador não consuma chunks intermediários em duplicidade por causa de desconexão, reconexão ou troca de
task no celular. Se o emissor for o celular, a renderização no celular ainda pode perder a visão em tempo real, mas o host
process continua consumindo o stream do provider e persistindo o snapshot final. Depois de se recuperar, o celular deve
usar o snapshot como fonte autoritativa.

## Comportamento da UI

Um observador replayable pode, durante a execução, não renderizar o corpo em streaming e mostrar apenas a indicação de
loading "Outra dispositivo está enviando uma mensagem...". Ao fim da task, o alinhamento por snapshot substitui o
conteúdo pelo bloco de mensagem final. O lado continuous do desktop continua mantendo a renderização do corpo em tempo
real via direct stream.