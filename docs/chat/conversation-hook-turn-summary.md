# Resumo de Hook do turno de conversa

> Status: em 2026-08-19 a semântica de produto foi confirmada, e este documento é a especificação factual para o ícone de Hook no rodapé da conversa, o popover de detalhes e a projeção multiplataforma.

## Objetivo

Quando um determinado product turn tiver executado de fato um Hook de usuário, workspace ou plugin, adicionar um ícone `Anchor` na action bar do assistant na parte inferior desse turno:

- No hover ou no foco por teclado, mostrar apenas a dica curta localizada "钩子" / "Hooks".
- Ao clicar ou ativar por teclado, abrir um popover de detalhes ancorado no ícone; no Web do celular, abre por clique.
- Os detalhes respondem apenas "quais Hooks realmente executaram nesta rodada, em ordem, de onde veio cada um e se houve alguma anomalia".
- Quando nenhum Hook realmente executou, o ícone não é exibido e não fica um contêiner vazio de trabalho do assistant nem uma linha virtual vazia.

Este recurso não muda a configuração de Hook, o Trust, o matcher, a ordem de execução, o consumo de saída nem a semântica de sucesso/falha da task.

## Limites de produto

### Escopo de contagem

- O ícone e osDetails agregam pelo `turnId` autoritativo e não contam a session inteira.
- `UserPromptSubmit`, Hooks de tool, `Stop` etc. são todos atribuídos ao product turn real que os disparou.
- `SessionStart`, no lançamento normal, é atribuído ao primeiro turno pelo `turnId` que o runtime já carrega.
- "Turno real de intenção do usuário" significa um TurnStarted `user-visible`. Turnos de manutenção (turnos de comandos controlOnly como o `/compact` manual) não são elegíveis para carregar o resumo de SessionStart: tanto o reposicionamento de pending quanto a atribuição de cold merge não podem tratá-los como alvo de fechamento.
- model-only ≠ turno de manutenção (revisão de 2026-08-28): turnos de notificação de background_task, turnos de subagent_message e turnos de goal continuation também são `inputVisibility="model-only"`, mas são turnos de agent que realmente executam ferramentas; seus PreToolUse/PostToolUse/Stop precisam ser ligados diretamente ao turno original por `event.turnId`, com atribuição consistente entre live e cold merge. A exclusão de turnos de manutenção vale apenas para o reposicionamento de pending do SessionStart e não pode bloquear indiscriminadamente todos os Hooks.
- Quando uma session é apenas aberta, sem turno real posterior, não se cria conteúdo de timeline visível só para o Hook de resume.

Contexto do bug (2026-08-28, HK17): no Runtime, `runSessionStartHooks` executa antes do parsing da entrada `/compact`; quando a primeira entrada é `/compact`, o Hook de SessionStart realmente executa e o evento carrega o runtime turnId do compact. O flush da camada de projeção e a atribuição de cold merge olham apenas para o "próximo TurnStarted", sem excluir turnos de manutenção model-only, e o resumo de Hook foi ligado por engano ao turno do marker de compact:

```text
primeira entrada do usuário "/compact"
  Runtime turn()
    ├─ runSessionStartHooks("startup")     ← Hook realmente executa (didExecute=true)
    ├─ parseCompactCommand(input) → compact
    └─ executeManualCompact()
         └─ TurnStarted{ inputVisibility="model-only" }   ← turno de manutenção
            ├─ compact lifecycle marker
            └─ TurnComplete

Posicionamento da projeção (restrição comum a live / cold)
  SessionStart lifecycle → pending
  TurnStarted(compact, model-only)  ─X→ não deve fazer flush/atribuição (ponto da correção)
  TurnStarted(next real, visible)   ─→  flush para esse turno real
  apenas /compact e sem entrada seguinte  ─→  o resumo permanece pending, sem criar conteúdo de timeline visível
```

