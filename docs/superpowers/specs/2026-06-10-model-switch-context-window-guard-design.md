# Design do Guarda de Janela de Contexto na Troca de Modelo

## Resumo da funcionalidade/mudança

O composer do V4 executa hoje `switchModelConfig` diretamente, sem o guarda de contexto de troca de modelo da
antiga toolbar. Já existe uma semântica de produto exigindo que: quando a sessão atual já usou mais contexto do
que o modelo alvo tem disponível para o lado de entrada, a troca não pode ser feita diretamente; é preciso
comprimir primeiro com o modelo atual e, após a compressão, confirmar que cabe para só então trocar.

Esta restauração ajusta também a semântica antiga: uma task em execução não é mais recusada pelo guarda. O botão
de confirmação exibe “Parar e comprimir agora”; a CLI para atomicamente o trabalho em primeiro plano, congela
mas preserva a fila existente e faz a compactação de guarda deste caso passar à frente da fila. O `/compact`
comum continua com o FIFO atual e não é afetado por este caso especial.

O V4 atual não implementa esse comportamento; trata-se de um `bug-candidate`. Este documento é a fonte de
fatos anterior à implementação e não significa que o código esteja concluído.

## Registro de esclarecimentos

| Data | Questão | Decisão do usuário | Fronteira fixa |
| --- | --- | --- | --- |
| 2026-07-15 | A janela alvo é insuficiente e há uma task em execução: recusar a troca ou esperar/adiantar? | Oferecer “Parar e comprimir agora” | Após a confirmação do usuário, parar o trabalho em primeiro plano, sem manter uma intenção implícita de UI esperando o turno atual terminar naturalmente |
| 2026-07-15 | Uma fila existente impede a compactação de guarda? | Não impede; comprimir diretamente após o clique | A compactação de guarda ultrapassa a fila existente; conteúdo e ordem relativa da fila não são removidos nem modificados |
| 2026-07-15 | O guarda altera o `/compact` comum? | Não | Apenas o guarda de troca de modelo usa semântica de preempção; a semântica FIFO do `/compact` comum em A08/B13 é preservada |
| 2026-07-15 | Como a fila é restaurada após o sucesso? | Restaurar o estado anterior à operação | Se antes era `autoDrain=true`, continuar consumindo depois que a troca se estabilizar; se antes estava held, continua held |
| 2026-07-15 | E se a compactação falhar ou a janela ainda for excedida? | Manter o estado seguro de parada | Não trocar de modelo; o turno já parado não é retomado; a fila é preservada e permanece held |
| 2026-07-15 | E o auto compact já existente? | Não comprimir de novo | Aguardar o estado final do compact existente e reconferir o uso, sem interromper e sem criar um segundo compact |

## Objetivos

- Interceptar a seleção de modelo apenas em sessões já ativas; a seleção de modelo padrão de um workspace em rascunho não muda.
- Antes da troca real, avaliar `currentUsedTokens > targetEffectiveContextWindow`.
- Quando a janela alvo é insuficiente, exibir diálogo de confirmação; no estado ocioso o botão é “Comprimir”, no estado em execução é “Parar e comprimir agora”.
- No estado ocioso, comprimir imediatamente com o modelo atual; no estado em execução, parar atomicamente o trabalho em primeiro plano e comprimir imediatamente.
- A compactação de guarda não é bloqueada por fila/escolha held existente, mas precisa preservar o conteúdo, a ordem e as informações de origem da fila.
- Só executar a troca para o modelo alvo depois que a compactação tiver sucesso e o uso novo satisfizer o orçamento alvo.
- Após o sucesso da troca, retomar o consumo da fila somente se `autoDrain=true` antes do guarda.
- Manter desktop continuous e mobile web-remote replayable compartilhando a mesma máquina de estados de sessão/comando da CLI.

## Não objetivos

- Não alterar o FIFO do `/compact` comum: ao executar, adiciona ao fim da fila; quando está held, continua adicionando à fila pausada.
- Não alterar o limiar de compactação automática do agent nem o ciclo de vida do auto compact.
- Não adicionar guarda a uma sessão em rascunho.
- Não remover, editar ou reordenar itens de fila existentes.
- Não retomar automaticamente um turno de assistente, trabalho de ferramenta ou continuação de objetivo que já foram parados.
- Não permitir que o usuário force a troca ignorando a insuficiência da janela alvo.
- Não armazenar no relay, no desktop main ou na remote bridge o estado de negócio do guarda, da fila, da compactação ou da troca de modelo.

