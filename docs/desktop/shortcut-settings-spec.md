# Spec de Configurações de Atalhos（Shortcut Settings）

As configurações de atalhos oferecem vinculações de comandos da aplicação no nível do usuário. A primeira rodada cobre nova tarefa, abrir workspace, fechar o contexto atual, alternância de barra lateral／painel／terminal, busca de tarefas, navegação anterior e posterior na sessão, avançar e voltar no histórico, centro de comandos e zoom da página. Enter, Escape, Tab e Space mantêm a interação fixa dos componentes. A configuração é salva por ID de comando, com retorno ao valor padrão quando o valor está ausente ou é inválido; a mesma combinação só pode estar vinculada a um comando.

Este spec é a única base de implementação da funcionalidade; o princípio arquitetural é **que apenas o módulo de atalhos em todo o repositório conheça as teclas, e o restante do código só conheça IDs de comando**.

## 1. Objetivos e não objetivos

Objetivos：

- O usuário pode gravar e salvar qualquer combinação válida na página de configurações, com efeito imediato após salvar（nesta janela na hora, em outras janelas via sincronização, e no menu do desktop por reconstrução）.
- A tabela de comandos, os bindings padrão e a lógica de correspondência／gravação／conflito ficam concentrados em um módulo independente; adicionar um atalho configurável muda apenas um ponto da tabela de comandos em shared + o registro do handler no consumidor.
- O reconhecimento de combinações cobre: múltiplos modificadores（qualquer combinação de CmdOrCtrl／Ctrl／Alt／Shift）、Shift+letra, reescrita do layout Option do macOS（fallback por event.code）, IME em modo de composição（IME em modo de composição: isComposing／Process／Dead／229 não disparam）e ausência de disparo repetido em tecla longa com repeat.
- A semântica de teclas é consistente nos três sistemas operacionais（macOS／Windows／Linux）, com os dois temas, i18n e compatibilidade entre desktop／Web／celular.

Não objetivos：

- Atalhos globais de sistema（que respondem com o aplicativo sem foco, Electron `globalShortcut`）：mantém-se como está, sem introdução, e fica para uma extensão futura.
- Teclas de interação em nível de componente da caixa de entrada da sessão（Enter envia, Escape cancela, Tab indenta, navegação por G／números do TaskSearchDialog, ⏎ do GitActionMenu）não são configuráveis.
- Isolamento de atalhos por workspace: configuração global em nível de usuário, sem divisão por workspace.

## 2. Arquitetura e direção das dependências

```
┌────────────────────────────────────────────────────────────┐
│ packages/shared（única fonte de dados, dados puros + funções puras, sem DOM/Electron）  │
│  shortcutCommands.ts:                                       │
│   · tipos ShortcutCommandId / ShortcutChannel                 │
│   · tabela de comandos SHORTCUT_COMMANDS（id/canal/binding padrão/configurável）      │
│   · serialização parse/serialize/isValid（sintaxe compatível com Electron）     │
│  protocol.ts + validationAppSettings.ts:                     │
│   · campo AppSettings.shortcutBindings（três sincronizações: interface +    │
│     object schema + patch schema）                           │
└──────────────────────┬─────────────────────────────────────┘
                       │ todo código importa apenas daqui, sem criar conhecimento de teclas
        ┌──────────────┼──────────────────┐
        ▼              ▼                  ▼
┌──────────────┐ ┌─────────────┐ ┌────────────────────┐
│ ui/src/      │ │ ui/src/     │ │ processo main do   │
│ shortcuts/   │ │ settings/   │ │ desktopApplication │
│ （núcleo de execução）    │ │ Shortcut    │ │ Menu.ts:           │
│ · matcher geral   │ │ Settings    │ │ accelerator lê da tabela │
│ · gravador      │ │ Section.tsx │ │ efetiva e reconstrói │
│ · resolve da tabela│ │（UI de edição, │ │ no rebuild   │
│ efetiva│ │ │  só lê e escreve │ │（reaproveitando a    │
│ · detecção de conflito    │ │  dados）  │ │ cadeia SyncAppSettings → │
│ · hook de label │ └──────┬──────┘ │  syncImmediate      │
└──────┬───────┘        │        │  AppSettings existente）│
       │                │        └────────────────────┘
       ▼                ▼
  useAppKeyboard   useSettings（useSettingService.ts）
  （casca fina: evento →   já embutido: update() = settingService.update
  comando → handler）      + platform.syncAppSettings + refresh()
```

Regras rígidas da direção das dependências：

- `ui/src/shortcuts/` é o único dono do conhecimento de atalhos; `useAppKeyboard`, `ShortcutSettingsSection` e os consumidores de label apenas chamam sua API e não analisam strings de teclas.
- O serviço de configurações é apenas um repasse de dados para atalhos（`Record<ID de comando, string[]>`）, sem validação semântica; toda a validação semântica（formato／conflito／teclas reservadas）fica dentro do módulo de atalhos.
- Não adicionar IPC, não mexer no store principal do Zustand e não expandir BROADCAST_FIELDS. A sincronização entre janelas e a reconstrução do menu reaproveitam a cadeia de configurações（ver §6）.

## 3. Formato de serialização（convenção central do reconhecimento de combinações）

Adota-se um subconjunto da sintaxe compatível com accelerator do Electron, e a mesma string é usada para: persistência em setting.json, correspondência no renderer, repasse do accelerator do menu e transmissão entre processos.

```
binding   := modifier+ key
modifier  := "CmdOrCtrl" | "Ctrl" | "Alt" | "Shift" | "AltGr"
key       := [a-z] | [0-9] | "[" | "]" | "=" | "-" | "," | "." | "/" | "\\"
            | ";" | "'" | "`" | [A-Z]（normalizado para minúsculas na gravação; maiúsculas são inválidas）
            | "Plus" | "Minus" | "Equal"（apelidos de compatibilidade do menu, normalizados pelo núcleo）
            | "F1".."F12" | "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight"
            | "Home" | "End" | "PageUp" | "PageDown" | "Delete" | "Insert"
