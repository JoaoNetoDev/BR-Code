# Histórico de prompts do Composer

## Resumo da funcionalidade/mudança

| Campo                   | Valor                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| Mudança                 | Ao submeter texto, o Composer filtra apenas repetições consecutivas iguais à última entrada; `↑/↓` continuam lendo o histórico |
| Superfícies visíveis ao usuário | Composer de conversa V4 compartilhado por Desktop/Web                                                          |
| Documentos existentes   | `docs/v4-refactor/m5-composer-parity.md`、`docs/conversation-session-case-catalog.md`                          |
| Responsáveis pelo código existente | `packages/ui/src/lib/promptHistory.ts`、`packages/ui/src/lib/promptHistoryStorage.ts`、`packages/ui/src/v4/ConversationComposer.tsx` |
| Fora de escopo           | Deduplicação global, migração de dados antigos, mudança de capacidade do histórico e da workspace key, estado de protocolo/Agent/relay |

## Registro de esclarecimentos

| Rodada | Pergunta                              | Resposta do usuário        | Limite fixado                                                | Acompanhamento necessário |
| ------ | ------------------------------------- | -------------------------- | ------------------------------------------------------------ | ------------------------ |
| 1      | Repetição consecutiva ou global       | Só filtra as consecutivas | `A,A` mantém só uma; `A,B,A` mantém tudo                   | não                      |
| 1      | Como normalizar antes de comparar     | Basta remover espaços das pontas | Compara apenas o texto completo após `trim()`; espaços internos, quebras de linha e caixa ainda importam | não        |
| 1      | Se ao ler o histórico antigo deve-se limpar duplicatas | Não é preciso limpar | O caminho de leitura não faz migração de dedup; duplicatas já existentes no histórico mantêm a ordem original | não |

## Decisões de limite

| Limite        | Decisão                                                                              | Inclui                                  | Exclui / poda                                         | Fonte          |
| ------------- | ------------------------------------------------------------------------------------ | --------------------------------------- | ----------------------------------------------------- | -------------- |
| Deduplicação na escrita | Se a nova entrada for idêntica à última entrada atual após `trim()`, não anexa nem grava em disco | Submissões consecutivas iguais, diferença apenas de espaços nas pontas | Duplicatas não consecutivas                  | usuário       |
| Equivalência de texto | Remove apenas espaços das pontas                                                     | `" A "` é igual a `"A"`                  | Colapso de espaços internos, de caixa, normalização Unicode | usuário       |
| Compatibilidade de leitura | Não deduplica no read path                                    | Ordem original e duplicatas do array antigo | Migração ou limpeza total                     | usuário       |
| Assumir navegação | Mantém o estado atual: `↑/↓` só são assumidos com entrada vazia ou já em modo de navegação do histórico | Composer de linha única ou multilinha   | Cursor se movendo normalmente com rascunho não vazio | código existente |
| Rollback em falha | Mantém o estado atual: envio com falha não adiciona ao histórico                         | reject/failure no send                   | Manter o texto que falhou no histórico               | código existente |

## Escopo de domínio e cruzamentos de alto risco

| Domínio                    | Inclui?       | Por que pode alterar o comportamento                              | Fontes primárias                                    |
| -------------------------- | ------------- | ------------------------------------------------------------------ | -------------------------------------------------- |
| Composer de conversa       | sim           | Tanto a submissão quanto `↑/↓` acontecem no composer Lexical compartilhado | `ConversationComposer.tsx`、`LexicalChatInput.tsx` |
| Persistência do renderer   | sim           | O histórico é estado `localStorage` do renderer                   | `promptHistoryStorage.ts`                          |
| Modo de cliente Desktop/Web | representativo | Os dois lados reutilizam a mesma lógica de UI; esta funcionalidade não entra na cadeia de dados continuous/replayable | `docs/architecture/message-flow.md`                |
| Agent/protocol/queue       | não           | A escrita do histórico não altera command submetido, queue nem projection | `docs/conversation-protocol-declaration.md`        |

Os cruzamentos de alto risco convergem assim: sucesso/falha do envio afeta se o novo histórico é
mantido; repetição consecutiva ou não consecutiva afeta se algo é anexado; duplicatas no storage
antigo afetam apenas o resultado da leitura. `desktop-continuous` e `web-remote-replayable`, fase da
session, provider, queue, tema e locale não alteram o resultado de deduplicação que é puramente de
renderer, por isso cada um fica com um representante da implementação compartilhada, sem permutação
completa.