## Escopo de domínio e produtos cruzados de alto risco

| Domínio | Owner do estado | Responsabilidade desta rodada | Cruzamento de alto risco |
| --- | --- | --- | --- |
| Composer/configuração de modelo do V4 | `packages/ui/src/v4/SessionPane.tsx` + `switchModelConfig` da CLI | Interpretar o objetivo do usuário, exibir a confirmação, consumir a projeção autoritativa e submeter a troca final de modelo | Seleção tardia, CAS de revision, metadata de provider custom/native |
| Uso de contexto/compactação | Runtime de sessão da CLI + projeção do V4 | Executar a compactação com o modelo atual, produzindo marker e uso novo | ACK de compactação não significa conclusão, compactação duplicada, falha/cancelamento |
| Stop/fila | Núcleo de comandos da CLI | Congelar auto-drain, parar o trabalho em primeiro plano, preservar a fila e fazer a compactação de guarda ter precedência FIFO | Estado final de stop tardio, fila held, novas entradas durante a execução, pausa de objetivo |
| Entrega ao cliente | Sessão compartilhada Host/CLI | Desktop continuous e mobile replayable observam o mesmo fato de comando | Reconexão, troca de modelo em outra ponta, isolamento por `workspaceIdentity`/`remoteSessionId` |

## Mapa de conceitos e fatos atuais

- Entrada de modelo do V4: `packages/ui/src/v4/composer/V4ComposerToolbar.tsx` hoje passa a seleção direto para `onSelectModel`.
- Escrita de modelo do V4: `packages/ui/src/v4/SessionPane.tsx` escreve hoje a configuração da sessão via `switchModelConfigWithRecovery` e CAS de revision.
- Campos autoritativos de uso: `usage.contextWindow.usedTokens/maxTokens/autoCompactThresholdTokens` em `packages/shared/src/zcode-protocol-v4/snapshot.ts`.
- Metadata do modelo alvo: `ModelProviderModelConfig.contextWindow/maxOutputTokens`; `resolveModelProviderContextWindow()` responde pelo fallback e pelo `[1m]`.
- Compactação comum: `commandPayloadSchemas.compact` hoje tem payload vazio; o `goal-compact.ts` da CLI a adiciona ao FIFO em busy/held.
- Stop: `session-flow.ts` da CLI pausa primeiro o objetivo ativo e depois aborta o controller atual; a semântica existente B02-B04 exige preservar a fila e desligar o auto-drain.
- Projeção: o ACK de comando só prova admissão; o guarda precisa esperar o estado final do marker de compactação e o uso novo, não pode tratar o ACK como compactação bem-sucedida.
- O antigo `manual-review/pending/conversation-session-model-switch-auto-compact.test.ts` serve apenas como evidência histórica e não conta como cobertura oficial do V4 atual.

## Regra de orçamento

O orçamento efetivo de entrada do alvo permanece consistente com a política de compactação automática do agent:

```text
outputReserve = positive(maxOutputTokens) ?? 64_000
effectiveReserve = min(outputReserve, contextWindow)
targetEffectiveContextWindow = max(0, contextWindow - effectiveReserve)
needsGuard = currentUsedTokens > targetEffectiveContextWindow
```

- native/custom/modelIdByKind precisam resolver todos para a mesma metadata do modelo alvo.
- Modelos como `[1m]` continuam reutilizando `resolveModelProviderContextWindow()`.
- Quando o uso atual ou a metadata alvo estiver ausente/inválido, mantém-se o fail-open legado, para que metadata obsoleta não trave a cadeia de troca existente; esse ramo é coberto por teste unitário e não é expandido para uma matriz E2E.
- Após a compactação, se o uso estiver ausente/inválido, o comportamento é fail-closed: quando não é possível provar que cabe, não troca.

## Estado de produto e sequência

