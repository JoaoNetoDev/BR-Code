# Plano de Implementação de Navegação e Diretório de Subagent

> Status: fronteira de produto já confirmada, em implementação em worktree independente. Este documento já mesclou o plano original side-pane-only com o plano Subagent Session Directory; o código atual não é a fonte da semântica de produto.

**Objetivo:** as ferramentas Agent/Task no fluxo da conversa-pai mantêm sempre um resumo de linha única, sem expandir Prompt, saída, atividade ou subferramentas. Quando existe `childSessionId`, clicar na linha de resumo abre uma tab somente leitura à direita no desktop/Web comum, e a gaveta lateral existente no celular em `/remote`; quando não existe `childSessionId`, a linha de resumo não é clicável. O resumo no desktop/Web comum oferece o diretório de subagents da Session-pai atual, agrupado por em execução/encerrado e paginado para os encerrados. O motivo da falha é preservado simultaneamente no estado do resumo-pai e nos detalhes do child atual, mas sem nova persistência nem nova linha de timeline para os detalhes do child.

**Direção arquitetural:** continuar reutilizando o `SessionPane` V4, a projeção de conversa, o estado de side-pane do workspace e a gaveta existente do celular. Adicionar uma consulta somente leitura `session/subagents`, combinando o transcript active do pai, as child sessions persistidas e o runtime overlay em uma única projeção; sem novas tabelas de banco. No lado da UI, distinguir explicitamente a identidade de agrupamento da task de topo `rootSessionId`, o pai direto `parentSessionId` e o alvo `childSessionId`. O desktop mantém `desktop-continuous`, o celular mantém `web-remote-replayable`; relay, desktop main e Host não mantêm estado de diretório.

**Não objetivos:** desta vez não restauramos a capacidade de runtime de subagent derivar subagent, não adicionamos persistência de erro de child, não alteramos a atribuição de permission/AskUserQuestion, não alteramos a persistência ou o ciclo de vida de assinatura da tab do side-pane, não adicionamos tabelas de banco nem campos à Agent tool, não modificamos Workflow, não fornecemos diretório no celular e não iniciamos outro Host/Agent runtime para o celular.

## 1. Feature Summary

| Campo | Conteúdo |
| --- | --- |
| Tipo de mudança | Correção de comportamento existente e proteção contra regressão; unificação da entrada de detalhes de subagent em foreground/background/mobile |
| Entradas visíveis ao usuário | Linha de resumo de Agent da sessão-pai, linha de status Running subagent, tabs à direita no desktop/Web comum, gaveta à direita em `/remote` no celular, child somente leitura |
| Spec principal existente | `docs/subagent-session-side-tabs.md`, `docs/agent-tool-call-renderer.md` |
| Catalog/matrix existente | `docs/conversation-session-case-catalog.md` SAT01-SAT23, BG26, Z01; `docs/testing/conversation-session-e2e-coverage-matrix.md` |
| Principais owners de UI | `ConversationAgentToolCallRow`, `SessionPane`, `SubagentSessionSidePane`, `AnimatedSidePanePanel`, `workspaceSidePane`, `WorkspaceShellLayout` |
| Principais owners de teste | `packages/ui/test/subagentSidePane.test.ts`, E2E SAT pendente, E2E BG26, E2E Z01 pendente |
| Fronteiras que não descem | A projeção/runtime da CLI continua sendo dona do resumo e da autoridade de undo; não mover estado para relay/main nem alterar attachment do Host, owner/lease, queue ou caminho de execução do workspace |

## 2. Clarification Log

| Rodada | Pergunta | Resposta do usuário | Fronteira fixa | Seguimento |
| --- | --- | --- | --- | --- |
| 1 | O Agent na conversa-pai continua expandindo inline? | Não expandir mais no fluxo da conversa; clicar na linha inteira abre a lateral | A conversa-pai carrega apenas resumo de estado e entrada de detalhes | accepted |
| 1 | Onde o erro do subagent é exibido? | Basta exibir na linha de resumo-pai; também pode exibir nos detalhes | A linha-pai mantém "execução falhou" e o hover/focus da causa raiz; com child, os detalhes também exibem o erro atual | accepted |
| 1 | Como tratar quando não há `childSessionId` | Não clicável | Não criar tab temporário de erro nem manter fallback inline | accepted |
| 1 | É permitido abrir subagent aninhado recursivamente? | Deixar a porta aberta; o runtime atual já não consegue derivar subagents | O modelo de identidade da UI e o callback suportam recursão; E2E real de runtime é podado por ora | accepted + runtime-pruned |
| 1 | Como exibir no celular? | Sem inline, usando a gaveta à direita | Reutilizar o overlay de side-pane mobile existente, sem nova página mobile | accepted |
| 2 | permission/AskUserQuestion nos detalhes do child têm salto especial? | Sem tratamento especial | Não fechar a gaveta automaticamente nem adicionar aviso de "voltar à conversa-pai para tratar" | accepted |
| 2 | O erro do child vira conteúdo persistente de timeline? | Sem persistência, basta exibir | Consumir diretamente o `snapshot.control.lastError` atual; sem nova row/schema/storage | accepted, cobre a escolha B da rodada anterior |
| 3 | O diretório adiciona tabela de banco? | Não adiciona | Reutilizar active transcript, child session SQLite e runtime overlay | accepted |
| 3 | Escopo do diretório | Branch active atual; Workflow inalterado | Agent e alias Task compatível; mostrar apenas child persistente confiável | accepted |
| 3 | Estado e paginação | running sem paginação; ended em lotes de 20 | success/fail/cancel/lost terminal no mesmo grupo, preservando o estado específico | accepted |
| 3 | Multi-plataforma | Desktop/Web comum tem diretório; celular mantém apenas a gaveta de detalhes | Celular não oferece diretório | accepted |
| 3 | mini/expanded | mini não mostra ended; expanded tem contagem de ended | ended-only não força mini; a contagem de expanded entra no grupo recolhível "Agentes", clicar na contagem abre o diretório | accepted |
| 3 | Ciclo de vida do branch | edit/retry invalidam, compact preserva, fork herda referências de ended | Fechar automaticamente tabs de detalhes invalidados e não entrar em "fechados recentemente" | accepted |
| 4 | Fronteira de protocolo | Permite consulta somente leitura `session/subagents` | Não adicionar campos de Agent tool/error nem tabelas de banco | accepted |
| 4 | Celular sem child com erro completo | Nesta rodada apenas manter o erro curto | Não criar entrada de erro completo exclusiva para touch | accepted |
| 5 | Detalhes do child suportam undo de resumo de arquivo? | Suporta | Conversa permanece somente leitura; abrir apenas rewind workspace-only de um único turn, a task-pai pode continuar em execução | accepted |

