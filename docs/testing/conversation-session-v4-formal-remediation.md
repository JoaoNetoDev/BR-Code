# Remediação do Replay Formal de Conversation V4

## Contexto e evidências

Em 2026-07-11 foi executada a primeira rodada de replay desktop non-Docker usando glob formal non-recursive e um pool estrito de providers:

- formal spec: 29; workers reais: 29; `manual-review/pending`: 0.
- fixtures de provider: `common.json` + 29 fixtures case-local; `provider-basic` ou o fallback tool-cross não foram carregados.
- run id: `task6-strict-20260711`.
- resultado: 34 tests, 20 passed, 14 failed; 15 specs totalmente verdes e 14 specs com pelo menos uma falha.

Essas 14 falhas não voltam para pending e não ficam verdes por meio de aumento de timeout, fixação de textos em inglês ou restauração do fixture shared legado. Elas continuam como formal contract e são reexecutadas no batch estrito depois de corrigidas pelos grupos de causa raiz abaixo.

## Fronteira de autoridade unificada

```text
CLI / autoridade de snapshot do V4
          |
          v
materialização canônica da UI
  ├─ data attributes semânticos de row/marker
  ├─ atributos de shell do status-panel
  ├─ um único owner visível do split-layout
  └─ row-count / render-unit-count como unidades separadas
          |
          v
helpers E2E formais
  └─ leem ids/atributos estáveis e realizam a interação de usuário atual
```

O E2E não pode voltar a tratar DOM de depuração antigo, textos de i18n, child elements ocultos ou o antigo owner de localStorage como autoridade de produto.

## Agrupamento das falhas e decisões de correção

| Formal spec | Falha direta | Qualificação da causa raiz | Contrato de correção |
| --- | --- | --- | --- |
| `v4-edit` | a resposta editada não aparece | o E2E ainda escreve newText no composer principal; o produto atual exige Edit em linha → input em linha → Send em linha | o helper resolve com precisão o user rowId e usa `v4-edit-input/submit-${rowId}`; as asserções fortes de rewind/rerun são mantidas |
| `v4-fork-edit-branch` | a resposta editada não aparece | mesma origem de `v4-edit` | reutiliza o mesmo helper de edição em linha e depois prova que o child do fork só tem a nova branch |
| `v4-compact` | espera por `[compact]` | oracle de texto de debug antigo; o status real do marker em V4 é `success` | a timeline row expõe marker type/status/origin; o helper afirma atributos estruturados e não afirma textos em inglês/chinês |
| `v4-background-work` | o item em running nunca aparece | o status panel unificado é mini em pane estreito e o item só é montado na seção expandida correspondente de "terminal/agente"; após cancelamento o item em running deve sumir | primeiro lê o typed running count do shell do panel e então expande a seção correspondente; após cancelar, afirma o ACK e o desaparecimento do item |
| `v4-goal` | o banner antigo de goal nunca aparece | o goal migrou para o status panel unificado e o banner/TID antigo não tem referência de produção | o shell do panel expõe goal objective/status tanto em mini quanto em expanded; o helper faz leitura com escopo de pane |
| `v4-delete` | TID de delete ausente | a enxugada WIP do header removeu por engano a entrada de UI e a fiação de command da SessionPane do protocolo congelado | restaura a delete action acessível por toque; volta para draft só após accepted/noop, e não volta em caso de failed |
| `v4-rename` | input de rename ausente | mesma enxugada WIP que apagou o delete | restaura o input/submit de rename do header e a fiação do ACK de `renameSession` |
| `v4-sidebar` | input de rename ausente | mesma origem do rename | depois de restaurar a entrada, continua validando o custom title do sessions-index e o fechamento da lista após delete |
| `v4-load-older` | raw rows esperadas 70, unit count recebido 1 | `data-row-count` já derivou de raw projection rows para turn render units; um único turn com 70 blocks não prova paginação | separa window/raw total/render unit/mounted unit; o fixture passa a ter múltiplos turns completed; o anchor é verificado em turn unit |
| `v4-scroll` | raw rows esperadas 50, unit count recebido 1 | mesma origem do load-older; um único turn não forma uma lista longa estável | histórico de múltiplos turns + novo turn de controlled-stream; é proibido comparar unidades de contagem diferentes entre si |
| `v4-split-persist` | o ratio não é restaurado após refresh | o draft split promovido a group continuava mantendo o shadow owner de paneLayout, e o divider escrevia no store errado | o sucesso da promoção consome o layout de origem; o group persiste seu próprio ratio; remote compact não habilita group |
| `v4-split` | o pane revive após close | após o GC do group há fallback para o shadow split não limpo | mesma causa raiz de transferência de ownership de split-persist; após close resta apenas um single pane |
| `v4-stop-queue` B08 | provider request failed | o primeiro envio ocorre logo após o ACK pending do prewarm de draft, e a criação de sessão do fallback lê apenas o `draftConfigRef` ainda não hidratado, perdendo provider/model/thought e caindo em builtin/requisição real | o fallback combina uniformemente initial config síncrona → config de draft do usuário → app followupMode; o teste unitário de pending-prewarm e o E2E estrito de B08 fazem a guarda juntos |
| `v4-turn-navigator` | `Browser.getWindowForTarget` unknown command | a API de window rect do WDIO/Electron é incompatível com o ChromeDriver atual | reutiliza o viewport helper que funciona entre plataformas; não muda a semântica do turn navigator do produto |

## Projeção visível e atributos de teste