```text
renderer desktop-continuous / web-remote-replayable
                         |
                  seleciona o modelo alvo
                         |
             resolve o orçamento efetivo alvo
                         |
             +-----------+-----------+
             | used <= budget        | used > budget
             v                       v
       switchModelConfig CAS    diálogo de confirmação
                                     |
                     +---------------+---------------+
                     | ocioso/concluído               | executando/parável
                     v                               v
              botão: “Comprimir”            botão: “Parar e comprimir agora”
                     |                               |
                     +---------------+---------------+
                                     |
                         comando de compactação de guarda
                                     |
             CLI: snapshot do autoDrain anterior + definir false
                                     |
             CLI: parar o trabalho em primeiro plano + esperar o lock ativo ocioso
                                     |
             CLI: iniciar a compactação antes de qualquer item de fila preservado
                                     |
                  projeção de compactação final + uso novo
                                     |
                revalidar sessão / seleção / revision
                         +-----------+-----------+
                         | cabe                    | falhou/obsoleto/grande demais
                         v                       v
              switchModelConfig CAS       manter o modelo antigo
                         |                manter a fila held
              restaurar autoDrain somente
              quando antes era verdadeiro
```

## Design de comando/protocolo

O renderer não pode enviar `stop` e `compact` comum em sequência: entre os dois comandos existe uma corrida de
auto-drain da fila/inserção de comandos entre dispositivos, e o compact comum ainda cai no fim da fila conforme
o protocolo atual.

Planeja-se adicionar um comando de preempção de guarda independente (nome de implementação sugerido:
`preemptCompact`) ao schema estrito de comando exportado por `packages/shared/src/zcode-protocol-v4/index.ts`:

- Deve carregar `baseRevision` e rejeitar confirmações obsoletas antes de o CLI iniciar a parada destrutiva.
- O commandId é a fronteira de idempotência; quando já houver uma compactação manual/de guarda em execução ou na fila da mesma sessão, retorna `compactOperationLock`.
- O núcleo de comandos da CLI, na mesma decisão, executa em sequência: ler o `autoDrain` original, definir `false`, pausar o objetivo e abortar o controller em primeiro plano conforme a semântica de Stop existente, esperar o estado ocioso e chamar diretamente o único caminho `startManualCompact`.
- O comando de preempção não entra no FIFO de entrada comum; os itens de fila são preservados como estão.
- Novas entradas durante a compactação ainda vão para a fila e não interrompem a compactação.
- O estado final da compactação é expresso pelos markers/projeção de uso já existentes, sem novo estado em relay/main.
- O renderer só chama o `switchModelConfigWithRecovery` existente quando a compactação teve sucesso, o uso novo é aceitável e a sessão/seleção originais continuam válidas.
- Após o sucesso da troca, chamar `setAutoDrain(true)` com a nova revision; só executar se era true antes do guarda. Em caso de falha, uso desconhecido ou ainda acima da janela, o auto-drain não é restaurado.
- Se o renderer initiator se desconectar após a compactação, a CLI mantém o modelo antigo e a fila held; após reconectar, o usuário pode continuar a partir da projeção autoritativa, sem executar uma troca de modelo fantasma.

## Comportamento da UI

- O diálogo aparece somente quando `needsGuard=true`.
- No estado ocioso o título mantém “É necessário comprimir o contexto antes de trocar de modelo”, e o botão de confirmação é “Comprimir”.
- Em running/stoppable, explica que a resposta atual será parada imediatamente e que a fila existente será preservada; o botão de confirmação é “Parar e comprimir agora”.
- Cancelar, Esc ou fechar pelo overlay não para nada, não compacta e não troca o modelo.
- Enquanto o guarda está em andamento, desabilita a confirmação repetida da mesma ação e exibe o ciclo de vida de compactação existente; não é permitido forjar mensagens de usuário adicionais.
- Se o usuário selecionar outro modelo na mesma sessão durante a espera, o token de seleção antigo é invalidado; uma compactação já iniciada pode concluir, mas o alvo antigo não pode sobrescrever a nova escolha tardiamente.
- Se o usuário mudar para outra task, a compactação da sessão original continua convergindo conforme os fatos da CLI, mas não pode trocar o modelo da nova task.
- Desktop, Web e celular Web reutilizam o mesmo componente e i18n; seguem as regras existentes de ConfirmDialog, cores semânticas, tamanhos compactos, tema duplo e responsividade do `DESIGN.md`.

