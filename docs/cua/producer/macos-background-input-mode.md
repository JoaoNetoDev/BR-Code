# Modo de entrada em background no macOS

## Situação atual (corrigido em 2026-09-16)

Vários pontos deste documento tratam `open_application(activate=true)` como meio de
trazer o app para foreground/restaurá-lo (veja "observar novamente antes de despachar"
e os passos de aceitação do fixture do Chrome). **No lado macOS essa ferramenta já
não existe**: `open_application` foi retraído do darwin em 2026-09-11
(src/tools/platform-surface.ts), o modelo não tem mais nenhuma forma de ativar, e
por isso `FOREGROUND_REQUIRED` é insatisfazível no macOS. Em máquina real, em
2026-09-16 (open panel em background do LibreOffice), comprovou-se: `Cmd+Shift+G` é
totalmente ignorado, enquanto `AXOpen` da célula da barra lateral é confiável. A
orientação de file_panel do lado do modelo passou a ensinar `AXOpen`
(src/targeting/format.ts). Os passos abaixo que envolvem "trazer para foreground
antes de pressionar as teclas" devem ser lidos conforme essa correção; para
restaurar essa lane, é preciso antes repor a capacidade de elevação automática.

> Atualização de 2026-08: o native owner, o despacho em background e a fronteira de
> segurança possibly_sent deste documento continuam válidos. A "força de compact/full
> state após a ação, action_outcome, state_sync_status, barreira de desbloqueio
> delta/no_change" foi substituída por
> `docs/cua-receipt-observation-contract.md`. O resultado de ação visível ao modelo
> hoje é, por padrão, `zcode-cua-action-receipt-v1`; o estado `force_full` é
> capturado uma única vez apenas quando há `return_state=compact|full` explícito.

## Objetivo

Por padrão, o zcode-cua no macOS não pode alterar o app de foreground atual do
sistema, a key window, a hierarquia de janelas ou a posição física do mouse. A
ação precisa estar explicitamente vinculada a um app lógico vivo, a uma
presentation window e a uma surface real; quando a evidência é insuficiente, a
operação falha de forma fechada (fail-closed). Somente quando o app lógico já está
em foreground e o WindowServer prova que o hit-test comum do OS coincide
exatamente com a surface capturada, é permitido usar `kCGHIDEventTap` para
entregar o evento ao responder atual do AppKit; esse caminho não ativa o app
implicitamente.

Linux e Windows continuam com a semântica de plataforma atual. A ABI privada
SkyLight existe apenas dentro do Helper nativo do macOS e não entra no schema MCP
cross-platform.

## Estado e sequência

```text
MCP target/state_id + actionable frame
    |
    v
AX relationship graph ---> presentation root + attached surface(s)
    |                                      |
    |                                      +-- WindowServer before/after owner proof
    v
pixel -> exact actual owner PID + CGWindowID + live bounds
    |
    +-- stale/replaced/relação incerta ----------------> action_sent=false
    |
    +-- logical app frontmost + OS hit-test == actual surface
    |           |
    |           `-- foreground CGEvent -> AppKit focused sheet responder
    |
    `-- otherwise
                |
                `-- synthetic focus + stamped window fields
                    -> SLEventPostToPid(actual owner, actual window)