- A cold recovery precisa criar primeiro o mapeamento runtime turn → hydration turn usando o `anchor.turnId` da mensagem persistida e só então classificar o lifecycle do Hook; não pode deixar o Hook de um turno completed como runtime turn órfão nem no conjunto pending.
- Quando o mesmo runtime turn é dividido em vários product turns por queue drain, o cold merge precisa avançar o hydration turn atual por `TurnSteerDrained/SessionInputPromoted.messageId` e congelar a atribuição daquela invocation na chegada do primeiro lifecycle de Hook; não pode descartar o mapeamento porque várias mensagens duráveis compartilham o mesmo runtime anchor.

### Definição de "realmente executou"

- Só as executions que receberam `HookRunStarted` contam como "realmente executou" nos detalhes. Sucesso, falha, timeout, cancelamento e o block emitido ativamente pelo próprio Hook após executar são preservados.
- Um `HookRunBlocked` gerado diretamente pelo admission antes da execução no processo não é exibido como "rodou"; a UI de pending/review dos Workspace Hooks existentes continua sendo a responsável por explicar bloqueio por falta de confiança ou por política.
- Hooks internos têm `clientVisible=false` por padrão e não entram no resumo visível ao usuário.
- O ícone só aparece quando existe pelo menos uma execution realmente executada e visível ao cliente.

### Origem

A origem mantém três semânticas reais, sem disfarçar plugin como User ou Workspace:

| `sourceKind` | Exibição em chinês | Exibição em inglês |
| ------------ | -------------------- | -------------------- |
| `user`       | 用户                  | User                 |
| `project`    | 工作区                | Workspace            |
| `plugin`     | 插件                  | Plugin               |

`internal` não é exibido.

### Estado visível

| Resultado do Runtime | Estado da UI |
| -------------------- | ------------ |
| started e sem estado terminal | 运行中       |
| success                     | 已完成       |
| executed block               | 已阻止       |
| failed                       | 失败         |
| timed_out                    | 已超时       |
| cancelled                    | 已取消       |

Falha de Hook não abre o Popover automaticamente, não exibe Toast global e não marca a task como falha diretamente.
- Um Hook `UserPromptSubmit` que realmente executou e bloqueia a entrada atual sincroniza o motivo de bloqueio, já anonimizado, para `snapshot.control.lastError`, exibido pelo `ChatErrorBanner` da área de chat; isso é apenas a mensagem de erro da entrada atual e não muda um turn concluído com sucesso para `phase=error` — o próximo `TurnStarted` limpa essa mensagem. Bloqueios de Hook ainda não executados na fase de admission, e bloqueios em fronteiras de ferramenta como `PreToolUse`/`PermissionRequest`, continuam mostrados apenas nos detalhes do Hook, evitando reportar uma decisão de permissão de ferramenta como se fosse um erro de entrada de chat.

### Chat Error de bloqueio de UserPromptSubmit

```text
HookRunner
  -> HookRunStarted
  -> HookRunBlocked(blockReason, stderrPreview/errorMessage)
  -> ProductProjection
       ├─ HookInvocationRow.executions[].blockReason
       └─ control.lastError(fault.runtime.hookBlocked)
  -> ChatErrorBanner (acima do composer)
```

- Só se escreve em `control.lastError` quando o mesmo `hookRunId` já recebeu `HookRunStarted` e o evento é `UserPromptSubmit`; um bloqueio apenas de admission não satisfaz a condição de "realmente executou".
- `lastError.message` começa com o tipo de erro estável `hooks_prompt_block`; quando existem `stderrPreview` / `errorMessage` / `stdoutPreview` já anonimizados, o formato do resumo é `hooks_prompt_block: <diagnostic>` e, sem diagnóstico, mostra apenas o tipo do erro. `recoverable=false`, sem entrada de retry. `lastError.detail` sempre mantém o `blockReason` genérico e acrescenta o erro completo do Hook quando há diagnóstico; o botão「查看详情」do Chat Error abre esse conteúdo, e o lado esquerdo da faixa usa o ícone de Hooks. `traceId` é preservado para copiar o erro e dar feedback.
- `TurnComplete(resultType="success")` continua sendo o estado terminal do turn após o bloqueio por Hook, com `phase` e a semântica de sucesso da tarefa inalteradas; `TurnStarted` limpa o `lastError` antigo, evitando que o motivo do turno anterior cubra a entrada seguinte.