## 3. Product Contract

### 3.1 Máquina de estados da linha de resumo

```text
Linha de resumo da ferramenta Agent (nunca expande)
│
├─ childSessionId disponível
│  ├─ foreground / background
│  ├─ running / success / failed / cancelled
│  └─ click / Enter / Space
│     ├─ desktop-continuous -> criar ou ativar tab somente leitura à direita
│     └─ web-remote-replayable -> criar ou ativar a tab na gaveta direita do celular
│
├─ childSessionId ainda não chegou
│  ├─ mantém resumo não clicável por enquanto
│  └─ childSessionId chega depois -> torna-se clicável; não pode abrir detalhes automaticamente
│
└─ childSessionId nunca existe
   ├─ falha de provider/model/config/tool antes da inicialização
   ├─ o resumo mostra o estado terminal e a entrada de estado de erro existente
   └─ não clicável, sem tab temporária, sem detalhe inline
```

### 3.2 Invariantes de interação

1. A linha de resumo do Agent na conversa V4 não tem seta de expansão, `aria-expanded` nem conteúdo colapsável.
2. Havendo alvo child, o resumo inteiro é uma única ação de detalhe, com suporte a mouse, Enter e Space; ativações repetidas apenas focam a tab existente, não alternam para fechar.
3. Sem alvo child, o resumo não tem `role=button`, `tabIndex=0` nem test id de ação de detalhe.
4. foreground e background não divergem mais no comportamento de detalhe; `backgrounded` afeta apenas o ciclo de vida de runtime e o estado, não se o child pode ser aberto.
5. `compactForRemoteControl` no celular não é mais condição de proibição para detalhe de subagent; ele ainda pode continuar restringindo capacidades sem relação, como browser embutido, Apps externos e tela dividida.
6. O painel de status Running e a linha Agent da conversa reutilizam a mesma requisição de abertura e a mesma identidade de tab; os controles de stop/cancel continuam impedindo a propagação do evento.
7. Os detalhes do child mantêm a conversa somente leitura: sem composer, retry, edit, fork, stop, resposta de permission/elicitation; o file rewind workspace-only de um único turn é a única exceção explícita de escrita, e tanto abrir o child quanto executar o undo não alteram o `activeTaskId` do shell nem o histórico da conversa-pai.

### 3.3 Contrato de persistência e sequência do undo de arquivo

```text
child live runtime(seq 1..N) -> detached publisher(raw=N)
child runtime released       -> checkpoint/session_entry
preview/apply cold resume    -> SessionResumed(new raw epoch)
                              -> RewindTriggered
                              -> workspace_file_rewind/session_entry
                              -> publisher transport seq continua N+1..
```

- O vínculo de checkpoint e o estado de rewind workspace-only reutilizam o `session_entry` existente, sem novas tabelas ou migrations.
- `SessionResumed` apenas redefine o raw cursor do gateway, sem retroceder a sequência de transport externa; após o refresh, o turno do child permanece `reverted`, e a linha Agent-pai, o agregado da task-pai e o histórico de chat não mudam.

### 3.4 Contrato de exibição de erro

```text
projection.error da Agent tool do pai
  -> "execução falhou" no resumo-pai
  -> hover/focus/copy existente da causa raiz

snapshot.control.lastError atual do child
  -> aviso de erro nos detalhes somente leitura do child
  -> exibe apenas o erro já fornecido pela projeção atual
  -X-> sem nova row de turnError
  -X-> sem novo schema de protocolo
  -X-> sem nova persistência de session/task
```

- O resumo-pai continua usando o erro estruturado mais próximo da causa raiz, sem degradar para `Turn execution failed`.
- O aviso de erro dos detalhes do child não vai para o composer, pois o pane somente leitura não renderiza composer.
- Se o snapshot a frio existente por acaso tiver `control.lastError`, ele pode ser exibido normalmente; este documento não define como novo contrato que "o erro dos detalhes do child necessariamente persiste após refresh".
- BG26 continua verificando que a linha Agent-pai permanece failed + error após restore da task; para os detalhes do child só é exigido que fique visível na projeção live/current, sem novas asserções de restore.
- Quando uma ferramenta interna do child falha mas o Agent inteiro termina com sucesso, o resumo-pai não pode marcar failed indevidamente; a falha interna permanece apenas na timeline do child.
- `cancelled/stopped` e `failed` continuam separados, sem renderizar a parada ativa do usuário como erro de provider.

### 3.4 Identidade na descida recursiva

O `parentSessionId` existente cumpre ao mesmo tempo "pai direto" e "com qual task de topo a tab aparece/desaparece", o que só se aplica a child de primeiro nível. No futuro, a recursão precisa separar:

```text
root task A
└─ child B
   └─ child C

Ao abrir C:
  rootSessionId   = A     # agrupamento de tab, visibilidade por task, registro de última ativação
  parentSessionId = B     # linhagem direta, usada no futuro por breadcrumb/diagnóstico
  childSessionId  = C     # alvo da assinatura de detalhes

tab stable id = workspaceKey + rootSessionId + childSessionId
workspaceKey  = workspaceIdentity?.trim() || workspacePath
```

