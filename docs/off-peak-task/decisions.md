# Tarefa Fora do Pico · Registro de Decisões (ADR contínuo)

> **Status: ADR histórico, funcionalidade já implementada.** Este documento preserva ao longo do tempo a evolução das soluções D1–D44; as entradas iniciais não são reescritas como solução final, e «decidido» significa apenas a conclusão da época. O comportamento atual segue `spec.md`, `tech-design.md`, `implementation-notes.md` e o código, e Scheduled Automation continua sendo um domínio independente.
>
> Saída das sessões de grilling. Cada decisão: contexto → opções → conclusão. OPEN = não decidido.

### Índice de leitura do código atual (2026-07-23)

- As interfaces do servidor seguem D26/D39: `availability → POST /ticket → POST /ticket/status → messages → settle`; o register/per-task GET de D25 é uma forma histórica.
- O código oficial de invalidação de ticket é `400/3102`; o `3001` só permanece na compatibilidade de rollout do adapter e nas explicações históricas.
- A cota de criação segue o snapshot de availability do D39 mais o 3103 de `POST /ticket`; o `limit.max_tasks/sliding_window` do D36 e a contagem local por createdAt foram removidos do cliente final.
- D44 estabelece explicitamente que a máquina de estados de aprovação dedicada do Off-Peak de D11/D27 não foi adotada: permission/elicitation passa só pela sessão comum, o estado agregado permanece `running`, e o mesmo turno automático continua usando o idle-plan overlay.
- O overlay por turno do D33 já foi implementado; e os prompts do usuário enviados durante um turno automático ocupado são drenados depois de restaurar o modelo residente do usuário.

## D1 Modelo de cobrança (decidido em 2026-07-09)

**Conclusão: pool gratuito. No contexto do produto não existe o conceito de «saldo», todo o capítulo de guarda de saldo é eliminado e o cliente não tem lógica de saldo alguma.** Na criação a autenticação é feita por cota de plano (lite:1 / pro:2 / Max:3, com o significado detalhado em D5).

Análise original:

O PRD se contradiz: a definição inicial diz que a v1 usa pool gratuito (codingplan+lite:1/pro:2/Max:3), a v0.2 acrescenta um capítulo inteiro de guarda de saldo de ¥0.50 e depois o capítulo inteiro é riscado. O coding plan existente é por cota (`GET /api/monitor/usage/quota/limit`, em porcentagem), e o cliente não tem nenhuma API de saldo em ¥.

- A (recomendado): v1 com pool gratuito + cota por plano, sem guarda de saldo, e o cliente sem lógica de saldo.
- B: pool gratuito + exibição somente leitura do saldo.
- C: guarda de saldo completa (exige API de saldo no servidor + consulta e dedução após cada chamada).

## D2 Fonte de verdade da janela fora do pico (decidido em 2026-07-09)

**Conclusão: o servidor envia a tabela de janelas e o cliente apenas a mantém em cache de leitura. Antes de a API de janelas ficar pronta, não há ETA preciso, apenas textos do nível «próxima janela fora do pico».**

> Substituído por D21 (consenso nos comentários do documento em 2026-07-10): a tabela de janelas não é enviada, o cliente não tem conceito de janela e passa a fazer polling da interface de autorização de agendamento.

Análise original:

Três alternativas de leitura no PRD: inferência a partir do pico maas das 14-18 (→ as outras 20h são todas fora do pico e a narrativa de «hoje à noite 22:07» desmorona) / preset 22:00-06:00 na página de configurações / «manter consistente com o maas, precisa validar».

- A (recomendado): o servidor envia a tabela de janelas (na v1 pode ser hardcoded na configuração do servidor), e o cliente apenas mantém o cache de leitura; sem API, não há ETA preciso de «horário de início previsto».
- B: preset hardcoded no cliente.
- C: inferir pelo pico do maas.

## D3 Semântica dos limites de janela (decidido em 2026-07-09)

**Conclusão: sistema de limiar de admissão. A janela só controla «quando é permitido iniciar», e uma vez iniciado o processo roda até o estado terminal sem interrupção. Cortado: estado window_paused, «já foram consumidas N janelas», retomada por snapshot no fim da janela e notificação de «janela pausada».**

Análise original:

O capítulo «não concluído no fim da janela → pausar com snapshot → retomar na próxima janela» foi riscado, mas o estado window_paused, «já foram consumidas N janelas» e «o progresso não se perde por interrupção» continuam espalhados por todo o texto. Limite rígido = precisa resolver o kill em andamento (o que fazer com um bash em execução?) e a retomada da sessão por snapshot, que é o pedaço de maior custo de implementação de todo o PRD.

- A (recomendado): limiar de admissão — a janela só controla «quando é permitido iniciar», e uma vez iniciado roda até o estado terminal; window_paused é cortado.
- B: limite rígido — pausa forçada no fim da janela + retomada (texto original do PRD).
- C: limite flexível — após o fim da janela não se iniciam novas chamadas de LLM, e a tarefa pausa após a conclusão, retomando na próxima janela.

## D4 Prevenção de suspensão (decidido em 2026-07-09, baixa prioridade)

**Conclusão: um switch manual «manter acordado» nas configurações; nesta iteração não há integração automática com powerSaveBlocker e o assunto não é aprofundado. Mantém-se o cartão educativo «mantenha na tomada».**

Análise original:

O PRD diz explicitamente que «não impede a suspensão do sistema», entregando apenas um cartão de configuração para o usuário desligar a suspensão por conta própria. No macOS, por padrão, a máquina dorme quando fica ociosa → na janela das 22:00 a máquina está dormindo, a tarefa nunca roda e a promessa central não se cumpre. O Electron `powerSaveBlocker.start("prevent-app-suspension")` impede a suspensão por ociosidade com uma linha (não impede com a tampa fechada, e a recomendação de manter na tomada e com a tampa fechada continua). O cron scheduler existente tem estratégia de skip para janelas perdidas durante o sono, e as tarefas fora do pico têm a semântica oposta.

- A (recomendado): ligar o powerSaveBlocker enquanto existem tarefas queued/running, com possibilidade de desligar nas configurações.
- B: seguir o PRD e não impedir a suspensão (aceitando a alta probabilidade de não rodar na primeira noite).
- C: impedir a suspensão somente durante running (dormir durante a espera da fila perde a janela do mesmo jeito).

## D5 Identidade da tarefa = envio atrasado na conversa + trava de fila (decidido em 2026-07-09)

A tarefa fora do pico não é uma entidade independente, mas «um envio atrasado em alguma conversa» (pode ser uma conversa nova ou continuar uma existente). Durante a fila o composer dessa conversa fica travado, permitindo apenas «cancelar / executar imediatamente», e o contexto não deriva. Quando a janela chega, a execução acontece sobre o estado da conversa no momento da submissão (continuar uma conversa existente = retomar aquela session e enviar o prompt enfileirado).

## D6 Cota: tier eliminado, o servidor limita a quantidade de tarefas agendadas (decidido em 2026-07-09)

O lite:1/pro:2/Max:3 do PRD e o «no máximo 1 por pessoa a cada 24h» são totalmente eliminados. **O servidor limita uniformemente a quantidade de tarefas agendadas (não terminais) por usuário**, o valor concreto é política do servidor, e o cliente só trata «criação rejeitada (limite atingido)».

> Correção em D18: o valor do limite é enviado pelo servidor e o cliente o aplica localmente, sem passar por uma interface de autenticação por criação.

## D7 Agendamento local: estritamente serial (decidido em 2026-07-09)

Dentro da janela a máquina local executa uma tarefa por vez, na ordem de entrada na fila, e só passa para a próxima depois que a anterior termina. Não há isolamento por worktree (a serialização evita naturalmente escritas concorrentes no mesmo workspace). Mesmo entre workspaces diferentes é serial (uma única posição de execução em nível de app).

> Correção em D18: a lógica de fila vai para o servidor; a serialização local degrada para «política de execução» — apenas uma é tentada/executada por vez, preservando o efeito de evitar escrita concorrente no mesmo workspace, mas não é uma fila.
>
> Refutado por D20: o cliente não impõe nenhuma limitação de concorrência, e a cota de concorrência é decidida pelo agendamento do servidor.

## D8 Totalmente automático = bypassPermissions, sem mexer em git (decidido em 2026-07-09)

O modo totalmente automático mapeia o `bypassPermissions` existente, e a pausa sensível mapeia o default mais a cadeia existente de notificações permission_request. Não há sandbox do sistema de arquivos; o texto «sandbox forçado» é removido e vira «aprovar todas as operações automaticamente». Não há baseline automático de git; mantém-se o texto de alerta do PRD «recomenda-se fazer commit de uma versão limpa», e a responsabilidade fica com o usuário.

## D9 Janela perdida = adiar, não descartar (decidido, consequência semântica)

Uma tarefa queued que não é agendada dentro da janela porque o app não estava aberto ou a máquina dormiu → permanece queued e espera automaticamente a próxima janela, sem ação do usuário. Atenção: isso é o contrário da semântica de misfire-skip do scheduler de automations existente (`MISFIRE_GRACE_MS` marca como skipped e não repete), e o caminho de agendamento de tarefas fora do pico não pode reutilizar essa política.

> Passa a valer naturalmente após D21: não há janela a perder, e depois da recuperação basta continuar o polling e o despacho enquanto houver tarefas queued.

## D10 Botões de ação na notificação = macOS best-effort, caminho principal dentro do app (decidido, fato de engenharia)

As actions da Electron Notification só aparecem no macOS e exigem assinatura + estilo de notificação do usuário configurado como «lembrete»; o banner pisca e some. Os três botões (aprovar/recusar/cancelar) são apenas um aprimoramento do macOS, e **o caminho de interação autoritativo é dentro do app** (barra de status no topo da página de detalhes da conversa + botões de ação); o clique na notificação sempre leva à conversa. Reutiliza-se a cadeia existente de `desktopNotifications.ts`.

## D11 Forma de execução da cobrança = Provider dedicado fora do pico (idle plan) (introduzido em 2026-07-09)

> **Correção do status de implementação (2026-07-23)**: a injeção do idle plan por turno foi implementada; as regras derivadas desta seção sobre trocar para o provider do usuário / avisar cota de plano após a aprovação de permissão não foram adotadas no código final e foram cortadas explicitamente por D44.

A forma concreta do «pool gratuito»: **quando uma tarefa fora do pico executa dentro da janela, ela usa um provider dedicado invisível ao usuário (idle plan, semelhante ao mecanismo de Start plan)**. Regras derivadas:

- Uma tarefa pausada por sensibilidade, depois de aprovada, **retoma imediatamente**, mas a retomada **não pode usar o idle plan** e troca para o provider pago do próprio usuário. A interação de aprovação precisa deixar explícito que «a continuação usará a sua própria cota do plano».
- O mesmo vale para «executar imediatamente» no estado queued: ao sair da fila já usa o provider do próprio usuário.
- Comentário de confirmação (2026-07-10) + refinação de D27: o gatilho da troca para o provider do usuário é «o usuário ativamente deixando que ela continue fazendo algo / assumindo» — aprovar a execução de uma operação sensível, executar imediatamente, ou enviar ativamente um prompt; **recusar e pular = veto + continuar sem supervisão → manter o idle plan** (D27). Todas as trocas são lógica puramente do cliente, e o servidor não fica sabendo.
- ⚠ A validar: se o mecanismo existente de troca de provider no meio da sessão (ver chat-model-change-notice) cobre o cenário de retomada.
- (O OPEN original foi decidido por D15/D26: time box de 3h para active + retomada automática.)

## D12 Agrupamento «em andamento» na barra lateral = exibição por workspace (decidido em 2026-07-09)

Agrega apenas as tarefas fora do pico do workspace atual, convivendo com a visão principal de automations. O agendamento continua serial global em nível de app (D7), e exibição e agendamento ficam desacoplados.

## D13 Limite multiplataforma = iniciar no desktop, leitura apenas no celular (decidido em 2026-07-09)

A entrada de início (switch da lua) e a aprovação sensível existem apenas no desktop; o controle remoto pelo celular, através da cadeia replayable existente, naturalmente vê apenas de forma somente leitura os ícones e agrupamentos de status, sem função especial e sem bloqueio.

## D14 Redefinição do campo «horário esperado de conclusão» (decidido em 2026-07-09)

Cortada a escolha do usuário entre três faixas (próxima janela / 24h / 48h) e o lembrete de expiração. O diálogo de submissão mostra apenas o **«horário de início previsto» somente leitura** = a próxima janela devolvida pela tabela de janelas do servidor; se no momento da submissão já se está dentro de uma janela, então é a janela atual → a tarefa roda imediatamente (quando chegar sua vez na posição de execução). O texto é ajustado: a proposta de valor do switch da lua é «executar na janela fora do pico», sem se prender à «noite».

> Depois de D21 isso é ainda mais enfraquecido: sem tabela de janelas não há o que calcular, e o diálogo de submissão e a barra de status passam a dizer «aguardando capacidade computacional fora do pico», sem nenhuma promessa de horário de início.