## Especificação de UI

### Action bar

```text
[复制] [赞] [踩] [Fork] [Anchor]
                           │ hover/focus -> Tooltip"钩子"
                           └ click/Enter/Space -> details Popover
```

- O ícone reaproveita o `Anchor` da entrada de configurações de Hooks, com tamanho acompanhando o ícone de action de mensagem existente (`size-3.5`).
- A action bar do Desktop mantém a exibição por hover/foco do turno inteiro; a action bar do celular no controle remoto é sempre visível.
- "Não permanente" significa um gate de dados e não um novo estado de ocultação: o ícone de Hook só é renderizado quando pelo menos uma execution client-visible do turno satisfaz `didExecute=true`; quando nenhum Hook realmente rodou nesta rodada, essa entrada não existe no DOM.
- A action de Hook é um artefato local ao turno, posicionado depois do corpo, da pré-visualização, do cartão de tarefa agendada, do sumário de arquivos e da imagem de rodapé do navegador, mas antes do `turnTailBoundary` contínuo.
- Quando existe corpo do assistant, copy/feedback/fork/time continuam sendo exibidos; turnos terminais sem corpo, interrompidos ou com error também podem exibir a action de Hook sozinha, desde que tenham realmente executado um Hook.
- No máximo uma entrada de Hook é renderizada por turno: a action bar normal do assistant e a action bar de Hook independente devem ser mutuamente exclusivas. O rodapé de origem Highspeed é renderizado separado, e não pode fazer um turno com corpo exibir o Hook em duplicata nem esconder a entrada de Hook de um turno terminal sem corpo.
- A action de Hook compartilha a mesma elegibilidade de turno que copy/feedback/fork/retry: um turno de manutenção `timelineOnly` (turnos marker puros de compact/modelChange), mesmo tendo uma Hook row legada com `didExecute=true`, não pode renderizar a action de Hook nem uma barra de ações vazia; a isenção de turno terminal sem corpo (HK11) cobre apenas product turns reais.
- Tooltip e Popover não podem estar visíveis ao mesmo tempo; quando o Popover abre, o Tooltip fecha.

### Popover de detalhes

```text
┌─ 钩子 ──────────────────────────┐
│ SessionStart           用户   12ms │
│ SessionStart           用户   18ms │
│ UserPromptSubmit       用户    7ms │
│ PreToolUse           工作区   24ms │
│ PreToolUse           工作区  1.25s │
│ PostToolUseFailure 工作区 8ms 失败│
└─────────────────────────────────┘
```

