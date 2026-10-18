# Matriz de Validação de Sessão de Conversa

Objetivo: transformar os cases MVP da área de sessão em tarefas de verificação executáveis. O case catalog é responsável por descrever "como o produto deve ser", e este arquivo é responsável por descrever "como provar que ele realmente é assim".

Fontes de protocolo:

- [conversation-protocol-declaration.md](./conversation-protocol-declaration.md)
- [conversation-session-case-catalog.md](./conversation-session-case-catalog.md)

## Princípios de Verificação

Cada case E2E precisa de pelo menos uma asserção visível ao usuário e uma evidência não-UI. A UI é a asserção principal, porque o produto é finalmente definido pela experiência do usuário; logs, protocolo, rede e arquivos são evidências auxiliares, usadas para localizar problemas de assincronia, filas, persistência e entre sessões.

As asserções de UI devem ser engineerizadas e determinísticas: localizar elementos por `data-testid` global e judging o resultado por atributos DOM, valores de input, texto normalizado, estado disabled e quantidade de elementos. Screenshots e gravações servem apenas como artefatos de análise de falha, não como condição automática de aprovação. O contrato de test id da área de sessão está em: [conversation-session-ui-testid-contract.md](./conversation-session-ui-testid-contract.md).

Regra padrão de ausência de banner de erro: a menos que o case declare explicitamente na expectativa de produto que "deve aparecer um banner de erro", qualquer case positivo ou caminho sem falha em que `ChatViewErrorBanner` / `ChatErrorBanner` apareça durante o teste é julgado como falha. Contraexemplos típicos são barras de erro surgindo em caminhos positivos como compact, goal, queue, fork, edit e model switch; mesmo que os outros estados de UI estejam visualmente corretos no final, o case não pode ser registrado como aprovado. Cases que permitem banner de erro devem ser marcados explicitamente como fault, negative, error recovery ou provider/network failure no nome ou nas observações do catalog / coverage matrix / spec, e devem deixar claros a origem esperada do erro, se ele pode ser dispensado e o estado seguinte do botão/fila.

| Camada de evidência | O que prova                                       | Forma de coleta no MVP                                                                                      |
| ------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| UI                  | O estado real visto pelo usuário e sua operabilidade | Localizador WDIO por `data-testid`, atributos DOM, valores de input, texto normalizado, estado disabled, quantidade de elementos |
| Runtime/Store       | Se a projeção interna do renderer corresponde ao estado de produto | Exportação de estado dedicada a testes, registrando `sessionId`, `phase`, `queue.length`, `autoDrain` |
| Protocol            | Se os comandos reais de app e agent estão como esperado | Captura das requisições e respostas `session/send`, `session/compact`, `session/goal`, `session/stop`, `session/fork` |
| Log                 | Se os fluxos assíncronos acertaram o caminho correto | UI logger, service logger, agent log, correlacionados por `caseId/runId/sessionId/inputId` |
| Network/SSE         | Se o stream do modelo, os erros e as retentativas de compact ocorreram como esperado | mock provider registrando requisições, SSE events e o tempo dos eventos |
| Files               | Se o histórico da sessão, a configuração e o resultado de fork foram gravados corretamente | Exportar ao final do teste o session snapshot, o snapshot de configuração e a árvore de arquivos relacionada |
| Artifact            | Possibilidade de análise após a falha             | Um diretório por case, preservando screenshots, gravações, logs, quadros de protocolo, quadros de rede e snapshots; não participa de pass/fail |

## Estrutura de Artifact

Cada case gera um diretório, evitando misturar evidências quando várias sessões rodam em paralelo.

```text
artifacts/conversation-session/<caseId>/<runId>/
  screenshots/
    01-before.png
    02-after-action.png
    03-final.png
  video.mp4
  ui-log.ndjson
  service-log.ndjson
  agent-log.ndjson
  protocol-frames.ndjson
  network-events.ndjson
  session-snapshots/
    before.json
    after-action.json
    final.json
  files/
    workspace-tree-before.txt
    workspace-tree-after.txt
```

Screenshots e gravações são um arquivo de evidências, não uma fonte de asserções. A condição automática de aprovação deve ser escrita nas camadas determinísticas de UI / Runtime / Protocol / Network / Files.

Todos os logs e quadros devem carregar estes campos de correlação:

```text
caseId
runId
workspaceIdentity
workspacePath
sessionId
inputId
queryId
clientMode
```

Quando um campo não existir, escreva explicitamente `null`; não omita, para que seja possível fazer join mecânico depois.

## Seleção de Cases MVP

