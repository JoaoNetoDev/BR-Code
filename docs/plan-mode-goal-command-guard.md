# Guard de Comando de Goal no Modo Plan

## Resumo da feature/mudança

| Campo                | Valor                                                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Mudança              | Ao enviar um comando de controle de goal pelo composer no modo Plan, rejeitar na fronteira de admissão da UI e avisar para trocar de modo |
| Superfícies visíveis ao usuário | Composer do desktop, composer Web comum, composer mobile `/remote`                                                             |
| Documentação existente | `docs/conversation-protocol-declaration.md`、`docs/conversation-product-state-space.md`、`docs/v4-refactor/v4-goal-command-parity-plan.md` |
| Responsáveis pelo código existente | `packages/ui/src/v4/SessionPane.tsx`、`packages/ui/src/v4/ConversationComposer.tsx`、`packages/ui/src/v4/slashCommands.ts`                     |
| Fora de escopo        | Reescrever o goal runtime do CLI, modificar a persistência de queue/goal, mudar o protocolo de entrega do desktop continuous ou do mobile replayable |

## Log de esclarecimentos

| Rodada | Pergunta                                                                                                        | Resposta do usuário | Fronteira fixada                                   | Necessário acompanhamento |
| ------ | --------------------------------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------- | ------------------------- |
| 1      | No modo Plan, ao enviar `/goal` ou `/goal <conteúdo>`, em todas as plataformas apenas exibir toast, sem criar goal, sem enviar mensagem e preservando a entrada? | sim                 | Guard de UI compartilhado entre plataformas; efeito colateral zero de comando; texto original do composer preservado | não                       |

## Decisões de fronteira

| Fronteira             | Decisão                                       | Inclui                                                                                   | Exclui / poda                                                                  | Origem                                  |
| -------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------- |
| Modo de colaboração   | Rejeitar somente quando `config.mode=plan`   | sessão draft/prewarmed, sessão já existente                                              | build/edit/yolo mantêm a semântica original                                      | usuário                                  |
| Classe de comando    | Rejeitar comandos de controle de goal já reconhecidos pelo parser | `/goal`、`/goal <conteúdo>`、`/goal replace/resume/...` e as entradas equivalentes já existentes como `/target` | `/compact`, texto comum                                                            | usuário + equivalência existente do parser |
| Anexos/contexto      | Reutilizar a guarda de parser existente      | Só é slash command quando não há anexos nem contexto de página/seleção de sessão        | texto `/goal` com anexo ou contexto continua passando pelo `sendText` comum       | código existente                         |
| Efeitos colaterais   | Apenas toast e retorno `blocked`              | Entrada, anexos e registro de rascunho preservados                                       | Não dispara `sendGoalCommand`/`resumeGoal`, não cria session, não grava histórico de prompt | usuário                                  |
| Fronteira do cliente  | Compartilhar o guard de admissão do `SessionPane` | desktop continuous, Web comum, web-remote replayable                                    | Não escrever uma cópia do guard em relay/main/Host/CLI                            | documentação de arquitetura             |

## Escopo de domínio e cross-products de alto risco

| Domínio                           | Inclui?            | Por que pode mudar comportamento               | Fontes primárias                      |
| --------------------------------- | ------------------ | ---------------------------------------------- | ------------------------------------- |
| Comportamento de conversa/sessão  | sim                | `/goal` originalmente criaria, atualizaria ou enfileiraria um goal | protocolo de conversa + matriz de goals |
| Shell de UI/locale/mobile         | sim                | Toast, preservação da entrada e consistência entre plataformas estão no composer compartilhado | `DESIGN.md` + i18n da UI              |
| Permissão/modo de colaboração     | sim                | `config.mode=plan` é o estado autoritativo deste guard | snapshot/config do V4                 |
| Entrega remote/replay             | apenas representativo | O comportamento no terminal é o mesmo; o protocolo de entrega não pode ser reescrito | fluxo de mensagens                     |

Cruzamentos de alto risco: Plan × alias de goal pode gerar bypass; Plan × promoção de draft pode criar incorretamente uma session vazia; Plan × limpeza do composer pode fazer a entrada rejeitada se perder. Os três são decididos antes da admissão na UI.

## Mapa de conceitos e donos de estado

| Conceito                | Por que importa                       | Origem / responsável                                              |
| ----------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| modo de colaboração     | Determina se o guard de Plan é atingido | projeção do CLI `snapshot.config.mode`; durante o draft, espelhado pelo draft config |
| slash command visível   | Distingue intenção de controle de goal de texto comum | `parseV4VisibleSlashCommand`                                      |
| dispatch de comando     | Ponto de entrada de qualquer efeito colateral de goal/session | `SessionPane.dispatchSendTextAfterConfig`                          |
| rascunho do composer    | Deve ser preservado quando rejeitado   | `ConversationComposer` + editor Lexical/draft store                |
| texto do toast          | Prompt compartilhado, bilíngue         | i18n da UI + componente de toast compartilhado                     |

