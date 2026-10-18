# M5: restauração do composer de sessão do v4 (consolidação das capacidades da área de entrada)

## Objetivo

Restaurar a área de entrada do SessionPane do v4, que no M3 havia sido reduzida verticalmente a um textarea
nu, de volta às capacidades completas da UI antiga: editor Lexical, seleção de modo, seletor de modelo,
profundidade de raciocínio, uso de contexto, máquina de estados da tecla de envio e painel de candidatos de `/`.

## Divisão entre novo e antigo (restrição rígida: UI antiga, lógica nova)

| Camada | Origem | Descrição |
| --- | --- | --- |
| `LexicalChatInput` (packages/ui/src/LexicalChatInput.tsx) | Restaurado como estava em `b44d4a87a^` | O provider lê o `v4/activeTaskProvider` existente; `ChatComposerPasteEvent` fica consolidado neste arquivo; mantém a flag `enableMentionPanel`; o slash command lê sempre o catálogo de workspace do CLI |
| `ChatPromptEditor` / `ChatPromptActionMenu` / `usePromptEditorDragState` (packages/ui/src/prompt-editor/) | Restaurados como estavam | Casca de exibição puramente por props; o valor de retorno de `onSubmit` é repassado (false=manter rascunho), sendo essa a única adaptação de comportamento |
| `CatalogSlashCommandPlugin` (packages/ui/src/prompt-editor/) | Componente migrado inicialmente, já removido | O canal de diretório de commands estático do host foi desativado; hoje permanece apenas o `SlashCommandPlugin`, que lê o slash catalog de workspace do CLI |
| `V4ComposerToolbar` (packages/ui/src/v4/composer/) | Wiring novo | Reutiliza os componentes de exibição ModelConfigSelect / ChatModeSwitchControl / ThoughtLevelCycleControl / ChatContextUsage; o valor atual vem de `snapshot.config` / `snapshot.usage` do v4; o caminho de escrita usa comandos do v4 |
| `ConversationComposer` (packages/ui/src/v4/) | Reescrito do zero | Máquina de estados da tecla de envio + held choice + Stop + layout do dock |

## Fiação da interface de dados

- Modelo/profundidade de raciocínio → `switchModelConfig`. A barra de ferramentas apenas emite os eventos
  semânticos `onSelectModel(providerId, modelId)` / `onSelectThought(thought)` (o value passa por
  `decodeCustomModelValue`), e **os parâmetros do comando são completados pelo SessionPane a partir do snapshotRef
  (projeção mais recente)** — o config prop dos subm componentes memoizados fica uma projeção atrasada em
  operações consecutivas; um CAS stale usa retry limitado via `ack.revisionAtDecision` (corrida de revision em
  “trocar modelo → trocar profundidade de raciocínio” seguidos).
- Seleção de modo → **novo comando aditivo `switchCollaborationMode`** (mode ∈ build/edit/plan/yolo, CAS):
  - Handler do CLI (`commands/handlers/model-config.ts`): snapshot `app.getMode()` → `app.setMode(mode)` →
    `runtime.emitModeChanged` (novo método do core, que reemite
    `SessionModeChanged(source=command)`; o próprio `app.setMode` não gera eventos).
  - Projeção: `onSessionModeChanged` → `config.mode` (campo aditivo, com default `"build"` para não quebrar
    frames antigos). O SessionModeChanged do caminho de plan (enterPlanMode/exitPlanMode) também é consumido, e a
    UI acompanha.
- Uso de contexto → `snapshot.usage.contextWindow` (campo já existente, gravado na projeção em ModelComplete),
  com a UI reutilizando ChatContextUsage (`{used: usedTokens, size: maxTokens}`).
- O catálogo de modelos (opções do seletor) pertence à superfície de configuração: por enquanto passa pela leitura
  dos serviços vivos (`useModelProviders` + `useToolbarConfigOptions(workspacePath, null)`), com **data de
  expiração = v4 da superfície de configuração**.
- Máquina de estados da tecla de envio (alinhada ao antigo ChatViewComposer): running+rascunho vazio → Stop
  (comando `stop` do v4, migrado do header para o composer); running+com rascunho → “Adicionar à fila”; held
  (inputRouting.mode=choice) → dois botões de limpar/manter (contrato de testid do M4 inalterado); pending →
  spinner; em caso de falha de envio, o rascunho é preservado.

## Contrato de e2e

- `TID_V4_COMPOSER_INPUT` passa a ser contenteditable do Lexical: `setInputValueByTestIdDom` ganha um ramo de
  bridge `__zcodeLexicalInputE2E` (que dirige o estado real do editor; o commit do Lexical só ocorre depois do
  microtask de update, e a escrita adota confirmação por polling), com as asserções do spec semanticamente
  inalteradas.
- Critério de direção dos controles Radix: gatilhos de DropdownMenu controlados usam clique real do WebDriver
  (`element.click()` não emite pointerdown); os gestos de pointer sintetizados na confirmação de um Radix
  SelectItem são ignorados, então usa-se uniformemente o caminho de teclado “item focado + Enter” (helper
  `selectRadixOption`) mais a verificação de fechamento do menu.
- Observabilidade: os logs de produção do renderer são desligados, e o resumo de ack dos comandos do v4 é
  gravado em um buffer circular limitado `window.__zcodeV4CommandAcksE2E`
  (`v4/commandAckObservability.ts`), anexado automaticamente às mensagens de falha do spec.
- Os formulários de debug do M4 (4 testids como v4-model-provider-input) são desativados; o helper `switchV4Model`
  é adaptado para dirigir `TID_CHAT_MODEL_SELECT_*` / `TID_CHAT_THOUGHT_LEVEL_SELECT_*` (seletores reais).
- Novos `TID_CHAT_MODE_SELECT_TRIGGER/ITEM` (âncoras de e2e da seleção de modo); a âncora `TID_V4_MODEL_CONFIG`
  ganha data-mode / data-usage-used / data-usage-max.
- Novo spec: `conversation-session-v4-composer-toolbar.test.ts` (aparição/filtro/seleção do painel de slash,
  troca do seletor de modelo para secondary, projeção da troca de modo e projeção de usage não nula).

## Fora do escopo nesta fase (entradas mantidas, flags de props desligadas)

Painéis de mention/@/#, seleção/arrastar/soltar/colar anexos e persistência do prompt history — serão ativados
quando a superfície de dados do v4 estiver pronta (`showMentionButton` / `attachmentAction` /
`enableExternalFileDrop` / `enableMentionPanel` / `onPaste`).

Além disso: durante o período de draft, o valor inicial projetado de `config.mode` é fixo em `"build"`; quando a
preferência persistida não for build, a primeira `SessionModeChanged` prevalece (TODO M6: canal de seed sem
revision durante o período de draft).