O primeiro lote seleciona apenas as 10 que mais provam o ciclo completo, sem cobrir dimensões ambientais como exceções externas, disco cheio, 429/503 e replayable em dispositivos móveis.

| MVP ID | Catalog ID  | Por que testar primeiro                                          |
| ------ | ----------- | -------------------------------------------------------------- |
| MVP-01 | A01         | O menor ciclo fechado: disparar, criar sessão e entrar na página de detalhe |
| MVP-02 | A03         | Enfileirar mensagem comum durante running, que é o nó raiz da capacidade de fila |
| MVP-03 | A08         | Enfileirar `/compact` digitado durante running, validando FIFO e a proibição de se disfarçar de mensagem comum |
| MVP-04 | A07/H03/H04 | Enfileirar `/goal` durante running, validando a diferença entre comando e prompt comum |
| MVP-05 | B02         | A fila é preservada após stop e não é consumida automaticamente    |
| MVP-06 | B06/B08     | Held queue após parada: continuar digitando enfileira, enviar imediatamente consome |
| MVP-07 | D03         | A fila é preservada ao editar uma user query de histórico           |
| MVP-08 | E07/K08     | Fork de assistant estável não copia a fila da sessão pai             |
| MVP-09 | F03/F08     | Compact manual coexiste com held queue                             |
| MVP-10 | G01/G10     | Depois do auto compact bem-sucedido, continua o pendingAction        |

## Probe Matrix

### MVP-01 Primeiro disparo entra na página de detalhe

Catalog：A01

| Camada         | Asserção                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| UI            | Após digitar "这是个什么项目" e enviar, entra-se na página de detalhe da sessão; a mensagem do usuário está visível; o composer é limpo; exibe estado de gerando ou de aquecimento |
| Runtime/Store  | É gerado um `sessionId` não vazio; `phase` entra em `prewarming` ou `running`; queue=0              |
| Protocol       | Há apenas uma criação e um envio relativos ao primeiro disparo; `content` é igual a "这是个什么项目"  |
| Log            | Registra workspace prepared, session created, first prompt accepted                                |
| Network/SSE    | O mock provider recebe uma requisição de modelo e começa a emitir SSE                               |
| Files          | A primeira user message existe no session snapshot                                                   |
| Artifact       | Três screenshots: before, after-send e first-token, apenas para análise de falha                     |

### MVP-02 Mensagem comum enfileirada durante running

Catalog：A03

| Camada         | Asserção                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------- |
| UI            | Ao enviar "继续解释" enquanto o turno atual está em streaming, o painel de fila mostra 1 mensagem pendente; o assistant atual continua gerando |
| Runtime/Store  | `phase=running`; `queue.length=1`; o conteúdo do item da fila é "继续解释"                  |
| Protocol       | Não deve aparecer imediatamente um segundo `session/send` para a mesma sessão                 |
| Log            | Registra o ramo de enqueue e não registra queue drain started                                   |
| Network/SSE    | A requisição de modelo atual continua; não há segunda requisição de modelo                     |
| Files          | O histórico já gravado não contém o user turn "继续解释", a menos que a fila seja consumida depois |
| Artifact       | Screenshot do painel de fila e recorte de quadro de protocolo, apenas para análise de falha     |

### MVP-03 `/compact` enfileirado durante running

Catalog：A08

| Camada         | Asserção                                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| UI            | Ao enviar `/compact` durante o streaming, aparece o feedback "已加入队列"; a fila adiciona o item de manutenção `/compact`; nesse momento não há compact timeline marker |
| Runtime/Store  | `phase` continua `running`; o fim da fila ganha kind=`compact`; `activeTurnKind` não muda                                       |
| Protocol       | Nenhuma requisição de modelo de compact é adicionada antes de o trabalho atual terminar; o compact só é executado após a promoção da fila; `/compact` não é tratado como um `session/send` comum |
| Log            | Registra compact admission/enqueue; registra a promoção tipada após a fronteira ready                                          |
| Network/SSE    | A requisição de modelo atual continua; nenhuma nova requisição de compact antes de ela terminar                                   |
| Files          | O session snapshot não ganha a user message `/compact`; summary/marker só são adicionados quando o compact realmente executa     |
| Artifact       | Screenshot da fila/toast e resumo da ordem FIFO do protocolo; a aprovação é julgada pelo kind do item de fila e pela sequência das requisições |

### MVP-04 `/goal` enfileirado durante running

Catalog：A07、H03、H04