```

Regras：

- **A ordem dos modificadores é fixa**：`CmdOrCtrl → Ctrl → Alt → Shift → AltGr → key`. Após o parse, reserializar para normalizar（forma canônica）; uma string inválida devolve null no parse.
- **CmdOrCtrl é um modificador semântico**: no macOS corresponde a `metaKey && !ctrlKey`, no Windows／Linux corresponde a `ctrlKey && !metaKey`（seguindo a lógica de separação por plataforma de keyboardShortcuts.ts:165-173）; no menu, é repassado diretamente ao Electron.
- **Ctrl é o Ctrl explícito**: no macOS, gravar Ctrl+X produz `Ctrl+X`（o Ctrl do mac fica reservado para a edição em estilo Emacs do sistema e só é vinculado se o usuário escolher explicitamente）; no Windows／Linux, gravar o modificador principal sempre produz `CmdOrCtrl+X`, e `Ctrl+X` é tratado como `CmdOrCtrl` na correspondência nessas plataformas.
- **Shift+tecla uniformiza a tecla base em minúsculas**: gravar `Shift+P` produz `CmdOrCtrl+Shift+p`（não `P`）e `Shift+7` produz `CmdOrCtrl+Shift+7`（não `&`）. A implementação prefere `event.code` para voltar à tecla física base（`KeyP`→`p`、`Digit7`→`7`、`Equal`→`=`）, usando `event.key` apenas como fallback — essa é a única fonte confiável sob diferenças de layout（AZERTY, reescrita do Option no macOS）.
- **A correspondência é de modificadores exatos**: os quatro estados de modificador do evento são comparados um a um com o binding, e modificadores extras não contam como acerto（evita que Cmd+Ctrl+K dispare CmdOrCtrl+K）.
- **Correspondência de key**: acerto comparando `event.key` em minúsculas, ou via `event.code` com tabela de mapeamento de fallback（versão estendida do getExpectedShortcutCode existente, complementada com Equal／Minus／vírgula／ponto／barra／ponto e vírgula／aspas／crase／barra invertida）.
- **Filtro de IME e ruído**: `event.isComposing === true`、`key === "Process"`、`key === "Dead"`、`keyCode === 229` e `event.repeat === true` nunca correspondem nem são gravados. Nenhum comando global pode ser disparado por keydown durante a composição de um IME chinês.
- Binding de tecla única（sem modificador）é válido no formato e suportado na correspondência（exige os quatro modificadores falsos）, mas a tabela da primeira rodada não contém comandos de tecla única; a UI de gravação exige pelo menos um modificador（exceto F1-F12 e teclas de direção）.

## 4. Tabela de comandos（fonte única de verdade）

| ID do comando          | Canal   | Binding padrão                                                  |
| ---------------------- | ------- | ---------------------------------------------------------------- |
| openCommandCenter      | window  | `CmdOrCtrl+K`、`CmdOrCtrl+Shift+P`（dois padrões, o grupo inteiro é substituído） |
| openSettings           | window  | `CmdOrCtrl+,`（mac ⌘, / win·linux Ctrl+, convenção do sistema）      |
| findInTask             | window  | `CmdOrCtrl+F`                                                    |
| toggleSidebar          | window  | `CmdOrCtrl+B`                                                    |
| toggleTerminal         | window  | `CmdOrCtrl+J`                                                    |
| toggleSidePane         | window  | `CmdOrCtrl+Alt+B`                                                |
| previousConversation   | window  | `CmdOrCtrl+Shift+[`                                              |
| nextConversation       | window  | `CmdOrCtrl+Shift+]`                                              |
| navigateBack           | window  | `CmdOrCtrl+[`                                                    |
| navigateForward        | window  | `CmdOrCtrl+]`                                                    |
| newTask                | menu    | `CmdOrCtrl+N`                                                    |
| openWorkspace          | menu    | `CmdOrCtrl+O`                                                    |
| closeActiveContext     | menu    | `CmdOrCtrl+W`                                                    |
| zoomIn                 | menu    | `CmdOrCtrl+=`（o menu mantém o padrão de duas entradas: Plus visível + `=` oculto） |
| zoomOut                | menu    | `CmdOrCtrl+-`                                                    |
| resetZoom              | menu    | `CmdOrCtrl+0`                                                    |

- Canal `window`: distribuído por `useAppKeyboard` no renderer, com efeito consistente nas três pontas.
- Canal `menu`: accelerator do menu do aplicativo desktop（processo main）; comandos do canal menu ficam esmaecidos na página de configurações de Web／celular com a marcação 「仅桌面端生效」, e os comandos do canal window são configuráveis nas três pontas.
- Campos de cada item da tabela：`id`、`channel`、`defaultBindings: string[]`、`configurable`（tudo true na primeira rodada, campo preservado）. O nome de exibição do comando usa a chave i18n `settings.shortcuts.command.<id>`.
- Nota histórica: o protótipo estático do branch listava 12 itens e omitia findInTask／previousConversation／nextConversation, e navigateBack／Forward foram marcados por engano como «tarefa anterior／seguinte» — esta tabela é a correção oficial.

## 5. Modelo de configuração e persistência

- `AppSettings.shortcutBindings?: Record<string, string[]>` — **guarda apenas os overrides do usuário**; comandos sem override não são persistidos e, na leitura, são mesclados com os padrões da tabela. Semântica do override: substituição do grupo inteiro（quando openCommandCenter é sobrescrito, os dois bindings padrão deixam de valer ao mesmo tempo e dão lugar ao grupo gravado pelo usuário）.
- Sincronização em três pontos do schema: a interface `AppSettings` em `protocol.ts`, o `appSettingsObjectSchema` em `validationAppSettings.ts`（`z.record(z.string(), z.array(z.string())).optional()`）e o `appSettingsPatchSchema`（mesma forma opcional）. O zod remove campos desconhecidos por padrão, então esquecer o patch schema faz a atualização se perder silenciosamente.
- O schema só valida o formato; a validação semântica（se o ID do comando existe, se o binding é válido）é feita de forma tolerante na etapa de resolve da tabela efetiva: IDs de comando desconhecidos ou itens de binding inválidos são ignorados com log de warn e o restante entra em vigor normalmente — assim, escrever à mão entradas inválidas em setting.json não derruba todo o sistema de atalhos.
- **Restrição de compatibilidade entre estado de lançamento e teclas padrão de novos comandos**: a funcionalidade de customização de atalhos ainda não foi lançada e não há configuração de usuário legada, então um novo comando pode receber diretamente a tecla padrão（como `CmdOrCtrl+,` do openSettings）. **Após o primeiro lançamento**, ao adicionar um novo comando, se a tecla padrão puder colidir com um binding explícito já salvo pelo usuário（mesmo escopo e fisicamente equivalente, como `Ctrl+,` do win ≡ `CmdOrCtrl+,`）, é obrigatório fazer a compatibilidade de upgrade «a nova tecla padrão cede ao override explícito», garantindo que os bindings existentes do usuário não sejam preemptados silenciosamente e que a exibição na página de configurações corresponda à execução real.

## 6. Cadeia de efetivação（sequência）

```
O usuário clica no binding na página de configurações → grava o keydown
  │ Escape cancela /aviso de combinação inválida
  ▼