```

## Contrato de comportamento

1. `left_click` e suas formas com `click_count` 2/3 e `mouse_button` right/middle
   compartilham o roteamento por surface. Em background ou na presença de
   obstrução irrelevante, usa-se a recipe com escopo de window; quando o app
   lógico já está em foreground e o hit-test do OS acerta exatamente a mesma
   actual surface, usa-se o CGEvent de foreground, porque a NSOpenPanel foi
   medida em aceitando o evento SkyLight com escopo de window e ainda assim não
   produzir efeito colateral de responder do AppKit. O click state é
   sequencialmente 1/2/3.
2. `scroll` e `left_click_drag` usam o mesmo canal de eventos direcionados por
   PID/window; dentro de `left_click_drag`, a pressão salva a janela alvo e as
   coordenadas virtuais, e a liberação precisa reutilizar o mesmo alvo. No lado do
   modelo não há entradas separadas de pressão/movimento/liberação.
3. `type` e `key` (incluindo a forma com duração de hold) mantêm a prioridade do
   AX. Quando o app lógico não está em foreground, o padrão é entregar eventos
   de teclado reais em uma sessão de background com actual PID/window; quando já
   está em foreground, o evento vai para a attached surface atualmente focada do
   OS. O próprio `strategy=event` não ativa o app: ele só emite um evento de
   teclado real global quando o logical PID já está em foreground e o
   `app_ref.window_id` fresco ainda é a current focused file-panel surface.
   Quando for necessária a elevação para foreground, o chamador precisa executar
   antes `open_application(activate=true)`, observar novamente e só então
   despachar. Se a precondição de foreground/foco não for satisfeita, retorna-se
   `foreground_required + action_sent=false`, sem se passar por
   TCC `permission_denied` e sem degradar silenciosamente para window_event.
   As teclas Tab/Enter/combinações do renderer do Chromium também caem nessa
   exceção: um receipt de background PID/window não prova que o renderer recebeu
   o evento. Fluxos já revalidados em foreground pelo fixture precisam usar
   explicitamente o `window_id` exato e `strategy=event`, e ser aceitos pelo
   resultado de DOM keydown/keyup/submit.
4. `type(target=element)`, `set_value`, `select_text` e `perform_action`
   continuam preferindo o token AX. O `set_value(strategy=event)` de elemento é
   idêntico ao item 3: exige ativar e revalidar a janela exata e então fazer a
   seleção/entrada global, sem ser interceptado pelo background mode; as
   estratégias padrão/AX continuam sendo encapsuladas por synthetic focus nativo,
   que não ativa apps do sistema.
5. `open_application` no macOS abre em background por padrão. A única exceção de
   elevação para foreground é quando o chamador passa simultaneamente
   `activate=true` e `app.window_id` é confirmado por evidência fresca de
   AX/WindowServer como `open_panel`, `save_panel` ou um `attached_dialog`
   derivado do painel de arquivos sob o mesmo presentation root. Esse caminho
   ativa o logical app, foca a exact actual surface, revalida e então retorna;
   janelas comuns, popovers, lineage ausente e generation antiga não podem se
   valer dessa elevação. Inicialização comum sem URL e sem `new_instance`
   continua usando o `NSWorkspaceOpenConfiguration` nativo, com
   `activates=false` e `allowsRunningApplicationSubstitution=true` fixos: a janela
   aparece normalmente na tela (interativa, legível por AX), mas não ativa nem
   rouba o foco do teclado. Atenção: não se pode definir `hides=true`: a janela
   seria criada em estado oculto, o unhide também não a traz de volta para a
   tela, a travessia da árvore AX estoura o tempo e isso viola o item 7 desta
   seção, "o alvo de entrada deve ser uma janela on-screen". O Helper precisa
   manter a requisição viva e aguardar o sucesso do completion de
   `openApplicationAtURL` antes de entrar na validação das pós-condições de
   janela AX; não se pode tratar "requisição do LaunchServices submetida" como
   sucesso e retornar antes. O pid do `NSRunningApplication` devolvido pelo
   completion precisa ser reportado ao broker junto com o resultado — as fontes
   de enumeração (NSWorkspace KVO / `CGWindowList(OnScreenOnly)`) têm atraso de
   alguns segundos para apps recém-iniciados, então a resolução de identidade
   prioriza a consulta direta por `applicationInfo(pid)`. Quando o processo alvo
   já existe mas `AXWindows=0`, é preciso redistribuir e aguardar o
   aparecimento da janela AX real antes de retornar; caso contrário, falhar de
   forma explícita, sem deixar as observações seguintes degenerarem em
   `elements(0)`. Todo o processo não ativa o alvo e não mascara um roubo
   momentâneo de foco restaurando depois o app de foreground.
6. No macOS, toda raw action sem `app_ref`/evidência de janela é rejeitada; um
   Helper antigo sem a ABI de background também é rejeitado, sem jamais degradar
   para entrada global.
7. O alvo precisa ser uma janela real, atualmente on-screen e ainda pertencente
   ao PID vinculado. Janelas ocultas, minimizadas, em outro Space e window id
   inválido/negativo de fallback retornam `action_sent=false`.
8. Eventos com PID, window id e coordenadas dentro da janela já gravados são
   entregues uma única vez, apenas por `SLEventPostToPid`. Não se deve chamar
   `CGEventPostToPid` de novo para o mesmo `CGEventRef`; o canal duplo faria o
   Chromium receber `mousedown` / `mouseup` / `contextmenu` duplicados, e o
   "sucesso da ferramenta" viraria uma máscara para efeitos colaterais de
   negócio repetidos.

## Fronteira de receipt após ações AX

O valor de retorno de APIs de escrita como `AXUIElementPerformAction` não é uma
confirmação transacional do estado de negócio do app. O macOS pode entregar a
ação ao app alvo primeiro — o app já adicionou o item, abriu o editor ou mudou a
seleção — e ainda assim a API AX retornar `kAXErrorAttributeUnsupported`,
`kAXErrorFailure` ou `kAXErrorCannotComplete`. Portanto, depois de entrar na
chamada nativa, o erro só pode significar `possibly_sent`, não pode significar
"a ação não aconteceu" e não pode disparar retentativa automática.

```text
Estado do modelo s-N
    |
    v