| Camada         | Asserição                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------- |
| UI            | Ao enviar `/goal 修完登录流程` durante o streaming, o painel de fila ganha um item de goal; o turno atual não é interrompido |
| Runtime/Store  | A fila ganha um item cujo tipo ou conteúdo preserva a semântica de `/goal`; `phase=running`     |
| Protocol       | `session/goal` não aparece no momento do envio; aparece quando o turno atual termina e a fila é consumida |
| Log            | enqueue goal e depois drain goal; registra semântica de update quando já existe goal e semântica de set quando não existe |
| Network/SSE    | Nenhuma requisição de modelo nova para o turno atual; se o consumo do goal dispara nova requisição, isso é decidido pelo resultado do goal |
| Files          | O session target não muda antes do consumo do goal; depois do consumo o target é definido ou atualizado |
| Artifact       | Snapshots antes e depois do enqueue, e o snapshot do target após o consumo                   |

### MVP-05 Fila preservada após Stop e sem consumo automático

Catalog：B02

| Camada         | Asserição                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| UI            | Com running e queue=1, clicar em stop; o turno atual exibe o resultado de parada/interrupção; a fila continua mostrando 1 item; não há loading automático da próxima rodada |
| Runtime/Store  | `phase=completed(interrupted)`; `queue.length=1`; `queue.autoDrain=false`                                |
| Protocol       | Aparece `session/stop`; logo após o stop não aparece o `session/send` do primeiro item da fila          |
| Log            | stop accepted; sem queue drain started                                                                   |
| Network/SSE    | O SSE atual é interrompido ou encerrado; sem nova requisição de modelo                                  |
| Files          | O session snapshot preserva o estado de assistant interrupted; o snapshot da fila preserva o item original |
| Artifact       | Três screenshots: antes do stop, depois do stop e após estabilização, apenas para análise de falha      |

### MVP-06 Continuar digitando e enviar imediatamente com Held Queue

Catalog：B06、B08

| Camada         | Asserição                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| UI            | Com `completed(interrupted), queue=1, autoDrain=false`, continuar digitando "再补充"; a fila vira 2; ao clicar em "立即发送" na segunda, o segundo item vai para o topo e começa a ser consumido |
| Runtime/Store  | Continuar digitando apenas anexa à fila sem mudar `autoDrain`; após o envio imediato o item alvo se torna o active input                            |
| Protocol       | Continuar digitando envia um `sendText`, projetado pela CLI como item de fila; "立即发送" envia `sendQueuedNow` e, no consumo, não deve repetir o admission command |
| Log            | append queue item; send now/promote queue item; queue drain started                                                                       |
| Network/SSE    | Só depois do envio imediato aparece uma nova requisição de modelo                                                                         |
| Files          | Antes do consumo o histórico da sessão não contém o user turn "再补充"; depois do consumo o user turn correspondente aparece                |
| Artifact       | Screenshot da mudança de ordem da fila e quadro de protocolo; a aprovação é julgada pela ordem dos ids dos itens de fila                   |

### MVP-06b Preservação da mensagem de guia no modo Running Guide

Catalog：M06a、M06b、M06c

| Camada         | Asserção                                                                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| UI            | As settings iniciais declaram explicitamente `zcodeInteractionBehavior=guide`; com `running, queue=0`, continuar enviando texto comum; a mensagem de guia aparece como um item de fila `turn-steer`, ou projetada como user message; após uma espera breve, ela não pode desaparecer dos dois lugares |
| Runtime/Store  | O provider selecionado é `glm`, e antes do envio a fila local é 0; o item de guia carrega `turnSteer.status=submitting/queued`; se o estado terminal do runtime chegar primeiro, é preciso remover o turnSteer e voltar à fila local, em vez de remover a mensagem |
| Protocol       | O modo guide continua enviando `sendText`; a CLI projeta como entrada de guide conforme `inputRouting`/follow-up mode, sem criar um turno comum separado; quando as condições de guide não são atendidas, a fila da CLI consolida, sem voltar à fila local do renderer |
| Log            | Registra agent-side steer queued / drained / rejected / fallback; se os eventos chegarem fora de ordem, deve ser possível correlacionar de volta ao item de guia original por pendingInputId/messageId |
| Network/SSE    | A mensagem de guia não deve gerar uma requisição de modelo comum independente; se for drenada, o conteúdo seguinte pertence ao turno atual; se houver fallback, o próximo queue drain envia uma requisição comum                   |
| Files          | Após o drain, o histórico da sessão contém o user turn com marcador de guiado; sem drain, o snapshot da fila preserva o texto de guia original                                                              |
| Artifact       | Snapshot de settings, item de fila com `data-kind=turn-steer` / guided user message após o envio, e estado de fila/histórico após estabilizar; a aprovação é julgada pelo marcador e pelo id do item de fila, como dupla âncora          |