Validação de conflitos pelo núcleo（ver §7）
  │ recusado → UI marca em vermelho + indica o ocupante, não persiste, a cadeia termina
  ▼ aprovado
useSettings.update({ shortcutBindings: {...} })
  ├─ settingService.update(patch)     → validação zod + mesclagem com os settings mais recentes + escrita atômica de setting.json
  ├─ platform.syncAppSettings(patch)  → IPC → syncImmediateAppSettings no main：
  │      ├─ patch.shortcutBindings presente → rebuildMenu()（o accelerator é lido da
  │      │    tabela efetiva em mainSettingService para reconstruir o menu do app）
  │      └─ webContents.send(SettingsChanged) para todas as janelas
  │           → onSettingsChanged do useSettings nas outras janelas → refresh()
  │             → sharedSnapshot atualizado → recálculo da tabela efetiva → o próximo evento do useAppKeyboard já usa a nova tecla
  └─ refresh() → sharedSnapshot atualizado nesta janela（efeito imediato）
```

- Desktop com múltiplas janelas: a janela A muda a tecla → a janela B atualiza pelo SettingsChanged（precedente: a difusão para todas as janelas em main/index.ts de setAutoUpdatePreferences）.
- Web／celular: `platform.syncAppSettings` é um fallback no-op, e, com janela única, não há problema entre janelas; comandos do canal menu não se aplicam.
- Na inicialização: o primeiro fetch de cada janela pelo useSettings já entrega a tabela efetiva; no rebuildMenu, o processo main lê os shortcutBindings em `mainSettingService.get()`.

## 7. Política de conflito（recusa de teclas reservadas do sistema; confirmação secundária para tomar binding ocupado dentro do app）

Ao gravar a combinação B para vincular o comando C, valida-se na ordem：

1. B atinge a lista negra de teclas reservadas（RESERVED_BINDINGS, ver abaixo）→ **recusa direta**, marca em vermelho com 「系统保留键位」 e sem entrada de confirmação. Tomar um atalho do sistema／do navegador quebraria a digitação e o comportamento nativo do navegador, e por isso não há confirmação secundária.
2. B já está ocupado por outro comando na tabela efetiva（incluindo qualquer um de seus bindings padrão）→ **marca em vermelho indicando o ocupante + botão de confirmação 「仍要绑定」**. Confirmado, o binding é tomado: o override de C é escrito como [B] e o override do comando roubado passa a ser o seu binding efetivo menos B（que pode virar um array vazio explícito = não definido, sem voltar ao padrão）; sem confirmar, é possível continuar gravando outras combinações ou sair com Escape.
3. B é igual ao binding atual de C → nenhuma operação（idempotente）.

**Supressão no modo de gravação（evita que a tecla sendo gravada dispare o comando original）**: o listener de gravação e o useAppKeyboard são ambos listeners window capture e o de gravação é registrado mais tarde（na mesma fase, vale primeiro quem registra primeiro）, portanto, durante o modo de gravação — para o canal renderer o núcleo faz `setShortcutRecordingActive(true)` e curto-circuita a distribuição do useAppKeyboard; para o canal menu, `platform.setShortcutRecordingActive(true)`（IPC `SetShortcutRecordingActive`）avisa o main, que ao reconstruir o menu remove todos os accelerators configuráveis（no macOS o menu do sistema consome a tecla antes do renderer, e preventDefault não impede isso）; o **listener de fallback na raiz do Web**（useRootPlatformEffects sempre respondendo a Cmd/Ctrl+N、O）e as **teclas fixas da barra de ferramentas**（Ctrl+M / Ctrl+Shift+M / Ctrl+T）também são curto-circuitados no modo de gravação — eles são registrados antes do listener de gravação e, sem curto-circuito, consumiriam a tecla antes do gravador. Ao sair do modo de gravação, tudo é restaurado.

**Fechamento entre processos no modo de gravação（evita vazamento por destruição de janela）**: o IPC carrega o id do webContents de origem; quando a janela fecha ou o processo de renderização cai durante a gravação, o renderer não envia o IPC de reset, e o main, na limpeza já existente de destruição de janela, reseta o modo de gravação conforme o webContents de origem e executa rebuildMenu — impedindo que os accelerators do menu fiquem removidos para sempre（todas as execuções futuras de rebuildMenu construiriam um menu sem accelerator e isso atingiria todas as janelas）.

**Semântica de teclado no modo de gravação（gravar = intenção explícita, o gravador tem exclusividade sobre o teclado）**：

- **A gravação assume o foco imediatamente**: o elemento kbd de preview da linha faz `focus()`, tirando o foco de elementos editáveis（como a caixa de busca）. Caso contrário, um IME chinês consumiria Shift+letra como entrada composta e o gravador só receberia eventos de ruído isComposing／229 — essa é exatamente a forma da causa raiz de «não conseguir reconhecer a combinação Shift pura».
- **Eventos de ruído de IME ainda são gravados no modo de gravação via `event.code`**（para eventos isComposing／Process／Dead／keyCode 229, a key não é confiável, mas o code é a tecla física）. O lado de correspondência continua filtrando tudo（isShortcutEventNoise inalterado）: gravação permissiva, correspondência estrita.
- **Combinações cuja normalização de plataforma perde o modificador principal são recusadas na gravação**: Cmd+Ctrl+ do mac e o Meta puro（tecla Win）no win／linux ficam, após a normalização, com cmdOrCtrl e ctrl ambos falsos; serializar normalmente produziria uma tecla nua（como "k"） — isso não está na lista negra, não dispara a detecção de conflito e, depois de persistido, apertar essa tecla nua em todo o app aciona o comando e engole a digitação. Antes de serializar, valida-se `(metaKey || ctrlKey) && !cmdOrCtrl && !ctrl` e a gravação é recusada.
- **O aviso de conflito／invalididade não sai do modo de gravação**: basta pressionar de novo a nova combinação para sobrescrever（o listener permanece montado）; pressionar um modificador sozinho（pending) limpa imediatamente a pré-visualização／erro／dica de binding roubado restantes, garantindo o feedback visual de que o gravador «continua vivo».

**Isenção para alvos editáveis（Shift puro + tecla imprimível e escrever letra maiúscula são o mesmo evento físico）**: no momento da distribuição do useAppKeyboard, se o alvo do evento for input／textarea／contenteditable, bindings da classe «sem modificador principal + Shift + um único caractere imprimível」（`isShiftOnlyPrintableBinding`）são ignorados — sem correspondência e sem preventDefault — para que o usuário consiga digitar letras maiúsculas na caixa de chat／de busca／no terminal; com o foco fora de áreas editáveis, esse tipo de binding funciona normalmente. Teclas nomeadas（Shift+F1、Shift+teclas de direção）não são afetadas pela isenção.

Semântica dos dados de override correspondente：`um array vazio explícito` para um comando em `shortcutBindings` significa **«não definido»**（tabela efetiva vazia, sem voltar ao padrão） — tanto o botão 「清除」 da página de configurações quanto o comando roubado após a tomada produzem esse estado; apenas quando todas as entradas são inválidas é que se volta ao padrão（proteção contra edição manual de setting.json）. **Essa semântica se estende até a resolução do menu no lado main**（`resolveMenuAccelerator`）: array vazio explícito → item de menu sem accelerator（a tecla padrão do comando roubado precisa de fato ser removida, sem voltar a um valor padrão hardcoded — do contrário haveria duas ações para a mesma tecla）; somente entradas totalmente inválidas voltam ao padrão, de forma consistente com a tabela efetiva do renderer.

Lista negra de teclas reservadas（não podem ser vinculadas por nenhum comando configurável）：

- Teclas únicas de interação fixa de componentes：`Enter`、`Escape`、`Tab`、`Space`、`Backspace`、`ArrowUp/Down/Left/Right`。
- Combinações de interação fixa de componentes（consumidas de forma fixa pela barra de ferramentas）：`CmdOrCtrl+M`（menu de modelos）、`CmdOrCtrl+Shift+M`（modo de sessão）、`CmdOrCtrl+T`（profundidade de pensamento） — elas não leem a tabela efetiva, e vinculá-las causaria duas ações para a mesma tecla.
- Comportamentos nativos de navegador／edição（combinações com modificador principal）：`CmdOrCtrl+C/V/X/Z/A/Y/S/P/L`、`CmdOrCtrl+Shift+Z`。
- Refresh e ferramentas de desenvolvedor：`F5`、`CmdOrCtrl+R`、`CmdOrCtrl+Shift+R`、`F12`、`CmdOrCtrl+Shift+I/J/C`。
- Faixa de teclas de função：`F1`-`F12` reservadas por inteiro（semântica de ajuda／ferramentas do navegador etc.）.
- **Reserva dinâmica no Web**: no Web／celular, comandos do canal menu não são configuráveis, mas suas teclas padrão（Cmd/Ctrl+N、O、W etc.）continuam consumidas de forma fixa pelo listener de fallback da raiz — a detecção de conflito recusa pela lista de teclas reservadas（sem entrada para tomar o binding）, sem abrir a tomada de bindings como acontece no desktop.

A lista negra é declarada no módulo do núcleo na forma normalizada de binding, e a comparação acontece depois da normalização. Os bindings padrão da tabela de comandos não podem intersectar a lista negra（asserção de teste unitário, restrita a comandos de escopo global, ver §12）. É permitido mudar um comando para qualquer combinação fora da lista negra, inclusive uma tecla que antes pertencia a outro comando（nesse caso a regra 2 avisa e a tomada acontece após confirmação secundária, e não a interceptação pela lista negra）.

## 8. Especificação de UI da página de configurações

- Reaproveita a seção de atalhos já registrada（settingsPageConfig / settingsNavigation / montagem do SettingsPage já prontas） e reescreve o `ShortcutSettingsSection`:
  - **Linha única com múltiplos bindings**: um comando por linha — o nome do comando na coluna esquerda fica centralizado verticalmente em todos os bindings, a coluna de teclas lista verticalmente cada binding e a coluna de ações tem a lixeira 「清空全部」. Quando o comando não tem binding, mostra a keycap 「未分配」（clicar já grava o primeiro）.
  - **Keycaps por tecla（estilo do shadcn Kbd）**: a string de binding é decomposta por `formatShortcutBindingLabelParts` em tokens por tecla（macOS `["⇧","⌘","P"]`、Win/Linux `["Ctrl","Shift","P"]`, a mesma sequência de tokens da label de exibição）, e cada token renderiza o componente `Kbd` de forma independente（`components/ui/kbd.tsx`: `h-5 min-w-5` fixo + centralização por flex + `font-sans`; teclas de símbolo e de letra têm o mesmo tamanho, evitando a variação de largura causada pelo fallback de símbolos em fonte mono）; uma combinação usa `KbdGroup`（gap-1）na horizontal. Keycaps de comandos com override do usuário usam a cor da marca.
  - Ações em linha（nesta etapa, apenas substituir; adicionar／remover bindings ainda não é suportado）: clicar em uma keycap ou no lápis = **substituir aquele item**（o modo de gravação é embutido na posição do item e, após o sucesso, o grupo inteiro é reescrito pelo índice na lista efetiva com `buildShortcutOverridesWithBindingAt`; gravar o primeiro item de um comando não atribuído passa por `buildShortcutOverridesAfterAppend`）; a lixeira = **limpar todos os bindings**（grava um `[]` explícito = não atribuído, sem voltar ao padrão）. No modo de gravação, `Escape` cancela e `Backspace` restaura o padrão（removendo o item de overrides, mantendo a pré-verificação de conflito da tecla padrão de SG-03）. O `buildShortcutOverridesWithoutBindingAt`（remover um único item）já está pronto no núcleo e tem teste unitário; a entrada de UI será aberta depois.
  - **Duplicata no mesmo comando é recusada**: quando a combinação gravada é fisicamente equivalente a outros itens efetivos deste comando（`isSamePhysicalBinding`）, marca em vermelho e recusa（add compara com todos os itens; replace pula o item alvo que está sendo substituído） — não faz sentido pendurar o mesmo conjunto de teclas em um comando. A política de conflito entre comandos e de teclas reservadas não muda（§7）.
  - Marca vermelha em conflito：`text-destructive` + texto do ocupante（a cor semântica, conforme DESIGN.md, é usada só para problemas reais de validação）; o texto de dica deixa explícito que «após o conflito, basta pressionar de novo a nova combinação».
  - O filtro pela caixa de busca（cabeçalhos de todas as linhas de binding dos comandos cujo nome／ID casa） e 「全部恢复默认」（limpa shortcutBindings） são mantidos.
  - **Busca por combinação de teclas（estilo dos Keyboard Shortcuts do VSCode）**: botão com ícone de teclado na extremidade direita da caixa de busca; ao clicar, entra em estado armado（o placeholder vira 「按下要搜索的组合键…」 e o campo fica readOnly）. O estado armado reaproveita a supressão de exclusividade de teclado da gravação em linha（`setShortcutRecordingActive`, nos canais renderer e menu）, com capture de keydown na window: `Escape` sai; `Backspace` limpa a combinação já capturada; os demais eventos são capturados pelo gravador（`recordShortcutBinding`, com normalização de plataforma; letras nuas e outras teclas impossíveis na tabela de comandos são silenciosamente ignoradas）. Assim que a captura tem sucesso, o estado armado é encerrado e a combinação passa a ser um filtro independente（AND com a busca textual): casam os comandos da tabela efetiva que são **fisicamente equivalentes** a ela（`isSamePhysicalBinding`, o mesmo critério canônico da detecção de conflito, então Ctrl+m do win ≡ CmdOrCtrl+m）. A combinação capturada é exibida como texto no campo pela esquerda（estilo VSCode, cor da marca + fonte monoespaçada, readOnly; nesse momento o filtro textual continua valendo internamente）, e o × na extremidade direita volta à busca puramente textual. É mutuamente exclusivo em relação à gravação em linha: ao armar, clicar no botão de gravação primeiro desarma, e vice-versa. Quando o filtro não tem acerto, o fim da tabela exibe o texto de estado vazio（a busca por tecla mostra o label da combinação; a busca puramente textual, não）.
  - No Web／celular, os comandos do canal menu ficam esmaecidos（cor de texto atenuada, sem ocultação）, com a marcação de texto i18n 「仅桌面端生效」 no fim da linha.
  - Os atalhos de troca de modo de interface continuam registrados e respondendo, mas não são exibidos na lista de atalhos; o atalho de alternância claro／escuro permanece na lista. Os submenus de tema da barra lateral e de modo de interface mostram apenas as opções, sem repetir a dica de atalho no rodapé.
  - Todo o texto passa por i18n（complementando as chaves em zh-CN/en-US em sincronia）, substituindo o chinês hardcoded do protótipo.
- Label de exibição：`useShortcutCommandLabel(commandId)` pega o primeiro binding da tabela efetiva e o formata como label de plataforma（estilo macOS `⌘K`, estilo Win/Linux `Ctrl+K`, seguindo o hábito de formatação já existente em keyboardShortcuts.ts）; quando o comando não está atribuído（binding efetivo vazio）, devolve string vazia, o tooltip não exibe o trecho de teclas e **não volta ao padrão para exibição** — a dica precisa corresponder ao que está de fato em vigor. Substituir os seguintes pontos de chamada：App.tsx:143-149（7 ocorrências）、NewTaskButtonGroup.tsx:16、WindowsCaptionMenuButton.tsx:238/243/260、WorkspaceSidebar.tsx:414、WorkspaceSidebarFooter.tsx:294/302. O ⏎ do GitActionMenu e o G／números do TaskSearchDialog são teclas internas dos diálogos, não estão na tabela de comandos e permanecem como estão.
- Exibição de duas teclas：openCommandCenter mostra o primeiro binding da tabela efetiva.

## 9. Parametrização do useAppKeyboard

- Transformar em: receber `handlers: Partial<Record<ShortcutCommandId, (() => void) | null>>` e ler internamente a tabela efetiva; dentro do `useEffect`, keydown → filtro（repeat／IME）→ correspondência geral comando a comando e binding a binding pela tabela efetiva → ao acertar, `preventDefault()` + chamar o handler.
- Quando o handler é null／ausente, **não faz preventDefault**（seguindo a semântica existente de previousConversation／navBack: quando a função está indisponível, o comportamento padrão do navegador passa）.
- O mapeamento de handlers no ponto de montagem de App.tsx corresponde aos IDs de comando, com comportamento um a um igual ao atual e sem mudança de lógica de negócio.
- As funções existentes da série matchesPrimaryShortcut são mantidas para as interações fixas que não entraram na tabela（matchesShiftTab e afins） e não são removidas nesta rodada.

## 10. Plano de testes

Testes unitários（escrever os testes antes da implementação）：

- shared de serialização：roundtrip de parse/serialize, normalização（ordem／maiúsculas／apelidos）, recusa de strings inválidas e compatibilidade com Electron（CmdOrCtrl repassado é válido）.
- Matcher do núcleo：separação por plataforma（meta do mac vs ctrl do win／linux）, correspondência exata de modificadores（modificador extra não acerta）, Shift+letra（key maiúscula／code como fallback）, reescrita do Option do macOS（key é o caractere do layout e o code acerta）, IME（isComposing／Process／Dead／229 não acertam）, repeat não acerta e binding de tecla única.
- Gravador：normalização de plataforma Cmd／Ctrl→CmdOrCtrl, Ctrl→Ctrl no mac, Shift+7→7（lookup por code）, modificador pressionado sozinho não gera nada, semântica de Escape／Backspace, **gravação de combinação Shift pura（Shift+F）**, **gravação de evento de ruído de IME por lookup de code（sem code que possa ser consultado, permanece pending; repeat não é gravado; o lado de correspondência continua filtrando）**.
- Resolve da tabela efetiva：mesclagem de padrões, substituição do grupo inteiro, ignorar itens inválidos e ignorar comandos desconhecidos.
- Detecção de conflito：lista negra, ocupação entre comandos e idempotência; asserção de que os bindings padrão da tabela não intersectam a lista negra.
- Comparação de equivalência da busca por tecla（`isSamePhysicalBinding`）：CmdOrCtrl ≡ Ctrl no win／linux e sobreposição de AltGr; no mac o modificador principal e o Ctrl são independentes（a relação de equivalência da mesma string se inverte conforme a plataforma）; teclas nomeadas nuas; strings que falham no parse nunca são iguais.
- Construtores de múltiplos bindings com quebra de linha：`buildShortcutOverridesAfterAppend`（preserva todas as teclas padrão + overrides; em comando não atribuído, o append é o primeiro item）、`buildShortcutOverridesWithoutBindingAt`（remove o item indicado, grava `[]` explícito quando fica vazio e não afeta outros comandos）、`buildShortcutOverridesWithBindingAt`（substitui na posição indicada e preserva as demais teclas padrão）.
- schema：roundtrip de atualização de patch de shortcutBindings e comportamento de remoção de campos desconhecidos.

e2e（packages/desktop/test/e2e/; por exigência do repositório, interação com o App precisa de e2e）：

- Gravar uma tecla nova na página de configurações → continua em vigor após reiniciar（persistência em setting.json）.
- A tecla nova realmente dispara o comando na interface principal（por exemplo, com toggleSidebar rebound, pressionar a nova tecla abre e fecha a barra lateral）.
- Cenários de conflito：gravar uma combinação já ocupada por outro comando → marca em vermelho indicando o ocupante + 「仍要绑定」 e, após confirmar, o binding tomado é persistido e o comando roubado fica 「未设置」; gravar uma tecla reservada do sistema（como Ctrl+C） → recusa direta e sem botão de confirmação; durante a gravação, apertar teclas não dispara o comando original（a supressão funciona）.
- Apertar teclas durante a composição de um IME chinês não dispara comandos（pode-se simular um evento isComposing）.
- Pipeline de teclas reais（`browser.keys()`, distinto de um KeyboardEvent sintético）：gravação de combinação Shift pura → persistência → efeito na interface principal（SC-04）; após um conflito, apertar diretamente a segunda combinação sem pressionar Escape（SC-05）; evento de ruído de IME recebido no modo de gravação é gravado por code（SC-06, evento isComposing sintético）; Shift puro + tecla imprimível em alvo editável não dispara comando nem engole o caractere（SC-07）; após tomar o binding do canal menu, o accelerator original é removido e a tecla só dispara o novo owner（SC-08, incluindo a semântica de array vazio no lado main）.
- 「清除」 para 「未分配」（SC-10）：clicar na lixeira → a kbd mostra 「未分配」 e o botão de limpar fica desabilitado → apertar a tecla padrão original na interface principal não dispara mais o comando → ao reabrir a página de configurações continua não atribuído（persistência da cobertura `[]`, sem voltar ao padrão）; o caminho de restauração do padrão via `Backspace` no modo de gravação não é afetado.
- Busca por combinação（SC-11/SC-12、`settings/shortcut-settings-key-search.test.ts`）：após armar, pressionar o modificador principal da plataforma + K filtra o comando cujo binding padrão é essa combinação（openCommandCenter）e as outras linhas desaparecem → limpar recupera o conjunto completo; combinação sem acerto（CmdOrCtrl+Shift+9）mostra o estado vazio → limpar rearma, e Escape sai（aria-pressed é redefinido e a lista não se move）.

## 11. Etapas de implementação

1. shared：`shortcutCommands.ts`（formato + tabela de comandos）+ o campo em três pontos de protocol.ts/schema + testes unitários.
2. `ui/src/shortcuts/`：matcher／recorder／resolve／conflicts／label + testes unitários.
3. Parametrização do `useAppKeyboard` + mapeamento de handlers em App.tsx + substituição de 11 labels.
4. Reescrita do `ShortcutSettingsSection` + chaves i18n（zh-CN/en-US）.
5. desktop main：parametrização do accelerator do menu + branch de atalhos em `syncImmediateAppSettings`（rebuildMenu + difusão de SettingsChanged）.
6. Casos de e2e.
7. `pnpm typecheck`、`pnpm lint`、testes unitários relacionados e e2e tudo verde antes do commit.

## 12. Escopo e origem（scoped shortcuts）

Tomando como referência as colunas When／Source dos Keyboard Shortcuts do VSCode: uma tecla pode ser vinculada para valer dentro de um **escopo** específico, e a página de configurações indica a **origem** da tecla. Com a introdução de escopos, Enter e afins, essa «tecla de confirmação de diálogo», pode entrar na tabela com segurança — o raio de impacto fica limitado ao contexto.

### 12.1 Definição de escopo

O `ShortcutCommandEntry` da tabela de comandos ganha `scope?: "global" | "composer"`（padrão `global`）：

- `global`：todos os comandos atuais. O distribuidor é o useAppKeyboard（canal window）／o accelerator do menu（canal menu）.
- `composer`：comportamentos que só fazem sentido quando a caixa de entrada do chat está focada. O distribuidor é o plugin de comportamento de teclado do composer（`LexicalChatInput` KeyboardPlugin）, o **único consumidor**; useAppKeyboard, menu e listener de fallback do Web não têm nenhuma ciência dos comandos de composer（`useAppKeyboard` pula explicitamente `scope !== "global"`）.

A implementação do escopo não depende de um registro global de foco: o keydown do plugin do composer só chega quando o próprio editor está focado, e o alvo do evento é o próprio escopo, o que naturalmente elimina estado compartilhado e problemas de timing（fonte única de dados = o caminho do evento DOM）.

Primeiros comandos de escopo composer（resultado da auditoria de teclas fixas internas dos componentes, ver a tabela abaixo）：

| Comando                   | Binding padrão | Descrição        |
| ------------------------- | -------------- | ---------------- |
| `composerSend`            | `Enter`         | Envia a mensagem |
| `composerInsertNewline`   | `Shift+Enter`   | Insere quebra de linha |

Candidatos de escopo que **não** entram na tabela na auditoria（registrados como memorando）：G／números／⏎ do TaskFindDialog e o ⏎ do GitActionMenu（teclas de navegação internas de diálogo, futuramente com possibilidade de um escopo `taskFindDialog`）; Ctrl+M / Ctrl+Shift+M / Ctrl+T da barra de ferramentas（consumo entre escopos, mantidos como global + lista negra, ver §7）.

### 12.2 Mudanças de apoio no núcleo

- Lista branca de nomes de teclas：`NAMED_KEYS` ganha `Enter`（a partir daí `Shift+Enter` e `CmdOrCtrl+Enter` podem ser representados）; no lado da gravação, `CODE_TO_KEY` ganha o correspondente（code `Enter` do teclado principal; `NumpadEnter` não é mapeado）.
- A lista negra de teclas reservadas é corretamente restringida：`Enter` entra em `RESERVED_BINDINGS` — **vale apenas para o escopo global**; a asserção «os bindings padrão da tabela não podem intersectar a lista negra» é corretamente limitada a apenas comandos globais.
- A detecção de conflito é isolada por escopo: ao rebindar um comando, a ocupação só é comparada com comandos do **mesmo escopo**（`CmdOrCtrl+Enter` como tecla de envio do composer coexistindo com um comando global não é conflito）; a lista negra só bloqueia rebindings de escopo global.

### 12.3 Ordem de distribuição no plugin do composer（prioridade entre a camada de rebind e as funções de runtime）

```
keydown（composer Lexical KEY_ENTER_COMMAND, COMMAND_PRIORITY_HIGH）
  ① disabled / isComposing ──▶ comportamento atual（bloqueio total / liberação da confirmação de candidato do IME）
  ② camada de rebind resolveComposerKeyAction（shortcuts/composerShortcuts.ts, lê os comandos composer da tabela efetiva）
       ├─ acerta composerInsertNewline ──▶ deixa o Lexical inserir parágrafo（quebra de linha）
       └─ acerta composerSend ──▶ branch de envio（reaproveitando as funções de semântica existentes）:
             combinação sem modificadores ──▶ sujeito ao gate submitDisabled / enterSubmits（viewport de celular）, equivalente ao Enter nu atual
             com modificador Ctrl/Meta e entrega invertida ativa（onModifiedSubmit já injetado）──▶ cede o lugar: libera a cadeia principal,
             e Ctrl+Enter continua expressando a função de runtime «delivery reverso»（a semântica de entrega é mais específica que a tecla）
  ③ não acertou（incluindo combinações com modificadores em todos os estados padrão）──▶ a cadeia principal atual executa como está