Validação pré-chamada nativa ----falha/target stale----> not_sent receipt
    |                                      descarta apenas o s-N comprovadamente stale
    v
Entra em uma única chamada nativa
    | accepted / possibly_sent
    v
accepted/possibly_sent receipt (retry_action=false)
    |
    +-- return_state=none ----------> termina, sem capture
    |
    `-- return_state=compact/full --> uma captura force_full --> novo estado s-(N+1)
```

O resultado de ação visível ao modelo agora é uniformemente
`zcode-cua-action-receipt-v1`:

- `dispatch_status="accepted" | "possibly_sent" | "not_sent"` descreve apenas o
  fato do despacho;
- `retry_action=false` proíbe que o host ou o modelo reexecute a chamada não
  idempotente tal e qual;
- o padrão é `return_state="none"`, sem capture, settle ou espera de barreira de
  estado implícitos;
- `return_state="compact" | "full"` explícito executa uma única observation
  `force_full`;
- o receipt vem antes da árvore AX longa, para evitar que a evidência de
  proteção contra reexecução se perca quando o host trunca a saída.

Ações de elemento descartam apenas o `pre_state_id` referenciado por este
target; outros states do mesmo app/window não são afetados pelo lock de escrita
de escopo amplo. O fresh native token gerado por hit-test de coordenadas não tem
`pre_state_id`, portanto não descarta indevidamente o state mais recente.
`possibly_sent` usa o mesmo contrato de receipt para element, coordinate, drag,
mouse down/up e keyboard, sem mais degradar para `CUA_NOT_READY` e deixar o
modelo adivinhar se deve reexecutar. Mutation scope sem pid/bundle/name
continua devendo ser rejeitado antes do despacho com `action_sent=false`.

O synthetic-focus do AX contextual é apenas uma precondição de despacho. Se ele
retornar explicitamente `action_sent=false`, é permitido contornar essa
precondição e executar uma única ação AX; assim que o wrapper já tiver chamado a
ação nativa, ou o fato do despacho for ambíguo, não se deve fazer fallback,
reanalisar o token nem dar AXPress de novo.

## Compatibilidade e riscos

- SkyLight é uma ABI privada e uma atualização do sistema pode torná-la
  indisponível; a detecção é feita símbolo a símbolo em tempo de execução, com
  erro explícito e sem fallback global.
- "Background" não significa poder operar uma janela sem renderização. A janela
  pode estar encoberta por outras, mas precisa continuar no Space atual e com o
  WindowServer marcando-a como on-screen.
- O app alvo ainda pode recusar entrada sintética. O sucesso da ação significa
  apenas que o evento foi direcionado e entregue; o efeito final é verificado
  pela observation pós-ação já existente.
- producer e Helper não suportam versões misturadas. Ao instalar um novo
  producer é obrigatório cobrir a instalação antiga com o Helper empacotado do
  mesmo build id; se a checagem de inicialização não passar, falhar de forma
  explícita, sem compatibilizar payloads de wire antigos no caminho de ação.

## Diagnóstico de falha no Begin