### MVP-06c Matriz de Reprodução de Guia Imediata com Queue em Running

Catalog：M07a、M07b、M07c、M07d、M07e、M07f、M07g、M07h

| Case  | Asserção                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------- |
| M07a  | `running + queue text + clique em enviar imediatamente no topo`: o texto do topo se torna o active input da próxima rodada após o stop; a mensagem entra no user history; sem requisições duplicadas |
| M07b  | `running + queue text + clique em enviar imediatamente em item que não é o topo`: o item clicado é promovido e consumido; os não clicados mantêm a ordem relativa; a mensagem alvo não se perde |
| M07c  | `running + /goal na fila + clique em enviar imediatamente`: o item de goal é consumido com semântica de goal e atualiza o target; não pode ser enviado como texto comum nem ser engolido |
| M07d  | `turno ativo em tool call / approval window e clique em enviar imediatamente`: o roteamento de tool/approval continua pertencendo ao turno antigo; a preempção só afeta o queue drain |
| M07e  | `stop terminal event atrasado e clique em enviar imediatamente`: o late terminal event só pode consolidar o active input antigo; não pode sobrescrever a mensagem nova, a fila ou o activeInputId |
| M07f  | `activeInputId ausente e o fallback do desktop ainda consegue dar stop + drain`: o log de fallback fica visível; o item clicado ainda consegue entrar na próxima rodada; sem pulo silencioso |
| M07g  | `dois cliques rápidos seguidos em enviar imediatamente`: send-now é idempotente; o mesmo item não é enviado duas vezes; itens não clicados não são removidos por engano |
| M07h  | `troca de modelo durante running e depois enviar imediatamente`: a requisição antiga em voo não muda; a requisição de consumo do item de fila clicado usa o modelo/think depth mais recente da sessão |

### MVP-07 Edição de User Query Preserva a Fila

Catalog：D03

| Camada         | Asserição                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| UI            | Com `completed(interrupted), queue>0`, editar qualquer user query de histórico e enviar; a sessão começa a rodar de novo; a fila continua exibindo o conteúdo original |
| Runtime/Store  | Após o edit, `phase=running`; o conteúdo e a ordem da fila e `autoDrain=false` permanecem                 |
| Protocol       | Apareecem a requisição de rewind/edit e o send subsequente; não aparece queue clear                        |
| Log            | rewind accepted; queue preserved                                                                           |
| Network/SSE    | Aparece a nova requisição de modelo da reexecução após o edit                                              |
| Files          | O histórico ativo do snapshot muda para o novo ramo; o snapshot da fila não muda                           |
| Artifact       | Screenshots do histórico antes e depois do edit e diff do snapshot da fila; a aprovação é julgada por message id, queue item id e diff de snapshot |

### MVP-08 Fork de Assistant Estável não Copia a Fila

Catalog：E07/K08

| Camada         | Asserição                                                                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI            | O ponto de fork é um assistant já estabilizado em `completed(success)` na sessão pai; mesmo que a sessão pai tenha held queue, após o fork entra-se ou cria-se a sessão fork; a fila do pai é preservada; a fila da nova sessão fica vazia |
| Runtime/Store  | A fila do pai não muda; a sessão fork tem novo `sessionId` e queue.length=0                                                                                   |
| Protocol       | Aparece `session/fork`, com target apontando para a assistant message; não aparece comando que copie a fila                                                   |
| Log            | fork accepted, registrando parentSessionId, forkedSessionId, targetMessageId                                                                                  |
| Files          | O histórico da sessão fork contém apenas o conteúdo anterior ao ponto de fork; não há prompt enfileirado da sessão pai                                           |
| Artifact       | Screenshot da fila da sessão pai e screenshot do estado vazio da fila da nova sessão, apenas para análise de falha                                             |

### MVP-09 Compact Manual Coexiste com Held Queue

Catalog：F03、F08

| Camada         | Asserição                                                                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI            | Com `completed, queue>0, autoDrain=false`, executar compact manual; aparece o timeline de compact started; após o compact bem-sucedido o mesmo timeline é atualizado com success; a fila é preservada e não é consumida automaticamente |
| Runtime/Store  | Durante o compact, `origin=manual`; ao concluir, `phase=completed(success)`; a fila não muda; `autoDrain=false`                                           |
| Protocol       | Aparece um `session/compact`; não aparece `session/send` automático de item da fila                                                                     |
| Log            | manual compact started/completed; sem queue drain started                                                                                                |
| Network/SSE    | Aparece a requisição de modelo do compact; sem requisição de modelo de consumo da fila                                                                   |
| Files          | O session snapshot tem compact summary ou marker; o snapshot da fila não muda                                                                             |
| Artifact       | Screenshots do timeline compact started/success e da fila preservada; a aprovação é julgada pelo test id do compact marker e pelo queue item id        |