- Usa `bg-popover + border-popover-border + rounded-xl + shadow-md`.
- No Desktop usa largura compacta e fixa; no celular a largura não passa de `calc(100vw - 2rem)`.
- A área de título usa 8px de padding vertical, o wrapper da lista mantém apenas 2px de folga acima e abaixo e cada Hook usa 6px de padding vertical; mantém-se 8px de espaço entre o evento e a origem, aumentando a densidade de leitura de listas longas sem diminuir o tamanho da fonte.
- A altura máxima do shell do Popover é limitada ao mesmo tempo por `20rem` e por `--radix-popover-content-available-height` do Radix; ao exceder, apenas a lista interna rola, e nenhum `top/right/bottom/left` do shell pode ultrapassar o padding de colisão do viewport.
- As invocations entram no Renderer derivadas na ordem das rows da CLI; dentro da mesma invocation, as executions com `didExecute=true` são listadas uma a uma na ordem de `hookIndex`. Hooks iguais não são agregados nem deduplicados, e a repetição é a expressão direta da ordem autoritativa de execução.
- Cada linha mostra apenas o evento do Hook e a origem; o texto de produto de `project` é uniformemente "工作区" / "Workspace".
- Não mostra `displayName`, executável do runtime, nome de arquivo de script, nome de tool nem contagem de execuções. Mesmo sem um nome explícito de Hook, não se pode derivar um nome visível ao usuário a partir do comando ou do nome do arquivo.
- Executions em estado terminal mostram a duração esmaecida depois da origem; abaixo de 1 segundo exibe o inteiro `Nms`, a partir de 1 segundo exibe segundos, com duas casas decimais dentro de 10 segundos e uma casa nas demais. Em execução não mostra duração incompleta.
- Estados terminais de sucesso não mostram ícone verde duplicado nem "已完成"; apenas em execução, falha, timeout, cancelamento e executed block são exibidos texto de estado/ícone semântico, sem depender apenas da cor para expressar anomalia. O estado anômalo vem depois da duração.
- O executed block exibe o motivo de bloqueio anonimizado logo à direita do ícone de estado; quando o motivo está ausente, mostra o texto genérico `Hook blocked execution`; o ícone de Hooks na action bar mostra sincronamente o primeiro motivo de bloqueio à sua direita, sem exigir que o usuário passe o mouse nem abra um tooltip para entender por que foi bloqueado.
- O título mostra apenas "钩子" / "Hooks", sem o subtítulo "共 N 个钩子执行".
- A primeira versão não exibe runtime, nome de arquivo de script, nome de tool, contagem, comando completo, caminho absoluto, stdin, tool input, variáveis de ambiente, stdout/stderr ou stack; a row client-safe em produção também não pode transmitir o comando completo nem outros campos brutos sensíveis.

O Popover é um detalhe somente leitura e não oferece rerun, Trust, edição de configuração nem atalho para as configurações.

## Cadeia de estado e sincronização

```text
HookRunner
  -> HookRunStarted / HookRunCompleted / HookRunFailed / HookRunBlocked
  -> CLI session event log (única fonte de verdade persistente)
  -> ProductProjection
       - hookInvocationId agrega invocation
       - hookRunId agrega execution
       - turnId autoritativo / reposicionamento de pending resume SessionStart
       - gera HookInvocationRow client-safe
       - executed block de UserPromptSubmit gera transient control.lastError
  -> delivery de posse da conexão
       desktop-continuous     -> direct continuous delta/snapshot
       web-remote-replayable  -> replayable delta/gap/snapshot
  -> ConversationProjectionStore do Renderer (sem store dedicado a Hooks)
  -> ConversationTurnRenderUnit.hookInvocations
  -> terminal turn action + details Popover
```

A conversão de identidade na recuperação a frio é fixa:

```text
durable message anchor.turnId (runtime)
              │ transcript message identity
              ▼
       hydrate-turn-* event turn
              │ ProductProjection TurnStarted mapping
              ▼
       stable product turn (messageId)
              ▲
              │ o lifecycle do Hook é reescrito primeiro para o hydrate turn no cold merge
runtime Hook turnId
```

Essa conversão vale apenas para a materialização cold/replayable; o desktop continuous continua usando a ordem original dos eventos live e o mapeamento runtime → product, sem emendar eventos cold.

O resumo seguro compartilhado contém apenas identidade de exibição, origem, event/tool, estado, motivo de bloqueio anonimizado e duração autoritativa. Os fatos de negócio de desktop e celular são os mesmos; os dois lados só diferem na entrega e na forma de recuperação continuous/replayable. relay, desktop main e o owner/lease do Host não ganham estado de Hook session, nem uma segunda cópia de cache ou fila.

## Projeção do protocolo

