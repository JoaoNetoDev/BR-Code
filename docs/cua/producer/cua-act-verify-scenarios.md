# Cenários CUA ACT-VERIFY — cobertura e design

Este é o documento de cobertura da suíte e2e **act-verify**
(`scripts/cua_act_verify.py`). É a contraparte act-verify do `scripts/e2e_opus.py`
existente, que é **observe-only**: o model EXECUTA uma tarefa e nós VERIFICAMOS uma
pós-condição determinística — "o model clicou" não é sucesso; o efeito colateral
verificável é.

## O contrato act-verify (vs. observe-only)

| | observe-only (`e2e_opus.py`) | **act-verify (`cua_act_verify.py`)** |
|---|---|---|
| chamadas do model | `get_app_state`, depois relata | `get_app_state` → **act** (`left_click`/`type`/`set_value`/...) → `get_app_state` |
| o que conta como sucesso | o model produziu uma descrição | **um verificador independente** confirma o pós-estado |
| sinal de aprovação | exit 0 se alguma ferramenta disparou | PASS somente se `model_acted AND verify_passed` |

Cada cenário tem três fases independentes que o harness executa para você:

1. **setup** — preparação determinística (abrir o app, limpar o documento, criar
   uma fixture) para que o model parta de um estado conhecido;
2. **act** — conduzir o model real (GLM-5V-Turbo) via `scripts/e2e_opus.py` com
   um prompt de tarefa que lhe diz para agir pelas ferramentas MCP a11y-first;
3. **verify** — ler o pós-estado com um método que NÃO confia na alegação do
   model: o AppleScript lê TextEdit/Finder/Notes/Terminal diretamente, o `pbpaste`
   lê a área de transferência, e o display do Calculator é lido via System Events.

## Como executar (local, model real, cobrado)

```bash
# Prerequisites (one-time, GUI):
#   1. unlock the screen (live CUA can't run behind the loginwindow shield)
#   2. System Settings > Privacy & Security > Accessibility    -> add the python executable that runs the harness
#   3. System Settings > Privacy & Security > Input Monitoring -> add the same executable
#   4. System Settings > Privacy & Security -> Screen Recording -> add the same executable
#      (without it the preflight prints a WARNING and per-app raster grabs the
#       wallpaper, not the target window — raster-based scenarios degrade)
#
# The act-verify harness runs on SYSTEM python3 (no `uv`, no `pyproject.toml`,
# no `.venv` — the Python MCP server was removed; only the harness stays).
# Install its deps once (see AGENTS.md §"Act-verify harness"):
python3 -m pip install mcp pyautogui pyobjc-framework-Quartz pyobjc-framework-ApplicationServices

# full suite (80 scenarios; spaces calls ~30s to avoid BigModel 429s)
python3 scripts/cua_act_verify.py --ts-server

# a subset
python3 scripts/cua_act_verify.py --ts-server --only AV01,AV03,AV08,AV22,AV28

# just the environment preflight (no model calls)
python3 scripts/cua_act_verify.py --ts-server --preflight-only
```

Os artefatos ficam em `artifacts/act-verify/` (ignorado pelo git): um `result.json` +
`e2e_opus.stdout` + `ledger/{manifest.json,frames.jsonl}` por cenário, um
`summary.json` combinado e um `preflight.json`. O relatório humano é escrito em
`/tmp/act-verify-e2e-report.md` (substitua com `--report`).

O **ledger de gravação** por chamada de ferramenta (!179) é habilitado por cenário
apontando `ZCODE_CUA_LEDGER_DIR` para o diretório `ledger/` do cenário; ele captura
a entrada redigida de cada ferramenta + resultado/exceção + duração + o método
exato de backend que cruzou a fronteira do SO.

## Preflight de ambiente (fail-fast)

O harness se recusa a queimar chamadas de model cobradas contra uma parede. Ele
bloqueia (exit 0, `status=BLOCKED`, zero chamadas de API) quando qualquer um destes
casos vale:

- **tela bloqueada** — `CGSSessionScreenIsLocked == true`. Atrás do escudo do
  loginwindow o AX retorna `-25211` e os AppleEvents expiram (`-1712`); nenhum app
  é acionável. (Este é o mesmo bloqueador documentado na nota MEMORY
  `zcode-cua-m09-unlocked-console-verify`: execuções live com a tela bloqueada são
  `infra_fail`, não falhas reais.)
- **Acessibilidade não confiável** — `AXIsProcessTrusted() == false` para o
  executável python que roda o servidor. `get_app_state` falha de forma fechada
  com `permission_blocked`. (Nota: `request_access` pode relatar
  `accessibility:true` a partir de uma heurística não autoritativa;
  `AXIsProcessTrusted()` é a fonte da verdade e é o que o preflight usa.)
- **deps pyobjc do macOS ausentes** — `No module named 'ApplicationServices'`.
  Corrija com
  `python3 -m pip install pyobjc-framework-Quartz pyobjc-framework-ApplicationServices`
  (a forma `uv sync --extra macos` está obsoleta — não há `pyproject.toml` /
  fluxo `uv` no `main` atual).

O preflight também emite **WARNING**s não bloqueantes (impressos como `WARNING:` e
registrados sob `evidence.warnings` em `preflight.json`). Esses degradam cenários
específicos, mas nunca bloqueiam a suíte, por isso são reportados de forma
destacada em vez de corromper silenciosamente uma execução:

- **Screen Recording não concedido** (`CGPreflightScreenCaptureAccess() == false`,
  uma sondagem sem prompt; também registrado como
  `evidence.screen_recording_granted`). Cenários só-AX (Calculator/TextEdit lidos
  via a árvore AX) ainda passam, mas o raster por app retornado por
  `get_app_state` com `include_screenshot` captura o papel de parede da mesa em
  vez da janela alvo, então qualquer cenário dependente de raster degrada para um
  frame em branco. Conceda Screen Recording ao mesmo executável para eliminar
  isso.