```

No estado padrão（sem override do usuário）, os comportamentos de ② e ③ são equivalentes ramo a ramo（matriz travada por teste unitário：desktop／viewport de celular × Enter／Shift+Enter／Ctrl+Enter × interruptor de entrega invertida）, o que garante regressão zero. A semântica de substituição do grupo inteiro não muda: depois que o usuário rebinda `composerSend` para `CmdOrCtrl+Enter`, o Enter nu fica sem binding → em ③, no ramo de Enter nu, quando shift／ctrl／meta são todos false e `enterSubmits` é verdadeiro, o comportamento seria o envio padrão — para que o Enter nu do «partido do Ctrl+Enter» caia em quebra de linha, o ramo de Enter nu da cadeia principal recebe antes uma verificação de escopo: quando o binding efetivo de `composerSend` não contém o Enter nu（isto é, o usuário o removeu）, o Enter nu deixa o Lexical inserir a quebra de linha. Enquanto Shift+Enter não for sobrescrito, ele continua acertando a quebra de linha pelo binding padrão de `composerInsertNewline` e não é afetado.

### 12.4 Página de configurações

- Os comandos de composer aparecem automaticamente na lista（orientado a dados）.
- **O escopo vira uma coluna própria**：a lista passa de três para quatro colunas（comando | tecla | escopo | ações）, e cada linha marca explicitamente 「全局」/ `Global` ou 「输入框」/ `Composer`（i18n sincronizado em zh／en） — legibilidade de letreiro pequeno em formato de badge é ruim, e uma coluna própria deixa o escopo identificável de imediato.
- A lógica de esmaecimento do canal menu não se aplica（comandos de composer são alteráveis de forma consistente nas três pontas）; a marca 「仅桌面端生效」 permanece ao lado do nome do comando（semântica de disponibilidade por plataforma, ortogonal ao escopo）.
- 「全部恢复默认」 é uma operação destrutiva: após o clique, reutiliza o diálogo global de confirmação（`useConfirmDialogStore` + `ConfirmDialogHost`, Enter confirma／Esc cancela）e só limpa `shortcutBindings` após a segunda confirmação; o botão fica desabilitado quando não há overrides.
- A coluna 「来源」（padrão／usuário／plugin）por enquanto é carregada pelo visual já existente（realce brand da tecla sobrescrita + restaurar padrão） e só será materializada como coluna independente quando os atalhos de plugin entrarem na tabela de comandos.

### 12.5 Testes

- shared：roundtrip de parse／serialize da família `Enter`; campo `scope`; itens de comandos de composer da tabela.
- Núcleo de ui：`RESERVED_BINDINGS` contém `Enter` e só bloqueia global; isolamento de escopo na detecção de conflito; matriz de `resolveComposerKeyAction`（padrão／rebind／ceder lugar na entrega invertida／fallback sem binding）; matriz de equivalência ②≡③ no estado padrão.
- e2e（SC-09）：gravar composerSend como `CmdOrCtrl+Enter` na página de configurações → no composer, o Enter nu não envia（a entrada é preservada） e `CmdOrCtrl+Enter` envia（rascunho limpo ou mensagem do usuário na tela）. Atenção: persistir ≠ atualização imediata da tabela efetiva no renderer（a difusão de SettingsChanged tem uma janela assíncrona de subsegundo）; após a asserção de persistência, o caso espera explicitamente essa janela passar antes de validar o comportamento na interface principal.

### 12.6 Atalhos da barra de ferramentas do composer promovidos a comandos configuráveis

As antigas teclas fixas Ctrl+M（abrir menu de modelos）／Ctrl+Shift+M（alternar modo de sessão）／Ctrl+T（alternar profundidade de pensamento） eram consumidas de forma fixa por um listener window capture em `v4/composer/toolbarShortcuts.ts`, sem ler a tabela efetiva（CR-06 já as bloqueava pela lista negra de reservadas）. Agora são promovidas a comandos da tabela：

| Comando              | Binding padrão   | Descrição                     |
| -------------------- | ---------------- | ----------------------------- |
| `openModelMenu`      | `Ctrl+m`         | Abre o menu de modelos        |
| `cycleSessionMode`   | `Ctrl+Shift+m`   | Alterna o modo de sessão      |
| `cycleThoughtLevel`  | `Ctrl+t`         | Alterna a profundidade de pensamento |

- **Modificador Ctrl explícito**（e não CmdOrCtrl）: a semântica é a tecla Ctrl de forma consistente nas três pontas（também no mac）, equivalente em semântica à correspondência exata de modificador da série antiga `matchesCtrlShortcut`, com mudança zero no comportamento padrão.
- A distribuição continua no listener window capture da barra de ferramentas（a ação depende do estado da barra do composer：openRequestKey do menu de modelos, gating de opções etc.）, mas a correspondência passa a ler a tabela efetiva — após um rebind na página de configurações o efeito é imediato; a supressão no modo de gravação, o filtro de defaultPrevented／repeat／isComposing e o gating de atribuição de options permanecem inalterados.
- A lista negra de reservadas retira corretamente essas três entradas（o plano de bloqueio CR-06 anterior a §12.6 fica abolido）: o sistema de conflitos（detecção de ocupação + confirmação secundária para tomar binding）passa a valer integralmente para comandos configuráveis.

Detecção de conflito por equivalência física（novo CR-01）: o lado de correspondência trata combinações equivalentes de plataforma como a mesma tecla física; se a detecção de conflito fizesse apenas comparação exata de strings, o produto da normalização de plataforma do gravador（gravar ⌃M no win produz "CmdOrCtrl+m"）passaria por cima da detecção de ocupação da binding padrão explícita de Ctrl（as três teclas da barra de ferramentas）, causando uma oclusão silenciosa sem aviso（o useAppKeyboard distribui primeiro com preventDefault, o listener da barra de ferramentas desiste por causa da guarda de defaultPrevented e o menu morre silenciosamente）. Por isso, a detecção de conflito e a limpeza da tomada acontecem na tecla canônica — em plataformas não apple, CmdOrCtrl ≡ Ctrl ≡ AltGr（bit do modificador principal）e AltGr ≡ Alt（bit de sobreposição）são fundidos e normalizados; em plataformas apple, CmdOrCtrl (meta) e Ctrl são comparados como teclas físicas independentes. O macOS tem ainda uma defesa contra minimize: ⌘M é o accelerator fixo do role "minimize" do menu do sistema, e vincular ⌘M em qualquer escopo（inclusive composer）é recusado como tecla reservada — o menu do sistema consome a tecla antes do renderer, e vincular é morte certa.

Consolidação do critério de revisão（SG-03／SG-09）：

- **Restaurar padrão（limpar o override） tem a mesma defesa da gravação**: antes do clearBinding, faz-se uma pré-verificação de conflito com a primeira tecla padrão do comando（incluindo variantes como Ctrl+m ≡ CmdOrCtrl+m após a normalização de equivalência física）; havendo ocupação, um toast indica o ocupante e **nada é persistido** — pelo critério de produto, apenas se avisa e não se limpa automaticamente o ocupante（a limpeza automática exigiria lógica de restauração em cascata, que é um design proliferado）; o caminho via Backspace no modo de gravação reaproveita o mesmo clearBinding e nasce com a mesma defesa.
- **Divisão entre 「清除」 e 「恢复默认」（critério após a revisão）**: a lixeira 「清除」 = grava um array vazio explícito = não atribuído (a tecla original deixa de valer de vez); `Backspace` no modo de gravação = restaurar o padrão = remover o item de override（a única entrada de retorno ao padrão de um único comando; há ainda o 「全部恢复默认」 global）. Limpar apenas reduz bindings e não produz uma tecla nova, portanto não quebra o invariante «uma tecla, um comando» e não passa pela pré-verificação de conflito; restaurar o padrão reintroduz a tecla padrão na tabela efetiva e por isso precisa de pré-verificação.
- **Política de abertura uniforme para o escopo composer**: não se limita à família da tecla Enter — resolveComposerKeyAction compara contra todos os bindings da tabela efetiva, e o usuário pode vincular envio／quebra de linha a qualquer tecla（como F9）, de forma consistente com a política de abertura dos demais comandos. Mesma tecla entre escopos（como composerSend vinculado a CmdOrCtrl+k junto com o centro de comandos global）não é considerada conflito pelo isolamento de escopo da §12.2; ao apertar, as duas ações acontecem, o que faz parte da escolha explícita do usuário dentro da política de abertura.
  **Acompanhamento na camada de distribuição（fechamento do novo CR-01）**: KEY_ENTER_COMMAND só é despachado para Enter, e rebinds de outras teclas são distribuídos pelo keydown capture na raiz do LexicalChatInput（handleNonEnterScopedKeydown）— ao acertar newline, faz insertLineBreak explícito; ao acertar send, reaproveita a cadeia de envio mas sem o gate de enterSubmits do viewport de celular (o envio acidental por teclado virtual só diz respeito à tecla física Enter), e sem interseção com a entrega invertida (que só responde a Ctrl／Meta+Enter) e sem necessidade de ceder lugar. A função pura resolveComposerKeyAction é compartilhada pelos dois caminhos de distribuição.