## D15 Running atravessando o fim da janela = trava do idle plan até o estado terminal (decidido em 2026-07-09)

**Conclusão: assim que a tarefa começa, o idle plan fica travado até o estado terminal, e o servidor faz a baixa da tarefa inteira como «tarefa iniciada dentro da janela».** Requisito rígido para o servidor: a liberação do idle plan não pode ser um «corte fora da janela», e precisa suportar «tarefa iniciada dentro da janela roda até o estado terminal» (período de tolerância ou identificador por tarefa), escritas no contrato de API.

> Complemento de D19: travar até o estado terminal é uma **garantia de atribuição e liberação do provider** (não rejeitar, não trocar), não uma garantia de dispensar a fila — cada requisição dentro da tarefa ainda pode entrar na fila.
>
> **Correção de D26 (2026-07-14)**: o servidor tem um teto rígido de active de 3h, e não «trava até o estado terminal». Atravessar as 3h = retirar um novo número com o mesmo task_id + retomar e continuar (ver D26).

Análise original:

O sistema de limiar de admissão de D3 permite que a tarefa passe do fim da janela, e D11 diz que o idle plan só está disponível dentro da janela; os dois se chocam:

- A (recomendado): trava do idle plan desde o início até o estado terminal, com baixa da tarefa inteira pelo servidor como tarefa iniciada dentro da janela e transbordo controlado.
- B: no instante do fim da janela troca para o provider pago do usuário e continua — isso queimaria o dinheiro do usuário enquanto ele dorme, o que é inaceitável a menos que haja consentimento explícito.
- C: parar no fim da janela (volta ao limite rígido, refutando D3).
  Depende de o idle plan do servidor recusar diretamente requisições fora da janela.

## D16 Forma de integração do idle plan = reuso do mecanismo de Start plan (decidido em 2026-07-09)

Provider embutido invisível, liberado pelo servidor durante o período da janela (incluindo a tolerância até o estado terminal de D15). O cliente reutiliza a infraestrutura no estilo Start plan, sem criar uma nova cadeia de envio de credencial temporária por tarefa.

## D17 Situação atual do servidor = os três itens são totalmente novos (confirmado em 2026-07-09)

Tabela de janelas / autenticação de criação + baixa / liberação do idle plan: nada disso existe hoje. O cliente começa trabalhando com mocks conforme o rascunho do contrato de API da spec, e o contrato é levado para alinhamento com o servidor/produto.

> Correção em D18: os três itens são reestruturados em «envio de configuração (tabela de janelas + limite de criação) / admissão de fila no gateway (protocolo de response header) / liberação do idle plan»; se o registro explícito e a baixa no estado terminal são necessários, fica a cargo do servidor decidir.

## D18 A fila vai para o servidor, e o cliente só faz tentativas e trata as respostas (decidido em 2026-07-09, corrige D6/D7/D17)

Arquitetura real revelada pelo usuário:

- **O servidor hospeda o núcleo da fila**: pool global de tarefas fora do pico, FIFO entre usuários (primeiro criado fica primeiro), e o servidor organiza a admissão de uma certa concorrência conforme a folga de recursos.
- **O cliente não hospeda a lógica de fila** e faz apenas três coisas:
  1. Criação: localmente limita a submissão conforme o limite de quantidade de tarefas enviado pelo servidor (não há interface de autenticação por criação; proteção de segurança de criação em excesso na mesma conta em múltiplos dispositivos é assumido naturalmente pela fila do servidor).
  2. Dentro da janela: inicia a tentativa de execução da tarefa queued mais antiga da máquina local, com a requisição indo ao servidor.
  3. Tratamento do response header de fila (na fila/liberado/posição/intervalo de retentativa): avisado de que está na fila → permanece queued (pode exibir a posição na fila) e retenta conforme Retry-After/backoff; liberado → running.
- ~~A «serialização estrita» local é mantida, mas degradada para política de execução~~ (refutado por D20: o cliente não limita concorrência).
- Efeito colateral: a exibição da posição «faltam N tarefas na sua frente» do PRD se torna realmente viável graças ao campo de posição do header (opcional).
- (Tudo o que estava «pendente de decisão do servidor» foi decidido: FIFO = registro prévio D25; baixa no estado terminal = settle D22; fila no meio de running D19.)

## D19 Cada requisição dentro da tarefa pode ser reenfileirada, e o servidor prioriza o melhor esforço da tarefa em execução (decidido em 2026-07-09)

Depois que a tarefa é admitida, **cada requisição de modelo pode ser reenfileirada pelo servidor**; o servidor faz o melhor possível com fila de prioridade para garantir que o Agent loop da mesma tarefa seja agendado primeiro (a admissão de novas tarefas cede lugar às requisições de continuação das tarefas em execução). leitura de implementação no cliente:

- O tratamento do header de fila é convergido para a **camada de adaptação do provider de idle plan** (Retry-After + retentativa com backoff), transparente para o agent runtime — o loop percebe apenas que «essa resposta está lenta». Conferir o reuso do mecanismo existente `bigmodel-business-error-retry`.
- Nenhum estado novo na máquina de estados: a tarefa permanece running; a barra de status da página de detalhes pode mostrar temporariamente «aguardando recursos fora do pico (posição N)».
- A espera na fila **não conta** para o julgamento de failed por «falhas consecutivas de API», e a espera não tem limite (esperar é grátis em cenário sem supervisão); apenas erros reais levam a um estado terminal.
- Quando o usuário cancela a tarefa, o loop de retentativa em espera é abortado.
- Comentário adicional (2026-07-10): um dos objetivos de projeto da fila prioritária do servidor é **garantir que as requisições da mesma sessãoo máximo possível rodem de forma contínua**, evitando inanição longa no meio do loop.

## D20 A concorrência é controlada pelo servidor, e o cliente não faz serialização local (decidido em 2026-07-09, refuta D7)

O usuário pode ter múltiplas tarefas fora do pico e múltiplas execuções concorrentes; **quantas execuções concorrentes cada usuário realmente recebe é decidido pelo servidor**. O cliente inicia todas as tarefas queued dentro da janela na ordem de entrada na fila, e a admissão e a cota de concorrência ficam todas no gateway (combinando com o protocolo de header de D18/D19).

- O despacho de uma única tarefa continua sendo single-flight (a transação de reivindicação impede o despacho duplicado da mesma tarefa), e não há limite local de concorrência entre tarefas.
- O risco de várias tarefas escreverem arquivos em paralelo no mesmo workspace é exatamente o mesmo de o usuário rodar manualmente várias conversas ao mesmo tempo (já permitido hoje), e não há isolamento por worktree.
- Confirmação por comentário (2026-07-10): futuramente concorrência por camada de plano (por exemplo, Max Plan com 3+ concorrentes) — política do servidor, sem impacto para o cliente.

## D21 O cliente não tem conceito de janela: polling de autorização de agendamento no lugar da tabela de janelas (decidido em 2026-07-10, substitui a forma da tabela de janelas de D2)

Origem: consenso nos comentários de um documento no Feishu. O cliente **não julga pico/fora do pico e não guarda tabela de janelas**:

- Apenas quando existe na máquina local uma tarefa fora do pico não terminal, faz polling da interface de autorização de agendamento do servidor; **o intervalo de polling é enviado pela interface e não fica hardcoded**.
- A resposta contém `canDispatch` (se pode despachar agora) + intervalo + maxTasksPerUser; canDispatch=true significa iniciar o despacho («submeter» = esta rodada de requisição de modelo pode ser liberada).
- Toda a flexibilidade fica no servidor: pode liberar 24h quando há capacidade sobrando e pode afrouxar a estratégia ao adicionar modelos pequenos com muito poder computacional — sem precisar de novo release no cliente.
- O espírito do sistema de limiar de admissão de D3 é preservado: o limiar deixa de ser «janela de tempo» e passa a ser «autorização do servidor»; depois do running, continua sem relação com a autorização (D15 trava até o estado terminal).
- A UI não faz mais nenhuma promessa de horário de início, e o texto é unificado como «aguardando capacidade computacional fora do pico».

## D22 Baixa no estado terminal = reporte explícito de settle + proteção por timeout silencioso (decidido em 2026-07-13)

O item pendente 2 da seção 7.6 foi decidido. Nova interface idempotente `POST /api/off-peak/tasks/{id}/settle` (status + endedAt), com o cliente no padrão outbox: reporta ao chegar no estado terminal, a coluna `settled_at` registra o ack, o ciclo de polling reenvia por conta própria e o scan no start do host cobre o resto. Ao receber, o servidor remove da fila de espera / do conjunto ativo e libera a cota; a recuperação por timeout silencioso é mantida como proteção. A baixa não é uma ação de cobrança, apenas contabilidade de recursos. Detalhes em tech-design §7.7.

## D23 Conversa hospedeira travada em todos os estados não terminais + provider vinculado ao escopo do run (decidido em 2026-07-13)

D5 só travou o estado queued, e este item completa a lacuna de running / awaiting_approval («o que acontece se o usuário digitar direto nesse session?»):

- **Trava em todos os estados não terminais**: o composer fica travado, e a superfície de intervenção manual é reduzida aos botões do estado correspondente: queued「Cancelar / Executar imediatamente」、running「Cancelar tarefa」、awaiting_approval「Aprovar / Recusar e pular / Cancelar」. O único caminho para conversar diretamente é primeiro cancelar (a automação termina, os arquivos são preservados e a trava é liberada) — «assumir = terminar a automação».
- Alternativa refutada: liberar a digitação durante running (mensagens humanas ficam depois da tarefa, com troca para o provider do usuário). Turns grátis/pagos intercalados na mesma sessão são inexplicáveis para o usuário e esbarram no limite semântico do queued prompt do desktop; o ganho de flexibilidade não compensa a complexidade.
- **Provider vinculado ao escopo do run**: a chave de seleção do idle plan é injetada apenas neste despacho, sem ser persistida na configuração da sessão; depois do estado terminal a conversa volta automaticamente ao provider do próprio usuário — caso contrário a primeira mensagem humana depois de desbloquear continuaria queimando o pool gratuito, violando D11 na direção oposta. Incluído nos critérios de aceitação do MR3.

## D24 Estratégia de espera longa: clamp curto × sondagem infinita, apoiada no Retry-After (decidido em 2026-07-13)

O servidor pode enviar um Retry-After de horas, e o cliente nunca dorme por muito tempo (em 2026-07-14 o servidor confirmou que o 429 retorna `Retry-After`; o portador é HTTP 429/3105, e não um header de resposta customizado):

- **Regra 1 (abandono no primeiro despacho)**: no estado queued, se o primeiro Retry-After > `max(10 minutos, pollInterval atual)` → abandona este despacho, a tarefa permanece queued esperando a próxima autorização, sem deixar o agent loop pendurado; o novo despacho reusa a semântica de resume da recuperação de interrupção.
- **Regra 2 (clamp por tentativa × sondagem infinita)**: no estado running, a espera de uma única vez = `min(Retry-After, 5 minutos)`, com sondagem idempotente ilimitada (3h ≈ 36 vezes), e um recurso que fique livre antes é capturado pela próxima sondagem. O clamp e o parsing de retry-after reutilizam a lógica existente de `bigmodel-business-error-retry`; **a isenção de orçamento é um switch novo** — o novo retry reason `offpeak_queued` contorna o retry budget unificado (senão hoje a tentativa falha na quarta ou quinta vez).
- **Regra 3**: a UI exibe a dica de retentativa com fidelidade, e cancelar/executar imediatamente ficam sempre disponíveis; ao cancelar, o temporizador de espera é abortado.
- **Duas obrigações do servidor**: lacunas de horas precisam ser expressas por uma válvula grossa (schedulable=false + intervalo de polling longo), e não admitir e depois dar um Retry-After de horas; a resposta de fila precisa ser retornada antes de a requisição ser aceita (zero efeito colateral de modelo), e um stream SSE não pode virar fila no meio do fluxo.
- Ponto de implementação: `apps/zcode-cli/packages/adapters/src/model/{failure-inspection,failure-classifier,runner-retry}.ts`, detalhado em tech-design §4.3.

## D25 Contrato do servidor convergido para quatro interfaces de ciclo de vida da tarefa (decidido em 2026-07-13, substitui o poll global de D21, decide o item 7.8-1)

> **Forma de interface histórica, substituída por D26.** O `POST /register`, o `GET /:taskId`, o 409 e o `maxTasksPerUser` abaixo servem apenas para preservar o processo de evolução e não são o contrato atual do cliente.

**Retirar número → fazer polling → requisição de modelo → liquidar**:

1. `POST /register` — retira o número na criação da tarefa, e o servidor registra na FIFO global pela ordem de registro (**este é o registro prévio, decidido o item pendente 1 de 7.8**: a ordem FIFO é memorizada pelo servidor, eliminando falsificação de queuedAt e contornamento multi-dispositivo), e valida o maxTasksPerUser aqui (409 ao exceder).
2. `GET /:taskId` — **substitui o poll global de D21**: devolve `status + schedulable + queuePosition + nextPollAfter`. schedulable=true ≡ janela aberta + vez na fila (válvula grossa, por tarefa).
3. `POST /messages` — = /chat chamando o modelo, iniciado depois de schedulable. O detalhe de D19 fica aqui: manter o número em running e poder limitar uma requisição com backoff (clamp curto × sondagem infinita de D24).
4. `POST /:taskId/settle` — libera o número / a vaga de concorrência no estado terminal (D22 entra no ciclo de vida).

Consequências: ① o poll global `GET /poll` / a tabela de linha única `off_peak_poll_state` são abolidos, e schedulable/queue_position/next_poll_at passam a ficar na linha de `off_peak_tasks` (lida pelo scheduler entre processos); ② a submissão deixa de ser «localmente sempre bem-sucedida» e passa a poder falhar na ida e volta (409/rede), então a UI precisa de um estado de falha — com isso o «sem interface por criação» de D18 é refutado; ③ a autoridade do maxTasksPerUser está no 409 do register, e a contagem local do cliente serve só para prever o estado do botão, sendo o excesso multi-dispositivo barrado pelo servidor; ④ o controle de concorrência = o servidor decide quantas tarefas são tornadas schedulable ao mesmo tempo.

- Mantido em aberto: se register e o primeiro messages devem ser fundidos (atualmente opta-se por «fazer polling até schedulable e só então enviar messages», com responsabilidades mais claras).

> **Substituição por D26 (2026-07-14)**: alinhamento com o contrato real v2 do servidor — register→`POST /ticket` (devolve o ticket_id Snowflake do servidor), GET por task→`POST /ticket/status` em lote, schedulable→estado ready do servidor. Ver D26.

## D26 Alinhamento ao contrato v2 do servidor (decidido em 2026-07-14, corrige D3/D9/D15/D24/D25)

Comparação com `off_peak_design.md` (v2) do `zcode-server` feat/off-peak. O servidor é um **sistema de admissão com time box rígido**, diferente da nossa hipótese de «roda até o estado terminal».

**1. Dois IDs (task_id / ticket_id).** O cliente submete seu próprio `task_id` (um id estável por tarefa fora do pico, significativo dentro do usuário e sem exigência de unicidade global); o servidor retira o número e gera um `ticket_id` Snowflake, e a partir daí status/settle/messages usam **sempre o ticket_id**. A tabela local ganha a coluna `server_ticket_id`, preenchida no sucesso da retirada e atualizada ao retirar de novo.

**2. Máquina de estados de dois eixos.** Estado de admissão do servidor `queued→ready→active→expired/settled`; estado de execução do cliente `queued/running/awaiting_approval/estado terminal`. O mapeamento: **schedulable ≡ ready do servidor**, **running ≡ active do servidor**, estado terminal do cliente→settle→settled no servidor, expired no servidor→dispara retomada ou falha.

**3. A janela de baixa demanda está no servidor, e o cliente continua sem conceito de janela (D21 se confirma).** `queued→ready` só é promovido dentro da janela de baixa demanda do servidor (por padrão 00:00-08:00 + 12:00-14:00, Asia/Shanghai, com suporte a cruzar a meia-noite); fora da baixa demanda é possível retirar número e consultar a posição, mas sem promoção. O cliente não guarda nem julga a janela e apenas faz polling do state; o texto«aguardando a janela fora do pico»é agora literalmente verdadeiro. Tickets já ready/active não são afetados pelo fim da janela. **Correção de D9**: perder a janela em `queued→ready` = esperar a próxima janela de baixa demanda (sem descartar) se confirma; mas ready de 5min e active de 3h são cronômetros rígidos.

**4. Teto de 3h + retirada automática de novo número para retomada (itens ①② decididos).** O servidor tem um teto rígido de active de 3h, sem renovação deslizante, e ao expirar a mensagem recebe `400/3102` — **corrige D15/D3**: o idle plan é um time box de 3h, e não «trava até o estado terminal». A cota de retirada de números na prática é relaxada: **o mesmo task_id pode retirar números várias vezes** (após expirar, retirar de novo com o mesmo task_id → novo ticket_id). O cliente faz **retomada automática**: active expirado / 400/3102 recebido → retira um novo número com o mesmo task_id → volta para queued esperando o próximo ready → retoma a mesma session e reenvia → o agent loop conclui naturalmente → settle. Na perspectiva do usuário é uma tarefa alternando running/espera e terminando aos poucos; cada trecho de 3h é um ticket, e a tarefa atravessa múltiplos tickets.

**5. Alinhamento de interfaces/headers (substitui a forma de D25).**

- `POST /api/v1/off-peak/ticket {task_id}` → `{ticket_id, state, position, next_poll_after, …}` (retirar número, podendo já vir ready).
- `POST /api/v1/off-peak/ticket/status {ticket_ids:[…≤100]}` → status em lote (position / active_deadline).
- `POST /api/v1/off-peak/ticket/:ticket_id/settle` (somente JWT, sem body).
- `POST /api/v1/off-peak/anthropic/v1/messages`, com os headers `Authorization: Bearer <jwt>` + `X-Coding-Plan-Api-Key: <key original>` + `X-Off-Peak-Ticket-ID: <ticket_id>`, e body nativo do Anthropic.
- O provider de idle plan = provider cujo baseURL aponta para esse endpoint de messages e cujo auth é JWT + coding-plan-key; o servidor guarda a key upstream (concretização do pool gratuito). Os modelos são limitados pela lista de permissões `allowed_models`, com body de até 10MB.

**6. Mapeamento de códigos de erro v3 (documento do servidor de 2026-07-16, corrige o 3001 da v2).** `3101/403` sem coding plan válido→bloqueia a submissão; `3103/429` cota de retirada de número (+next_take_at, já relaxado); `3105/429` concorrência de modelo no máximo→**com `Retry-After`**, e o cliente faz backoff de `min(Retry-After,5min)` conforme D24, consumindo o orçamento de 3h; `3103/429` cota de retirada de número→com `next_take_at` (tempo absoluto, e não Retry-After); `3102/400` ticket indisponível (expirado/settled/inexistente/de outra pessoa)→**dispara a retomada com retirada de novo número, e não é um erro comum**; `3006/400` modelo fora da lista de permissões→validar com allowed_models antes da submissão; `3011/499` cancelamento pelo cliente→resultado esperado; `2001/2002/2007/2010`(500) falha de dependência→backoff transitório. **O sinal real de reenfileiramento/limitação é HTTP 429/3105 + Retry-After, e não o header de resposta `X-OffPeak-Queue` imaginado no início** — o backoff de D24 se baseia nisso, e a formulação de header em §4.3/§7.6 deve ser entendida assim.

**7. O que o cliente precisa assumir.** Fornecer `X-Coding-Plan-Api-Key` (a key original do provider de coding plan do usuário); fazer polling em lote contínuo para dirigir a promoção (o servidor não tem scheduler residente, e consultar o status já dispara o Promote); manter task_id↔ticket_id e guardar server_ticket_id.

(Problema ③ do next_poll_after de ready de 5min disputando o primeiro envio: não tratado nesta iteração.)

## D27 Confirmação de fechamento (decidido em 2026-07-14)

> **Correção do status de implementação**: a lista de permissões de modelos, a retirada de número na submissão e a retirada de novo número após expiração já foram implementadas; a máquina de estados de aprovação dedicada ao Off-Peak da seção abaixo (troca para o provider do usuário após a aprovação / recusa e pulo) não foi adotada no código final, ver D44.

Confirma de uma vez todos os pontos restantes:

- **Recusar e pular mantém o idle plan**: a troca para o provider do usuário acontece somente quando «o usuário ativamente deixa que ela continue fazendo algo / assume» (aprovar a execução de uma operação sensível / executar imediatamente / enviar ativamente um prompt); recusar e pular é veto + continuar sem supervisão, e o idle plan é mantido (refinando D11).
- **Modelo: escolha do usuário + validação prévia por allowed_models**. → exige que o servidor exponha `allowed_models` ao cliente (nova interface ou envio por config) — **um novo item de alinhamento para o servidor**. O 3006 funciona como proteção.
- **Submissão já retira número**: entrar na fila já faz `POST /ticket`, e mesmo fora da baixa demanda retira número e entra na FIFO exibindo a position, apenas não é promovido a ready.
- **Ticket ready de 5min inutilizado = retirada automática com o mesmo task_id**: tratado de forma idêntica à expiração de active de 3h (a unificação «qualquer expired → retirar de novo com o mesmo task_id e retomar»; o problema ③ não ajusta o intervalo de polling nesta iteração).
- **files_changed**: reutiliza o diff de task existente, conferido no MR4, sem decisão separada.
- **settle liquida apenas o ticket atual**: tickets antigos expirados já estão em estado terminal naturalmente no servidor e não precisam de settle.

### Lista de alinhamento com servidor/produto (levar para fechar)

1. Documentar que 429/3105 retorna `Retry-After` (confirmado verbalmente, documento v2 ainda pendente).
2. ~~Expor `allowed_models` ao cliente~~ ✅ resolvido (2026-07-15): o servidor envia por gradual rollout, via `GET /api/v1/client/configs` compartilhado, em `data.configs.offPeak.allowed_models` na §11.1, ver D31.
3. Valor real de relaxação de `take_number.limit` (já foi confirmado que várias retiradas pelo mesmo task_id são permitidas).

### Spikes de código antes de começar (verificação factual, não decisão)

- `session/resume` continuando entre tickets + `updateRuntimeModelConfig` trocando de provider no meio.
- Se o cliente consegue ler a Coding Plan API Key original (`X-Coding-Plan-Api-Key` como pré-requisito).
- Se `bigmodel-business-error-retry` suporta 429+Retry-After.

## D28 Paradigma de UI = entidade irmã de Automation, e o design manda (decidido em 2026-07-14, refuta o paradigma conversacional de D5/D23)

> **Correção de leitura (2026-07-28)**: o «Automations Tab (All / Scheduled tasks / Idle-time task)» deste item foi estreitado por D47 para duas tabs, Scheduled e Idle, e a visão geral mista All foi removida; as demais decisões continuam valendo.

Paradigma finalizado no Figma (⚫️ Z.ai - Zcode / página Automations & Tarefas Fora do Pico): a tarefa fora do pico é uma **entidade sob o sistema Automations**, e não um «envio atrasado em uma conversa».

- **Criação**: formulário de página inteira na visão principal de Automations (Task title + Instructions + projeto + dropdown Ask for approval + modelo + seleção de horário Idle-time), com duas tabs Settings/History — reuso completo do paradigma de criação das tarefas agendadas do feat/cron.
- **Lista**: Automations Tab (All / Scheduled tasks / Idle-time task), com cartões tendo selo de posição na fila e menu de ações.
- **Entradas** (≥4): botão na visão principal de Automations, barra de orientação + cartões de template na página New task, toast de orientação dentro da conversa para 429/cota esgotada do Coding plan, e Create via chat. **O switch da lua no composer do PRD não existe mais.**
- **Abolições/refações em cascata**: D5 (envio atrasado + trava de fila) e D23 (trava do composer em estados não terminais, semântica de assumir) são abolidos por inteiro — run→nova session, sem problema de conversa travada; o ícone de status da lua na barra lateral, o diálogo de confirmação de envio por conversa e o «lembrar preferência por 30 dias» desaparecem com o paradigma. A retomada de 3h de D26, o contrato de quatro interfaces, a estratégia de espera de D24 e os limites de cobrança de D27 **continuam valendo** (agindo na camada de execução do run).
- Detalhes posteriores de UI têm essa página do Figma como única fonte de verdade, e o checklist de UI da spec §5 é reescrito segundo o design (unificado nesta rodada de grilling).

## D29 Interações do design, primeira leva (grilling 2026-07-14)

> **Correção do status de implementação**: o dropdown de permissões foi mantido; «aprovar = assumir = trocar para a key do usuário» e o estado de espera dedicado não foram adotados no código final, ver D44. O que segue abaixo é o feedback de design da época, e não o contrato de UI atual.

Com a página Automations & Tarefas Fora do Pico do Figma como fonte de verdade, cada ponto foi decidido:

1. **Entidade de uso único**: criar já retira número e coloca na fila → ao terminar vai para o estado terminal; sem Run again (um ticket settled do servidor não pode ser retirado de novo com o mesmo task_id; rodar de novo = criar um novo task_id, entrando pelo template ou pela cópia).
2. **History = uma linha resumindo toda a execução**: a segmentação de 3h é transparente para o usuário e não gera uma linha por trecho; Go to session pula para a sessão única.
3. **Pause/Continue (plano A + Continue manual)**: Pause = o cliente para de despachar, e o ticket continua na fila do servidor; se durante a pausa chegar a ready e não for pego → o ticket expira naturalmente em 5min → **fica parado no estado Paused, sem retirar número automaticamente**; Continue: ticket vivo = retomar o despacho (custo zero), ticket inutilizado = retirar número manualmente agora e voltar ao fim da fila. O consumo de cota é sempre disparado por uma ação explícita do usuário. → Ajuste de texto para o design: o tooltip «voltará a ser colocado na fila» deve virar «é preciso continuar manualmente para entrar na fila de novo».
4. **Permissão padrão = Ask for approval** (prioridade à segurança), com alerta no próprio formulário: «durante a execução fora do pico não há supervisão, e as operações que exigirem confirmação pausam a tarefa até você responder». As quatro opções ficam abertas (Ask/Edit automatically/Plan/Full access, mapeadas para o ZCodeTaskMode existente). Derivadas: aprovar = assumir = trocar para a key do usuário e rodar até o fim (D27, o ticket deixa de ser necessário depois); recusar e pular mantém o idle plan, e a retirada de novo número quando o ticket já expirou fica presa à ação explícita «recusar».
5. Adotado direto do design (sem controvérsia): botão de criação cinza ao atingir o limite + tooltip "Free tier limit reached"; usuário sem coding plan com botão bloqueado + "apenas para usuários de coding plan"; múltiplas tarefas na fila ao mesmo tempo (vários cartões na mesma tela cada um com sua posição); dropdown de modelo = forma de lista de permissões allowed_models.

## D30 Interações do design, segunda leva + revisões em cascata do paradigma (fechamento do grilling 2026-07-14)