- **A fonte de entrada de teclado ativa é um IME CJK / layout não latino**
  (registrado como `evidence.keyboard_input_source`). A fonte de entrada ATIVA é
  lida via Text Input Source Services (`TISCopyCurrentKeyboardInputSource`,
  `ctypes` — sem dependência extra), que relata o MÉTODO/MODO de entrada ao vivo,
  então detecta um método de entrada CJK (por exemplo Pinyin,
  `com.apple.inputmethod.SCIM.ITABC`) sobreposto a um layout latino (ABC) — um
  caso que o padrão de *layout* do HIToolbox sozinho (o fallback quando o TIS está
  indisponível) não consegue enxergar. Um método de entrada CJK intercepta o
  `type`/keystroke cego do harness para composição, então o texto digitado
  vira lixo e os cenários de `type` dão FAIL falso. Mude para um layout latino
  (ABC / U.S.) antes de uma execução de aceitação. O harness apenas **detecta e
  avisa** — nunca altera a fonte de entrada do sistema do usuário.
- **Backlog "Untitled N" do TextEdit no iCloud (Sticky)** (registrado como
  `evidence.icloud_textedit_backlog`, uma contagem de `Untitled*.rtf` em
  `~/Library/Mobile Documents/com~apple~TextEdit/Documents/`). O TextEdit
  **restaura** esses documentos na inicialização (eles sobrevivem a
  quit/pkill, e o reset hermético por cenário apenas recolhe os documentos
  PRÓPRIOS da suíte), então eles sombreiam o documento da frente e inflament os
  FAILs de TextEdit. Limpe-os antes de uma execução de aceitação — são dados de
  iCloud do USUÁRIO, então o harness **nunca os apaga**; ele apenas reporta a
  contagem.

Bypass para forçar uma execução live apesar do preflight: `--force` (você assume
a consequência).

## Matriz de cenários (80)

