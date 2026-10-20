# PiP Session Coordinator v2: captura composta de janelas relacionadas

## Objetivo

O v2 mantém a autoridade de session/turn do v1 e corrige apenas o problema de mistura
entre a identidade da janela nativa do macOS e a da apresentação PiP. Uma ação de teclado ou
de elemento pode abrir um sheet/dialog anexado; ele tem um CGWindowID próprio, mas ainda
pertence à mesma apresentação PiP da janela de topo original.

```text
actual window 2310 (root) ───────────────┐
                                          ├─ presentationWindowId=2310 ── one PiP
actual window 2324 (attached sheet) ─────┘                            composite

actual window 2400 (independent root) ───── presentationWindowId=2400 ── second PiP
```

O state/frame das ferramentas CUA continua vinculado à janela real; somente a apresentação
PiP usa a janela lógica raiz. Não é permitido inferir a relação de associação pelo nome do
atalho, pelo nome da ferramenta ou por `include_screenshot`.

## Vínculo de captura

`PipCaptureTarget` ganha o novo campo opcional `presentationWindowId`:

```ts
type PipCaptureTarget = {
  windowId: number;              // 本次实际聚焦/操作的 surface
  presentationWindowId?: number; // 可证明的同进程逻辑根；缺失时等于 windowId
  pid: number;
  bundleId: string;
};
```

A captura no macOS sobe a partir da janela AX selecionada, siguiendo `AXParent`, no máximo 8
níveis para cima. Só são aceitos ancestrais com o mesmo PID e CGWindowID diferente de zero; o
ancestral válido mais externo é tomado como a presentation root. Ciclos, timeout, processos
diferentes, ausência de ID ou falha de leitura recuam para o window ID real. Em Linux/Windows
permanece `presentationWindowId === windowId`.

O macOS 14.0/14.1 não tem `includeChildWindows` do ScreenCaptureKit, por isso também
mantém a exibição de surface independente do v1 com `presentationWindowId === windowId`; só
no macOS 14.2+ a identidade e os pixels são unificados.

`window.window_id`, a procedência do frame da captura, o alvo de entrada e o post-action state
continuam reportando a janela real; `presentationWindowId` não entra no DTO de janela visível
ao modelo.

## ABI nativa estrita

O protocolo público sobe para version `2`, runtime id `zcode-cua-pip-session-v2`. O handshake
do Helper só fica ready quando a nativa oferece `pipStartVerifiedCompositeAsync`; sem essa ABI
o Auto-PiP é desligado e não há fallback para a `pipStartVerifiedAsync` do v1.

Os parâmetros do composite start são fixos:

```text
(presentationWindowId, windowId, pid, bundleId, width, height, group)
```

O registry de painéis nativos, o dismissal e a capacidade usam chave `(group, pid,
presentationWindowId)`; o controller guarda à parte o window ID real mais recente, usado na
ativação por duplo clique e no diagnóstico.

## Estado da apresentação nativa

- Nova apresentação: resolve o `SCWindow` da presentation root e cria um filter do
  ScreenCaptureKit com `includeChildWindows=YES`.
- Mesma apresentação, mesma janela real: renova o filter e faz promote, sem criar painel.
- Mesma apresentação, janela real alterada: avança a capture generation, renova o filter da
  root e o actual activation target; o último frame antigo é mantido até o primeiro frame novo.
- Presentation root diferente: cria um novo painel conforme as regras existentes de
  multi-panel.
- Depois que o sheet é fechado, a próxima captura da root continua atingindo a mesma
  apresentação e é renovada para a imagem root-only.

Quando a root e a janela real diferem e o composite filter não pode ser estabelecido, os
painéis existentes mantêm o último frame; sem painel, o Auto-PiP é abandonado. Não se pode
iniciar a janela real filha como um segundo painel. A falha do PiP não altera o resultado das
ferramentas CUA.

## Ordenação de admissão da apresentação

O modo de sessão PiP possui um presentation scheduler do lado do producer. O Coordinator
continua validando de forma síncrona a focus revision, a turn sequence e o capture binding,
mas o native presentation start precisa passar pelo scheduler para ser serializado; contextos
diferentes de apresentação que chegam em paralelo dentro do mesmo turn não podem competir
diretamente pela admissão de worker único da nativa.

```text
new turn ── synchronous cancellation barrier (pipBeginTurn)
                         │
                         ├── invalidate the previous native start generation
                         ├── remove queued captures/terminal for the previous turn
                         └── release the mailbox wait for the superseded capture
                                              │
                                              ▼
coordinator ── capture(root) ── capture(sheet/root) ── terminal
                         │                  │
                         └── same key coalesce latest actual window
                                          │
                                          ▼
                             one native start at a time
```

- A capture key é `(sessionId, turnId, pid, presentationWindowId)`; na fila, chaves iguais
  mantêm apenas a janela real mais recente.