1. **Est. de espera prevista é cortado**: o cartão mostra apenas a posição (#N in queue), e o cliente não faz nenhuma estimativa de tempo (aplicação da leitura de D14); o servidor não precisa adicionar campo de estimativa. → Item de alteração no design.
2. **Leitura final da cota**: distinct task_id dentro de uma janela móvel de 24h ≤ o número configurado no servidor (**incluindo Paused**, sem devolução); várias retiradas com o mesmo task_id não contam de novo (retomada/Continue/nova retirada após recusa são todas isentas). O texto acompanha a configuração («X execuções gratuitas a cada 24 horas»). → Item de alinhamento com o servidor decidido.
3. **Manter acordado = um único switch global**, com pontos de entrada espelhados na faixa da lista, na página de criação e em General das configurações, e texto unificado; implementação = a configuração `keepAwakeWhileRunning` + o powerSaveBlocker em vigor enquanto existem tarefas em execução (a forma concreta de D4).
4. **As entradas convergem para duas**: botão na visão principal de Automations + barra de orientação e cartões de template na página New task (template = formulário de criação pré-preenchido). **Cortado**: o toast de orientação dentro da conversa para 429/cota esgotada do Coding plan (esse frame de design v1 foi abolido), e o Create via chat para fora do pico.
5. **Barra lateral**: agrupamento de sistema da visão Group「Idle-time task」(agregação entre projetos, com selo de contagem); não aparece na visão Project; **D12 por workspace é abolido**. Clique no item: sem sessão (na fila/pausada) → página de detalhes da tarefa; com sessão → pula direto para a conversa (deixando «ver tarefa» no topo para voltar aos detalhes).
6. **Cartão em estado terminal**: mantido em exibição (selo Succeeded/Failed + horário), pode ser excluído e não é limpo automaticamente. O critério de ordenação foi revisto para apenas `createdAt` decrescente, sem agrupar por ativo/terminal.
7. **Janela de edição**: queued/paused com todos os campos editáveis (o ticket só trava a identidade na fila, e o prompt só é lido no despacho); a partir de running a edição é bloqueada (só cancelar); estados terminais são somente leitura. O diálogo de descarte de rascunho segue o paradigma scheduled.
8. **Revisão da decisão de D25 (em cascata do paradigma)**: não se «pré-cria a conversa hospedeira na submissão» — a criação grava apenas os dados do formulário + retirada de número; **no despacho o createTask cria uma nova session** (igual à automation), o sessionId é preenchido na primeira execução, e a recuperação de interrupção ainda retoma a mesma session.
9. **Revisão de D23 (em cascata do paradigma)**: a trava do composer é abolida — a run session é uma conversa comum, e o usuário falando durante running segue o estado atual do z.code (mensagens na busy queue); mas **as mensagens enfileiradas precisam passar pelo provider do próprio usuário** — o «provider vinculado ao escopo do run» de D23 fica ainda mais crucial (evita que uma fala no meio e o chat depois do estado terminal queimem o pool gratuito), e entra nos critérios de aceitação do MR3 + cobertura de spike.
10. **Novo estado paused na máquina de estados** (ação do usuário): queued ⇄ paused (Pause/Continue); um ticket expirado durante o paused continua em paused (D29-3); paused pode ser cancelado e editado.

### Lista de feedback para o design (levar para alinhamento)

1. Remover Est. do cartão e deixar apenas a posição.
2. Texto do tooltip de Pause: «o ticket de uma tarefa pausada que chegou a ser numerada mas não começou expira, e é preciso «continuar» manualmente para entrar na fila de novo» (o texto atual sugere devolução automática, o que conflita com a semântica de Continue manual).
3. A permissão padrão continua Ask for approval, mas o formulário precisa de uma linha de alerta: «durante a execução fora do pico não há supervisão, e as operações que exigirem confirmação pausam a tarefa até você responder».
4. Faltam designs para os estados: selo do cartão em running, estilo do cartão em estado terminal (Succeeded/Failed), estado de cartão awaiting_approval e o estado de aviso Paused-ticket inutilizado (precisa continuar manualmente).
5. O estilo das notificações do sistema não foi desenhado (conclusão/falha/aguardando confirmação, com interação conforme D10: botões best-effort no macOS e clique pulando para a sessão).
6. O texto "One free run every 24 hours" passa a acompanhar o número configurado no servidor.
7. O frame de entrada de baixo volume dentro da conversa (toast de 429/cota esgotada) fica abolido na v1.

## D31 Integração do switch de gradual rollout no cliente (decidido em 2026-07-15, alinhado à §11.1 do servidor)

O novo design do servidor acrescenta a §11.1: a entrada Off Peak no cliente é enviada por gradual rollout pela **interface de configuração compartilhada existente** — `GET /api/v1/client/configs` (Authorization opcional, Common Params pelo Header unificado existente) — e o cliente lê de `data.configs.offPeak`, com **zero requisições novas**. O z.code já tem consumidores dessa interface (`forceUpdateGuard.ts` para a checagem de atualização forçada no start, `bigmodelCodingPlanSubscriptionProvider.ts`), e o cliente reutiliza diretamente a cadeia de fetch.

Campos: `enable_offpeak_task` (switch principal da funcionalidade; false, ausente, ou chave não enviada por não atingir o gradual rollout significam desligado) + `allowed_models` (lista de modelos que o usuário do gradual rollout pode escolher). O servidor deixa explícito: essa configuração **controla apenas a exposição e a exibição de modelos**, e não substitui a autenticação do servidor / o julgamento de baixa demanda / a admissão de ticket / a validação da lista de permissões (o 3006 de proteção permanece, e D27 se confirma).

Três decisões do cliente:

1. **Não atingir o gradual rollout = ocultar completamente, e ficar preso dentro do gradual rollout**: a tab Idle-time, o botão de criação, o cartão de template e o agrupamento da barra lateral não são renderizados; o «cinza travado para quem não tem coding plan» (D29-5) só tem efeito depois que o gradual rollout é atingido. O julgamento de exposição tem duas camadas: gradual rollout ligado → depois verificar o coding plan.
2. **Critério de habilitação válida = `enable_offpeak_task === true` e `allowed_models` não vazio**: lista vazia/ausente é tratada como configuração incompleta, ou seja desligado (oculto), sem exibir um formulário que não pode ser submetido.
3. **Virada do gradual rollout no meio do caminho: o estoque continua rodando, e apenas a entrada de criação é escondida**: depois que a configuração é atualizada e enable fica false — a entrada de criação (botão/cartão de template) é escondida; se existirem tarefas não terminais, a tab Idle-time e o agrupamento da barra lateral continuam exibindo o estoque e o deixam rodar até o estado terminal (a admissão de ticket do servidor é a verdadeira autoridade); sem estoque, tudo é ocultado. Tarefas do estoque cujo modelo saiu da lista de permissões não são pré-julgadas, e no despacho um `400/3006` segue o tratamento de falha existente.

Derivadas: o item 2 da lista de alinhamento de D27 (expor allowed_models) é fechado; um item é acrescentado aos spikes — confirmar o momento atual de fetch de client/configs (forceUpdateGuard é uma única vez no start), e o ritmo de atualização do gradual rollout pode exigir um fetch extra ao abrir a entrada.

## D32 «Executar imediatamente» cortado na v1 (decidido em 2026-07-15)

> A remoção de «Executar imediatamente» foi implementada; a troca para o provider do usuário no fim desta seção é apenas a intenção restante da convergência da época, e hoje não há ligação de runtime.

O menu de cartão decidido em D30 (queued=Pause/Delete/editar) e o Figma não têm entrada «Executar imediatamente», mas a tabela de limites de cobrança da §0, os pequenos itens remanescentes de D18 e a lista de RPC ainda traziam essa entrada, e o documento se contradizia. Confirmado com o usuário: **vale o menu de cartão do Figma/D30, e a v1 não faz execução imediata**. Se quiser rodar agora = cancelar a tarefa e abrir uma conversa por conta própria. Limpeza em cascata: a linha correspondente na tabela de limites de cobrança, o RPC `offPeakRunNow`, a linha «queued→saída da fila» na tabela de migração e o «Executar imediatamente» na lista de gatilhos de assumirativamente do §3 da spec. O gatilho de troca para o provider do usuário converge para dois: aprovar a execução de uma operação sensível, e enviar ativamente um prompt dentro da run session.

## D33 Escopo de execuçãode execução = injeção de runtimeModel por turno (decidido em 2026-07-15, implementa D23/D30-9)

O spike ② (tech-design §11) provou: definir um modelo na session persiste em três camadas (cache do app `runtimeModelConfigBySessionKey` / `record.modelRuntime` da CLI / catálogo do workspace), e a fala do usuário durante o busy e o chat depois do estado terminal seriam drenados para o idle plan, violando D23/D30-9. Depois de comparar dois planos e confirmar com o usuário, fica decidido **(a) injeção por turno**:

- Cada sendPrompt de despacho carrega separadamente o runtimeModel do idle plan, válido apenas para aquele turno; não escreve o modelo residente da session, não cai nas três camadas de cache e não toca no catálogo do workspace (semântica `applyWorkspace:false`).
- O modelo residente da session é sempre o do próprio usuário → a fala no meio e o chat depois do estado terminal vão **naturalmente** pelo provider do usuário, sem problema de timing de volta.
- O runtime da CLI precisa tratar «modelo residente da session» e «modelo temporário do turno ativo» como dois estados: `ensureModelReady` pode validar o alvo temporário do turno ativo, mas não pode voltar automaticamente ao modelo do usuário só porque ele não está no catálogo do workspace; essa exceção é autorizada apenas pela marca de turno ativo em memória, e não pode afrouxar o limite normal do catálogo de modelos ocultos.
- O registry de providers pode ser atualizado a quente durante a execução de um turno. Cada reconstrução de overlay/registry precisa usar «o catálogo de workspace mais recente + o runtimeModel do turno ativo atual», e é proibido remover o provider temporário das retentativas seguintes de um turno em andamento; o modelo do usuário só é restaurado depois que o turno termina, limpando o provider temporário segundo o catálogo de workspace mais recente.
- Aplicação, hot reload, recuperação e limpeza precisam entrar na mesma fronteira de serialização da configuração de modelo da session; a recuperação e a limpeza vêm antes do ready/drain da fila. Se a restauração do modelo original falhar, as credenciais temporárias ainda precisam ser limpas, com proteção de segurança dos modelos disponíveis do catálogo do workspace, e não pode sobrar um meio-estado com «runtime apontando para um provider temporário já removido».

```text
workspace catalog ───────────────┐
                                 ├─ latest catalog + active turn override ── model registry
sendText(turnRuntimeModel) ──────┘                              │
                                                               ├─ provider registry refresh: 保留 override
turn finally: restore user model ── clear active override ─────┴─ rebuild latest workspace-only registry
                                                               └─ release ready / drain queue
```

- Alternativa refutada (b): createSession definindo o idle plan + volta explícita por evento no estado terminal + interceptação antes do drain — a superfície de mudança é menor, mas existe uma corrida entre a volta e o drain da fila.
- Custo (aceito pela engenharia): o lado do agent service / da CLI precisa de um canal de runtimeModel por turno que não vá para cache (o `ZCodeAgentSendPromptParams.runtimeModel` existente não está ligado ao caminho principal sendText da V4 e, depois do send, escreve em cache, precisando de extensão).
- Decisão de engenharia associada (mesmo dia): o mock do servidor é entregue como **mock em processo + switch de ambiente** (o cliente HTTP real é implementado conforme o contrato, e o switch liga o mock para permitir testar o fluxo completo na máquina real, com a integração apenas removendo o switch); o E2E é feito nesta rodada também (a poda de catálogo/matriz é confirmada antes com o usuário).

## D34 Completar o campo de profundidade de raciocínio (decidido em 2026-07-16)

Omitido ao redigir o modelo de domínio: a superfície de configuração da automation é model + provider + mode + thoughtLevel, e ao redigir off-peak só foram trazidos model + permissionMode(=mode); o `thoughtLevel` não foi trazido — D1–D33 nunca discutiram se as tarefas fora do pico deveriam ter profundidade de raciocínio, e nem decidiram incluir nem cortar. O composer do formulário de criação do Figma desenhou um seletor de profundidade de raciocínio `Max ▾` (igual à automation), o que prova que deveria existir.

**Conclusão: completar `thoughtLevel`, alinhado à automation.** O provider continua não sendo trazido (fora do pico é fixo em idle plan, D26/D33). Atravessa: tipos shared / parâmetros de criação + coluna `off_peak_tasks.thought_level` + protocolo OffPeakRun + o `setConfigOption("thought_level")` do despacho no host (mesmo caminho da automation, com a injeção de provider por turno inalterada) + o dropdown de profundidade de raciocínio na barra do composer da UI. O padrão segue o padrão do workspace (não preenchido significa não enviar).

## Itens remanescentes (decididos junto no mesmo lote)

- ~~Operação no estado queued = cancelar / executar imediatamente~~ (substituído pelo menu de cartão de D30 + D32: queued=Pause/Delete/editar, sem execução imediata); failed não tem retentativa automática e pode ser reenfileirado manualmente (com nova autenticação).
- Os campos «capacidade consumida / capacidade restante» da página de detalhes são cortados naturalmente junto com a ausência de saldo e de provider invisível.
- «Lembrar preferência por 30 dias» guarda apenas um campo, o modo de permissão.
- Nomenclatura unificada no código em `offPeak` (tabela `off_peak_tasks`), sem mudar o nome do branch.
- Todos os textos relacionados a saldo, como o redirecionamento «ir para recarregar», são abolidos.

## D35 Conclusões da verificação quadro a quadro do Figma para os estados de borda (decidido em 2026-07-16)

Após medir com uma instância isolada do agent-browser todos os frames relacionados a idle da página Automations & Tarefas Fora do Pico do Figma, convergiu-se:

1. **Implementação completada (presente no Figma, já listado na spec ou sem conflito)**: diálogo de descarte de rascunho (4889-1942, a spec §5 já exigia «seguir o scheduled» — mas o próprio scheduled não estava implementado, e o fora do pico foi o primeiro); tab History em forma de tabela (Instructions/Triggered/Status/Duration + menu de linha, 4866-2819) + estado vazio na criação「No history yet.」(4866-3106); estilo de duas linhas no dropdown de permissões + ✓ no selecionado (4835-4974, reusando o texto `mode.description.glm.*` do composer principal); aviso no canto superior direito quando o acesso total não está habilitado (4970-2055).
2. **Cinza ao atingir o limite = reativo (estado de transição, substituído por D38)**: o cliente atual não tem API de consulta de cota (o contrato de quatro interfaces não tem esse endpoint), então o cinza de "Free tier limit reached" só pode ser ativado depois de a criação receber um 3103, e limpo na próxima criação bem-sucedida. O gateway de mock ganha a injeção `ZCODE_OFFPEAK_MOCK_QUOTA_COUNT` para permitir a aceitação. **Plano futuro**: depois de criar a interface de consulta de cota, mudar para consultar a cota ativamente antes de abrir a entrada / renderizar o botão de criação, sem depender do evento de falha 3103 para um cinza reativo. A implementação atual serve apenas comproteção de segurança para antes da existir interface de cota.
3. **Estado travado para quem não tem coding plan = julgamento do cliente pelo registro do instante atual (decidido pelo usuário em 2026-07-16, refuta a «adiado» da primeira versão deste item; a fonte de verdade da elegibilidade foi substituída por D40)**: na época ficou acordado não esperar um campo de entitlement do servidor — sem assinatura válida, `codingPlanProviderAvailability` já põe o provider de coding plan com `systemDisabledReason` e sincroniza o registro do renderer em tempo real, e a UI julga por `hasActiveCodingPlanProvider` (zai/bigmodel coding plan + conexão de plano de equipe bigmodel; Start plan não conta), com zero requisições novas. O travamento tem prioridade sobre o cinza de limite atingido; e o registro não pisca o travamento enquanto carrega. A demonstração de mock usa o canal forçado `codingPlanActive` (`ZCODE_OFFPEAK_MOCK_NO_PLAN=1` para demonstrar o estado travado), e o caminho real não envia esse campo. D40 demonstra ainda mais que varrer amplamente o registro divergiria da credencial de runtime, e a situação atual mudou para o host resolver a selected connection atual e devolver o support des- à UI.
4. **Mantido como abolido**: agrupamento automático «excedeu o tempo de fila» + toast de devolução automática da fila (4866-2175 parcial, refutado pela seção §266 das decisões D); frame de entrada de baixo volume dentro da conversa (4828-1642, abolido na v1 por D30-4); card idle com Est. na tab All (D30-1).

## D36 Cinza ao atingir o limite = cota de configuração + prever com registro local (2026-07-16, decisão do usuário, substituído por D39)

Fonte de verdade do contrato do servidor: repositório interno `zcode/zcode-server`, `docs/off_peak_design.md` (§11.1).

**Forma alvo**: não bater na parede — deixar o botão de criação cinza com antecedência, pelo «limite de cota de retirada de números enviado pelo servidor + registro local de retiradas na janela móvel».

**Confirmação dos nomes de campo (fechamento de D36 em 2026-07-17)**: o `data.configs.offPeak` do servidor envia hoje uma estrutura de três camadas `enable_offpeak_task` / `allowed_models` / `limit: { max_tasks, sliding_window }` (exemplo `{"max_tasks": 5, "sliding_window": 86400}`). A unidade de `sliding_window` é **segundos** (e não dia natural), e `max_tasks` é o número máximo de tasks submetidas com sucesso dentro da janela móvel. A leitura do cliente fica consistente com o `off_peak.take_number.{limit,window}` do servidor — campo ausente/inválido/sem match do gradual rollout → tratado como não ser possível submeter nova task (o 3103 continua sendo proteção de segurança, como antes do bloqueio de D36).

**leitura de contagem (correção autoritativa de D30-2)**: a contagem é por `off_peak_tickets.created_at` do usuário na janela móvel, e cada criação bem-sucedida de ticket conta uma vez; a isenção idempotente **vale somente enquanto o ticket mais recente não expirou** — retomada/Continue com o ticket do mesmo task_id ainda vivo é isento, mas **um Continue/nova retirada depois que o ticket expirou cria um ticket novo e conta na cota** (a expressão «retomada/Continue/nova retirada após recusa são todas isentas» de D30-2 é ampla demais e foirestricted pelo documento do servidor). settle / expiração de ready / fim de active **não devolvem** a vaga ocupada; quando o tempo de criação do ticket sai da janela móvel, a vaga se recupera automaticamente.

**Inevitável imprecisão da contagem local**: a retomada e a retirada após expiração consomem cota no servidor, mas não necessariamente criam uma nova linha em `off_peak_tasks` no cliente; com múltiplos dispositivos é ainda menos visível. → A contagem local serve apenas como **previsão** (cinza antecipada reduzindo cliques inúteis), e o 3103 do servidor é sempre proteção de segurança autoritativo. Caminho de implementação: `resolveOffPeakClientConfig` faz o parsing de `limit` → o repo ganha a contagem de retiradas de ticket na janela móvel → `count >= max_tasks` deixa o botão de criação cinza antes, mantendo o 3103 comproteção de segurança.

## D37 Fechamento das divergências de Figma em Automations (decidido em 2026-07-20)

Tomando 12 artboards do Figma e cerca de 49 diffs de imagem como fonte de verdade de UI, e preservando ao mesmo tempo a semântica de agendamento e de sessão já estabelecida:

1. **Camadas de nomenclatura**: UI em inglês=`Idle-time task`, UI em chinês=tarefa fora do pico; o domínio técnico usa respectivamente `OffPeak*` / `offPeak*` / `OFF_PEAK_*` / `off-peak` / `off_peak_*`.
2. **Limite de projetos locais**: toda a criação de Automations lista apenas os projetos locais já abertos e disponíveis na janela atual, sem recent/remote; após a criação o projeto não pode ser modificado. As tarefas remotas existentes continuam visíveis e gerenciáveis.
3. **Limite por dispositivo**: o `/remote` do celular esconde completamente o Automations; o workspace remoto do desktop esconde o Idle-time.
4. **Navegação do cartão**: o clique principal do cartão entra sempre em Settings/History; Go to session é uma operação secundária explícita.
5. **History continua uma execução única integrada**: cada task tem apenas 0/1 linha e não há tabela de runs. Aparece depois de `startedAt`; em andamento é unificado como `In progress`, e os estados terminais mapeiam para Succeeded/Failure/Skipped. Delete history escreve apenas `historyDeletedAt` para esconder a linha, sem apagar a tarefa, a sessão ou os campos de execução, sem confirmação e sem Undo.
6. **Limite dos avisos**: na primeira submissão sem Full access aparece um aviso, mas a criação acontece imediatamente; o template sem assinatura mostra um Toast de 8 segundos com Upgrade e um X para fechar; botões travados continuam mostrando Tooltip.
7. **keep-awake e cota (a parte de cota foi substituída por D39)**: keep-awake continua sendo um setting global persistente, e a criação não o modifica; ficou acordado naquela época que a contagem de configuração local serve apenas para previsão de UI, e que o 3103 do servidor permanece a autoridade final.
8. **Aceitação**: 1440×960, dark, en-US, barra lateral fixa e fixtures determinísticas como linha de base principal; light/zh-CN para aceitação semântica. Os desenhos do Figma com múltiplos Popover combinados são quebrados em estados independentes alcançáveis; não se introduz screenshot matcher, e usa-se HTML de comparação lado a lado para marcar uma a uma as diferenças esperadas resolvidas ou com base em ADR.

## D38 Cancelar o cinza antecipado por cota, e deixar o 3103 ser apenas um erro de criação isolado (2026-07-21, substituído por D39)

O servidor hoje não tem interface somente leitura de sondagem de cota, e `client/configs.limit` só envia um limite estático e a janela móvel, sem cobrir retirada multi-dispositivo, retirada após expiração e outros usos reais do servidor; o `429/3103` atual também não devolve um `next_take_at` confiável.
Por isso o `quotaExhausted` reativo de D35 e a contagem local na janela móvel de D36 não conseguem dar um momento confiável de recuperação.

**Interação final: não deixar cinza antecipada.** O travamento de elegibilidade do Coding Plan permanece; a cota não participa mais do julgamento de disabled do botão de criação, da entrada do estado vazio ou dos cartões de template. Cada clique do usuário em criar faz de fato um `POST /ticket`: em sucesso cria a tarefa, e ao receber 3103 exibe o erro existente «Free tier limit reached / a cota de tarefas fora do pico acabou». Ao fim da requisição a entrada volta imediatamente a ser clicável.
O cliente não persiste nem mantém em memória um boolean de cota esgotada, não bloqueia a requisição pela contagem local de `limit`, e o 3103 do servidor é sempre a única autoridade de admissão de cota.

```text
创建入口（仅 Coding Plan 资格门控）
  -> POST /ticket
     -> success：创建 task
     -> 429/3103：展示错误；不落 task；请求结束后允许再次点击
```

## D39 Snapshot de disponibilidade de cota do servidor + tempo de recuperação preciso (decidido em 2026-07-21)

O `main` do servidor foi atualizado em `7d90055719ee6e6be3424a90441967e359618d4a` e implementou o contrato de consulta de cota:

```http
GET /api/v1/off-peak/ticket/availability
Authorization: Bearer <zcode-jwt>
X-Coding-Plan-Api-Key: <coding-plan-api-key>

→ { code: 0, data: { can_take_number: true } }
→ { code: 0, data: { can_take_number: false, next_take_at: 1783908000000 } }
```

`next_take_at` é um timestamp Unix em milissegundos, devolvido somente quando não é possível criar um ticket novo no momento. Ele é calculado a partir do `created_at + window` do ticket correspondente ao limiar `limit` atual dentro da janela móvel, de modo que mesmo reduzindo dinamicamente o limit no servidor ele continua dando o tempo de recuperação correto. Esse resultado é apenas um snapshot do instante da chamada; após uma consulta bem-sucedida é possível que requisições concorrentes consumam cota, e o `POST /ticket` continua prevalecendo.

**Recamadas das responsabilidades do cliente:**

1. O `offPeak` de `GET /api/v1/client/configs` mantém apenas `enable_offpeak_task` e `allowed_models`, removendo o campo `limit` que não é mais usado, seu parsing e a contagem local por `createdAt`.
2. Ao entrar em Automations, consulta ativamente a availability. Com `can_take_number=false`, o botão de criação fica cinza antecipadamente e o Tooltip mostra o `next_take_at` do servidor; na hora marcada a consulta é refeita, sem persistir o boolean `quotaExhausted`.
3. Quando a consulta de availability falha, vale o fail-closed de D43; a criação real continua sendo tratada pelo `POST /ticket` para a corrida de concorrência após uma consulta bem-sucedida.
4. Há uma janela concorrente entre availability=true e a retirada real de número. Se o `POST /ticket` ainda retornar 3103, a UI exibe o erro daquela vez e atualiza imediatamente a availability; o 3103 do servidor é a autoridade final de admissão.
5. A nova resposta de 3103 traz o tempo de recuperação em `data.next_take_at`; o cliente mantém compatibilidade com o `next_take_at` de topo do mock antigo, mas não converte nenhum erro em um boolean sem prazo.

```text
client/configs ──> funcionalidade曝光 + allowed models
                         │
                         v
ticket/availability ──> 创建按钮额度快照 + next_take_at 定时刷新
                         │ can_take_number=true
                         v
POST /ticket ─────────> 最终准入（并发竞态仍可能 429/3103）
```

## D40 Elegibilidade e credenciais do Coding Plan unificadas em um snapshot de selected connection (decidido em 2026-07-22)

A varredura ampla de provider-registry de D35 só responde «existe algum plano utilizável no cache», e não «qual connection a família de provider atual realmente selecionou». O resolver de runtime antigo lia fixamente a key pessoal do BigModel, fazendo com que a UI pudesse liberar ZAI/Team e ainda assim a retirada de número ou o turno automático reclamassem de `codingPlanApiKey` ausente; e ao trocar de connection era possível misturar JWT, ticket key e turn key de instantes diferentes.

**Conclusão: elegibilidade, API de ticket e runtime por turno compartilham um único snapshot de credencial selecionada no host.**

```text
provider family + family mode + selected connection key
                         |
                         v
       exact connection classifier (Start/API Key rejected)
                         |
                         v
 selected provider registry entry / existing Team runtime-key projection
                         |
                         v
 OffPeakCredentialSnapshot { support metadata, JWT, codingPlanApiKey }
           |                         |                         |
           v                         v                         v
 sanitized UI support      availability/take/status/settle   per-turn model
```

A matriz de suporte é fixa em: key original do Coding Plan pessoal ZAI, key original do Coding Plan pessoal BigModel e key runtime do projeto BigModel Team (reusando o helper existente `${apiKey}.${secretKey}`). Start Plan, modo API Key, não selecionado, provider OAuth ativo diferente da família escolhida, disabled, stale, ou mudança de seleção/identidade de login durante a resolução são recusados; é proibido varrer qualquer provider em cache ou fazer fallback para a key pessoal depois de falhar a resolução de Team. A UI recebe apenas metadata des- como family/id/selected key e nunca toca nos segredos.

O verificador em `main@ec2b18daa01b8e1b801f0691ac22153c2e56c6db` do servidor suporta ZAI/BigModel conforme o provider de login do JWT e valida a atribuição do plano tratando `X-Coding-Plan-Api-Key` como credencial opaca, e por isso as três formas de key podem compartilhar o contrato atual de cinco endpoints; o JWT do Start Plan não é uma Coding Plan API key e não entra na matriz de suporte.

## D41 Navegação pelo template da página inicial liberada por qualquer Coding Plan (decidido em 2026-07-22)

O clique no template da página inicial apenas leva um rascunho ao formulário de criação, sem retirar número nem iniciar runtime. Se o gating de selected connection de D40 fosse antecipado para aqui, usuários que ainda não escolheram provider mas já têm Coding Plan seriam julgados como «não assinantes» e receberiam um Toast de Upgrade. Aleitura de produto foi ajustada: o gating de navegação da página inicial só verifica se existe no snapshot de providers algum Coding Plan ZAI pessoal, BigModel pessoal ou BigModel Team que não esteja desativado pelo sistema; Start Plan não entra. O usuário fechar manualmente um provider não equivale a cancelar a assinatura, e ainda conta como «já tem plano».

```text
New task 模板点击
        |
        +-- 无任一 Coding Plan --> Upgrade Toast + 不写草稿/不导航
        |
        `-- 有任一 Coding Plan --> 写草稿 + 进入创建表单
                                      |
                                      `-- 提交仍走 D40 selected connection 门禁
```

D41 apenas relaxa a navegação; não seleciona nem troca provider, e também não permite que o runtime varra o cache e escolha qualquer credencial. O botão de criação de Automations, a submissão do formulário de criação, a API de ticket e o runtime por turno continuam usando D40; com a família/conexão não selecionada, a submissão do formulário continua desabilitada.

## D42 Transporte do Team Plan no cliente confirmado, mas o verificador do backend de teste ainda bloqueia (confirmado em 2026-07-22)

O pacote de teste Windows `3.5.3-alpha.0@fc76b00d` do tester, ao mudar para a org/projeto BigModel Team completo, teve o pré-aquecimento da API Key do projeto Team retornando `status=existing`, a resolução de entitlement como `scope=team` da mesma org/projeto, e a availability do Off-Peak já entrando no middleware de Coding Plan do servidor. Os logs do backend de teste confirmam ainda mais que o verificador, ao chamar a dependência de subscription, recebeu `3101 coding plan is required`, que depois foi envolvido conforme o contrato atual de infraestrutura como `HTTP 500/code 2007`. Isso descarta «o cliente não enviou a key» — a ausência de key retornaria `403/3101` direto no middleware.

Na mesma rodada, o `POST /ticket HTTP 429` apareceu no access log do servidor com body_size=0, pertencendo a uma limitação HTTP global independente, e não à cota de retirada de número `3103` com `next_take_at`. Decisões:

- Não fazer fallback para a key pessoal do BigModel nem disfarçar o plano Team como sucesso de correção do cliente; o backend precisa acrescentar um ramo de verificador de credencial Team, ou fazer a dependência de subscription existente aceitar a runtime key de projeto Team.
- O cliente só exibe erro de cota com `code=3103` explícito; `2007` e o `429` cru exibem indisponibilidade temporária.
- O ticket client adiciona headers padrão de origem/request-id às requisições e registra com `warn` do service o path, HTTP/code, credential kind e request id; é proibido registrar JWT, API Key, segredo ou impressão digital.

## D43 Admissão de criação passa a fail-closed (decidido em 2026-07-23, substitui o fail-open de D39)

O usuário exigiu explicitamente que «sem elegibilidade e falhas temporárias de dependência também bloqueiam». A entrada de criação deixa de tratar a availability como uma otimização de cota que pode ser perdida e passa a tratá-la como confirmação de admissão do servidor: a criação só é permitida quando o support de selected connection tem sucesso e a última `GET /ticket/availability` retorna com sucesso `can_take_number=true`.

```text
selected connection support
        |
        +-- unsupported / unresolved ----------------------> 禁入
        |
        `-- supported --> GET /ticket/availability
                              |
                              +-- true --------------------> 允许创建
                              +-- false + next_take_at ----> 禁入，到点重查
                              `-- loading / network / 5xx -> 禁入，刷新后重试
```

Uma falha temporária de dependência não é escrita como conclusão permanente de elegibilidade, mas o bloqueio permanece até a próxima atualização bem-sucedida. A atualização manual, reentrar na página ou a reconsulta na hora de `next_take_at` podem lifting esse bloqueio temporário. O `POST /ticket` continua sendo a autoridade final depois de uma availability bem-sucedida, cobrindo a corrida de cota entre consulta e submissão; e depois que a própria requisição de criação falha, o estado volta a bloqueado até que a availability tenha sucesso de novo.
New Task e Automations podem ficar montados sobrepostos por um breve momento durante a navegação, e suas inicializações precisam ser single-flight no store compartilhado, proibindo que requisições concorrentes de availability se sobrescrevam com o resultado tardio de limitação/sucesso.

## D44 Permission passa só pela sessão comum, e o estado de espera dedicado ao Off-Peak é cortado (decidido em 2026-07-23)

O fato do código é que o `runtimeModel` por turno cobre o turno automático inteiro. permission/elicitation bloqueia a execução de ferramentas dentro de uma sessão comum aguardando a resposta do usuário, mas não encerra o turno atual; portanto apenas assinar o evento e escrever `awaiting_approval` não consegue implementar a troca de cobrança de D11, e ainda faria o cartão Review e a notificação dedicada prometerem um provider handoff que não existe.

**Conclusão: adota-se o limite de runtime atual comoleitura de produto, sem novo handoff de provider no meio do turno.**

```text
off-peak sendPrompt(turnRuntimeModel=idle plan)
        |
        +-- permission / elicitation requested
        |       |
        |       +-- 普通 session 展示并收集响应
        |       `-- off_peak_tasks.status 保持 running
        |
        +-- approve / deny --> 同一自动 turn 继续，仍用 idle plan
        |
        `-- turn terminal --> 恢复用户常驻模型 --> drain 用户排队消息
```

- Remover o estado de domínio `awaiting_approval`, o ponto de escrita no Repo, a exibição Review no cartão e a notificação de espera de confirmação dedicada ao Off-Peak.
- Se o banco histórico tiver esse valor reservado, a inicialização o migra para `running`; a recuperação no start continua tratando running→queued.
- A opção de permissão Ask for approval é mantida, e a confirmação segura continua sendo feita pela sessão comum.
- completed/failed continuam gerando a notificação agregada do Off-Peak; as notificações de permission/elicitation continuam sendo responsabilidade apenas da cadeia genérica da sessão.
- Se o produto voltar a exigir «trocar para o provider do usuário após a aprovação», é preciso primeiro projetar um handoff de runtime-model no meio do turno que possa ser verificado, e só então reintroduzir o estado agregado; não basta restaurar a casca de UI/Repo.

## D45 Turno automático fora do pico proíbe criar tarefas agendadas (decidido em 2026-07-23)

Tanto a primeira execução quanto a retomada de uma tarefa fora do pico entram em uma sessão comum, mas o executor é um turno automático em background. Se fosse mantida a superfície completa de ferramentas do turno comum do usuário, o modelo poderia chamar `CronCreate` para criar uma nova definição de agendamento persistente, fazendo uma execução fora do pico se difundir em tarefas agendadas futuras sem uma operação explícita do usuário.

**Conclusão: cada despacho fora do pico nega explicitamente `CronCreate` no escopo de turno do sendPrompt.**

```text
首跑 createTask ──┐
                  ├─ sendPrompt(toolDenylist=[CronCreate], turnRuntimeModel=idle plan)
续跑 resumeTask ──┘
                              |
                              +-- CronCreate：本 turn 不暴露
                              `-- CronList / CronDelete：保持可用
```

- O denylist é enviado apenas junto deste prompt e não é escrito na configuração residente da sessão; depois que o turno automático termina, a superfície de ferramentas do turno comum do usuário continua sendo decidida pela própria política da sessão.
- Não reutiliza a marca `automationId` da cron automation. Tarefa fora do pico e cron são entidades irmãs, e falsificar essa marca contaminaria a atribuição de sessão do cron, a agregação de tarefas e a semântica de histórico.
- A primeira execução e a retomada têm caminhos diferentes antes do `sendPrompt`, mas precisam convergir para o mesmo denylist de turno fora do pico, evitando que a etapa de recuperação exponha novamente o `CronCreate`.

## D46 Pause sem segunda confirmação e com texto de dica atualizado (decidido em 2026-07-28, substitui aleitura de UI de D29-3/D30-2)

O usuário exigiu explicitamente que o Pause não abra mais uma confirmação secundária e que a ação seja executada imediatamente ao escolher o item do menu; o ícone informativo e o Tooltip no fim da linha Pause são mantidos, com o texto especificado pelo produto:

- Inglês: `Tasks paused beyond the queue wait time will be placed back in the queue`
- Português: `Tarefas pausadas por mais tempo que o limite de espera da fila voltarão a ser colocadas de volta na fila.`

Esta rodada altera apenas a interação e os textos de exibição da UI, sem mudar a máquina de estados de tickets existente; o Tooltip é uma explicação simplificada para o usuário:

```text
queued -- Pause（无确认弹窗） --> paused
                                  |
                                  +-- ticket 未过期 -- Continue --> 恢复派发
                                  `-- ticket 已过期 -- Continue --> 重新排队
```

Portanto, o fato de runtime de D29-3 — «após pausar não há retirada automática de novo número, e no Continue a execução é retomada ou re-enfileirada conforme a validade do ticket» — continua valendo; a parte de UI de D29-3/D30-2 que exigia confirmação de Pause e o texto antigo do Tooltip é substituída por esta decisão.

## D47 Remover a tab mista All, e a visão principal fica só com as tabs Scheduled / Idle (decidido em 2026-07-28, estreita aleitura de três tabs de D28)

Decisão de produto: a visão principal de Automations remove a tab de visão geral«All / Todos», e o padrão passa a ser Scheduled tasks; a Idle-time task continua sob o controle de gradual rollout de D31. As restrições derivadas abolidas ou ajustadas:

- A grade mista compartilhada entre os dois tipos de tarefa, exclusiva da tab All (duas colunas / altura de linha de 132px / espaçamento de 16px, com idle primeiro em sequência contínua e o título de seção `Task created` oculto) é removida por completo, e não há mais visão geral entre tipos; os dois tipos de cartão mantêm semântica de lista independente apenas dentro de suas respectivas tabs.
- Com o gradual rollout desligado, a tab Idle selecionada converge de volta para Scheduled (antes era All); quando fora do pico está invisível resta apenas a tab Scheduled, e a action row continua carregando atualização e criação, sem esconder a linha inteira.
- A barra de keep-awake é um switch global (espelhando «Geral» das configurações, e o powerSaveBlocker não é linked à contagem ativa fora do pico), e as sessões de tarefas agendadas também se beneficiam: passa a ser exibida nas duas tabs, Scheduled e Idle — no estado de lista antes dos cartões de tarefa, e no estado vazio mantendo o grande cartão vazio na frente e a faixa atrás, sem estar mais ligada à visibilidade de fora do pico.
- A chave de texto `offPeak.tabs.all` é removida.

Implementação correspondente: `AutomationsTab` converge para `"scheduled" | "idle"`, e `resolveVisibleAutomationTabs` e `resolveAutomationTabAfterOffPeakChange` são implementados conforme aleitura acima; a fidelidade de lista populada e os testes de contrato de tab têm esta decisão (e os itens correspondentes depois de sincronizada a spec.md) como base de asserção.

## D48 O agrupamento fora do pico da barra lateral converge para linhas de primeira classe no tasks-index (decidido em 2026-07-28, substitui o mecanismo de id virtual e ordenação no renderer do mesmo dia)

Contexto: o agrupamento Idle-time da barra lateral era antes um componente independente (OffPeakSidebarGroup), que apenas pegava emprestado as classes visuais TASK_GROUP_* dos Scheduled. Dois feedbacks de usuário (não é possível arrastar dentro do grupo; recolher tudo não cobre) expuseram o custo contínuo de «consistência visual, comportamento em duas trilhas»; na manhã de 2026-07-28 primeiro foram adicionadas as duas comportamentos com id de grupo virtual + ordenação em localStorage, e logo em seguida uma sessão de grilling decidiu a convergência total. O mecanismo central = copiar o cron: `offPeakTaskId` se torna a marca persistente do task meta (sem reutilizar cronAutomationId, e o limite de entidade irmã de D45 permanece), `ensureOffPeakGroupMembership` escreve o agrupamento de sistema real, e a UI usa o pipeline nativo grouped.

PrincipaisYudecisãos do grilling (contrato completo na spec §5.1):

1. **Linhas fantasma preservam a visibilidade da fila** (refutando o plano de 3–5 dias de «copiar estritamente o cron, fila só em Automations»): um sessionId é pré-alocado na criação para escrever a linha no tasks-index, sem criar sessão — D30-8 continua valendo; no despacho, `session/create` leva o mesmo id e faz o upgrade sem emenda, e a identidade da linha é constante. O protocolo já suporta criação com id (zcodeSessionCreateParamsSchema.sessionId é opcional).
2. **Degradação de escopo**: aceita-se o escopo open-workspaces-only da visão grouped, e a entrada de agregação entre projetos converge para a visão principal de Automations; nenhuma exceção de consulta é aberta para um grupo individual.
3. **Relação de membro frouxa copiada**: pode-se arrastar para fora e para dentro, sem guarda fechada; a marca acompanha a linha e não o grupo.
4. **Arquivamento unificado**: fechar a linha = arquivar, incluindo linhas fantasma (semântica de «silêncio»: a tarefa continua rodando e aparece na lista de arquivados ao terminar), sem diálogo de confirmação; exclusão/cancelamento convergem para o menu de cartão em Automations. O antigo «confirmar e depois cancelar e excluir» da barra lateral foi aposentado.
5. **Ordenação dentro do grupo e grupo vazio permanente copiados do cron**; o «+» do cabeçalho do grupo é o único ponto não copiado (entra em Automations, pois a semântica de criar rascunho do cron é errada para fora do pico).
6. **Supressão total**: as linhas fantasma são visíveis apenas no grupo fora do pico da barra lateral, e não aparecem em Project/Timeline/Pinned/busca/web de controle remoto; clicar em uma linha fantasma → Automations.
7. **Aposentadoria e migração**: o mecanismo de id virtual, o `zcode-off-peak-sidebar-order` e a deduplicação por projeção são removidos por completo; as preferências locais de folding/ordenação aceitam reset (nunca foram lançadas com a versão oficial); a migração do estoque é idempotente (com sessão, preenche a marca + membro; sem sessão, adiciona a linha fantasma); o `OFF_PEAK_DEFAULT_GROUP_ID` entra no shared ao lado de CRON_DEFAULT_GROUP_ID (a premissa antiga de «não entrar no shared» desaparece com o surgir de membership real).
8. **Sem feature flag temporária**; a implantação é dividida em três MRs (marcação → comutação atômica + migração → fechamento de testes), com a spec à frente.

**Revisão da mesma noite (D48-A)**: após uma auditoria de implementação, o item 1 passa a escolher «copiar estritamente o cron» — tarefas enfileiradas/pausadas não sobem para a barra lateral antes do despacho e não há linhas fantasma, e a visão principal de Automations é a única superfície de gerenciamento da fila. Base da mudança de posição (evidências que eram desconhecidas no grill): ① a supressão não tem um chokepoint único — os taskIndexItems de `fetchTaskListMembershipSets` alimentam ao mesmo tempo a visão grouped e a lista plana, e a supressão total precisaria se espalhar pela construção de listas no renderer, pelo listTasks do servidor, pela busca e mais 5+ lugares, concretizando o «imposto permanente de invariante de três estados»; ② o preenchimento prévio de `sessionId` quebra o contrato implícito «existe = já executou» (do qual dependem o gating de Go-to-session do OffPeakHistoryTab, a entrada de cartão do OffPeakTaskList e vários outros pontos); ③ reavaliação do benefício — a linha fantasma compra apenas um marcador na barra lateral que leva a Automations, já que posição/pausa/exclusão existem só em Automations. A→linha fantasma é um caminho de atualização puramente incremental, e o esquema de linhas fantasma é marcado como «adiado» na spec §5.1, com o gatilho = um feedback real de usuários exigindo que tarefas na fila apareçam na barra lateral. O item 4 de arquivamento unificado se simplifica para «fechar linha já despachada = arquivar» (sem semântica de arquivamento de linha fantasma); a supressão total do item 6 é abolida (não há objeto a suprimir); os demais itens ficam inalterados.

**Revisão de review de MR (D48-B, 2026-07-28)**: fica explícito que o workspace remoto está fora do suporte das tarefas fora do pico (v1 é exclusivo do desktop local). A escrita de associação e o preenchimento de membro no bootstrap sempre pulam linhas remotas — a coluna `workspace_identity` de linhas remotas de estoque pode estar ausente, e a determinação de remote olha a chave primária `workspace_key`, senão o preenchimento usaria `workspacePath` para recalcular a key local e causaria escrita cruzada de membros (review CR-01). Ao mesmo tempo é completada a marcação `offPeakTaskId` no caminho normal de snapshot de resumeTask, com a mesma semântica do branch legacy (review SG-01).

## D49 Criação de tarefas fora do pico dentro da sessão (decidido em 2026-08-24, refuta o corte de Create-via-chat de D30-4)

O feat/offpeak_v2 restaura o «Create via chat para tarefas fora do pico»cortado na v1: o usuário pede ao agent, em qualquer sessão e em linguagem natural, que crie uma tarefa fora do pico, alinhado ao paradigma `CronCreate` das tarefas agendadas — **entrada de criação unificada = família de ferramentas irmãs OffPeak* e Cron***, e o agent roteia por semântica (as descrições das ferramentas diferenciam «gatilho agendado vs fila fora do pico, sem horário de execução determinado»), com os dois sistemas subjacentes permanecem independentes conforme D28. Três rodadas de grilling:

1. **Superfície de ferramentas = `OffPeakCreate` + `OffPeakList` (somente leitura)**; sem ferramentas de update/cancel. A única entrada de modificação: o cartão no fim do turno do chat → o formulário de edição da tab idle de Automations (a janela de edição de D30-7 não muda, e running/estado terminal ficam naturalmente somente leitura pelojulgamento readOnly já existente no OffPeakEditView).
2. **O turno automático fora do pico nega `OffPeakCreate`** (simétrico a D45: tarefa fora do pico criando tarefa fora do pico = auto-amplificação do pool gratuito); `OffPeakList` continua disponível (alinhado ao tratamento que preserva CronList em D45). Ponto de implementação: o toolDenylist do turno de despacho fora do pico expande de `["CronCreate"]` para `["CronCreate", "OffPeakCreate"]`.
3. **O turno automático de cron automation permite `OffPeakCreate`** (jogo combinado: o usuário pode montar a cadeia «agendado deriva fora do pico»). A proteção de amplificação não ganha contagem local, e a cota do servidor é a única autoridade (`POST /ticket` 3103, espírito de D38/D39). ⚠ Armadilha de cópia literal: a defesa `assertNotAutomationTurn` das ferramentas de cron tem a direção oposta, e o OffPeakCreate nunca pode entrar em nenhuma cópia de `AUTOMATION_MUTATION_TOOL_NAMES`.
4. **Superfície de parâmetros**: `title`/`prompt` obrigatórios; `permissionMode`/`model`/`thoughtLevel` opcionais (o agent sobrescreve conforme o pedido explícito do usuário), **padrão = totalmente automático (yolo) / último de `allowed_models` (assumindo que a ordem no servidor coloque o mais recente/forte por último) / nível mais alto de raciocínio**. Isso é uma **divergência intencional** do padrão do formulário (Ask + allowedModels[0] + nível padrão do workspace, D29-4/D34): o caminho da ferramenta atende à semântica de quem «fala e vai embora» sem supervisão — o padrão Ask deixaria a tarefa travada à meia-noite em uma confirmação de permissão, o que contraria o valor central do fora do pico; o caminho do formulário mantém o padrão seguro e a linha de alerta. A resolução do padrão é no host (onde o gradual rollout é legível); quando `model` é informado, valida-se contra allowed_models previamente, com o 3006 do servidor comproteção de segurança.
5. **Não congela o título da sessão**: não copia o `setCustomSessionTitle` do CronCreate — a criação fora do pico acontece com frequência no meio de uma sessão de trabalho, e a tarefa roda na sua própria session nova (D30-8), sem vínculo com a sessão de criação.
6. **Cartão estático no fim do turno** (o mesmo pipeline de ConversationTurnGroup no fim do turno do cron, renderizado após a conclusão da resposta): ícone da lua + título da tarefa + snapshot da posição no momento da criação (#N in queue, vindo da resposta de retirada de número) + botão «Ir para a tarefa fora do pico»→ `onOpenAutomationsMain(offPeakTaskId, "idle")` → visão de edição da tab idle. Não assina estados posteriores, e o histórico não tem problema de dado ativo expirado.
7. **Superfície de entrada apenas por ferramenta**: o botão da visão principal de Automations e a entrada da página inicial New task ficam como estão; `needsApproval: true` é copiado do cron (a criação consome cota de retirada de número).
8. **Gating**: quando o gradual rollout não é atingido (D31) / workspace remoto (D37-3/D48-B) / subagent_child, a ferramenta não é exposta, entregue pela flag `offPeakToolEnabled` nos parâmetros de session create/resume (host antigo não entrega → a ferramenta não é registrada, fail-closed); uma virada do gradual rollout no meio do caminho aceita «a superfície de ferramentas desta session não muda + o fail-closed de retirada de número do servidor comproteção de segurança», sem reconsulta de gradual rollout por turno. O invariante de D30-8 «a criação não pré-cria a conversa, e o sessionId é preenchido na primeira execução» não é afetado — a criação por ferramenta e a criação por formulário passam pelo mesmo `OffPeakTaskService.createTask`.
   **Complemento de 2026-09-04**: o gating é um fato em nível de workspace, e o portador autoritativo passa a ser o `workspace/updateOffPeakToolPolicy` chamado pelo host quando o cliente de agent fica pronto (degradação de method-not-found do CLI antigo é ignorada), cobrindo os caminhos de create/resume legacy, v4 createSession e a recuperação a frio v4 (o canal subscribe sem parâmetros); a flag por requisição é mantida como redundância de mesma origem. O salto do cartão usa «refresh forçado concluído após receber a navegação» como sinal de prontidão (o agent grava no banco sem passar pelo store da UI); quando o refresh falha, não se faz um veredito final de encontrado/ausente, e em vez disso se mostra que a lista não carregou (review CR-01). **Virada do gradual rollout no meio do caminho**: o handler devolve diretamente a falha estável `offpeak_disabled` quando o gradual rollout está desligado ou a configuração está ausente, sem passar por derivação de lista vazia; a validação prévia de model faz trim e é insensível a maiúsculas (review SG-02/03).

Revisões em cascata: a §5 da spec remove o item «Create via chat para tarefas fora do pico» da lista de «entradas já cortadas» (o switch da lua no composer e o toast de orientação de 429 continuam cortados); a lista de explicitamente não feito da §7 é sincronizada. As demais decisões de D30-4 (convergência de entradas, corte do toast de 429) continuam valendo.

### Revisão de D49-8: o start do chat na 3.12.2 não espera o gradual rollout (2026-09-14)

Esta revisão substitui o julgamento de exposição do gradual rollout na etapa de registro descrita acima: o Host local suportado decide o registro das ferramentas apenas pelo conjunto de serviços montados e pelo tipo de workspace, sem ler configuração remota. A política de workspace e as flags de criação/recuperação legacy e V4 são mantidas como canal de capacidade local. Com o gradual rollout desligado ou desconhecido, o modelo ainda vê OffPeakCreate/OffPeakList; a criação real só lê o gradual rollout e valida plano e modelo depois de entrar no handler do host, e só depois da aprovação é que createTask/retirada de número acontece. Na falha, mantém-se o erro de ferramenta estável existente e não há efeito colateral de criação. OffPeakList consulta apenas as tarefas locais do workspace atual. O gating de gradual rollout da entrada de página, o suporte remoto, o não registro para subagentes, a recusa de criação recursiva no turno fora do pico, as aprovações e a guarda de vínculo permanecem. Não é preciso adicionar ferramentas assincronamente a sessões já abertas, e nem é adicionada atualização de configuração em background.

Defeito original: registro e comando de criação analisavam em duplicidade o gradual rollout remoto; e a ausência de cache fazia com que o chat comum esperasse em série repetidamente. A capacidade local que a ferramenta pode tratar e se a conta tem permissão para criar são dois limites, e o primeiro não deve esperar pelo segundo.

## D50 A tarefa fora do pico criada dentro da sessão fica vinculada e roda na sessão de criação (decidido em 2026-09-07, revisa o «sem vínculo com a sessão de criação» de D49-5)

Pedido do usuário: a tarefa fora do pico criada dentro da sessão deve executar «com base na sessão existente». A alternativa B (fork de uma subsessão na criação herdando o histórico) foi refutada, e escolheu-se A: **alinhamento lógico com o targetTaskId do CronCreate** — vincular à sessão atual na criação, e retomar essa sessão no despacho enviando o prompt original da tarefa. Seis pontos decididos:

1. **Sempre vinculado, sem switch**: o `OffPeakCreate` dentro da sessão sempre vincula à sessão atual (o `boundSessionId` é preenchido pela porta da CLI a partir do contexto da ferramenta e chega ao host pelo protocolo `offPeak/create`, e o `repo.create` grava `session_id`; o `conversation_id` continua sendo preenchido na primeira execução, mantendo o contrato «não vazio = já executou»). O caminho de criação por formulário não muda e continua criando uma session independente (D30-8 continua valendo para o formulário).
2. **O modo de permissão padrão mantém o yolo de D49-4 e não é revertido quando a tarefa termina**: a diferença em relação ao cron é visível — o cron registra o mode do momento da sessão e a escrita de volta passa despercebida; fora do pico o usuário é colocado em acesso total e assim permanece. O usuário aceitou explicitamente.
3. **Não congela o título da sessão** (mantido de D49-5): o que é vinculado é a sessão de trabalho do usuário.
4. **Vinculação repetida recusa apenas o que não é terminal**: quando a sessão já tem uma tarefa fora do pico queued/running/paused, a criação é recusada (dois prompts sem supervisão disputando a mesma sessão); depois que a tarefa termina, criar de novo é permitido; é diferente do «uma sessão uma tarefa sempre recusado» do cron (a tarefa fora do pico é de uso único). O julgamento reaproveita o snapshot mínimo de `offPeak/list` (com sessionId/status), e uma falha na consulta é fail-closed.
5. **Ao bater em sessão ocupada no despacho, primeiro sonda**: a primeira execução vinculada lê `status === "running"` no tasks-index, e se estiver ocupada devolve transient diretamente ao scheduler para backoff (a partir de 30s dobrando, com teto de 15 minutos e sem limite de tentativas), **sem tocar em nenhuma configuração da sessão**. Motivo: o `session/send` da CLI recusa prompts concorrentes com -32010, mas o `setMode` não tem verificação de turno ativo, e escrever a configuração antes de bater na ocupação mudaria silenciosamente o modo de permissão da sessão do usuário. Sessão vinculada já deletada → permanent (sem backoff até a expiração do ticket e nova retirada).
6. **Stop é cancelar**: quando a tarefa está rodando na sessão do usuário e ele aperta Stop, o que para é o turno da tarefa, e o rastreamento de resultado mapeia stopped como `cancelled`, com o ticket invalidado (sem «voltar para queued esperando o próximo ticket»). Entradas do usuário durante o turno da tarefa entram na fila v4 atrás dele.

Consequências na UI: o rodapé dos cartões de tarefas fora do pico em Automations e a página de edição expõem o **título da sessão vinculada** (`sessionTitle`, um campo derivado somente leitura obtido pelo join do `repo.list` com a tabela tasks do mesmo banco, sem persistir), e a página de edição traz a dica de que Stop significa cancelar; o cartão no fim do turno da chat acrescenta à linha de status«rodará nesta sessão». Barra lateral: a sessão vinculada entra no agrupamento de sistema fora do pico quando recebe a marca `offPeakTaskId` na primeira execução (mecanismo de D48, igual ao targetTaskId do cron).

Revisão em cascata: «a tarefa roda na sua própria session nova, sem vínculo com a sessão de criação» de D49-5 vale apenas para a criação por formulário; o ramo de despacho da §4.7 do tech-design passa de dois ramos para três (resume / bound-first-run / init).

## D50 complemento: resposta à revisão automática de 2026-09-08

- **CR-01**: a description / modelInstructions de `OffPeakCreate` ainda diz «fresh session / NEW session / self-contained prompt», o que é o contrário da execução na sessão vinculada de D50. Foi alterado para «later continues THIS conversation with the full history», e o prompt pode referenciar o contexto já existente da sessão, mas continua exigindo que a entrega seja explicitada (sem supervisão não é possível perguntar). A segunda rodada apontou que o `.describe()` do parâmetro `prompt` em contracts tinha ficado para trás (entra no inputSchema visível ao modelo via zodToJsonSchema, contradizendo a descrição da ferramenta), e a correção foi sincronizada junto com uma asserção de texto em nível de JSON schema.
- **CR-02**: a guarda de vínculo da porta da CLI (D50-4) lê `offPeak/list`, mas esse método é truncado para exibição em top-20, de modo que com mais de 20 tarefas e a tarefa vinculada sendo mais antiga a guarda deixa passar. A segunda rodada apontou ainda que existe um TOCTOU entre a verificação prévia e o INSERT, com uma ida e volta de rede de retirada de número no meio. A convergência final foi em duas camadas: ① `OffPeakTaskService.createTask` chama `repo.hasActiveBoundTask(workspaceKey, sessionId)` para uma verificação prévia precisa antes da retirada de número (sem reutilizar a list de exibição), retornando `client_validation / session_bound` em caso de acerto; ② um índice único parcial na camada de armazenamento `idx_off_peak_bound_active ON (workspace_key, session_id) WHERE session_id IS NOT NULL AND status NOT IN estados terminais` faz com que a parte que atravessa a verificação prévia em concorrência seja rejeitada no INSERT, mapeada igualmente para `session_bound` (o ticket já retirado é invalidado junto com a tarefa, e o servidor o recolhe por expiração, sem interface de liberação). Se um banco já tiver linhas duplicadas, a criação do índice falha e o índice é pulado restando apenas a verificação prévia, aguardando inspeção manual. O handler `offPeak/create` do host não traz mais uma verificação prévia própria; a guarda que lê top-20 na porta da CLI é mantida como caminho rápido. A CLI traduz para um texto estável.
- **SG-02**: uma falha de sincronização de `workspace/updateOffPeakToolPolicy` apenas engole -32601, mas outros erros fariam o cliente ficar ready com reject. Passa a registrar todos os erros como warn sem repropagar: a direção de falha é fail-closed (a CLI não registra as ferramentas por padrão), e isso não merece bloquear o start.
- **SG-03**: o nível de raciocínio padrão passou de `defaultLevel ?? levels[0]` para o maior valor de uma tabela de intensidade conhecida (max > xhigh > high > medium > low > minimal > nothink > none), concretizando aleitura de «nível mais alto» de D49-4; só quando todos os nomes do catálogo são desconhecidos é que há fallback para defaultLevel / primeiro item. Decisão do usuário: o nível mais alto tem prioridade sobre o defaultLevel do catálogo.
- **SG-01 inalterado**: não enviar `enabled:false` a uma CLI já iniciada quando o gradual rollout é desligado é o «a superfície de ferramentas desta session não muda + proteção de segurança fail-closed do servidor» já decidido em D49-8, e enviar apenas true foi a direção deliberadamente estreita após a regressão de pre-push.

## D51 Turno fora do pico proíbe execução de Bash em background (decidido em 2026-09-07)

Problema: depois que um comando Bash em background é concluído, `runTaskNotificationBatch` inicia outro turno de notificação, e esse turno não leva `turnExecutionModel`/`offPeakTaskId`; quando o turno fora do pico termina ou falha, o modelo da sessão já foi restaurado para o provider do usuário, e esse agent loop completo roda no plano do próprio usuário sem nenhuma ação do usuário (o limite de cobrança de D33 é contornado).

Decisão: **não corrigir a atribuição do turno de notificação, e simplesmente desligar a superfície de Bash em background no turno fora do pico** — o `bashHandler` lê `context.offPeakTurn`: um `run_in_background` explícito lança um `ToolExecutionFailed` recuperável (com a dica de rodar em foreground), e a conversão automática para background por timeout (`isBashAutoBackgroundEligible`) é desligada junto, com comandos longos tratados com o timeout de foreground. Isso é simétrico ao `BACKGROUND_UNAVAILABLE` já existente no subagent runner (turno fora do pico recusando Agent em background), e as duas entradas de background falham de forma fechada no turno fora do pico.

Não feito: o turno de notificação levar modelo/adiar (exige manter credencial temporária entre turnos, o que conflita com o limite de limpeza de D33); turnos de cron automation não são afetados (usam o provider do usuário, e a superfície de background continua como antes).

## D52 Turno fora do pico proíbe SendMessage e Workflow (decidido em 2026-09-14, hotfix/3.12.2)

Problema (ZCT-2099408932463325184, 3.12.1): quando o Agent principal usa `SendMessage` para retomar um subagente já concluído, `resumeTerminalAgentInBackground → runBackgroundAgent` em `subagent/runner.ts` passa apenas o signal, sem o `subagentModelOverride` do turno fora do pico; a resolução de modelo de `runExploreAgent` cai em `getSessionModelSelection()` quando não há override e o profile não tem modelo explícito, e como D33 determina que a seleção residente é sempre o Provider do usuário, todos os turnos de retomada são contabilizados no Coding Plan do usuário.
A 3.11.2, o mesmo caminho ainda usava o idle plan porque o runner lia `turnExecutionModel`, o que é uma regressão da refatoração de provider (1ccc89c5d4..eb8b9deee5). Há um caminho semelhante em `Workflow`: as subsessões de script criam o modelo pela seleção residente da sessão pai pelo `script-workflow-child-runtime`.
Esse caminho também contorna a verificação `modelOverride.background === "deny"` de D51 (sem modelOverride não há deny).

Decisão: **não complementar o override no caminho de retomada, e simplesmente proibir essas duas ferramentas no turno fora do pico** (decidido pelo usuário). Em três camadas, como em D49: o turn denylist (núcleo `OFF_PEAK_MUTATION_TOOL_NAMES`, `prompt-turn.ts` da V4, `server-operations.ts` legacy, todos com o mesmo valor ampliado para `["OffPeakCreate","SendMessage","Workflow"]`) esconde as ferramentas; o handler reaproveita `assertNotOffPeakTurn` lançando um `PermissionDenied` recuperável com a dica de usar um Agent em foreground; e o denylist de fallback de `isOffPeakCreateRestrictedTurn` reconhece apenas o sentinela OffPeakCreate (o denylist despachado por um host antigo pode ainda não trazer as ferramentas novas). Dentro do turno fora do pico todos os subagentes são concluídos de forma síncrona em foreground, então o SendMessage não tem outro uso válido, e a proibição não traz perda funcional.

Não feito: passar o override pelo caminho de resume (conflita com a semântica de deny de background de D51, e exigiria definir um plano de espera em foreground); a geração de título continua usando o modelo deste turno (`session-title.ts` ainda usa a seleção residente, 1 requisição pequena por sessão, tratado separadamente).

## Fila de discussão em aberto

(Convergida por completo; a forma final está em `spec.md`.)