### MVP-10 Continuar PendingAction após Auto Compact bem-Sucedido

Catalog：G01、G10

| Camada         | Asserição                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI            | Ao disparar um envio comum, o sistema decides que é preciso auto compact; primeiro aparece o timeline de compact automático; após o compact bem-sucedido a mensagem do usuário continua aparecendo e a geração começa |
| Runtime/Store  | Depois de `compacting(origin=auto)` volta ao `running` do pendingAction; o pendingAction não se perde nem se duplica                                         |
| Protocol       | As requisições de compact acontecem primeiro; o `session/send` ou `session/goal` correspondente ao pendingAction só acontece após o sucesso                    |
| Log            | auto compact attempt 1 success; continue pendingAction                                                                                             |
| Network/SSE    | O SSE do compact termina primeiro; em seguida a requisição de modelo do pendingAction começa                                                           |
| Files          | No snapshot, o compact marker vem antes do user turn correspondente ao pendingAction; não há user turn duplicado                                          |
| Artifact       | Screenshot da ordem do timeline e linha do tempo de protocolo/rede; a aprovação é julgada pela ordem de marker/message no DOM e pela linha do tempo de protocolo/rede |

## Capacidades de Teste que Precisam Ser Complementadas

Estas são as capacidades mínimas necessárias para rodar o MVP, e não representam uma plataforma de automação completa.

| Capacidade                     | Uso                                             | Requisito do MVP                                                                                                                                                            |
| ------------------------------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Selector de UI estável         | O WDIO não adivina elementos por texto, classe CSS ou screenshot | Completar os test ids de queue, message, compact marker, fork, edit, toast, model selector etc. conforme [conversation-session-ui-testid-contract.md](./conversation-session-ui-testid-contract.md) |
| Captura de protocolo           | Verificar se os comandos foram enviados e se a ordem está correta | Cada requisição/resposta é gravada em `protocol-frames.ndjson`                                                                                                              |
| Mock provider/SSE              | Tornar running, stop, compact e auto compact controláveis | Suportar atraso de token, falha, três retentativas de compact e recuperação bem-sucedida                                                                                     |
| Export de session snapshot     | Verificar histórico, fila, goal e configuração de modelo | Permitir exportar JSON nas fases-chave do case                                                                                                                            |
| Correlação de logs             | Permitir o join entre UI, service, agent e protocol | Todos os logs carregam `caseId/runId/sessionId/inputId`                                                                                                                   |
| Coletor de artifacts           | Permitir análise após a falha                    | Coletar ao final do teste, de forma unificada, screenshots, gravações, logs, quadros de protocolo, quadros de rede e snapshots; screenshots não participam da decisão automática |

## Ordem de Execução

1. Implementar manualmente primeiro os probes de MVP-01 a MVP-03, provando que UI + protocol + log + snapshot são coletados por completo.
2. Depois conectar os cases de queue, stop, edit, fork e compact.
3. Por último conectar o auto compact, porque ele exige que o mock provider suporte disparo por limiar, retentativas e ordem da timeline.
4. Com o MVP estável, mapear em lote os demais accepted cases do case catalog para o mesmo conjunto de templates de probe.

## Correções Posteriores ao Início do Todo156

A fronteira de aceitação usa as decisões finais de [Todo156 SF-01～SF-19](working-memory/provider-refactor/steps/todo-156-start-plan-followup-final-decisions.md). `conversation-session-start-plan-independent` aguarda revisão manual de cases complementares em SF-01/02/08/10/13: círculo de Start sob conexão paga, item selecionado no dropdown de equipe, nome do plano, e o primeiro item da sub-tela com parâmetros (fechar/confirmar/não), com asserções de que a requisição real de modelo e o rascunho da caixa de entrada principal não mudam. As demais combinações de estado de cache são cobertas por `startPlanRecommendationFreshness`, `providerFamilyConnectionVisibility` e pelos testes de card de status; viewports desktop/mobile e temas claro/escuro têm seus próprios casos visuais de browser. Este registro não é uma declaração de promoção para CI nem de cobertura E2E de todas as SF.