- Terminals concluídos são enfileirados depois das captures já aceitas; failed e closed
  permanecem para depois do fechamento do start in-flight, com o native terminal effect
  executado, proibindo o ressurgimento tardio de painéis.
- Um novo turn é a exceção: uma cancellation barrier de mesmo session. `pipBeginTurn` precisa
  ser executado de forma síncrona antes do lifecycle ACK, invalidando os starts antigos com a
  generation nativa e cancelando as captures/terminals enfileiradas do turn anterior. Não se
  pode enfileirar o begin-turn atrás de uma capture Promise que talvez nunca settled; caso
  contrário o protocolo devolveria `applied=true` enquanto a janela nativa ficaria presa no
  visto verde da rodada anterior.
- Se `pipBeginTurn` lançar exceção, a barrier não foi estabelecida: é preciso interromper a
  capture ativa antiga, não submeter o estado do coordinator para o novo turn e não devolver
  `applied=true`. Depois de retornar `native-reset-failed`, o mesmo lifecycle event pode ser
  tentado novamente; durante a falha, os bindings de capture do novo turn são rejeitados
  conforme o estado do turn antigo, para evitar a divergência entre o ACK e o ciclo de vida
  nativo.
- Native busy/false só gera retry limitado; não se pode chamar o `pipStop` global nem avançar a
  generation de outro worker in-flight.
- A troca de focus group permanece de execução imediata, sem bloqueio pela fila de admissão de
  apresentação.
- O scheduler mantém no máximo 64 captures únicos; ao exceder, descarta primeiro o capture de
  background mais antigo, e lifecycle control nunca é descartado. Essa degradação afeta
  apenas o Auto-PiP e não altera o resultado das ferramentas CUA.

A admissão do native start precisa primeiro obter o slot de worker único e só então avançar a
request generation; o worker libera o slot antes de o Promise settled. Apenas
`pipStop`, `pipBeginTurn`, desabilitações globais e outras cancelamentos explícitos de
lifecycle podem invalidar a generation de um worker já admitido.

## Resolução explícita de surface anexada

Um `window_id` explícito não pode procurar apenas em `kAXWindows`. No macOS, as janelas
top-level são verificadas em sequência, depois a janela focada/main, e a busca pelo CGWindowID
solicitado acontece no grafo limitado de surface-container com mesmo PID, 8 níveis e 64 nós;
depois do acerto, a presentation root é calculada seguindo `AXParent`. NSOpenPanel, sheet,
dialog e popover, mesmo não listados em `kAXWindows`, devem ser atribuídos à apresentação
pai sempre que a relação AX puder ser provada. Windows CG-only/custom sem relação continuam
sendo exibidos de forma independente com o actual ID; é proibido adivinhar a relação
pai-filho por geometria, título ou bundle.

## Ordenação do promote do ponteiro

O pointer-down aceito atualiza primeiro, dentro da thread do event-tap e apenas a ordem de
lead protegida por `g_pip_stack_mutex`, e só então executa `orderFrontRegardless` de forma
assíncrona na thread principal do AppKit. A submissão assíncrona é reconferida por
membership, running, group visibility e visibility epoch, sem depender do interaction
generation, que avança com drag/up. A ordem interna de arbitragem e a ordem visual do
WindowServer devem finalmente coincidir.

## Aceitação

- O rastro `2310 -> 2324` com `Cmd+Shift+G` produz apenas uma apresentação.
- O attached sheet e a janela pai aparecem simultaneamente no PiP composto; depois que o sheet
  fecha, o mesmo painel volta a exibir a janela pai.
- Duas janelas top-level independentes com o mesmo PID ainda produzem dois painéis.
- O duplo clique ativa a janela real mais recente; o fechamento registra dismissal na
  presentation-root.
- Settle de post-action repetido, frames tardios fora de ordem e abertura/fechamento rápido de
  sheet não criam painel novo nem voltam a exibir a imagem antiga.
- Capturar em paralelo dois contextos de apresentação independentes no mesmo turn resulta em
  exatamente dois painéis; a admissão busy não descarta o grupo inteiro.
- Quando o native start do turn antigo não settled, antes do ACK do novo turn o distintivo de
  conclusão já foi limpo, a nova capture não fica bloqueada pela Promise antiga e o terminal
  antigo não pode adicionar de volta o visto verde de forma tardia.
- Quando o native reset lança exceção, o novo turn retorna `native-reset-failed`, a mailbox de
  capture antiga é liberada; o coordinator não consome o sequence/eventId desse event, e a
  repetição do mesmo event pode ser submetida após o reset bem-sucedido.
- Capturar explicitamente a root, um attached panel não listado em `kAXWindows` e uma janela
  top-level independente resulta em 2 apresentações.
- Após clicar em qualquer painel visível, ele se torna ao mesmo tempo o lead nativo e o front
  panel do WindowServer.