- A raiz da row `timelineMarker` do V4 precisa expor `data-row-kind="timelineMarker"`, `data-marker-type` e `data-status`; o compact também expõe `data-origin`.
- O shell do status panel unificado precisa manter os mesmos atributos semânticos nos dois ramos visuais, `mini` e `panel`: goal status/objective e running background count. O child expandido só afeta os detalhes visíveis e não altera a autoridade do shell.
- A timeline expõe simultaneamente: `windowRowCount` raw, `totalRowCount` raw e `renderUnitCount` lógico; a mounted unit é contada por um atributo de turn-unit separado. É proibido comparar raw row com contagem de turn unit diretamente.
- As entradas e os command ACKs de edit/retry/fork/delete/rename precisam ser verificados por sondagem estável de TID/command; o rascunho do composer principal e o rascunho de edição em linha são dois estados independentes.

## Ownership do Split

```text
draft / split não agrupado
  owner = paneLayout:v2
       |
       | o segundo pane vincula uma session normal e a promoção tem sucesso
       v
group de workbench multi-session
  owner = workbench-groups:v1
  paneLayout:v2 = single primary (source consumida)
       |
       +-- ratio do divider -> group.root
       +-- refresh -> group.root
       `-- close para um pane -> GC do group -> single pane comum
```

`workspaceIdentity?.trim() || workspacePath` continua sendo a chave de isolamento de group/session. Esse estado existe apenas no workbench desktop renderer-local/Web comum; o `web-remote-replayable` do `/remote` no celular não cria, não restaura e não persiste group.

## Paginação e fronteira de cold

O provider enviar vários text blocks dentro de um turn não é uma construção de histórico persistente estável: ao vivo são visíveis vários segmentos raw, e a transcrição cold pode consolidar tudo em um único text part persistente. Os fixtures de load-older/scroll precisam construir o histórico com vários turns completed reais, garantindo a mesma semântica de turn-unit em live e cold.

Permanece também um bug-candidate independente: se a cauda de raw row for cortada no meio de um turn gigantesco, a unit key de UI, a prepend anchor e o loadOlder automático quando o viewport é insuficiente precisam de pequenos testes unitários; não se pode mascarar com scroll manual no E2E.

## Ordem de aceitação e poda

- Aceitar: os 14 formal cases existentes acima, corrigindo a semântica de produto existente ou a materialização do teste.
- Não adicionar: Docker admission, E2E mobile replayable, multiplicação visual completa do status-panel, multiplicação completa das APIs de window manager.
- Não podar: edit rerun, rename/delete, split close/ratio, loadOlder, scroll, B08 e turn navigator continuam formais.
- Rodar primeiro o unit/focused RED→GREEN de cada grupo de falha, depois o single-spec estrito correspondente e, por fim, o batch estrito de 29 specs e o batch default em estilo CI.
- Nesta rodada Docker não é executado, por exigência do usuário; o batch desktop só prova `desktop-continuous` e não afirma que o `web-remote-replayable` do celular está coberto.
- A CI formal precisa executar antes o conversation admission audit e rodar no modo estrito de fixture case-local; o summary precisa cobrir arquivo a arquivo todos os specs expandidos, não basta checar `tests.total > 0`, e o fallback de replay legado não pode dar um verde falso no lugar de um matcher ausente.

## Progresso das correções direcionadas

Até 2026-07-11, os 14 specs que falharam na primeira rodada já ficaram verdes individualmente com o pool estrito de fixtures:

- `background-work`, `compact`, `delete`, `edit`, `fork-edit-branch`, `goal`, `rename`, `sidebar`: run `v4-ui-formals-strict-20260711-032153`, 8/8.
- `load-older`: run `v4-load-older-strict-20260711`, 1/1; 25 turns, 75 raw rows, cold tail 60 e prepend anchor passaram.
- `scroll`: run `v4-scroll-strict-20260711`, 1/1; 14 turns, controlled stream, não puxar de volta e voltar ao fim passaram.
- `stop-queue`: run `v4-stop-queue-strict-after-prewarm-fix-20260711`, 3/3 (incluindo B08).
- `turn-navigator`: run `task6-turnnav-fix-final-20260711`, 1/1.
- `split`: run `v4-split-strict-after-owner-fix-20260711`, 1/1.
- `split-persist`: run `v4-split-persist-strict-dynamic-owner-20260711`, 1/1; prova ao mesmo tempo o owner único dinâmico do group promovido e do split comum na barra lateral.

## Fechamento do gate geral

Até 2026-07-11, os dois batches desktop non-Docker completos já passaram:

- pool estrito de providers: run `task6-strict-green-20260711`, 29 specs, 34/34 tests, 0 failed; carregou somente `common.json` + 29 fixtures case-local.
- resolução automática de fixtures em estilo CI (padrão): na primeira vez 33/34, com a única falha em scroll, que esperava apenas a render unit e lia 41/42 antes da materialização completa das assistant/timeline rows do último turn; depois de completar a barreira de turn completo de 3 rows, o single-spec run `v4-scroll-ci-barrier-fix-20260711` passou 1/1, e o rerun completo `task6-ci-style-green-rerun-20260711` ficou em 29 specs, 34/34 tests, 0 failed.

Os SWG10/SWG11 acrescentados pela review e a strictness da CI formal não regridem o contrato de produto acima: a exclusão do primary de um group precisa voltar para draft e o `web-remote-replayable` precisa contornar restauração/criação/persistência/consumo do group; a CI precisa de admission audit + case-local estrito + validação de cobertura por arquivo de spec esperado. Eles são guardados respectivamente por testes direcionados de UI e por testes de CI/config, e não apresentam o mobile replayable como evidência de E2E desktop desta rodada.