- Child de primeiro nível usa `rootSessionId === parentSessionId`, portanto o texto do id de tab existente permanece compatível.
- As linhas Agent dentro de `SubagentSessionSidePane` reutilizam a mesma summary action do `SessionPane` principal; apenas o wrapper hospedeiro herda o `rootSessionId`.
- Como o runtime atual não permite subagent derivar subagent, implementa-se apenas o tipo de UI, o reducer de tab e o contrato de callback; não se forja cobertura de E2E real de provider.
- Nesta rodada não se adiciona UI de breadcrumb; salvar o `parentSessionId` direto apenas evita que a interface misture novamente linhagem e agrupamento visível.

### 3.5 Fronteiras multiplataforma e assíncronas

```text
Attachment do renderer Desktop                  Attachment Mobile /remote
{desktop-continuous}                         {web-remote-replayable}
        │                                             │
        ├─ parent conversation subscription           ├─ parent replayable subscription
        └─ child side-tab subscription                 └─ child drawer replayable subscription
                         \                            /
                          existing shared Host / CLI

relay / desktop main:
  apenas faz attachment, autenticação e repasse de rpc-frame
  não possui estado de tab, conversation, error, snapshot ou child
```

- O celular precisa reutilizar o overlay à direita já existente em `WebRemoteControlMobileShell`; ao abrir, o chat de fundo continua inert.
- Abrir um child no celular não cria local host, remote host, sessão SSH/WSL/Docker ou runtime de Agent independentes.
- Requisições de workspace remoto percorrem `workspaceIdentity` e `remoteSessionId`; não se pode criar tab/connection key usando apenas `workspacePath`.
- Nesta rodada não se modifica o ciclo de vida existente de force-mount/lease do side-pane. Permitir que o celular libere a assinatura de tabs ocultas é otimização de performance, fica no backlog e não pode alterar a semântica replayable.

## 4. Current-Code Conflict Map

| Conflito | Fato atual | Julgamento alvo | Classificação |
| --- | --- | --- | --- |
| background Agent proibido de abrir direto | `9ebfe37525a` adiciona guard `backgrounded` em `openSubagentSessionFromSummary` e liga `canOpenChildSession` a `showSubagentOutputPreview` | Viola SAT01 e a consistência foreground/background confirmada nesta rodada | bug-candidate |
| BG26 força expansão | E2E BG26 clica em `TID_TOOL_SUMMARY_TRIGGER` e espera saída inline | Mudar para hover de falha na linha-pai + abertura direta do child + aviso de erro atual do child | spec/test conflict |
| Fallback inline do SAT11 | Spec atual mantém expansão inline para sem child, falha de start, aninhado e celular | Cancelar todo o inline; sem child fica estático, aninhado/mobile vão para contêiner de detalhes | spec conflict |
| Callback de detalhe no celular quebrado | `V4ChatPane` mobile não tem prop `onOpenSubagentSession`, e o contexto da linha Agent recebe `undefined` | Ligar de volta ao handler do app-shell pelo DI existente | bug-candidate |
| Gate compact no celular | Linha Agent e painel de Status não oferecem entrada quando `compactForRemoteControl` | O detalhe de subagent deve entrar na gaveta à direita existente | bug-candidate |
| Sem callback recursivo no pane do child | `SubagentSessionSidePane` não recebe/não repassa `onOpenSubagentSession` | Repassar um wrapper com identidade root/parent/child | capability gap |
| Pane somente leitura perde o erro | `control.lastError` só é passado ao composer; o somente leitura oculta o composer | Exibir diretamente o aviso de erro atual no SessionPane somente leitura | bug-candidate |
| Acoplamento de dados do preview inline | `showSubagentOutputPreview`, `SubagentDrilldown`, `agentOutputPreview` e a ponte de `content` do Agent servem apenas ao inline | Remover o caminho inline do V4 e as pontes sem consumidor | cleanup |
| Mistura de root/parent | visibilidade de tab, stable id e last-active map usam apenas `parentSessionId` | Separar agrupamento root de linhagem direta | design defect |

## 5. Domain Scope And State Owners

### 5.1 Primary domains

| Domínio | Incluído? | Motivo | Principais fontes |
| --- | --- | --- | --- |
| Comportamento de conversation/session | sim | Guard da linha Agent, estado terminal da tool, sequência do alvo child, projeção de erro | protocolo de conversation, catalog SAT/BG/Z |
| UI de permission/tool/subagent | sim | Mutualidade action/inline do ToolLayout, renderer do Agent, child aninhado | `docs/agent-tool-call-renderer.md`, ToolCallBlocks |
| UI shell/responsivo | sim | Tab de desktop e gaveta de celular usam o mesmo estado de side-pane | `DESIGN.md`, WorkspaceShell, MobileShell |
| Remoto/replayable mobile | sim | Precisa preservar a fronteira shared-host/replayable | arquitetura web remote, sync realtime de task |
| Identidade de workspace/runtime remoto | sim | Isolamento de tab/conexão precisa de identity + remoteSessionId | restrições de workspace, workspaceSidePane |
| Persistência | limitado | Reutiliza transcript/event do pai e child session existentes; sem novas tabelas, tabs continuam memória do renderer | spec de directory/side-pane |
| CLI/runtime/protocol | sim, somente leitura | Nova consulta `session/subagents` e projeção de active-branch; não restaura runtime aninhado nem altera workflow | schema de protocolo + unit de query |

### 5.2 State owners