## Mapa conceitual e responsáveis pelo estado

```text
composer submit
  -> read per-workspace localStorage snapshot
  -> trim submitted text
  -> compare with last entry only
     |-- same      -> send command; history/storage unchanged
     `-- different -> append (max 30) -> persist -> send command
                                      `-> send failed: compare-and-rollback

empty composer / history-browsing state
  -> ArrowUp / ArrowDown
  -> PromptHistoryPlugin
  -> replace Lexical editor text
```

| Estado / fato                | Autoridade                                                            | Espelhos / caches                             | Evidência                                    |
| ---------------------------- | --------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------- |
| Entradas do histórico de prompts | `localStorage` do navegador para a workspace key existente atual | estado React `ConversationComposer.promptHistory` | JSON armazenado + prop `promptHistory` do composer |
| Índice de navegação atual    | ref de `PromptHistoryPlugin`                                          | nenhum                                        | comportamento unitário focado de navegação  |
| Texto submetido              | rascunho Lexical/composer até o command ser aceito                    | `textRef`                                     | chamada de `onSendText`                     |

## Dimensões e combinações candidatas

| ID candidato | Histórico armazenado | Texto submetido / evento | Guarda/efeito esperado                          | Status    |
| ------------ | -------------------- | ------------------------- | ----------------------------------------------- | --------- |
| PH01         | `["A"]`              | envia `" A "`             | igual à última após trim; não anexa nem grava   | aceito    |
| PH02         | `["A", "B"]`         | envia `"A"`               | compara só com o último `B`; anexa como `["A","B","A"]` | aceito    |
| PH03         | `["A B"]`            | envia `"A  B"`            | espaços internos diferentes; anexa normalmente  | aceito    |
| PH04         | dado antigo `["A","A"]` | leitura / mount         | sem dedup na leitura, ainda retorna dois itens  | aceito    |
| PH05         | `["A"]`              | envia `"A"` e falha      | não gravado no histórico, sem rollback de disco; histórico original intacto | aceito    |
| PH06         | `["A"]`              | rascunho multilinha não vazio com `↑` | a guarda existente preserva a navegação do cursor e não entra no histórico | podado    |

## Decisões de poda e questões em aberto

| ID decisão | Combinações podadas                             | Guarda/invariante                          | Motivo no produto              | Cobertura representativa |
| ---------- | ----------------------------------------------- | ------------------------------------------ | ------------------------------ | ------------------------ |
| PHD01      | provider/model/fase da session × dedup          | o dedup acontece numa função pura do renderer antes do command | não afeta o resultado da comparação | PH01-PH05                |
| PHD02      | desktop continuous × mobile replayable          | o histórico não entra na entrega de conversation | os dois lados reutilizam o composer | PH01                   |
| PHD03      | assumir histórico com `↑/↓` em rascunho não vazio | `currentIndex === null && text.length > 0` | não quebra o movimento do cursor multilinha | guarda existente do `PromptHistoryPlugin` |

Questões não resolvidas: nenhuma.

## Casos aceitos e passagem de cobertura

| ID caso | Preparação                       | Ação                      | Asserções                                                      | Camadas de evidência        | Status         |
| ------- | -------------------------------- | ------------------------- | -------------------------------------------------------------- | ---------------------------- | -------------- |
| PH01    | histórico recente é `A`          | submete `" A "`           | o command ainda é enviado; o histórico continua só com `A`; storage não recebe escrita | integração de UI + localStorage | teste focado  |
| PH02    | histórico é `A,B`                | submete `A` de novo       | o histórico fica `A,B,A`; a leitura preserva a repetição não consecutiva | função pura + localStorage | teste focado  |
| PH03    | histórico recente é `A B`        | submete `A  B`            | as duas entradas são mantidas                                  | função pura                  | teste focado  |
| PH04    | localStorage já tem repetição consecutiva | lê o histórico   | retorna a ordem original de duplicatas, sem migração nem gravação | localStorage                | teste focado  |
| PH05    | histórico recente é `A`          | submete `A` duplicado e o envio falha | o histórico original fica intacto e não há escrita compensatória | integração de UI + localStorage | teste focado  |

Matrix backfill: `docs/conversation-session-case-catalog.md` ganha o grupo `PH`;
`docs/testing/conversation-session-e2e-coverage-matrix.md` registra a automação de UI/storage focada.
Esta mudança não envia requisições a provider, não altera protocolo nem visual e não exige nova
fixture de replay; se o WDIO for adicionado depois, pode declarar `providerRequestPolicy: "none"`.