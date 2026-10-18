# Rolagem e foco do prompt na conversa

## Resumo da funcionalidade

| Campo                   | Valor                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| Mudança                 | O usuário envia um novo prompt enquanto lê o contexto anterior; somente o caminho de envio imediato executa uma vez a ação existente de "rolar até o final" |
| Superfícies visíveis ao usuário | Composer de conversa V4, item de fila "立即发送" (enviar agora), UI compartilhada desktop/Web/mobile |
| Documentos existentes    | `docs/conversation-session-case-catalog.md`,`docs/testing/conversation-session-e2e-coverage-matrix.md` |
| Responsáveis pelo código existente | `ConversationTimeline` mantém o estado de rolagem local do renderer; `SessionPane` orquestra o comando composer/queue |
| Fora de escopo           | Fixar permanentemente no final, mudanças de fila no protocolo/CLI, sincronizar posição de rolagem entre renderers, edit/retry/drenagem automática |

## Registro de esclarecimentos

| Rodada | Pergunta                                          | Resposta do usuário                            | Limite fixado                                    | Acompanhamento necessário |
| ------ | ------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------ | ------------------------ |
| 1      | Envio normal, enfileiramento e send-now da fila disparam todos? | Mensagem enfileirada não dispara; clicar em enviar agora na fila de mensagens dispara | Envio imediato e enqueue são julgados separadamente | não                      |

## Decisões de limite

| Limite    | Decisão                                        | Inclui                                                                | Exclui / poda                        | Fonte                                     |
| --------- | ---------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------- |
| Gatilho   | Reutiliza a ação instantânea existente de "rolar até o final" | Envio direto pelo composer aceito; clique em send-now do item da fila | Apenas enqueue, drenagem automática, edit, retry | usuário                                   |
| Tempo de vida | Restauração única de `following=true`          | Ir até o final nesta ocasião e o acompanhamento natural já existente depois | Trava permanente no final; continuar forçando a rolagem após o usuário rolar para cima | usuário + máquina de estados de rolagem existente |
| Falha     | Falha de envio pelo composer não altera a posição de leitura | Envio aceito/sem throw                            | rejeitado/throw                      | limite de ACK existente                   |
| Cliente   | Semântica do renderer compartilhado            | desktop contínuo, Web comum, UI remota mobile | Sincronizar posição de rolagem entre dispositivos | invariante de arquitetura                |

## Escopo de domínio

| Domínio                    | Inclui?  | Por que pode alterar o comportamento                                | Fontes primárias                       |
| -------------------------- | -------- | -------------------------------------------------------------------- | -------------------------------------- |
| Conversa/sessão            | sim      | `inputRouting.mode` distingue start-now de enqueue                   | declaração do protocolo de conversa    |
| Estado de rolagem do renderer | sim    | `followingRef`, memória de rolagem e ação de final definem onde o usuário lê | `ConversationTimeline.tsx`, casos SRM  |
| Mobile replayable          | apenas limite | UI compartilhada, mas o protocolo de recuperação não pode ter estado de rolagem | arquitetura de fluxo de mensagens      |
| Protocolo/CLI              | não      | Nenhum command/result novo nem estado de fila                        | invariante local do renderer           |

## Mapa conceitual e responsáveis pelo estado

```text
composer start-now --ACK accepted--\
                                  +--> SessionPane intent --> ConversationTimeline bottom action ref
queue send-now click -------------/
composer enqueue -----------------X

scrollToBottom(): following=true -> instant bottom -> existing content-follow behavior
user scrolls up: following=false -> hold reading position
```

| Estado / fato                 | Autoridade                                                   | Evidência                            |
| ----------------------------- | ------------------------------------------------------------ | ------------------------------------ |
| start-now vs enqueue          | `snapshot.inputRouting.mode` atual do V4 + disposition retido | teste de política focado             |
| clique em send-now da fila    | ação do usuário em `ConversationQueuePanel`                  | teste de componente SessionPane       |
| posição de rolagem/following  | instância do componente `ConversationTimeline`               | teste unitário de action-ref da timeline |
| verdade de conversa/fila      | projeção do CLI                                               | inalterado                           |

## Dimensões e combinações candidatas

| ID candidato | Estado                                                            | Evento                                                       | Efeito esperado                                        | Status                                                      |
| ------------ | ----------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------- |
| PSF01        | sessão existente, usuário acima do final, routing=`startNow`     | envio pelo composer resolve como aceito                      | final instantâneo; `following=true`                    | aceito                                                      |
| PSF02        | sessão existente, usuário acima do final, routing=`enqueue`     | entrada do composer é aceita na fila                         | mantém posição de leitura; `following=false`           | aceito                                                      |
| PSF03        | fila visível, usuário acima do final                             | clique em send-now do item da fila                           | executa imediatamente a mesma ação de final            | aceito                                                      |
| PSF04        | envio direto pelo composer lança/erejeita                        | envio falha                                                  | mantém posição de leitura e rascunho                   | podado do gatilho pela guarda de sucesso                 |
| PSF05        | PSF01/PSF03 já moveram para o final                              | usuário rola para cima novamente                             | handler de rolagem existente define `following=false`  | invariante aceita                                           |
| PSF06        | drenagem automática da fila                                       | runtime consome um item sem clique em send-now               | sem nova intenção de rolagem forçada                   | ignorado; o estado following existente decide a ancoragem do conteúdo |

## Decisões de poda

| ID decisão | Combinações podadas                                                  | Guarda/invariante                                    | Motivo no produto                                  | Cobertura representativa       |
| ---------- | -------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------- | ------------------------------ |
| P1         | provider/model/goal/tool × prompt scroll                             | o resultado do routing é a única dimensão de UI relevante | esses eixos não alteram a intenção de rolagem     | PSF01/PSF02                    |
| P2         | desktop contínuo × matriz de product-state mobile replayable         | a rolagem é local do renderer                          | a entrega muda a recuperação, não esta ação de UI  | unidade de componente compartilhado |
| P3         | edit/retry/drenagem automática                                       | nenhum evento de novo prompt no composer nem send-now explícito | evitar saltos não relacionados durante a leitura | ausência de gatilho na fiação   |

## Casos aceitos e cobertura

| ID caso | Preparação                                                                    | Ação                                          | Asserções                                                                                     | Camadas de evidência       | Status E2E |
| ------- | ----------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------- | ---------- |
| SRM05   | sessão longa, usuário rolou para longe do final, routing start-now            | envia prompt pelo composer e recebe ACK aceito | ação de final roda uma vez, conteúdo mais recente visível, following restaurado; rolagem posterior para cima é mantida | UI + command ACK            | planejado  |
| SRM06   | sessão longa em execução, usuário rolou para longe do final, routing enqueue | envia prompt pelo composer                    | a fila ganha um item; posição de rolagem/following inalteradas                               | UI + projeção               | planejado  |
| SRM07   | sessão longa com fila visível, usuário rolou para longe do final            | clica em "立即发送" em um item da fila        | ação de final roda imediatamente; o command segue o ciclo de vida existente de send-now       | UI + command ACK/projeção   | planejado  |

## Notas de passagem para E2E

- Reutilizar as fixtures existentes de rolagem em conversa longa do V4 e de fila.
- Usar controlled-stream somente para SRM06; SRM05/SRM07 não precisam de novo contrato de provider além das fixtures existentes.
- Desktop contínuo é o representante formal. Mobile replayable precisa apenas de uma asserção de componente compartilhado, a menos que apareça uma regressão específica de remota.
- Manter a implementação local do renderer; não adicionar campos de protocolo, estado de snapshot, estado de relay ou estado de rolagem persistente.