| Estado/fato | Autoridade | Espelho/cache de UI | Forma de prova |
| --- | --- | --- | --- |
| status/error/childSessionId da Agent tool | CLI ProductProjection `ToolCallRow` + `SubagentRow` | ConversationProjectionStore, legacy adapter | snapshot/delta + DOM |
| `control.lastError` atual do child | projeção de conversation do child | lease/store do SessionDataLayer | snapshot do child + aviso somente leitura |
| tabs do side-pane/tab ativa | `useAppPanels` do renderer / estado de side-pane do workspace | memória do workspace shell atual | unit de reducer + contagem de tabs no DOM |
| visibilidade da root task | `activeTaskId` do shell | mapa de subagents última-ativação | unit/E2E de troca de task |
| isolamento de workspace | `workspaceIdentity?.trim() || workspacePath` | tab id/connection registry key | unit de remoto com mesmo path |
| delivery profile | attachment do Host confiável | camada de transport/session | evidência de clientMode/deliveryKind |
| gaveta mobile aberta/inert | MobileShell do renderer | estado do overlay no DOM | teste de integração de UI/revisão remota manual |

## 6. Dimensions And Equivalence Classes

| Dimensão | Valores/classes de equivalência | Expandir? | Motivo do podamento |
| --- | --- | --- | --- |
| alvo child | presente, temporariamente ausente, permanentemente ausente, presente mas indisponível | sim | Determina diretamente action, linha estática e erro do pane |
| Execução do Agent | foreground, background | pairwise | Comportamento alvo idêntico, mas a regressão vem do guard de background |
| status terminal | running, success, failed, cancelled | representative | Mesma invariante de action; failed/cancelled têm asserção própria |
| cliente/superfície | tab lateral desktop/Web comum, gaveta mobile | sim | Contêiner e delivery kind diferentes |
| aninhamento | root child, capacidade futura de child aninhado | sim | Modelo de identidade diferente; E2E de runtime podado |
| ciclo de vida de abertura | primeira abertura, reabertura, troca de task, fechada/reaberta | representative | Risco de stable id e de grupo do pai |
| fonte de dados | publisher child live, store child frio, erro de assinatura | representative | Disponibilidade de detalhes difere, mas não pode regredir para inline |
| workspace | local, remoto mesmo path/identidade diferente | pairwise | Invariantes fortes de identity/remoteSessionId |
| fonte de erro | erro de tool do pai, control.lastError do child, erro de tool interna do child | sim | Evita confusão de hierarquia de erros |
| tema/idioma/entrada | light/dark, zh/en, pointer/teclado/toque | pairwise | Aceitação de UI/i18n/a11y, sem permutação completa |

## 7. Candidate Classification

| Candidate | Estado + evento | Efeito esperado | Status | Notas |
| --- | --- | --- | --- | --- |
| SDS-C01 | desktop foreground + child presente + ativar linha | abrir/reusar tab somente leitura à direita; sem inline | accepted | Atualizar SAT01 |
| SDS-C02 | desktop background + child presente + ativar linha | igual ao foreground | accepted | Corrigir a regressão `9ebfe37525a` |
| SDS-C03 | qualquer cliente + child permanentemente ausente | resumo estático; sem tab/sem inline | accepted | Atualizar SAT11 |
| SDS-C04 | child temporariamente ausente e depois chega | estático -> action; sem abertura automática | accepted | Sequência do SAT11 |
| SDS-C05 | mobile replayable + child presente | abrir a gaveta à direita existente com a tab do child | accepted | Atualizar SAT10 |
| SDS-C06 | child failed + lastError atual | hover no pai + aviso de erro somente leitura no child | accepted | Atualizar BG26; sem nova persistência |
| SDS-C07 | child failed + restore de renderer/task | restore de failed/error no pai; aviso do child não é contrato obrigatório | accepted | Preservar o restore do pai em BG26 |
| SDS-C08 | pane do child contém alvo Agent aninhado | herdar root, registrar pai direto, abrir/reusar tab aninhada | accepted UI contract | E2E de runtime podado |
| SDS-C09 | alvo child existe mas assinatura/hidratação falha | pane mostra erro de conexão/assinatura; linha-pai não regrede para inline | accepted | Usar a superfície de retry existente |
| SDS-C10 | Agent cancelado | continua abrindo o child existente; estado mostra stopped/cancelled, sem tooltip de falha | accepted | unit focado |
| SDS-C11 | Item de status Running em desktop/mobile | usar a mesma requisição de tab/drawer; cancel impede propagação | accepted | Atualizar o gate mobile do SAT12 |
| SDS-C12 | mobile sem child + necessidade de ver o erro bruto completo | apenas confirmado que a linha inteira não é clicável e não é inline; entrada de erro exclusiva para touch não confirmada | undefined | Não bloqueia o caminho principal do desktop, ver backlog |
| SDS-C13 | gaveta mobile fechada/tabs inativos | manter o comportamento existente de lease/forceMount | ignored in this change | Performance posterior, sem mudar semântica de delivery |
| SDS-C14 | runtime aninhado realmente gerando child-of-child | Capacidade de produto atual inexistente | pruned | Testar apenas contrato de UI/request/reducer |
| SDS-C15 | criar tab temporário por toolUseId para falha de start | Proibido | pruned | Usuário definiu claramente: sem child, não clicável |
| SDS-C16 | gravar erro do child em timeline/schema/store | Proibido | pruned | Usuário definiu claramente "sem persistência" |

## 8. Pruning Decisions And Backlog

| ID | Combinação podada/em aberto | Guard/invariante | Tratamento |
| --- | --- | --- | --- |
| P01 | Todo inline de Prompt/output/activity/child tools do Agent | `agentSummaryNeverExpandsInConversation` | Remover o caminho inline do V4, sem fallback |
| P02 | Tab de detalhes temporário quando não há child | `childDetailRequiresChildSessionId` | Resumo estático; não inventar segunda identidade com toolUseId |
| P03 | Outro runtime/host para o celular | invariante de attachment shared-host | Reutilizar o MobileShell + Host/CLI existentes |
| P04 | E2E de provider aninhado | guard de capacidade do runtime atual | Apenas unit de UI/reducer; adicionar E2E quando a capacidade voltar |
| P05 | Nova persistência de erro do child | decisão do usuário | Consumir apenas o control.lastError atual |
| P06 | Salto especial de permission/AskUser | decisão do usuário | Sem nova UI/sequência |
| P07 | Otimização de lease de tab oculta no mobile | não é correção de semântica de interação | Manter como está, abrir caso de performance à parte |