O begin de uma sessão de teclado em background não pode devolver apenas um
booleano. O booleano esmagaria em uma única mensagem de erro session busy, AX
não autorizado, símbolo SkyLight ausente, janela fora do Space atual, mudança de
owner/bounds da janela, falha de `GetProcessForPID` e registro de synthetic-focus
rejeitado pelo WindowServer, impossibilitando ao runtime distinguir "alvo
stale" de "ABI privada inoperante". A ABI detalhada e aditiva do Helper precisa
retornar:

- um `reason` estável;
- `native_status` (com valor apenas quando o SPI de baixo nível retorna um
  código de status);
- `pid`, `window_id` e bounds esperados;
- live owner, on-screen e live bounds, quando legíveis;
- a lista de símbolos SkyLight ausentes.

```text
MCP key/type/hold
    |
    v
beginBackgroundWindowInputDetailed
    |
    +-- ramo parse/AX/SkyLight/live-window/focus-record
    |                         |
    |                         v
    |              { ok:false, reason, evidence }
    |                         |
    |                         +--> log warn do Helper
    |                         +--> BrokerError.details
    v
verified PID keyboard dispatch (executado apenas quando ok=true)
```

A falha ocorre antes do verified keyboard dispatch, portanto todas as falhas de
begin devem preservar `action_sent=false`. Quando o addon antigo não tem a ABI
detalhada, continua falhando de forma fechada (fail-closed) e é marcado como
`legacy_unclassified`, não classificável com precisão, sem se passar por um motivo
nativo específico.

## Diagnóstico de falha no End

O mesmo raciocínio vale para o encerramento: o booleano esmagaria em um único
erro a incompatibilidade de session, a falha ao desfazer o foco sintético, uma
mudança real de foreground e o deslocamento do cursor físico. A ABI detalhada de
end precisa retornar `reason` estável, `native_status`, `pid`/`window_id`, além
do frontmost pid e do physical cursor medidos uma vez antes e uma vez depois do
despacho.

O end ocorre **depois** do verified dispatch, portanto cada `reason` deve ser
lido como `action_sent=true`, e nunca pode levar o chamador a interpretá-lo como
"a ação não chegou, é possível reexecutar".

**O caminho de teclado não trata `frontmost_changed` / `cursor_moved` como
falha.** A razão é que esses dois valores não são alteráveis por este caminho: o
teclado com escopo de app usa `CGEventPostToPid` (entrega direcionada por pid),
que não move o cursor do sistema nem chama `SetFrontProcess`. Portanto, a
deriva observada tem apenas duas origens —

1. o próprio usuário moveu o mouse (o encerramento inclui esperas de 100ms +
   40ms, e basta a mão tocar para disparar);
2. a reação normal do App alvo às teclas, por exemplo o `escape` fechando um
   menu e o app devolvendo o foreground.

No segundo caso, quanto mais a ação é eficaz, mais a validação falha. Reportá-los
como falha faria o modelo achar que a tecla não chegou e reexecutar, causando
entrada duplicada. Portanto: registrar log `warn` e telemetria; o resultado da
ferramenta continua sendo sucesso.

`session_mismatch`, `unfocus_record_failed`, `action_failed` e as diversas
`*_unclassified` continuam reportando erro — são vazamentos reais de estado ou
riscos não classificáveis, apenas precisam reportar o `reason` exato, em vez de
um vago "invariant changed". O caminho de ponteiro mantém a estratégia original,
sem ajuste por esta mudança.

## Aceitação

- Os testes unitários do broker provam que os cinco perfis de click em background
  escolhem todos a ABI com escopo de window; a ABI de foreground só é escolhida
  quando o app lógico já está em foreground e a actual surface passa
  simultaneamente pelo hit-test do WindowServer; com obstrução irrelevante
  presente, o caminho global não é usado.
- Testes unitários de scroll/drag/mouse hold provam que o escopo app/window é
  sempre preservado e que não há fallback global.
- Testes unitários de teclado do Chromium provam que não há mais ativação nem
  envio global.
- Os testes de código nativo travam os símbolos privados, os campos, o click
  recipe, o focus somente no target e o fail-closed.