`HookInvocationRow` é uma product row somente leitura local ao turno. A execution contém no mínimo:

```ts
interface HookExecutionProjection {
  hookRunId: string;
  hookIndex: number;
  didExecute: boolean;
  state: "running" | "completed" | "failed";
  outcome?: "success" | "blocked" | "failed" | "cancelled" | "timed_out";
  blockReason?: string;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  displayName: string;
  sourceKind: "user" | "plugin" | "project";
  pluginName?: string;
  toolName?: string;
}
```

Restrições:

- `didExecute=true` só pode ser deduzido quando o mesmo `hookRunId` já teve um `HookRunStarted` observado.
- `HookRunCompleted/HookRunFailed` terminal-only ainda podem ser usados para fechar a row com segurança, mas não podem retroagir `didExecute=true` nem fazer essa execution acionar o Anchor ou entrar nos detalhes.
- Uma execution bloqueada apenas no admission pode servir para o fechamento completo da invocation, mas o Renderer não a conta nos detalhes nem na contagem do ícone.
- A row não carrega `HookExecutionDescriptor.commandDisplay/sourcePath` nem campos brutos de error/output.
- Um async terminal upsert pode chegar depois da conclusão do turno, mas não pode empurrar de volta para running um turno já terminal.
- Depois de reinício da CLI, uma execution só com started é fechada como `failed/cancelled`; uma troca comum de task não pode ser confundida com cancelamento.
- Ao remover ramos de edit/retry/rewind, a Hook row do mesmo turno é removida junto com o `row.removed` autoritativo.

## Limites multiplataforma

```text
one CLI projection
      ├─ conexão A / desktop-continuous
      └─ conexão B / web-remote-replayable

B gap/resync/snapshot  -X->  cursor contínuo de A
A direct live stream   -X->  B contornando a recuperação replayable
```

- O celular continua se conectando ao shared Host/runtime que a janela do desktop já tem, sem iniciar outro Agent, Host ou session remota.
- O resumo de Hook não carrega caminho de workspace e portanto não cria uma nova key `workspaceIdentity`; o isolamento por task/session e a assinatura continuam reaproveitando o `workspaceIdentity?.trim() || workspacePath` e o `remoteSessionId` do attachment existente.
- O snapshot replayable e as rows/ranges precisam restaurar o mesmo resumo de Hook; não basta suportar apenas live delta.

## Casos e poda

| Caso | Setup                                                                                                         | Action                                                          | Assertion                                                                                                                                                             |
| ---- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HK08 | turno completed que realmente executou Hook de user/project/plugin                                         | hover e depois clicar no Anchor                                  | o hover mostra só "钩子"; o clique mostra evento, origem e duração terminal na ordem autoritativa, sem agregar Hooks repetidos; não mostra runtime, nome de arquivo de script, nome de tool nem contagem; a posição fica antes do turn boundary |
| HK09 | mesma invocation contendo ao mesmo tempo blocked apenas de admission, terminal-only e started realmente executado | conclusão do turno                                               | os detalhes contam apenas as executions realmente iniciadas; quando todas são admission/terminal-only, o ícone não aparece                                            |
| HK10 | Hook de histórico completed com runtime turnId; o mesmo runtime dividido por queue drain em vários product turns; ou `SessionStart` de resume sem product mapping | cold reopen; ou enviar o próximo prompt real após abrir o histórico | os Hooks são atribuídos ao footer de hydration/product correspondente pela fronteira de mensagem, sem runtime turn órfão, sem synthetic turn `session-hooks:*` e sem contêiner vazio |
| HK11 | turno terminal interrupted/error/sem texto do assistant que realmente executou Hook                        | fechamento do turno                                              | a action de Hook continua sendo exibida; copy/feedback/fork exclusivos do assistant não são forjados                                                                   |
| HK12 | live do desktop e snapshot/gap replayable do celular                                                       | abrir os detalhes do mesmo turno                                | o resumo seguro é consistente no estado terminal; o payload não contém command/path/stdin/stdout/stderr/tool input                                                      |
| HK13 | Hook assíncrono que fica terminal depois da conclusão do turno                                             | upsert recebido com o Popover aberto ou fechado                   | a mesma execution é atualizada no lugar; o turno não volta a running e a identidade do componente não é reiniciada                                                      |
| HK14 | ramo de histórico com Hook é truncado por edit/retry/rewind                                                 | aplicar `row.removed`                                           | a action de Hook e os detalhes desaparecem junto com o turno alvo e não são acrescentados ao fim do histórico                                                            |
| HK15 | Hook footer com 15 executions reais próximo ao composer sticky / ao fundo do viewport                       | rolar o Anchor real para a área visível e clicar via WebDriver, depois rolar a lista interna até o fim | o Popover fica inteiramente dentro do viewport disponível; `ul.scrollHeight > clientHeight` e com `overflow-y:auto` próprio, e o último item do DOM fica visível após rolar e é igual ao último item da ordem autoritativa |
| HK17 | a primeira entrada já é `/compact` e o workspace tem um SessionStart Hook client-visible; em seguida é enviado um prompt real | observar o turno do marker de compact e o próximo turno real   | o turno de manutenção compact não renderiza o Hook Anchor; o resumo de SessionStart é posicionado no footer do próximo turno real; com apenas `/compact` e sem entrada seguinte, o resumo permanece pending e não aparece Hook row órfã |