### Em aberto mas não bloqueante para a implementação principal

| Question | Padrão atual | Impacto |
| --- | --- | --- |
| Como ver o erro bruto completo na linha de falha do celular sem child | Não criar tap/popover separado; manter o estado curto, aguardando complemento do produto | Não usar esse item em aberto como desculpa para restaurar o inline; se depois for necessário, só entrada de estado de erro separado, nunca criar tab de child |
| Se o celular deve liberar o lease de child inativo após fechar a gaveta | Manter o ciclo de vida atual do side-pane | Decidir depois com dados de banda do relay, memória e atraso de reabertura |

## 9. Accepted Case Plan

| Catalog mapping | Setup | Action | Assertions | Evidence | Status after doc backfill |
| --- | --- | --- | --- | --- | --- |
| SAT01 | desktop/Web comum; foreground e background com childId | click, Enter, Space | mesma action de tab à direita; sem aria-expanded/chevron/inline; abertura repetida deduplicada | DOM + reducer do side-pane | planned |
| SAT02/SAT03 | 6+ tabs de child, pelo menos dois em streaming | abrir e alternar em sequência | 6+ tabs estáveis; desktop continuous continua atualizando | DOM + seq do tópico do child | pending/manual review |
| SAT05 | fechamento/reabertura de tab; refresh do renderer | reabrir | título e stable id mantêm o contrato existente; tabs não são restauradas | reducer + hydration | covered/focused |
| SAT06 | identidade remota A/B com mesmo path | abrir children | tab/conexão não se misturam; remoteSessionId repassado como veio | reducer + connection key | covered/focused |
| SAT10 | mobile `/remote` replayable, childId presente | tocar na linha Agent/linha Running | gaveta à direita existente abre; chat inert; sem inline; active task inalterada | DOM mobile + request scoped | planned |
| SAT11 | childId ausente/falha de start; também com childId atrasado | ativar antes/depois do alvo | ausente não clicável; clicável quando o alvo chega, mas sem abrir automático; nunca inline | DOM + request spy | planned |
| SAT12 | painel Running com subagent/bash/no-id misturados | ativar/cancelar | subagent desktop/mobile abre o mesmo detalhe; bash/no-id não abre; cancel só para | DOM + request spy | planned |
| SAT13 (novo) | side pane do child com lastError no snapshot atual | abrir child | pane somente leitura mostra o erro bruto; não cria linha de erro na timeline | snapshot + DOM | planned |
| SAT14 (novo) | contrato de linha aninhada sintética: A -> B -> C | ativar C no pane de B | request/root=A, parent=B, child=C; tab aparece com A; repetida deduplica | unit/reducer | planned, E2E de runtime podado |
| BG26 | child background com 429 do provider | notificação terminal, hover, abrir, troca de task | pai failed/hover; clique abre child; aviso do child live contém o texto original; restore do pai mantido; sem inline | fixture de provider + projection + DOM | planned update |
| Z01 | Agent falha em provider/model antes da criação do child | ver e tentar ativar a linha de falha | causa raiz visível; sem action de child, sem inline; Agent irmão normal | runtime tool_result + DOM | planned update |

## 10. Implementation Tasks

A ordem de execução deve ser mantida: spec/catalog/matrix -> testes falhando -> código -> evidência de runtime -> checagens completas -> commit.

### Task 0: Backfill Source-Of-Truth Specs Before Code

**Arquivos:**

- Modify: `docs/subagent-session-side-tabs.md`
- Modify: `docs/agent-tool-call-renderer.md`
- Modify: `docs/conversation-session-case-catalog.md`
- Modify: `docs/testing/conversation-session-e2e-coverage-matrix.md`
- Apenas referência: `docs/superpowers/plans/2026-07-10-background-subagent-failure-detail.md` (plano histórico concluído, não reverter)

**Passos:**

- [ ] Mudar "se não puder abrir direto, fallback inline" para "sem child fica estático; com child usa contêiner de detalhes unificado".
- [ ] Atualizar SAT01, SAT10, SAT11, SAT12, adicionar SAT13/SAT14; registrar a gaveta mobile, a identidade root/parent/child e o erro sem persistência.
- [ ] Reescrever a ação de UI do BG26: remover as asserções de expansão, adicionar tab de child/aviso de erro; manter o restore da linha-pai.
- [ ] Atualizar Z01: falha de start sem child gera cartão não clicável e sem inline.
- [ ] Marcar como `planned` ou `missing` os itens do matrix ainda não implementados; nunca escrever `covered` antecipadamente.
- [ ] Deixar explícito que o E2E de runtime aninhado é capability-pruned e que o erro bruto de toque no celular sem child é undefined.

### Task 1: Write Focused Failing Tests

**Arquivos:**

- Modify: `packages/ui/test/subagentSidePane.test.ts`
- Modify: `packages/ui/test/workspaceSidePane.test.ts`
- Modify: `packages/ui/test/agentToolCallBlock.test.ts`
- Modify: `packages/ui/test/v4AssistantWorkRenderItems.test.ts`
- Modify: `packages/ui/test/v4ToolCallRowAdapter.test.ts`
- Modify: `packages/ui/test/v4SessionPaneLayoutParity.test.ts`
- Modify: `packages/ui/test/workspaceShellRemoteMobileLayout.test.ts`
- Modify: `packages/ui/test/webRemoteControlMobileShell.test.ts` only if new integration assertion is needed

**Passos:**