A suíte abrange **10 categorias** de tarefas comuns de uso de computador em
**13 apps** (Calculator, TextEdit, Finder, Notes, Terminal, Stickies, Safari,
System Settings, Activity Monitor, Preview, Dictionary, Font Book e o Character
Viewer). Todo cenário é **reversível** (as fixtures vivem sob `/tmp` e são
removidas; toggles de configuração capturam e restauram o valor original — veja a
nota [recuperação dos defaults do Finder](#recuperação-de-três-estados-dos-defaults-do-finder-em-av78av79)
para saber como uma chave originalmente AUSENTE é restaurada). PASS exige tanto
`model_acted` quanto um `verify_passed` independente.

### AV01-AV17 (suíte original)

| ID | Name | Class | App | Caminho de act | Verificação independente |
|----|------|-------|-----|----------|--------------------|
| AV01 | Calculator 7+5=12 | calculator-compute | `com.apple.calculator` | `left_click` element-target ×4 (Invoke) | o display do Calculator lê `12` (System Events) |
| AV02 | Calculator 8×3−4=20 | calculator-multi-step | `com.apple.calculator` | `left_click` de elemento multi-etapa | o display lê `20` |
| AV03 | TextEdit type "hello world" | textedit-type | `com.apple.TextEdit` | ferramenta `type` (frase inteira) | `text of document 1` contém o texto |
| AV04 | TextEdit set_value "fixed" | textedit-set-value | `com.apple.TextEdit` | `set_value` no elemento de texto | `text of document 1` == `fixed` |
| AV05 | Finder select target.txt | finder-navigate | `com.apple.finder` | `left_click` de elemento na linha do arquivo | `selection` do Finder == `[target.txt]` |
| AV06 | Notes create note | notes-create | `com.apple.Notes` | clicar em "New Note" + `type` do título | existe uma nota chamada `AV06_MARKER` (o cleanup a apaga) |
| AV07 | Terminal `echo done` | terminal-command | `com.apple.Terminal` | `type` de `echo done\n` | o `contents` da aba do terminal contém `done` |
| AV08 | Clipboard copy | clipboard-copy | `com.apple.TextEdit` | `select_text` + Cmd+C (teclado) | `pbpaste` contém `clipme-AV08` |
| AV09 | Stickies type marker | stickies-type | `com.apple.Stickies` | `type` dentro da nota | o texto estático da nota contém o marcador (o cleanup o limpa) |
| AV10 | Calculator 15÷3=5 | calculator-compute | `com.apple.calculator` | `left_click` de elemento (operador ÷) | o display lê `5` |
| AV11 | TextEdit append line | textedit-append | `com.apple.TextEdit` | `type` de `\nline-two` no fim | o doc contém `line-one` e `line-two` |
| AV12 | Finder open folder | finder-open | `com.apple.finder` | `open_application` / ação de path | o `target` da janela da frente termina com `act-verify-fixture/` |
| AV13 | Finder drag file into folder | finder-drag | `com.apple.finder` | **`left_click_drag`** elemento→elemento | o arquivo existe em `DestFolder/moveme.txt` E sumiu do diretório pai (sistema de arquivos) |
| AV14 | Sound volume slider drag | settings-slider-drag | `com.apple.systempreferences` | **`left_click_drag`** no slider de volume | `get output volume of (get volume settings)` entre 30..70 (o cleanup restaura) |
| AV15 | TextEdit type + select-all + bold | textedit-bold-multistep | `com.apple.TextEdit` | `type` → teclado Cmd+A → Cmd+B | o fonte RTF salvo contém o marcador + uma control word RTF de negrito (`\b`) |
| AV16 | System Settings toggle Dock magnification | settings-navigate-toggle | `com.apple.systempreferences` | navegar no pane + `left_click` em um switch | `defaults read com.apple.dock magnification` alternado em relação ao original capturado (o cleanup restaura) |
| AV17 | Copy from TextEdit, paste into Notes | clipboard-cross-app | `com.apple.TextEdit` | copiar + `open_application` Notes + nova nota + colar | uma nota do Notes contém `clipme-cross-av17` (o cleanup a remove) |

### AV18-AV50 (33 novos cenários — expansão para 10 categorias)

| ID | Name | Class | App | Caminho de act | Verificação independente |
|----|------|-------|-----|----------|--------------------|
| AV18 | TextEdit type + italic | textedit-italic-multistep | `com.apple.TextEdit` | `type` → Cmd+A → Cmd+I | o RTF salvo tem o marcador + a control word RTF de itálico (`\i`) |
| AV19 | TextEdit type + underline | textedit-underline-multistep | `com.apple.TextEdit` | `type` → Cmd+A → Cmd+U | o RTF salvo tem o marcador + a control word RTF de sublinhado (`\ul`) |
| AV20 | TextEdit select-all + clear | textedit-selectall-clear | `com.apple.TextEdit` | teclado Cmd+A → Backspace | `text of document 1` está vazio |
| AV21 | TextEdit 3 separate lines | textedit-multiline | `com.apple.TextEdit` | `type` de `alpha\nbeta\ngamma` | o doc tem as 3 palavras + >=2 quebras de linha |
| AV22 | TextEdit find & replace all | textedit-find-replace | `com.apple.TextEdit` | Edit>Find>Replace, digitar, Replace All | o texto do doc == `bar alpha bar` (sem `foo`) |
| AV23 | Finder rename file | finder-rename | `com.apple.finder` | Return → `type` do novo nome → Return | FS: `newname-av23.txt` existe, `oldname` sumiu |
| AV24 | Finder navigate nested folder | finder-navigate-nested | `com.apple.finder` | double-`left_click` na subpasta | o `target` da janela da frente termina com `outer/inner` |
| AV25 | Finder move file to Trash | finder-trash | `com.apple.finder` | selecionar + Cmd+Backspace | o arquivo de origem sumiu (o cleanup o restaura a partir do Lixo) |
| AV26 | Finder duplicate file (Cmd+D) | finder-duplicate | `com.apple.finder` | selecionar + Cmd+D | >=2 arquivos correspondendo a `dupme-av26*` |
| AV27 | Finder create named folder | finder-new-folder | `com.apple.finder` | Cmd+Shift+N → `type` do nome | o dir `/tmp/av27-newfolder/AV27Folder` existe |
| AV28 | Safari type URL in address bar | browser-type-url | `com.apple.Safari` | `open_application` + Cmd+L + `type` da URL | `URL of front document` termina com `av28-fixture.html` |
| AV29 | Safari new tab (Cmd+T) | browser-new-tab | `com.apple.Safari` | teclado Cmd+T | `count tabs of front window` >= 2 |
| AV30 | Safari click link to navigate | browser-click-link | `com.apple.Safari` | `left_click` no elemento de link | `URL of front document` termina com `av30-b.html` |
| AV31 | System Settings toggle Dock auto-hide | settings-dock-autohide | `com.apple.systempreferences` | navegar + `left_click` no switch | `defaults com.apple.dock autohide` alternado (restaurado) |
| AV32 | Finder Settings toggle filename extensions | finder-settings-toggle | `com.apple.finder` | Cmd+, → Advanced → checkbox | `defaults com.apple.finder AppleShowAllExtensions` alternado (restaurado) |
| AV33 | Clipboard cut | clipboard-cut | `com.apple.TextEdit` | Cmd+A → Cmd+X | `pbpaste` tem o marcador E o doc está vazio |
| AV34 | Clipboard partial-select copy | clipboard-partial-copy | `com.apple.TextEdit` | `select_text` de "BETA" → Cmd+C | `pbpaste` == `BETA` |
| AV35 | TextEdit edit opened file + save | textedit-edit-save | `com.apple.TextEdit` | selecionar+`type` → Cmd+S | o arquivo em disco contém `av35-new` |
| AV36 | Terminal redirect to file | terminal-write-file | `com.apple.Terminal` | `type` de `echo … > file` | `/tmp/av36-out.txt` contém o marcador |
| AV37 | Notes create + type body | notes-body | `com.apple.Notes` | nova nota + `type` do corpo via **entrada real de teclas** | o corpo de uma nota contém `AV37_BODY_MARKER` — persiste APENAS via entrada real de teclas; um value-set padrão de elemento NÃO confirma (veja [reconciliação da escrita no corpo do Notes](#reconciliação-da-escrita-no-corpo-do-notes)) |
| AV38 | TextEdit window resize (edge drag) | window-resize-drag | `com.apple.TextEdit` | **`left_click_drag`** corner→coordinate | `bounds of front window` mudou (restaurado) |
| AV39 | Finder switch to List view | finder-view-list | `com.apple.finder` | Cmd+2 / menu View | `current view of front window` == `list view` |
| AV40 | Finder switch to Column view | finder-view-column | `com.apple.finder` | Cmd+3 / menu View | `current view of front window` == `column view` |
| AV41 | Calculator memory m+ then mr | calculator-memory | `com.apple.calculator` | `left_click` de elemento: 5, m+, AC, mr | o display lê `5` |
| AV42 | Calculator decimal 2.5+2.5 | calculator-decimal | `com.apple.calculator` | `left_click` de elemento incl. `.` | o display lê `5` |
| AV43 | Finder Get Info (context menu) | finder-context-menu | `com.apple.finder` | right-click + `left_click` no item de menu | existe uma janela "Info" do Finder |
| AV44 | TextEdit close + Don't Save dialog | dialog-discard-unsaved | `com.apple.TextEdit` | Cmd+W → `left_click` em Don't Save | 0 janelas do TextEdit abertas |
| AV45 | TextEdit select-word + replace | textedit-select-replace | `com.apple.TextEdit` | selecionar "REPLACEME" → `type` de "DONE" | doc == `alpha DONE gamma` |
| AV46 | Open Activity Monitor | app-launch-activity-monitor | `com.apple.ActivityMonitor` | `open_application` | `pgrep -x "Activity Monitor"` em execução |
| AV47 | TextEdit new document (Cmd+N) | textedit-new-document | `com.apple.TextEdit` | teclado Cmd+N | >=2 janelas do TextEdit |
| AV48 | Finder new window (Cmd+N) | finder-new-window | `com.apple.finder` | teclado Cmd+N | >=2 janelas do Finder |
| AV49 | Notes remove a note | notes-remove | `com.apple.Notes` | selecionar + Backspace + confirmar | a nota chamada `AV49_REMOVEME_MARKER` sumiu |
| AV50 | Calculator chain 6+6+6 | calculator-chain | `com.apple.calculator` | `left_click` de elemento com `+` encadeado | o display lê `18` |

### AV51-AV65 (mais 15 — ações de elemento de alvo único confiáveis)

Viés para ações de elemento de alvo único CONFIÁVEIS que exercitam o caminho de
element-target a11y-first: mais `Invoke` botão a botão no Calculator,
`set_value` no TextEdit sobre uma única área de texto (`set_value` no Notes é o
contra-caso deliberadamente NÃO-comprometido — veja [reconciliação da escrita no corpo do Notes](#reconciliação-da-escrita-no-corpo-do-notes)), ativação de checkbox no
System Settings, `perform_action` no Finder e cenários de app-launch + element-click
(Preview, Dictionary, Font Book, Character Viewer). Todo prompt de tarefa
conduz o model ao verbo de ativação NEUTRO ("press/activate") e a ler a lista
`actions` do elemento para o verbo que o backend anuncia — nunca embute um nome
`AX*` privado do macOS (veja
`test_scenario_tasks_have_no_platform_private_ax_tokens`).

| ID | Name | Class | App | Caminho de act | Verificação independente |
|----|------|-------|-----|----------|--------------------|
| AV51 | Calculator 9−3=6 (Invoke) | calculator-subtract-invoke | `com.apple.calculator` | `left_click` de elemento nos botões 9,−,3,= | o display lê `6` |
| AV52 | Calculator 6×7=42 (Invoke) | calculator-multiply-invoke | `com.apple.calculator` | `left_click` de elemento em 6,×,7,= | o display lê `42` |
| AV53 | Calculator 64−28=36 (Invoke) | calculator-subtract-multidigit-invoke | `com.apple.calculator` | `left_click` de elemento multidígito | o display lê `36` |
| AV54 | TextEdit set_value replace | textedit-set-value-replace | `com.apple.TextEdit` | `set_value` na área de texto | o doc tem `AV54_DONE` e não `AV54_OLD_MARKER` |
| AV55 | TextEdit set_value 2 lines | textedit-set-value-multiline | `com.apple.TextEdit` | `set_value` de duas linhas | o doc tem as duas linhas |
| AV56 | TextEdit set_value clear | textedit-set-value-clear | `com.apple.TextEdit` | `set_value` para `''` | o doc está vazio |
| AV57 | Notes set_value body | notes-set-value-body | `com.apple.Notes` | `set_value` na área de texto do corpo | **não-persistência conhecida**: `set_value` no corpo do Notes é sem compromisso (aceito e ecoado, nunca confirmado) — NÃO é uma regressão de produto (veja [reconciliation](#reconciliação-da-escrita-no-corpo-do-notes)) |
| AV58 | Notes title known-limitation | notes-title-known-limitation | `com.apple.Notes` | inspecionar / confirmar | **KNOWN LIMITATION (xfail)**: o Notes NÃO tem elemento de título separado (título = primeira linha do corpo), então um `set_value` de título não tem alvo definível — ponturado à parte (`KNOWN_LIMITATION`), NÃO é PASS e NÃO é FAIL de produto (veja [reconciliation](#reconciliação-da-escrita-no-corpo-do-notes)) |
| AV59 | Settings toggle "Show recent applications" | settings-dock-show-recents | `com.apple.systempreferences` | `perform_action`/`left_click` no checkbox | `defaults com.apple.dock show-recents` alternado (restaurado) |
| AV60 | Settings toggle "Minimize into app icon" | settings-dock-minimize-to-app | `com.apple.systempreferences` | `perform_action`/`left_click` no checkbox | `defaults com.apple.dock minimize-to-application` alternado (restaurado) |
| AV61 | Finder `perform_action` select file | finder-perform-action | `com.apple.finder` | `perform_action`/`left_click` na linha do arquivo | `selection` do Finder == `[pickme-av61.txt]` |
| AV62 | Preview close image window | preview-close-window | `com.apple.Preview` | Cmd+W / botão de fechar | o Preview tem 0 janelas abertas |
| AV63 | Dictionary search field type | dictionary-search | `com.apple.Dictionary` | focar o campo + `type` + Return | o campo de busca contém `apple` |
| AV64 | Open Font Book + click sidebar | app-launch-font-book | `com.apple.FontBook` | `open_application` + `left_click` | `pgrep "Font Book"` em execução + janela presente |
| AV65 | Character Viewer open + click category | app-launch-character-viewer | `com.apple.CharacterPaletteIM` | `open_application` + `left_click` | `pgrep CharacterPalette` em execução |

### AV66-AV80 (mais 15 — element-target / set_value / defaults-toggle confiáveis)

| ID | Name | Class | App | Caminho de act | Verificação independente |
|----|------|-------|-----|----------|--------------------|
| AV66 | Calculator 14+9=23 (Invoke) | calculator-add-multidigit-invoke | `com.apple.calculator` | `left_click` de elemento em 1,4,+,9,= | o display lê `23` |
| AV67 | Calculator 7×8=56 (Invoke) | calculator-multiply-invoke | `com.apple.calculator` | `left_click` de elemento em 7,×,8,= | o display lê `56` |
| AV68 | Calculator 63÷9=7 (Invoke) | calculator-divide-invoke | `com.apple.calculator` | `left_click` de elemento em 6,3,÷,9,= | o display lê `7` |
| AV69 | TextEdit set_value replace marker | textedit-set-value-replace | `com.apple.TextEdit` | `set_value` na área de texto | o doc tem `AV69_DONE` e não `AV69_OLD_MARKER` |
| AV70 | TextEdit set_value 3 lines | textedit-set-value-multiline | `com.apple.TextEdit` | `set_value` de três linhas | o doc tem as três linhas |
| AV71 | TextEdit set_value clear | textedit-set-value-clear | `com.apple.TextEdit` | `set_value` para `''` | o doc está vazio |
| AV72 | Notes set_value body | notes-set-value-body | `com.apple.Notes` | `set_value` no corpo | **não-persistência conhecida**: `set_value` no corpo do Notes é sem compromisso — NÃO é uma regressão de produto (veja [reconciliation](#reconciliação-da-escrita-no-corpo-do-notes)) |
| AV73 | Notes title known-limitation | notes-title-known-limitation | `com.apple.Notes` | inspecionar / confirmar | **KNOWN LIMITATION (xfail)**: o Notes NÃO tem elemento de título separado (título = primeira linha do corpo) — ponturado à parte (`KNOWN_LIMITATION`), NÃO é PASS e NÃO é FAIL de produto (veja [reconciliation](#reconciliação-da-escrita-no-corpo-do-notes)) |
| AV74 | Finder `perform_action` select (alpha) | finder-perform-action | `com.apple.finder` | `perform_action`/`left_click` na linha do arquivo | `selection` do Finder == `[alpha-av74.txt]` |
| AV75 | Finder `perform_action` select (gamma, decoys) | finder-perform-action | `com.apple.finder` | `perform_action`/`left_click` na linha correta | `selection` do Finder == `[gamma-av75.txt]` |
| AV76 | Safari navigate via address bar | safari-address-bar-navigate | `com.apple.Safari` | Cmd+L + `type` da URL `file://` + Return | `URL of front document` termina com `av76-fixture.html` |
| AV77 | Dictionary search field type | dictionary-search | `com.apple.Dictionary` | focar o campo + `type` + Return | o campo de busca contém `ocean` |
| AV78 | Finder toggle Show Path Bar | finder-view-pathbar-toggle | `com.apple.finder` | Opt+Cmd+P / menu View | `defaults com.apple.finder ShowPathbar` alternado (restaurado; veja abaixo) |
| AV79 | Finder toggle Show Status Bar | finder-view-statusbar-toggle | `com.apple.finder` | Cmd+/ / menu View | `defaults com.apple.finder ShowStatusBar` alternado (restaurado; veja abaixo) |
| AV80 | TextEdit set_value target phrase | textedit-set-value-marker | `com.apple.TextEdit` | `set_value` na área de texto | o doc contém `AV80_TARGET_PHRASE` |

### Recuperação de três estados dos defaults do Finder em AV78/AV79

AV78/AV79 alternam um default de usuário do Finder (`com.apple.finder ShowPathbar` /
`ShowStatusBar`) e precisam restaurar a configuração EXATA original do usuário
depois. `read_defaults_bool` colapsa "chave ausente", "leitura falhou" e `False`
explícito em um único `False` — ok para uma sondagem, mas LOSSY para
captura/restauração: uma chave que estava AUSENTE seria restaurada como
`-bool false`, deixando para trás uma chave sintética. Por isso AV78/AV79 usam o
leitor de três estados `read_defaults_state(domain, key) -> (exists, value)`:

- chave presente + `1` → `(True, True)` → cleanup `defaults write ... -bool true`
- chave presente + `0` → `(True, False)` → cleanup `defaults write ... -bool false`
- chave ausente (`defaults read` reports "does not exist") → `(False, False)` →
  cleanup `defaults delete com.apple.finder <key>` (preserva o estado "não definido")
- qualquer OUTRA falha de leitura (timeout / domínio inválido / valor
  intratável) → `RuntimeError` → **setup falha** (`setup-error`), então o cenário
  NÃO roda com um cleanup em que não pode confiar

O cleanup também protege o caso não capturado: se o setup falhou antes de capturar
(`_CAPTURED[s.sid]` não tem entrada `exists`), o cleanup deixa os defaults
intactos — o cenário nunca os alternou, então não há nada a restaurar. Verificado
por testes unitários para os três estados originais, além dos caminhos de falha
de leitura e não capturado (`tests/test_cua_act_verify.py`).

### Ciclo de vida: try/finally unificado (setup → drive → verify → cleanup)

`run_one` envolve setup + drive + verify em UM `try/finally` para que o
**cleanup de melhor esforço sempre rode depois que o setup foi tentado** — mesmo
quando o setup retorna um `setup-error`, o drive do model expira ou
`verify_scenario` lança uma exceção. Uma exceção lançada é registrada no registro
(`status=ERROR`/`SETUP_ERROR`, `error=...`) para que um cenário ruim nunca
aborte a suíte inteira, mas ela **nunca é mascarada**: uma exceção no cleanup é
capturada separadamente em `cleanup_status` e nunca sobrescreve o `error`
original. `result.json` é escrito exatamente uma vez, no `finally`, para todo
caminho. Essa é a garantia que torna a captura/restauração dos defaults do Finder
em AV78/79 (e todo outro setup com estado) segura em caminhos de falha parcial.

### Requisito de verificação em macOS real

Estes 80 cenários são **testes de GUI live no macOS**, não testes unitários
herméticos. Eles só fazem sentido quando executados em hardware macOS real (ou em
uma VM macOS com desktop visível) com:

- o **console desbloqueado** (atrás do escudo do loginwindow o AX retorna
  `-25211` e os AppleEvents expiram — veja a seção de preflight);
- **Acessibilidade** concedida ao executável python/uv que roda o servidor
  (`AXIsProcessTrusted() == true`);
- **Input Monitoring** concedido ao mesmo executável (para os caminhos de
  fallback de tecla bruta que o model usa quando a árvore AX de um app está
  momentaneamente vazia);
- a **fonte de entrada de teclado ativa definida como um layout latino**
  (ABC / U.S.) — um IME CJK (por exemplo Pinyin) corrompe a digitação cega do
  harness (o preflight avisa);
- o **backlog "Untitled N" do TextEdit no iCloud limpo** — o TextEdit restaura
  esses documentos autosalvos na inicialização e eles sombreiam o documento da
  frente (o preflight reporta a contagem; o harness nunca os apaga);
- as **credenciais do GLM-5V-Turbo** em `~/.zcode/v2/config.json` (chamadas
  cobradas).

**Isolamento de janela** por cenário (TextEdit/Finder): antes de cada cenário o
harness roda um reset hermético que recolhe SOMENTE os documentos/janelas que a
própria suíte criou nesta execução (rastreados por um registro de propriedade com
carimbo). A identidade do documento do TextEdit é lida da **árvore AX do System
Events** (`AXTitle` da janela + `AXDocument`), nunca do dicionário do app
`path of d` (que lança erro na coerção para um documento novo não salvo no macOS
26 Tahoe e levaria todo cenário de TextEdit a `SETUP_ERROR`). O close com
`saving no` do reset re-verifica a identidade completa de cada documento e o
fecha na MESMA passagem de AppleScript (sem corrida snapshot→close), condicionado
a uma correspondência de identidade inequívoca, exata e lendo de forma limpa — ele
prefere deixar um documento Untitled do harness aberto a qualquer risco de
descartar um documento do usuário.

Eles são pulados/bloqueados (não falham) quando essas condições não valem. Os
testes unitários em `tests/test_cua_act_verify.py` +
`tests/test_act_verify_teardown.py` fixam as definições de cenário, o
roteamento de verificação, a guarda de tokens AX, a restauração de três estados e
o contrato try/finally **hermeticamente** (sem GUI, sem rede) — eles rodam na CI
a cada push. A matriz live é o portão de aceitação humano/cobrado e é executada
manualmente (`python3 scripts/cua_act_verify.py --ts-server`) em um console
desbloqueado.

### Cobertura da taxonomia de 10 categorias

- **1. Edição de texto** (digitar/selecionar/formatar/buscar/substituir): AV03,
  AV04, AV11, AV15, AV18 (itálico), AV19 (sublinhado), AV20 (select-all+clear),
  AV21 (multi-linha), AV22 (find-replace), AV45 (select-replace) — negrito/itálico/
  sublinhado via control words RTF `\b`/`\i`/`\ul`; find-replace e select-replace
  são padrões distintos.
- **2. Gerenciamento de arquivos** (criar/abrir/renomear/excluir/navegar): AV05,
  AV12, AV13, AV23 (renomear), AV24 (navegar aninhado), AV25 (mover para o Lixo),
  AV26 (duplicar), AV27 (nova pasta) — todos verificados pelo sistema de
  arquivos, todas as fixtures sob `/tmp`.
- **3. Navegador web** (navegar/buscar/aba/bookmark): AV28 (digitar URL), AV29
  (nova aba), AV30 (clicar em link) — Safari, verificado via `URL of front
  document` + `count tabs`; páginas de fixture `file://` locais para execuções
  offline-determinísticas.
- **4. Configurações do sistema** (alternar/configurar/verificar): AV14 (slider
  de volume), AV16 (magnificação do Dock), AV31 (auto-ocultar do Dock), AV32
  (extensões de nome de arquivo) — cada um captura o valor original de `defaults`
  no setup e o restaura no cleanup (`killall Dock`/`killall Finder` aplica a
  restauração ao vivo).
- **5. Área de transferência** (copiar/colar/cortar/entre apps): AV08 (copiar),
  AV17 (colar entre apps), AV33 (cortar — verifica a origem esvaziada E a área de
  transferência com o conteúdo), AV34 (cópia de seleção parcial — `pbpaste` deve
  ser exatamente igual a `BETA`).
- **6. Fluxos multi-etapa** (encadeamento): AV15, AV17, AV35 (editar+salvar
  arquivo existente), AV36 (redirecionamento do terminal para arquivo), AV37
  (notes create+body), AV45.
- **7. Arrastar e soltar**: AV13 (arquivo→pasta no Finder), AV14 (slider de
  volume), AV38 (redimensionar janela pela borda — `left_click_drag`
  corner→coordinate, bounds verificados).
- **8. Busca e navegação**: AV05, AV12, AV24, AV39 (List view), AV40 (Column
  view), AV43 (menu de contexto / Get Info), AV47/AV48 (nova janela via Cmd+N).
- **9. Calculadora/matemática**: AV01, AV02, AV10, AV41 (memória m+/mr), AV42
  (decimal), AV50 (soma encadeada), AV51-AV53 (subtração/multiplicação via Invoke
  de elemento), AV66-AV68 (soma/multiplicação/divisão via Invoke de elemento) —
  doze padrões de cálculo distintos, o conjunto AV51+ enviesado para Invoke de
  element-target.
- **10. Diálogos e notificações**: AV43 (menu de contexto com right-click), AV44
  (descarte no diálogo Don't Save), AV49 (alerta de confirmação de remoção no
  Notes).

A expansão AV51-AV80 exercita adicionalmente o **contrato de element-target
a11y-first**: `set_value` em uma única área de texto conhecida (AV54-AV56,
AV69-AV71, AV80 TextEdit — com compromisso; AV57, AV72 corpo do Notes —
**deliberadamente sem compromisso**; AV58, AV73 título do Notes — **KNOWN_LIMITATION
/ xfail** (sem elemento de título separado), veja [reconciliação da escrita no corpo do Notes](#reconciliação-da-escrita-no-corpo-do-notes)), seleção de elemento por
`perform_action`/`left_click` (AV61, AV74, AV75 Finder), ativação de checkbox por
`perform_action` (AV59-AV60 System Settings), app-launch + element-click (AV62
Preview, AV63/AV77 Dictionary, AV64 Font Book, AV65 Character Viewer),
navegação pela barra de endereços do Safari (AV76) e alternâncias de defaults
pelo menu View do Finder (AV78-AV79).

### Reconciliação da escrita no corpo do Notes

Cobre **AV37** (`type` no corpo — com compromisso), **AV57 / AV72** (`set_value` no
corpo — contra-caso sem compromisso), **AV58 / AV73** (título — KNOWN_LIMITATION /
xfail, sem elemento de título separado) e o paste entre apps **AV17**.

**Realidade confirmada.** O corpo da nota do Notes é uma text view rich-text /
com apoio web. Uma escrita direta de valor via acessibilidade — `set_value`, ou o
`type` padrão sobre um element target (ambos passam pelo caminho de value-set
a11y-first) — é *aceita e ecoada de volta pela acessibilidade* mas **NÃO é
confirmada no modelo de documento da nota**. A verificação independente lê a nota
pelo dicionário AppleScript do Notes (a camada do model), então corretamente não
vê nenhum marcador. Isso é específico do Notes: o mesmo `set_value` no `NSTextView`
do TextEdit (AV54-AV56, AV69-AV71, AV80) **confirma** e persiste. Confirmado na
execução macOS de 80 cenários (AV37 `type` padrão, AV57 / AV72 `set_value` todos
liram `marker=False`) e por uma sondagem live de backend (`element_set_value`
atualiza apenas a sombra AX; `element_focus` + teclas reais acrescentam no cursor
e passam pelo caminho normal de inserção de texto do app). A ferramenta agora
expõe isso via `keyboard_hints._non_committal_rich_text_warning`: `type`/`set_value`
acrescentam um WARNING nesse caminho, guiando o model para a entrada real de
teclas.

**Expectativa reconciliada (para que isso pare de ser lido como regressão de
produto):**

- **AV37 — apenas o caminho com compromisso.** O sucesso (o corpo da nota persiste
  `AV37_BODY_MARKER`) exige **entrada real de teclas**: trazer o Notes para o
  primeiro plano e `type` com `strategy=event` (ou teclas com escopo de app) no
  corpo em foco. Um value-set padrão de elemento é esperado a NÃO persistir e não
  pode ser pontuado como caminho de sucesso. Isso mantém AV37 como um teste
  significativo de "inserir texto no Notes que realmente fica", alinhado à
  dica publicada.
- **AV57 / AV72 — sem compromisso conhecido (`set_value`).** `set_value` no corpo do
  Notes é o **contra-caso deliberadamente sem compromisso** em relação aos cenários
  de `set_value` no TextEdit: a ferramenta corretamente faz ACK (`Value set`) e
  agora AVISA, e o modelo da nota é esperado a NÃO receber a escrita. Trate um
  não-persistir aqui como **comportamento esperado, não um `backend_fail`** — a
  alternativa com compromisso é a entrada real de teclas no estilo AV37.
- **AV58 / AV73 — KNOWN_LIMITATION / xfail (sem campo de título), classificados
  ESTATICAMENTE.** O Notes não expõe elemento de título separado; o "título" é a
  primeira linha da única área de texto do corpo, então uma ação de "definir o
  campo de título" **não tem alvo definível algum**. Este é um **fato estrutural
  sobre a árvore a11y do app, não uma observação por execução**, então esses sids
  são classificados como `KNOWN_LIMITATION` no **início de `run_one`, ANTES de
  qualquer setup / env-probe / model drive** — **nenhuma chamada de model paga é
  feita**, e estruturalmente não existe resultado de model drive no qual um `429` /
  timeout / erro de credencial possa ser mascarado (o caminho de drive nunca é
  entrado). Eles são excluídos do denominador válido da taxa de PASS e
  deliberadamente **não** são roteados pelo body-write
  `score_notes_noncommittal_setvalue` (cuja checagem de warning não faz sentido
  para um título). Uma limitação de AX do app documentada, nem um PASS nem um
  `backend_fail` de produto, e que nunca pode se tornar um PASS falso.
- **AV17** (paste entre apps em uma nota nova) compartilha o mesmo requisito de
  compromisso: paste (um evento real de tecla) no corpo *em foco* persiste; um
  value-set não persistiria.

**Pontuação do harness (reconciliada — `scripts/cua_act_verify.py`).** O harness
agora concorda com esta spec:

- **AV57 / AV72 (`set_value` no corpo)** são pontuados a partir da transcrição do
  model por `score_notes_noncommittal_setvalue` (despachado em `run_one`, que tem a
  transcrição), e NÃO por uma leitura de persistência: PASS = a ferramenta
  exercitou o value-set E expôs o warning de não-compromisso (`may NOT commit it to
  the document`); um marcador ausente é ESPERADO e não é um `FAIL_VERIFY`.
  `verify_scenario` NÃO tem ramo de persistência para esses sids (removido), então
  nunca pode reintroduzir a contradição. O conjunto é fixado por
  `NOTES_NONCOMMITTAL_SET_VALUE = {"AV57", "AV72"}`.
- **AV58 / AV73 (título) são um bucket separado de KNOWN_LIMITATION / xfail,
  classificados ESTATICAMENTE** — `KNOWN_LIMITATION_SIDS = {"AV58", "AV73"}`. O
  Notes **não expõe elemento de título separado** (o título é apenas a primeira
  linha da única área de texto do corpo), então uma ação de "definir o campo de
  título" não tem alvo definível algum — um fato estrutural, não uma observação por
  execução. `run_one` faz curto-circuito nesses sids para
  `status = "KNOWN_LIMITATION"` (`verify_passed = False`, string de evidence fixa)
  no **seu topo, antes de setup / env-probe / `drive_model`**, então **nenhuma
  chamada de model paga é feita** e nenhum resultado de infra/drive pode ser
  engolido em uma limitação conhecida. Eles **NÃO** são roteados por
  `score_notes_noncommittal_setvalue` (essa checagem de warning de body-write não
  faz sentido para um campo de título) e **NÃO** por uma leitura de persistência.
  KNOWN_LIMITATION é excluído do denominador válido da taxa de PASS (como
  `env_offspace` / `BLOCKED_INFRA`): não é nem um PASS nem um `backend_fail` de
  produto, e nunca pode se tornar um PASS falso.
- A tarefa **AV37** conduz ao caminho de entrada real de teclas com compromisso
  (`type` com teclas de app_ref na nota nova em foco, ou `type` com
  `strategy=event` no elemento do corpo); sua verificação ainda exige persistência
  (`AV37_MARKER` no corpo da nota) porque a entrada real de teclas DE fato
  confirma. Cobertura unitária: `tests/test_cua_act_verify.py`
  (`test_score_notes_noncommittal_*`, `test_run_one_scores_av57_pass_from_transcript`,
  `test_run_one_scores_av58_av73_known_limitation_without_any_model_call`,
  `test_known_limitation_sids_not_in_noncommittal_set`,
  `test_verify_scenario_does_not_read_persistence_for_notes_setvalue`).

### Notas de design AV13-AV17 (arrastar + multi-etapa)

Estes cinco expandem a suíte de click/type/set_value para os dois caminhos que a
matriz anterior não cobria: o gesto **`left_click_drag`** (a correção P0 de
mouse-orphan !171 — um gesto de ponteiro bruto que precisa acertar o app em
primeiro plano com fechamento TOCTOU verify→use em ambas as pontas) e o **CUA
multi-etapa**, onde um único cenário encadeia várias ferramentas de act.

- **AV13 (arrastar no Finder)** — o teste canônico de arrasto: um arquivo
  `moveme.txt` é arrastado sobre uma pasta `DestFolder`. A verificação é uma
  **checagem pura do sistema de arquivos** (`DestFolder/moveme.txt` existe E a
  origem sumiu) — independente da árvore AX do Finder e da alegação do model.
  Reversível: toda a fixture vive sob `/tmp/av13-drag/` e é removida com
  `rmtree` no cleanup.
- **AV14 (arrastar o slider de volume)** — exercita um arrasto de slider no System
  Settings. A verificação independente é `get output volume of (get volume
  settings)`, um canal que o model não consegue forjar. O setup define o volume
  como 10 para que um arrasto no meio seja uma mudança inequívoca (janela-alvo
  30..70); o cleanup restaura o original capturado.
- **AV15 (digitar + negrito)** — uma cadeia multi-etapa `type` → Cmd+A → Cmd+B. A
  verificação salva `document 1` em `/tmp/av15-bold.rtf` e inspeciona o **fonte
  RTF** pela control word literal `\b` de negrito — um sinal determinístico,
  independente do model, de que o negrito foi de fato aplicado. O setup força um
  documento rich-text (alterna plain→rich via Shift+Cmd+T só quando necessário)
  para que o Cmd+B tenha efeito.
- **AV16 (alternar a magnificação do Dock)** — uma navegação no System Settings +
  alternância de um switch. A verificação lê `defaults com.apple.dock
  magnification` e confirma que ele **alternou** em relação ao valor capturado no
  setup. Este é o padrão de alternância reversível: o setup registra o original, o
  cleanup o grava de volta via `defaults write` + `killall Dock`. (A posição
  anterior de "deliberadamente não incluído" fica superada para esta alternância
  especificamente porque a captura→restauração a torna reversível; uma
  alternância destrutiva/irreversível continua fora de escopo.)
- **AV17 (área de transferência entre apps)** — copiar do TextEdit,
  `open_application` Notes, nova nota, colar. A verificação junta títulos +
  corpos das notas e procura o marcador (`read_notes_titles` +
  `read_notes_bodies`, ambos via AppleScript). O cleanup apaga a nota (mesmo padrão
  de AV06).

`left_click_drag` foi adicionado a `ACT_TOOLS` para que as trajetórias de
chamada de ferramenta dos cenários de arrasto sejam registradas como "model
acted" (caso contrário uma execução puramente de arrasto seria classificada
erroneamente como `FAIL_NO_ACT`).

## Por que a verificação é determinística

Cada verificador lê o pós-estado por um canal que o model não consegue influenciar
alegando sucesso:

- **AppleScript** lê o próprio modelo de dados do app (`text of document 1`,
  `selection`, `name of every note`, `contents` do terminal). O model nunca vê
  essas chamadas; elas rodam a partir do harness.
- **`pbpaste`** lê a área de transferência diretamente.
- **O display do Calculator** não tem dicionário AppleScript, então é lido via
  elementos de UI do System Events (o mesmo AX que o model leria, mas a partir do
  harness).
- Um poll de `wait_for` (≤8s) absorve o pequeno atraso assíncrono entre a última
  ação do model e o app confirmar o estado.

`PASS` exige AMBOS `model_acted` (o model de fato disparou uma ferramenta de act
— analisado a partir das linhas `[tool→]` no stdout redigido do `e2e_opus`) E
`verify_passed`. Isso elimina os dois modos de falha que um loop observe-only não
consegue detectar: o model alegando sucesso sem agir, e o model agindo sobre o
alvo errado.

## Artefatos gravados (por cenário)

```
artifacts/act-verify/
├── preflight.json            # environment gate evidence
├── summary.json              # pass/blocked tally + all records
└── <SCENARIO>/
    ├── result.json           # status, tool_calls[], verify_evidence, paths
    ├── e2e_opus.stdout       # redacted model log (tool I/O previews)
    ├── e2e_opus.stderr
    └── ledger/
        ├── manifest.json     # recording ledger (!179) schema + session key
        └── frames.jsonl      # every tool call: redacted input + result + duration
                              # + the backend method that crossed the OS boundary
```

O `frames.jsonl` do ledger é o substrato do caminho de operação: `kind=tool_call`
(Hook A, toda ferramenta), `kind=mutation` (Hook B via ActionExecutor, toda
atuação) e `kind=backend_call` (o método exato do SO). Todos os três compartilham
um `seq` monotônico, então um consumidor pode reproduzir a trajetória causal
completa de um PASS ou de um FAIL_VERIFY.