## Dimensões e podagem

| Dimensão | Classes de equivalência | Tratamento |
| --- | --- | --- |
| Fase da sessão | rascunho / concluída / executando / compactando | rascunho podado; concluída e executando aceitas; auto compact existente reaproveita N14 |
| Fila | vazia / fila com auto-drain / fila held | As três classes são mantidas; quantidades `1/2/3+` são colapsadas pela invariante “conteúdo e ordem relativa inalterados”, com valor representativo 2 |
| Resultado do guarda | cancelar / compactação bem-sucedida que cabe / bem-sucedida mas ainda grande demais / falha ou uso desconhecido | cancelar, cabe e fail-closed precisam ser todos provados |
| Cliente | desktop continuous / mobile replayable | Semântica de produto igual, mas evidências de projeção separadas; a lógica de replay gap não se espalha para o desktop |
| Provider | native / custom / runtime id mapeado / metadata desconhecida | Resolver coberto por teste unitário pairwise; E2E usa uma fixture native controlável |
| Trabalho ativo | saída do assistente / ferramenta ou objetivo em primeiro plano / trabalho de background independente | Compartilha a invariante existente de Stop foreground; trabalho de background não tem o escopo de parada ampliado por este guarda |
| Workspace | identidade local / SSH-WSL-Docker | Comandos isolados por sessão; remoto verificado de forma focada com `workspaceIdentity + remoteSessionId`, sem o produto cartesiano completo de OS/provider |

Decisões de podagem:

- `/compact` comum × semântica de preempção: `pruned`, isolado pela invariante da entrada de comando; A08/B13 inalterados.
- Produto cartesiano completo de quantidades de fila: `pruned`, a fila não é removida nem reordenada e o valor representativo cobre.
- rascunho × guarda: `pruned`, não há uso de sessão ativa.
- Metadata desconhecida × E2E: `pruned` até o teste unitário do resolver; o produto mantém fail-open.
- Cada provider × desktop/mobile: `pruned`, provado em camadas pelo resolver de metadata e pela projeção de entrega.
- Troca direta atual do V4 para um modelo pequeno demais: `bug-candidate`, consolidado após a implementação por N05/N09-N14.

## Casos aceitos

| ID | Setup | Action | Assertions | Evidência |
| --- | --- | --- | --- | --- |
| N05 | concluída, fila=0, uso acima do orçamento alvo | Seleciona o alvo e cancela/confirma | Cancelar não muda nada; confirmar compacta com o modelo antigo; só troca após o uso novo estar aceitável | diálogo, requisição/marker de compactação, uso/config do snapshot |
| N09 | executando, fila=0, uso acima do orçamento | Clica em “Parar e comprimir agora” | Turno em primeiro plano é interrompido; a compactação de guarda inicia em seguida; troca de modelo após o sucesso | timeline de stop/compactação, modelo da requisição ao provider, projeção de config |
| N10 | executando, fila=2, autoDrain=true | Confirma o guarda | Conteúdo/ordem da fila inalterados; a compactação passa à frente da fila; após a troca o auto-drain é retomado e a fila é consumida com o modelo alvo | Projeção de fila da CLI, ordem das requisições, config de modelo |
| N11 | concluída/interrompida, fila=2, autoDrain=false | Confirma o guarda | Não dispara a limpeza/manutenção da fila held; a compactação inicia imediatamente; a fila permanece held e a troca de modelo não dispara consumo | inputRouting, IDs/ordem da fila, projeção de compactação/config |
| N12 | executando ou concluída, compactação falha/cancelada, uso desconhecido ou ainda acima do orçamento | Confirma o guarda | Não troca o modelo; o turno já parado não é retomado; a fila é preservada e fica held; há um aviso explícito | marker de falha, uso/config, autoDrain da fila |
| N13 | guarda confirmado, compactação aguardando/em execução | Nova seleção de modelo na mesma sessão, troca de task ou atualização de config em outra ponta | O token de seleção antigo não pode trocar de modelo/task tardiamente; a nova seleção segue o config/revision mais recente | comando/revision, projeção com escopo de sessão, config final nas duas pontas |
| N14 | auto compact já em execução e contexto do modelo alvo insuficiente | Seleciona um modelo | Não para nem envia uma segunda compactação; aguarda a compactação existente, reconfere e executa a seleção efetiva mais recente | ciclo de vida único de compactação, seleção pendente, CAS de config |