- [ ] Remover background/mobile/nested do blocked set de `openSubagentSessionFromSummary`; retornar false apenas quando faltarem child/root/callback.
- [ ] Asserir que o Agent summary sem child é uma linha estática: sem action, sem toggle, sem conteúdo inline.
- [ ] Asserir que foreground/background geram o mesmo action test id e que Enter/Space usam o mesmo callback.
- [ ] Asserir que request/tab guardam `rootSessionId`, `parentSessionId` e `childSessionId`; visibilidade e last-active usam apenas root.
- [ ] Asserir que o `V4ChatPane` mobile recebe `onOpenSubagentSession` e `remoteSessionId`, e que a gaveta continua sendo o overlay à direita com fundo inert.
- [ ] Asserir que o child somente leitura exibe aviso quando `control.lastError` existe; um child normal sem erro não exibe.
- [ ] Asserir que nenhuma linha nova de conversation é gerada e que o erro não precisa existir após refresh.
- [ ] Asserir que o output de Agent em background não precisa mais do `content` como ponte de "corpo de atividade expansível".
- [ ] Rodar o Vitest focado e confirmar que as razões de RED são respectivamente gate background/mobile, fallback inline, mistura de identidade e ausência de superfície de erro somente leitura.

### Task 2: Separate Root Grouping From Immediate Parent

**Arquivos:**

- Modify: `packages/ui/src/lib/workspaceSidePane.ts`
- Modify: `packages/ui/src/hooks/useAppPanels.ts`
- Modify: `packages/ui/src/app-shell/types.ts`
- Modify: `packages/ui/src/v4/conversationRowContext.ts`
- Modify: `packages/ui/src/v4/SessionPane.tsx`
- Modify: `packages/ui/src/app-shell/SubagentSessionSidePane.tsx`
- Modify: `packages/ui/src/app-shell/AnimatedSidePanePanel.tsx`
- Modify: `packages/ui/src/app-shell/WorkspaceShellLayout.tsx`

**Interfaces:**

```ts
interface OpenSubagentSideTabRequest {
  rootSessionId: string;
  parentSessionId: string;
  childSessionId: string;
  subagentType: string;
  title: string;
}
```

**Passos:**

- [ ] Estender os tipos de request/tab para guardar root + pai direto; a entrada de primeiro nível preenche ambos com a session atual.
- [ ] Stable tab id, visible group e last-active map passam a usar `rootSessionId`; o `parentSessionId` direto não participa do agrupamento.
- [ ] Para HMR/tabs antigas em memória do renderer, usar compatibilidade com `rootSessionId ?? parentSessionId`, sem nova migration em disco.
- [ ] `SubagentSessionSidePane` recebe o callback por DI; request aninhado herda tab.root e usa o child atual como pai direto.
- [ ] `AnimatedSidePanePanel` apenas repassa a intenção de abertura, sem operar session/runtime diretamente.
- [ ] O request remoto preserva `workspaceIdentity` e `remoteSessionId`; a tab key não usa `workspacePath` puro para expressar identidade.
- [ ] Rodar os testes focados de reducer/request até GREEN.

### Task 3: Make Agent Summary Side-Pane-Only

**Arquivos:**

- Modify: `packages/ui/src/v4/ConversationAgentToolCallRow.tsx`
- Modify: `packages/ui/src/v4/conversationAssistantWorkItems.ts`
- Modify: `packages/ui/src/ToolCallBlocks.tsx`
- Modify: `packages/ui/src/ToolCallBlocks/fileSummaryTypes.ts`
- Modify: `packages/ui/src/ToolCallBlocks/renderers/agent.tsx`
- Modify: `packages/ui/src/ToolCallBlocks/ToolSummaryRow.tsx` if needed to remove static `aria-expanded`
- Modify: `packages/ui/src/v4/toolCallRowAdapter.ts`
- Delete after reference audit: `packages/ui/src/v4/SubagentDrilldown.tsx`

**Passos:**

- [ ] `canOpenChildSession` depende apenas de child/root/callback válidos, não de foreground/background, compact mobile nem antiga flag de preview inline.
- [ ] Sem child, passar explicitamente `canToggle=false`; o resumo estático não recebe `role=button`, handler de teclado, chevron ou `aria-expanded`.
- [ ] Preservar o comportamento de "quando o child chega depois, apenas muda para o modo action, sem abrir automaticamente".
- [ ] Remover `showSubagentOutputPreview`, `agentOutputPreview`, `SubagentDrilldown` e a cadeia de dados `inSubagentDrilldown` do V4.
- [ ] Remover a ponte adaptadora de `content` do Agent que existia só para a atividade inline de background; manter o mapeamento de projeção genérico de `error` e `output`.
- [ ] Não remover os helpers genéricos de prompt/atividade do renderer do Agent, a menos que `pnpm dep:refs` e `rg` provem que todos os consumidores não-V4 também sumiram; nesta rodada garantir apenas que a conversation V4 não expande.
- [ ] Manter o tooltip de falha/botão de copy bloqueando propagação; a região de linha comum ativa os detalhes.
- [ ] Atualizar o comentário de bugfix em chinês, explicando que a causa raiz da regressão foi a expectativa antiga do E2E que ligava indevidamente a linha de background de volta ao fallback inline.
- [ ] Rodar os testes focados de renderer/work-item/adapter do Agent até GREEN.

### Task 4: Show Current Child Error In Read-Only Detail

**Arquivos:**

- Modify: `packages/ui/src/v4/SessionPane.tsx`
- Optional create: `packages/ui/src/v4/ConversationReadOnlyErrorNotice.tsx`
- Modify only if new copy is unavoidable: `packages/ui/src/i18n/locales/zh-CN.ts`, `packages/ui/src/i18n/locales/en-US.ts`

**Passos:**

