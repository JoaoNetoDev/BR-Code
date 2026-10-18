# Fechamento da janela de feedback durante o upload em segundo plano dos anexos

## Contexto

O envio de feedback cria primeiro um ticket e depois faz upload das capturas de tela e dos logs de diagnóstico. A exportação e o upload dos logs de diagnóstico podem demorar bastante e, se a janela de envio permanecer aberta o tempo todo, o usuário fica bloqueado por um período longo no dialog.

## Comportamento

- Depois que o usuário clica em "Enviar feedback", a etapa de criação do ticket mantém a janela de feedback aberta.
- A requisição de criação do ticket precisa ter um timeout finito, evitando que o botão de envio fique permanentemente em "Conectando ao serviço de feedback" quando o serviço de feedback ou a cadeia de rede ficam pendurados.
- O "Cancelar" da etapa de criação do ticket precisa ser um cancelamento de verdade: a UI usa o creation operation id do serviço de feedback para avisar ao host process que interrompa a requisição de criação atual e interrompe também o upload posterior de capturas e logs.
- Após a criação bem-sucedida do ticket, os anexos de captura e log passam para upload em segundo plano e a janela de feedback fecha automaticamente.
- A entrada "Relatar problema" no menu de ajuda do topo, assim como as demais entradas de novo feedback, sempre abre um novo formulário de envio, sem vincular automaticamente nenhuma tarefa de envio em segundo plano já existente; o usuário não precisa esperar o upload dos anexos do feedback anterior terminar.
- As tarefas de envio em segundo plano existem de forma independente por `jobId`. Enquanto várias tarefas não terminarem, o canto inferior direito da janela exibe uma cartão de status para cada tarefa, em vez de mostrar apenas a última.
- Ao clicar no cartão de uma tarefa não concluída, o dialog de feedback se vincula apenas ao `jobId` daquele cartão, exibe o progresso correspondente e restaura a descrição original do problema, o contato, a captura de tela, o interruptor de log e a categoria do ticket no momento daquele envio; ao fechar, a tarefa continua em segundo plano. A entrada de novo feedback e "abrir uma tarefa de segundo plano específica" são ações distintas.
- O que a tarefa de segundo plano guarda é um snapshot do formulário do usuário no instante do envio. A descrição do problema deve usar o texto original digitado pelo usuário e não pode ser reconstruída de forma reversa a partir do `ticketInput.description` do backend, que já recebeu informações de diagnóstico como modelo e tipo.
- Se o usuário não adicionou captura de tela e desativou o upload de logs, não existe etapa de anexo em segundo plano e o comportamento de redirecionamento após a conclusão do envio é preservado.
- Fechar a janela não cancela a tarefa de upload em segundo plano de um ticket já criado; as indicações existentes de status do upload em segundo plano continuam responsáveis por mostrar o progresso, a pausa e os erros. Se o fechamento acontecer antes da criação bem-sucedida do ticket, a requisição de criação deve ser cancelada.
- Se a criação do ticket falhar, a janela não fecha automaticamente, o estado de erro existente continua sendo exibido e o usuário pode corrigir o conteúdo e tentar de novo.
- Se o upload dos anexos falhar, a janela de envio não é aberta novamente e a lógica existente de erro/dica do job em segundo plano é mantida.
- Se o usuário cancelar ativamente a criação do ticket, o estado de envio é redefinido e exibe "O envio de feedback foi cancelado", sem criar tarefa de upload de anexos; mesmo que o backend retorne sucesso de criação mais tarde, o job de envio antigo não é restaurado.

## Limites de estado e interação

```text
entrada de novo feedback
    |
    v
[formulário totalmente novo, submissionJobId = null]
    |
    | criação do ticket bem-sucedida, anexos continuam sendo enviados
    v
[tarefa de segundo plano job-A + snapshot de formulário A] ----\
                                  +--> lista de cartões no canto inferior direito --> clicar A --> [dialog de progresso + snapshot de formulário A]
[tarefa de segundo plano job-B + snapshot de formulário B] ----/                    \-> clicar B --> [dialog de progresso + snapshot de formulário B]

clicar novamente em "Relatar problema" -----------------------> [formulário totalmente novo, submissionJobId = null]
```

- `openSubmit(draft)` expressa apenas "novo feedback" e precisa limpar `submissionJobId`.
- `openSubmissionJob(jobId)` expressa apenas "verificar um envio em segundo plano" e não pode degenerar em "pegar a última tarefa ativa".
- `FeedbackSubmissionJob.formDraft` é um snapshot somente leitura e independente de cada tarefa, capturado no instante do envio; o dialog restaura esse snapshot por `jobId` e não lê o estado de outras tarefas nem do formulário novo atual.
- A lista de cartões em segundo plano assina o job registry global; as tarefas não compartilham `submitting`, progresso ou estado de cancelamento do formulário.
- Esta funcionalidade é uma capacidade de feedback local em nível de aplicativo; não introduz estado de workspace nem altera a cadeia de mensagens do `continuous` do desktop ou do `replayable` do controle remoto no celular.

## Não objetivos

- Não modifica o protocolo HTTP do backend de feedback, o protocolo de upload de anexos, a seleção de capturas de tela nem as regras de empacotamento dos logs.
- Não altera o comportamento da lista "Meus feedbacks" nem do detalhe do ticket.