Podas explícitas:

- Não se faz o produto cartesiano completo dos sete eventos de Hook; usam-se prompt, tool e stop/session como três categorias representativas de posicionamento.
- theme/locale são cobertos por componentes compartilhados e testes unitários de i18n, sem duplicar a máquina de estados do runtime em E2E.
- local/SSH/WSL/Docker compartilham a projeção desktop continuous; o SSH é usado apenas como representante de isolamento de workspace, sem duplicar quatro conjuntos de casos de UI.
- No celular só são verificadas a recuperação replayable e a interação de clique, sem duplicar o caso de hover do Desktop.
- Estado de Trust, matcher, process/command e efeitos de execução sync/async continuam cobertos pelos casos específicos de Hooks runtime/Trust.

## Verificação

- contracts/shared: strict schema rejeita campos sensíveis e continuous/replayable preservam o summary seguro.
- bootstrap: live/cold, posicionamento de resume SessionStart, blocked apenas de admission, async terminal, rewind e turnos de manutenção (TurnStarted model-only) sem carregar o resumo de SessionStart (HK17).
- UI: extração da unidade de renderização do turno, ausência de work vazio, Tooltip/Popover, origem/estado/i18n, turno terminal sem corpo, largura do celular e turnos de manutenção timelineOnly sem renderizar a action de Hook (HK17).
- E2E: reaproveita a fixture oficial do lifecycle de Hooks e afirma o Anchor, o Tooltip, o clique nos detalhes e pelo menos uma origem de Hook.
- O E2E visual precisa primeiro rolar o Anchor real para dentro do viewport e só então usar pointer/click do WebDriver; é proibido abrir com `HTMLElement.click()` um gatilho invisível e depois usar a captura de tela como evidência de aprovação de layout. Depois de abrir, é preciso afirmar simultaneamente que o rect do Popover está dentro do viewport, que a lista transborda de forma determinística e que o contêiner de rolagem é o `ul` interno; depois de rolar até o fim é obrigatório verificar que o último item está visível.
- Gates mecânicos: `pnpm --filter @zcode/desktop typecheck:e2e`, `pnpm typecheck`, `pnpm lint`.

## Resultado da implementação (2026-08-19)