- [ ] Derivar a mensagem de exibição do `snapshot.control.lastError` existente e da normalização de erro já existente, sem criar outro store.
- [ ] Quando `readOnly && controlLastError`, renderizar um aviso de erro semântico compacto na superfície de timeline/detalhe; não pode depender do composer oculto.
- [ ] Usar tokens do DESIGN, `role=alert`/texto legível, quebra de linha de erros longos e comportamento copiável; validar também light/dark e zh/en.
- [ ] Não adicionar `TurnErrorRow`, schema de row do V4, evento de projeção da CLI, persistência de task/session ou migration de restore.
- [ ] Não adicionar fechamento automático, salto ou banner extra para permission/AskUserQuestion.
- [ ] Erros de assinatura continuam usando a superfície de retry centrada existente; erro de negócio `control.lastError` não se confunde com erro de assinatura de transport.
- [ ] Rodar os testes focados de SessionPane/erro somente leitura até GREEN.

### Task 5: Wire Mobile Main Chat To The Existing Drawer

**Arquivos:**

- Modify: `packages/ui/src/v4/V4ChatPane.tsx`
- Modify: `packages/ui/src/app-shell/WorkspaceShellLayout.tsx`
- Modify: `packages/ui/src/v4/SessionPane.tsx`
- Modify: `packages/ui/src/v4/ConversationStatusPanel.tsx` only for the current mobile gate
- Test: `packages/ui/test/workspaceShellRemoteMobileLayout.test.ts`
- Test: `packages/ui/test/webRemoteControlMobileShell.test.ts`

**Passos:**

- [ ] Adicionar ao `V4ChatPane` as props DI `remoteSessionId` e `onOpenSubagentSession`, repassando-as ao `SessionPane`.
- [ ] O WorkspaceShell do celular passa `workspaceRemoteSessionId` e o `handleOpenSubagentSession` existente.
- [ ] Remover apenas o gate `compactForRemoteControl` do detalhe de subagent; não liberar outros gates mobile como tela dividida, browser embutido e app externo.
- [ ] A linha de subagent do painel de status Running também pode abrir a gaveta; itens bash/sem child continuam sem entrada.
- [ ] Reutilizar `setIsSidePaneCollapsed(false)`, o estado de side-pane do workspace e o overlay à direita do `WebRemoteControlMobileShell`; não criar novo componente de drawer.
- [ ] Verificar que abrir a gaveta não muda a active task, não contorna a assinatura replayable e não dispara nova criação de runtime/host.
- [ ] Manter a superfície de chat coberta inert, o fechamento pelo backdrop e o comportamento atual do tab strip.

### Task 6: Rewrite Conversation E2E Contracts

**Arquivos:**

- Modify: `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-subagent-side-tabs.test.ts`
- Modify: `packages/desktop/test/e2e/conversation-session/conversation-session-background-subagent-rate-limit.test.ts`
- Modify: `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-tool-error-surface.test.ts`
- Modify/create case-local fixtures and manifests only as required by the changed assertions

**Passos do SAT manual-review:**

- [ ] Manter as asserções de 6+ tabs, dedupe de abertura repetida, crescimento live do child e pane de workbench inalterado.
- [ ] Adicionar cobertura de abertura direta de Agent background pelo resumo da conversa, em vez de testar apenas o painel de status Running.
- [ ] Tanto o summary foreground quanto o background asseveram ausência de `aria-expanded`, de chevron e de conteúdo inline.
- [ ] Adicionar unit de clicabilidade para child atrasado/ausente; a menos que seja possível com fixture estável, não forçar E2E caro de provider apenas para um guard de UI.

**Passos do BG26:**

- [ ] Remover a lógica de clicar em `TID_TOOL_SUMMARY_TRIGGER` para expandir e esperar o `EXPECTED_RESULT` inline.
- [ ] Asserir que o summary background failed usa o action test id do side-pane e que o hover "execução falhou" da linha-pai continua sendo o texto original do provider.
- [ ] Clicar na linha-pai abre o child correspondente, e o aviso de erro live/current do child contém o texto original do provider.
- [ ] Trocar de task e voltar repete apenas as asserções de failed + hover na linha-pai + reabertura do mesmo child; não exige nova persistização do erro do child.

**Passos do Z01:**

- [ ] O Agent que falhou antes do start não tem action de child nem conteúdo inline, e a linha-pai ainda mostra a causa raiz real de provider/model.
- [ ] O Agent irmão continua com sucesso, e a continuação do pai recebe simultaneamente o tool_result failed/success.

**Evidência mobile:**

- [ ] O WDIO de desktop atual não pode se passar por `/remote` replayable real; usar primeiro unit de integração de shell + revisão manual em celular/viewport estreito de verdade.
- [ ] Se depois existir um harness de attachment mobile controlável, adicionar um E2E SAT10 replayable separado; enquanto não for executado, o matrix permanece `planned`/`manual-review`.

### Task 7: Runtime And Visual Verification

Bugs de interação não podem ser resolvidos apenas por leitura estática. Após a primeira implementação é obrigatório capturar evidência de runtime.

- [ ] Iniciar o desktop debugável e usar CDP/agent-browser para inspecionar o DOM do summary de Agent foreground/background: action id, ausência de inline, clique abrindo o child correto.
- [ ] Reproduzir o 429 local do caso BG26, registrando o tooltip da linha-pai, o aviso de erro atual do child e o estado da linha-pai após troca de task.
- [ ] Usar `/remote` no celular ou viewport mobile real + attachment shared-host para verificar a gaveta à direita, fundo inert, fechamento/reabertura e catch-up replayable.
- [ ] Verificar que o `activeTaskId` do shell não muda antes/depois de abrir o side pane e que o sessionId assinado pelo child está correto.
- [ ] Para workspace remoto, verificar que request/tab/connection key contêm simultaneamente `workspaceIdentity` e `remoteSessionId`.
- [ ] Verificar que o logger da UI não tem novo info de alta frequência; se precisar de diagnóstico, usar apenas `packages/ui/src/logger.ts` e trace por evento em debug.
- [ ] Conferir por screenshot light/Zai Light, dark/Zai Dark, chinês, inglês, tela estreita com título longo e quebra de linha de erro longo.