## Tratamento de erros

- Comando preempt rejeitado por revision obsoleta: sem stop, sem compactação; nova avaliação a partir do snapshot mais recente.
- Bloqueio de operação: não repetir a compactação; se for um auto compact existente, aguardar seu estado final e reconferir; se for outra compactação manual, reutilizar o mesmo estado final sem forjar sucesso.
- Falha ao iniciar a compactação após o stop: modelo antigo inalterado, fila held e os fatos interrupted/failed preservados.
- Compactação bem-sucedida, mas uso novo inválido ou ainda acima da janela: modelo antigo inalterado, fila held, com um toast explicando o cancelamento da troca.
- Falha posterior na troca de modelo: segue o tratamento de erro de config de modelo já existente e a fila não recupera auto-drain.
- Falha ao restaurar com `setAutoDrain(true)`: o fato de que o modelo já foi trocado não é revertido; a fila permanece held e o usuário é avisado a continuar manualmente.

## Plano de testes e entrega para E2E

A ordem do documento precisa vir antes do código de teste: atualizar primeiro
`docs/conversation-session-case-catalog.md` e `docs/testing/conversation-session-e2e-coverage-matrix.md`,
marcando N05/N09-N14 inicialmente como `planned`, sem continuar registrando a spec pendente MG legado como
cobertura.

Unitários/integração:

- Resolver de metadata: native, custom, `modelIdByKind`, `[1m]`, `maxOutputTokens`, fallback de 64k, fail-open para desconhecido.
- Orçamento/guarda: cabe, cancelar, compactação de sessão concluída, preempção em execução, fail-closed para falha/desconhecido/grande demais.
- Núcleo de comandos: revision obsoleta sem efeitos colaterais; fila preservada com ordem inalterada; pausa de objetivo + barreira de controller ocioso; bloqueio de operação de compactação; regressão do FIFO do compact comum.
- UI: exibição de “Comprimir” ou “Parar e comprimir agora” conforme a fase; seleção/task/revision tardia não aplica o alvo antigo.
- Entrega: desktop continuous e mobile replayable convergem do mesmo comando/projeção da CLI; a identidade remota não corresponde apenas por `workspacePath`.

E2E:

- Com base em uma fixture de provider local do caso, construir uma janela de contexto alvo pequena e controlada e um uso pós-compactação, sem depender de sorte com modelos online.
- Priorizar a cobertura oficial de N05, N09 e N10; N11-N14 entram primeiro em manual-review/pending e só sobem de nível quando a evidência estiver estável.
- O E2E formal de desktop prova a UI, a ordem das requisições ao provider e a projeção de fila/config; mobile replayable usa um caso focado de service/integration para provar o mesmo fato de comando, a recuperação após desconexão e o isolamento de identidade.
- Não substituir setup/action/assert por “o caminho passa por running/queue”; cada caso coberto precisa observar separadamente os resultados de stop, compactação, uso, troca e fila.

## Critérios de aceitação

- Selecionar um modelo pequeno demais em uma sessão concluída pede confirmação de compactação; cancelar não muda o modelo.
- Em uma sessão em execução o botão de confirmação é “Parar e comprimir agora”, e após confirmar o trabalho em primeiro plano é parado.
- Independentemente de a fila existir ou estar held, a compactação de guarda a ultrapassa imediatamente, mas o conteúdo e a ordem da fila não mudam.
- A compactação usa o modelo anterior à troca; o modelo alvo só é selecionado após o uso novo satisfazer o orçamento.
- Após o sucesso só é retomado o auto-drain que já estava ligado antes do guarda; uma fila held não é iniciada arbitrariamente.
- Em falha de compactação, uso desconhecido ou ainda acima da janela, o modelo antigo e a fila held são mantidos.
- O comportamento FIFO do `/compact` comum em running/held não sofre regressão.
- Desktop continuous e mobile replayable observam no final o mesmo fato de stop/compactação/modelo/fila, sem estado de negócio em relay/main.