```text
composer submit
  -> parse visible slash command
  -> read effective collaboration mode
  -> mode=plan AND command=goal-control
       |-- yes -> toast -> return blocked -> keep editor/draft -> no V4 command
       `-- no  -> existing config barrier -> V4 command -> ACK/projection

desktop-continuous --------\
                             +-> shared SessionPane guard -> existing Host/CLI
web-remote-replayable -----/
```

## Dimensões e combinações candidatas

| Dimensão            | Valores / classes de equivalência        | Inclui?       | Razão                                          |
| ------------------- | ----------------------------------------- | -------------- | ---------------------------------------------- |
| modo de colaboração | plan / non-plan                          | sim            | Determina o guard                              |
| intenção de entrada | goal-control / compact / text            | sim            | Distingue efeitos colaterais                   |
| superfície de sessão | draft/prewarm / sessão existente          | sim            | Evita que a promoção de draft crie uma session |
| modo de cliente     | desktop-continuous / web-remote-replayable | representativo | Mesmo efeito de UI compartilhada               |
| anexos/contexto     | none / present                            | sim            | Com presence, não é slash command              |

| Candidate ID | Estado  | Evento                                                  | Alvo/superfície | Guard/efeito esperado                                         | Status                       |
| ----------- | ------- | ------------------------------------------------------- | --------------- | ------------------------------------------------------------- | ---------------------------- |
| PG01        | plan    | enviar `/goal` ou `/goal <conteúdo>`                    | composer        | toast; retorna blocked; preserva a entrada; comando zero      | aceito                       |
| PG02        | non-plan | enviar comando de goal                                   | composer        | Mantém as semânticas existentes de set/update/queue            | aceito                       |
| PG03        | plan    | enviar texto comum ou `/compact`                        | composer        | Mantém as semânticas existentes de send/compact                | podado da mudança            |
| PG04        | plan    | enviar texto com aparência de goal e anexo/contexto     | composer        | O parser retorna texto comum, mantém `sendText`                | podado pela aplicabilidade do comando |
| PG05        | plan    | enviar um alias de goal                                  | composer        | Equivalente a PG01, não pode contornar o guard                | aceito                       |

## Decisões de poda e questões em aberto

| Decision ID | Combinações podadas                       | Guard/invariante                    | Razão de produto                                        | Cobertura representativa             |
| ----------- | ----------------------------------------- | ----------------------------------- | ------------------------------------------------------- | ------------------------------------- |
| PG-P01      | Estado final de negócio duplicado em desktop/mobile | admissão de UI compartilhada       | O perfil de entrega não altera o guard local do composer | PG01 + teste do componente compartilhado |
| PG-P02      | Todas as permutações de alias de goal    | equivalência do parser              | Basta tomar `/goal` e um alias como representante       | teste focado de parser/SessionPane    |
| PG-P03      | Todas as permutações queue/running/completed | O guard de Plan ocorre antes do dispatch | A phase do runtime deixa de afetar o resultado       | PG01                                  |

Não há questões de produto em aberto.

## Lista de casos aceitos e handoff de cobertura

| Case ID | Setup                                                                   | Ação                     | Asserções                                                                                                           | Camadas de evidência                   | Status   |
| ------- | ----------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------- |
| PG01    | Snapshot do V4 ou modo efetivo de draft é `plan`, e o composer tem o texto original `/goal` | Enter ou clique em enviar | texto do toast correto; `sendGoalCommand`/`resumeGoal`/`createSession` não são disparados; editor não é limpo; histórico de prompt não é gravado | UI + mock de comando + estado de draft/editor | coberto  |
| PG02    | modo é build/edit/yolo                                                 | enviar `/goal objective` | Continua disparando `sendGoalCommand`                                                                                | mock de comando                        | existente |
| PG05    | modo é plan                                                            | enviar um alias de goal  | Igual a PG01                                                                                                         | parser + mock de comando               | coberto  |

## Backfill da matriz

| Arquivo                | Mudança                                                          |
| ---------------------- | ---------------------------------------------------------------- |
| catálogo de casos      | Adicionar PG01 e remover a formulação antiga de que, após EnterPlanMode, `/goal` pode atualizar o target |
| matriz de cobertura principal | Adicionar a linha Plan × guard de composer de goal       |
| matriz específica de goals | Adicionar o item de rejeição no modo Plan                  |

## Notas de handoff para E2E

- Fixture de provider: desnecessário; o contrato de produto é zero requisições ao provider.
- Fixture de sistema de arquivos: desnecessário.
- Estratégia de timing: teste de UI focado; se depois for promovido a E2E, o manifesto usa `providerRequestPolicy: none`.
- Preset de Docker: não entra neste momento.
- Riscos de revisão: validar principalmente que draft/prewarm não sofre promoção e que o shell mobile reutiliza o `SessionPane` compartilhado.