### Task 8: Automated Verification And Closeout

**Testes focados:**

```bash
pnpm vitest run \
  packages/ui/test/subagentSidePane.test.ts \
  packages/ui/test/workspaceSidePane.test.ts \
  packages/ui/test/agentToolCallBlock.test.ts \
  packages/ui/test/v4AssistantWorkRenderItems.test.ts \
  packages/ui/test/v4ToolCallRowAdapter.test.ts \
  packages/ui/test/v4SessionPaneLayoutParity.test.ts \
  packages/ui/test/workspaceShellRemoteMobileLayout.test.ts \
  packages/ui/test/webRemoteControlMobileShell.test.ts
```

**Checagens E2E:**

```bash
pnpm --filter @zcode/desktop typecheck:e2e

pnpm --filter @zcode/desktop e2e:fixture:check -- \
  --spec ./test/e2e/conversation-session/conversation-session-background-subagent-rate-limit.test.ts

pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec \
  './test/e2e/conversation-session/conversation-session-background-subagent-rate-limit.test.ts'
```

- [ ] Para SAT/Z01 pendentes, executar manual/capture review, organização de fixtures locais do caso e promoção conforme `e2e-case-lifecycle`; nunca marcar diretamente como covered formal.
- [ ] Se modificar/remover exports, rodar primeiro `pnpm dep:refs --list-exports <file>` e depois `pnpm dep:refs <file>:<symbol>` para cada export alterado; usar `rg` para complementar a busca de consumidores em JSX/strings.
- [ ] Rodar `pnpm typecheck`.
- [ ] Rodar `pnpm lint`.
- [ ] Rodar `git diff --check`.
- [ ] Revisar o diff e confirmar que não houve alteração inesperada em protocolo, relay/main, queue, owner/lease, persistência de side-pane ou capacidade de runtime.
- [ ] Atualizar o estado final de cobertura e os caminhos de teste no catalog/matrix.
- [ ] Usar Conventional Commit, por exemplo `fix(ui): open subagent details outside conversation flow`.

## 11. Verification Matrix

| Surface | Desktop continuous | Web comum | Mobile replayable | Evidência necessária |
| --- | --- | --- | --- | --- |
| summary de Agent foreground | unit automatizado + SAT manual/E2E | unit/manual compartilhado | integração mobile/manual | DOM action/sem inline + request |
| summary de Agent background | BG26 + cobertura SAT | unit/manual compartilhado | integração mobile/manual | row failed/hover + abertura do child |
| sem child/falha de start | Z01 + unit focado | unit compartilhado | unit focado/toque manual | linha estática + erro raiz |
| erro atual do child | BG26 live | unit/manual compartilhado | manual mobile | snapshot.control.lastError -> aviso |
| contrato de UI recursivo | apenas reducer/unit | apenas reducer/unit | apenas reducer/unit | request root/parent/child |
| identidade de workspace remoto | unit + manual remoto | unit/manual | manual mobile remoto | workspaceKey + remoteSessionId |
| acessibilidade | pointer + Enter/Space | igual | toque + drawer | role/tabIndex/focus/inert |

## 12. Risks And Rollback Boundaries

| Risk | Detection | Mitigation |
| --- | --- | --- |
| linha sem child ainda marcada expansível pelo padrão do ToolLayout | unit de markup estático/DOM | Definir explicitamente `canToggle=false` no V4 e asseverar ausência de aria-expanded/content |
| output de background se perde após sair do inline | hover do pai no BG26 + aviso do child | Manter row.error; remover apenas a ponte de expansão de content |
| tab aninhada some ao trocar de task | teste de reducer root/parent | Visibilidade/last-active usam apenas rootSessionId |
| request mobile perde remoteSessionId | captura de prop do shell + manual remoto | Repasse explícito em V4ChatPane/SessionPane |
| conexão lenta no mobile afeta o desktop | evidência de connection/clientMode | Não modificar o delivery profile; assinatura owned permanece isolada |
| aviso de erro somente leitura confundido com erro de transport | testes de snapshot focados | Separar lastError de negócio da superfície de retry de assinatura |
| remover SubagentDrilldown atinge outras entradas | dep:refs + rg | Remover só sem consumidores; caso contrário manter o arquivo e desligar o caminho do V4 |
| E2E altera código de produto de novo para passar | revisão de catalog/matrix | Spec primeiro; BG26/SAT01 seguem este plano |

O rollback só pode reverter o wiring de UI/identidade/aviso de erro desta rodada; não é permitido reverter restaurando o fallback inline de background/mobile. Se o pane do child tiver uma falha bloqueante, deve-se corrigir o pane/superfície de erro de assinatura, em vez de fazer a conversa-pai assumir os detalhes novamente.

## 13. Definition Of Done

- [ ] `docs/subagent-session-side-tabs.md`, catalog e matrix consistentes com as decisões do usuário.
- [ ] Todos os summaries de Agent do V4 na conversa sem nenhum caminho de detalhe inline.
- [ ] foreground/background com child abrem diretamente a mesma tab de desktop/gaveta de mobile.
- [ ] Sem child, a linha inteira não é clicável e nenhuma tab temporária é criada.
- [ ] Um alvo child que chega depois não abre os detalhes automaticamente.
- [ ] O hover de failed do pai preserva a causa raiz; o erro atual do child é visível sem nova persistência/schema.
- [ ] O contrato de UI aninhada distingue corretamente root/parent/child, e o caso real de runtime é explicitamente podado.
- [ ] O celular reutiliza shared-host replayable + a gaveta à direita existente, sem afetar active task nem desktop continuous.
- [ ] BG26 não prova mais visibilidade de erro expandindo o cartão do Agent.
- [ ] Testes focados, evidência E2E, `pnpm typecheck`, `pnpm lint` e `git diff --check` passando.
- [ ] A implementação final usa Conventional Commit, listando na mensagem as fronteiras de verificação de mobile replayable e nested runtime.