- Em máquina real, usando um app observador que permanece em foreground como
  linha de base, executar ações em Calculator/TextEdit/Chromium em background e
  comparar o frontmost PID, o cursor físico e os bounds/ordem das janelas antes
  e depois da ação, verificando a mudança de estado do alvo.
- Testes unitários do broker provam que `frontmost_changed` / `cursor_moved` no
  end do teclado apenas geram log e não alteram o resultado da ferramenta,
  enquanto `session_mismatch` / `unfocus_record_failed` continuam em fail-closed
  e reportam o `reason` exato.
- **A aceitação em máquina real precisa incluir as duas situações "mover o
  mouse manualmente durante o despacho" e "pressionar escape com o menu do App
  alvo aberto".** Aceitar apenas em um ambiente silencioso, sem ninguém
  tocando a máquina, faz os invariantes de frontmost/cursor parecerem sempre
  válidos — foi assim que a evidência de 2026-08-13 abaixo passou, enquanto no
  feedback de máquina real a mesma rota falhou em 6 de 7 chamadas.
- O fixture AppKit precisa usar `NSOpenPanel.beginSheetModal(for:)` para
  estabelecer de fato a modal response, validar a sub-surface de `Cmd+Shift+G`,
  o caminho completo, o estado padrão do botão de confirmação e o fechamento por
  confirmação, e então o oracle interno do app valida o arquivo exato; a lane
  alvo não pode exceder 15 chamadas CUA e não pode chamar `osascript`.
- O fixture do Chrome precisa partir de um `open_panel` em background e, após a
  dupla confirmação de `open_application` trazer a exact surface para
  foreground, completar `Cmd+Shift+G`, a entrada do caminho, o Enter e a
  confirmação; o texto AX/DOM da página é o oracle final, e todo o caminho
  testado não pode usar CDP/Playwright para definir o arquivo.

## Evidência em máquina real do painel de arquivos, 2026-08-23

- presentation root, NSOpenPanel e a sub-sheet de `Cmd+Shift+G` foram
  resolvidos como três window id reais distintos, compartilhando o mesmo
  presentation root.
- 8 chamadas CUA completaram a entrada do caminho, a seleção do arquivo alvo e
  o fechamento por confirmação; o oracle interno do app retornou
  `response=ok`, `target_selected=true`, `osascript_calls=0`.
- O outcome do clique de confirmação reporta o actual panel owner/window e
  `surface_kind=open_panel`; após o fechamento do painel de arquivos, o app
  retorna ao mesmo presentation root.

## E2E de diferenças do painel de arquivos, 2026-08-24

- Três task packs independentes, M14–M16, travam respectivamente o roteamento
  de surface por coordenadas, a identidade de teclado por geração do panel e a
  permissão de coordenadas state-only; todos usam o NSOpenPanel real do AppKit e
  chamadas MCP nativas.
- M14/M15 executam explicitamente `activate=true` antes dos passos de teclado
  originais em foreground, cobrindo diretamente o caminho de recuperação
  "reativar e então digitar imediatamente"; `return_state:none` ainda precisa
  retornar a actual dispatch surface e o outcome não reexecutável.
- `main@e0d27a36`: M14/M16 não conseguem entregar o raster de painel acionável;
  o Escape de M15 retorna texto de sucesso, mas o painel não fecha.
- Ramo de correção: todos os blocking checks de M14, M15 e M16 passam;
  `osascript_calls=0`.
- M16 prova adicionalmente que o clique em um painel comum só retorna
  `accepted/not_proven` e não reporta erroneamente o painel como fechado por
  causa da captura transitória do presentation root durante o settle.

## Evidência em máquina real, 2026-08-13

- A Calculator em background (PID 23325, CGWindowID 168257), após receber um
  clique simples, passou a exibir o valor `7`.
- O clique duplo, o triplo, o botão direito e o botão do meio na mesma janela
  foram todos retornados com sucesso pelo native; o frontmost PID do sistema
  antes e depois de cada evento permaneceu em 17641, e o cursor físico permaneceu
  em `(985.21484375, 300.1875)`.
- O begin, a verified key e o end da sessão de teclado com synthetic-focus
  tiveram sucesso; a Calculator passou a exibir `78,888,891`, e o frontmost PID e
  o cursor permaneceram inalterados.