- Correção de HK17 em 2026-08-28: no Runtime, `runSessionStartHooks` executa antes do parsing da entrada `/compact`; quando a primeira entrada é `/compact`, o Hook de SessionStart realmente executa e o evento carrega o turnId do compact. As três camadas anteriores — live flush, atribuição de cold merge e elegibilidade de action na UI — olhavam apenas para o "próximo TurnStarted / fim do turno + didExecute", sem excluir turnos de manutenção model-only, e o ícone de Hook aparecia por engano no turno do marker de compact. Correção: o ProductProjection passa a acompanhar `currentTurnStartedModelOnly`, e tanto o flush quanto o caminho de ligação direta têm o turno real user-visible como único alvo de fechamento; o `hookInvocationTurnIds` de cold pula TurnStarted model-only; e o `hasHookActions` da UI compartilha a elegibilidade `!timelineOnly` com copy/feedback/fork. Evidência de regressão: bootstrap `product-projection.test.ts` HK17×2, `cold-event-merge.test.ts` HK17×1 e UI `v4ConversationTurnGroup.test.ts` HK17×1; o E2E `conversation-session-hooks-lifecycle.test.ts` ganhou o case HK17 (primeira entrada já sendo /compact).
- Correção de regressão da revisão de 2026-08-28: o gate de ligação direta da primeira versão bloqueava indiscriminadamente os Hooks de todos os turnos model-only, fazendo com que os Hooks de ferramenta (PreToolUse etc.) dos turnos reais de agent model-only — background_task / subagent_message / goal continuation — fossem engolidos pelo pending e flushed incorretamente para o turno de usuário seguinte, divergindo entre live e cold. Estreitamento: a cláusula de turno de manutenção do gate de ligação direta vale só para `SessionStart`; os Hooks de ferramenta voltam a ser ligados diretamente ao turno original por `event.turnId`. Evidência de regressão: `product-projection.test.ts` "HK17 keeps tool Hooks of a model-only real agent turn attached to that turn" (PreToolUse permanece em turn-bg e não migra para turn-user).
- Teste complementar SG-01 em 2026-08-28: os dois caminhos de fechamento de um turno model-only em estado terminal (TurnError que não limpa a tabela lateral pelo caminho controlOnly, TurnComplete cancelled que limpa) têm comportamento equivalente — o SessionStart pendente não vaza para o turno anormal, um SessionStart que chega depois do estado terminal não é ligado a um turno morto, e o próximo turno real do usuário fecha ao mesmo tempo os dois resumos pendentes de startup e resume. Evidência de regressão: `product-projection.test.ts` "HK17 keeps a pending SessionStart summary off an abnormally terminated model-only turn" (it.each ×2).
- Lacunas defensivas registradas e não corrigidas (não introduzidas aqui, por enquanto não bloqueiam): a UI `shouldKeepRenderUnit` ainda preserva a seção inteira para uma unit vazia só de hooks (espaço fantasma pt-14), e depois da correção fica difícil de disparar numa projeção normal; o SessionStart pendente é esvaziado silenciosamente por `onSessionResumed` no resume do runtime (semântica de troca de epoch, e o novo epoch volta a produzir o SessionStart de resume).
- Correção da revisão de 2026-08-24: completed/failed terminal-only não voltam a retroagir "realmente executou"; quando o cold merge divide um mesmo runtime turn em vários product turns por queue drain, a atribuição da Hook invocation é congelada pela fronteira de mensagem persistente. O replay oficial em Electron do HK15 passou 1/1, e as 15 executions provaram que o `ul` interno realmente transborda e tem `overflow-y:auto`, com o último item autoritativo visível após rolar até o fim; artefato: `packages/desktop/.e2e-artifacts/desktop-e2e-20260823-165442-024`. A reverificação independente do HK-EF-01 adjacente passou 1/1, artefato: `packages/desktop/.e2e-artifacts/desktop-e2e-20260823-170301-439`.
- Ajuste fino de densidade do Popover em 2026-08-21: mantendo `w-80`, o tamanho de fonte e a hierarquia de informação, o padding vertical de título/lista/linha foi apertado para 8px/2px/6px; o replay oficial em Electron passou 4/4, artefato: `packages/desktop/.e2e-artifacts/desktop-e2e-20260821-030515-480`, captura: `/private/tmp/zcode-hook-turn-summary-compact.png`.
- Duração por item adicionada depois da origem em 2026-08-21: fica vazia durante a execução e mostra `Nms` / `N.NNs` compacto no estado terminal; testes de UI direcionados 5/5 e replay oficial em Electron 4/4 passaram, artefato: `packages/desktop/.e2e-artifacts/desktop-e2e-20260821-032205-891`, captura: `/private/tmp/zcode-hook-turn-summary-duration.png`.
- Row de Hook client-safe, posicionamento de SessionStart de startup/resume no product turn, cold merge e entrega continuous/replayable já implementados.
- O Renderer usa `ConversationTurnRenderUnit.hookInvocations` para carregar o resumo de forma independente, sem entrar no work do assistant, no colapso de "已工作" nem na decisão de ChatLoading.
- Tooltip e Popover por clique, origem/estado em chinês e inglês, turno terminal sem corpo, bloqueio apenas de admission e open-state assíncrono terminal têm todos focused test.
- Testes direcionados de bootstrap 3 files / 211 tests passaram; testes direcionados de shared/UI 4 files / 94 tests passaram.
- Replay oficial do lifecycle de Hooks do Desktop 4/4 passou: `packages/desktop/.e2e-artifacts/desktop-e2e-20260819-141042-191`.
- Confirmação de feedback em 2026-08-20: a captura anterior do tema escuro era disparada pelo teste clicando direto em um gatilho DOM fora do viewport, e a altura do Popover era calculada só por `100dvh`, com o painel ultrapassando a interface disponível; essa captura deixa de contar como aprovação de aceitação visual. O resultado de HK15 só é preenchido depois de concluído e com evidência de clique real visível.
- A versão corrigida de limites de 2026-08-20 foi confirmada: os detalhes voltam ao conjunto mínimo de event + origem + estado anômalo; executions repetidas são mostradas uma a uma na ordem, sem agregar como `×N`, e sem mostrar runtime, nome de arquivo de script, nome de tool ou nomes derivados de comando.
- Correção da revisão de cold recovery em 2026-08-20: o merge antigo comparava diretamente o runtime turnId com `hydrate-turn-*`, formando rows órfãs de Hook completed e deixando SessionStart residual em pending. Agora o mapeamento runtime → hydration é feito pelo anchor da mensagem persistente antes de entrar no ProductProjection; focused tests de cold/replay 117/117 e testes direcionados de Hook projection 17/17 passaram.
- Replay oficial da versão por item em 2026-08-20 passou 4/4, artefato: `packages/desktop/.e2e-artifacts/desktop-e2e-20260820-055755-608`; amostragem visual 1/1 passou, artefato: `desktop-e2e-20260820-055915-282`, captura local: `/private/tmp/zcode-hook-turn-summary-v3.png`. No viewport de 1200×800 os bounds do Popover foram `left=450.0, right=769.7, top=55.9, bottom=375.6`.
- Registro de reverificação da versão antiga agregada em 2026-08-20: o E2E oficial em Electron primeiro rolou o Anchor para dentro do viewport, fez hover e depois usou WebDriver click; no viewport de 1200×800 os bounds do Popover foram `left=450, right=770, top=55.5, bottom=375.5`. Na época, a agregação de Hooks iguais e o estado/duração de sucesso já tinham sido removidos, e a full-chain passou 4/4, artefato: `packages/desktop/.e2e-artifacts/desktop-e2e-20260820-050537-413`; run de amostragem de captura do caminho visível: `desktop-e2e-20260820-050654-995`. Esse artefato continua provando apenas o limite do Popover no viewport e não serve como evidência visual do layout de informação por item atual.