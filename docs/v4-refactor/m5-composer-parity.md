# M5 Composer Parity — Alinhamento total da caixa de entrada com a versão antiga · auditoria de capacidades

Princípio divisor: **casca antiga, núcleo novo** — o JSX/estilos do antigo `ChatViewComposer` / `ChatPromptEditor` / `ChatInputToolbar` são reutilizados como estão (referência z-code-2), todo o wiring é novo: leitura de dados pela projeção v4 (`snapshot.inputRouting /
control / config / usage`) + sessions-index + serviço de superfície de config vivo; operações enviam comandos v4 (`sendText /
createSession / editUserQuery / stop / switchModelConfig / switchCollaborationMode /
attachment.put`); sem ressuscitar a orquestração de hooks antigos / estado de sessão do store antigo.

Linha de base de referência: `ChatViewComposer.tsx` antigo (antes da remoção `b44d4a87a^`).
Suporte atual: `packages/ui/src/v4/ConversationComposer.tsx`, `packages/ui/src/v4/composer/*`,
`packages/ui/src/v4/SessionPane.tsx`.

## I, Capacidades já alinhadas (capacidade × versão antiga × situação atual v4 × disposição)

| Capacidade                                                | Origem na versão antiga                                              | Situação atual v4                                                                                                                                                                               | Disposição                                                                                                   |
| --------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Editor Lexical + menu de ações + base fixa (sticky)       | ChatPromptEditor                                                      | `ChatPromptEditor` (mesmo componente)                                                                                                                                                          | Concluído                                                                                                    |
| Placeholder dinâmico (phase/history mudam o texto)         | `resolveChatPlaceholderKey`                                           | Mesma função: `hasHistoryMessages=rows.totalCount>0`, `isTaskProcessing=control.canStop`                                                                                                      | Concluído (parity)                                                                                           |
| Política de envio com Enter                               | `resolveChatEnterSubmits(preferEnterNewline=isWebRemoteControl)`      | Mesma função; no desktop Enter envia, no controle remoto Web do celular Enter quebra linha                                                                                                   | Concluído (semântica consistente entre plataformas, ver §III)                                               |
| Persistência de rascunho por sessão                       | Store antigo `zcodeSessionStore.composerDraftByScopeId` + `chatComposerDraftStorage` | `composer/composerDraftStore.ts` (espaço de chaves v4 independente, text+editorStateJson, scope=sessionId/`__draft__`)                                                            | Concluído (novo, sem escrita cruzada com chaves antigas)                                                     |
| Histórico de prompts ↑/↓                                  | `promptHistoryStorage`                                                | `readPromptHistoryEntries` / `appendPromptHistoryEntry` / `persistPromptHistoryEntries`                                                                                                       | Concluído; a escrita apenas filtra repetições consecutivas idênticas após trim em relação à anterior; a leitura do histórico antigo não limpa nada (ver `docs/ui/composer-prompt-history.md`) |
| Anexo: seleção de arquivo (picker nativo / fallback via input oculto) | useChatComposer                                                    | `useComposerAttachments.openAttachmentPicker`                                                                                                                                                  | Concluído                                                                                                    |
| Anexo: colagem de imagem / arquivo                         | useChatComposer                                                      | `handlePaste`                                                                                                                                                                                   | Concluído                                                                                                    |
| Anexo: colagem de texto longo ≥15Ki caracteres → arquivo temporário do host | useChatComposer                                 | Caminho `platform.createTempTextAttachment`                                                                                                                                                     | Concluído                                                                                                    |
| Anexo: arrastar do SO externo + reset automático por heartbeat | useChatComposer                                                    | `handleDragOver/Leave/Drop` + `scheduleComposerDragFeedbackReset`                                                                                                                              | Concluído                                                                                                    |
| Anexo: whiteboard add-to-chat (PNG)                       | useChatComposer                                                      | `handleWhiteboardMentionSelected` + `WHITEBOARD_ADD_TO_CHAT_EVENT`                                                                                                                             | Concluído                                                                                                    |
| Anexo: limite de 8 / tamanho / recusa de imagem inline oversized | useChatComposer                                                    | `MAX_CHAT_ATTACHMENTS` + `serializeForSend` (`OversizedInlineImageAttachmentError`→recusa envio preservando o rascunho)                                                                           | Concluído                                                                                                    |
| Anexo: reciclagem do objectUrl / ciclo de vida                  | useChatComposer                                                      | `revokeChatComposerAttachment` na desmontagem/limpeza                                                                                                                                           | Concluído                                                                                                    |
| Grade de pré-visualização de anexos + pré-visualização ampliada de imagem | ChatViewComposer topContent                                 | `topContentNode` (trecho antigo 345-501 restaurado como está)                                                                                                                                  | Concluído                                                                                                    |
| Chip de anexo codeComment                                  | `CodeCommentAttachmentChip` + bloco de prompt `codeCommentContext`    | `useCodeCommentContexts` (estado em memória do composer) + `buildPromptWithCodeComments`; apenas o pane principal recebe eventos globais; após envio bem-sucedido a pré-visualização do código é removida em sincronia                                          | **Concluído (correção de bug em 2026-07-21)**: repostos os eventos de add/remove, o chip e a serialização de envio que faltaram na migração v4 |
| Chip de anexo webElementContext                            | `WebElementContextAttachmentChip` + bloco de prompt `webElementContext` | `useWebElementContexts` (estado em memória do composer) + `buildPromptWithWebElementContexts`; após o envio, a linha de usuário restaura o chip somente-leitura com `parsePromptWebElementContexts`, e copy/edit preservam o `row.text` original                    | **Concluído (2026-07-09)**: não passa por anexos de protocolo nem entra na persistência de rascunho                                 |
| Banner de erro de sessão (mostra a causa da falha acima da caixa de entrada) | `ChatBottomDock` → `ChatViewErrorBanner` → `ChatErrorBanner` | `SessionPane` lê `snapshot.control.lastError` e mapeia para `ChatErrorBanner` exibido acima do editor de `ConversationComposer`; dismiss apenas oculta a impressão digital do erro atual, o próximo erro continua aparecendo        | **Integrado (2026-07-07)**                                                                                    |
| Depósito de anexos de envio → referência de modelo         | promptAttachment do protocolo antigo                                | `attachment.put`→`AttachmentRef` (`composer/attachmentUpload.ts`, 10 §6.5); localPath sem upload/imagem inline via put                                                                          | Concluído (novo protocolo)                                                                                    |
| Menção `@` de arquivo / pasta                              | Menção do ChatPromptEditor                                           | `enableMentionPanel` + `fileService.listWorkspaceFiles`                                                                                                                                         | Concluído                                                                                                    |
| Menção `@` de whiteboard                                   | Menção de whiteboard                                                  | `onWhiteboardMentionSelected`                                                                                                                                                                   | Concluído                                                                                                    |
| Menção `$` de skills                                      | Menção de skills                                                     | `skillsService`                                                                                                                                                                                 | Concluído                                                                                                    |
| Menção `#` de sessão                                      | Store antigo zcodeSessionStore/taskQueryCache                        | `sessionsMentionProvider` com fonte v4 sessions-index (`useWorkspaceSessionsIndexItems`)                                                                                                        | Concluído (troca de fonte)                                                                                    |
| Catálogo completo de slash `/`                             | `SlashCommandPlugin` (workspace slashCommands+skills+subagentes em broadcast) | command só exibe o catálogo slash do workspace da CLI; skills e subagentes continuam usando seus catálogos; a UI não acrescenta commands nem mantém whitelist embutida                          | Concluído                                                                                                    |
| Comando `/` não reconhecido → envio direto à CLI          | customCommandPromptResolver                                          | Não consome quando há anexo ou contexto de web element; `text.startsWith("/")` sem anexo de contexto vai por `handleSlashCommand`, e o não reconhecido é enviado direto por sendText                  | Concluído                                                                                                    |
| Árvore de arquivos do workspace «adicionar à conversa»     | Evento global                                                        | `WORKSPACE_FILE_ADD_TO_CHAT_EVENT` → `appendWorkspaceFileMentionToComposer` (somente pane principal)                                                                                          | Concluído                                                                                                    |
| Máquina de estados enviar/parar/enfileirar                  | submitControl do ChatViewComposer                                    | `canSend` / `showStopControl` / `mode==="choice"` dois botões, lendo `inputRouting.mode` + `control.canStop`                                                                                       | Concluído                                                                                                    |
| Botão de envio da fila durante streaming                   | `shouldShowStreamingQueueSendButton`                                  | Modo `choice` da v4 com dois botões (limpar a fila / manter a fila e enviar imediatamente)                                                                                                     | Concluído (semântica de fila v4)                                                                            |
| Esc → parar a geração (não parar por engano em popover)   | `useChatViewEffects.shouldIgnoreEscapeForStopGeneration`             | `composer/escapeStop.ts` + keydown de window no `SessionPane` (somente pane principal, com gate `control.canStop`) → comando `stop`                                                                | Concluído                                                                                                    |
| Barra: modelo / profundidade de pensamento / modo / uso de contexto | ChatInputToolbar                                                  | `V4ComposerToolbar` (reaproveita o antigo chat-input-toolbar para exibição; valores lidos de config, escritos por comandos v4)                                                                     | Concluído                                                                                                    |
| Atalhos de teclado da barra Ctrl+M / Ctrl+Shift+M / Ctrl+T | `useToolbarShortcutBindings`                                         | `composer/toolbarShortcuts.ts` (restaurado como lógica pura); Ctrl+M→openRequestKey abre o menu, Ctrl+T→`getNextThoughtLevelValue`→switchModelConfig, Ctrl+Shift+M→`getNextConfigSelectValue`→switchCollaborationMode | Concluído (completado nesta rodada)                                                                        |
| Interruptores de comportamento da fila autoDrain / followupMode | — (específico da v4)                                             | `V4ComposerQueueToggles` (reaproveita o testid input-control do M4)                                                                                                                             | Concluído (novo na v4)                                                                                       |

### Cadeia de codeComment para adicionar à conversa

A pré-visualização do código e o composer continuam desacoplados por um evento cancelável dentro do renderer, sem novos campos de protocolo. Apenas o pane principal com `listenAddToChatEvents=true` pode reivindicar o evento, evitando que um clique em tela dividida escreva em várias caixas de entrada; a origem do comentário continua guardando seu próprio `workspaceIdentity`, e a remoção casa com precisão por «chave do workspace de origem + id do comentário».

```text
代码预览提交评论
  -> CODE_COMMENT_ADD_TO_CHAT_EVENT
  -> primary V4 composer claim
  -> codeComment chip + 可发送状态
  -> buildPromptWithCodeComments
  -> sendText（仍是普通文本）
  -> accepted 后清 chip，并同步移除来源代码预览
```

Quando o envio é `blocked`, exige segunda confirmação de fila ou lança erro, o chip e a pré-visualização do código não são limpos, e o usuário pode tentar novamente diretamente. Esta cadeia altera apenas o conteúdo do rascunho no renderer; não altera a entrega de mensagens, o snapshot, a fila ou os limites de owner do `desktop-continuous` da desktop e do `web-remote-replayable` do celular.

## II, Presente na versão antiga e não integrado na v4 (disposição e motivo)

| Capacidade                                     | Origem na versão antiga                                                  | Situação atual v4                | Disposição / motivo                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Guarda de compactação de contexto antes de trocar de modelo | `onRequestContextCompressionForModelSwitch` (`modelSwitchContextWindowGuard.ts`) | ✗ (módulo removido junto com a onda) | Prazo encerrado: a v4 não ressuscitou; a entrada `/compact` da superfície de uso de contexto continua (`onSendCompressionCommand`) |
| Recuperação de provider                         | `onRecoverWorkspaceProvider` (superfície de configuração de recuperação)  | ✗                                 | Não integrar antes da v4ização das superfícies de configuração/recuperação; não pertence ao núcleo de entrada da sessão |
| contextHeaderContent (slot de banner do cabeçalho) | prop do ChatViewComposer                                            | ✗                                 | Não há fonte de conteúdo de cabeçalho v4 correspondente; é um slot puramente de exibição, integrar se necessário |
| onFocus (`handleInputFocus`)                     | onFocus do ChatPromptEditor                                             | ✗                                 | Antes servia para limpar efeitos colaterais de bloqueio/foco; na v4 a superfície de permission é controlada por `inputRouting.mode`, não pelo foco do composer |
| Ocultar o composer por blockingRequestId         | `display:none` do ChatViewComposer inteiro                               | Substituído por gate de `mode`    | A v4 usa `inputRouting.mode` (reject→editing desabilitado, guide/choice→sem envio direto) no lugar de ocultar tudo, semântica equivalente |
| Portal externo de triggerPanelContainer         | `setTriggerPanelContainer`                                              | Fallback interno do ChatPromptEditor | Concluído (equivalente): `internalTriggerPanelContainer` se resolve sozinho, a v4 não precisa de container externo |

## III, Explicação da política de envio com Enter

Na versão antiga, a única origem de `preferEnterNewline` é `isWebRemoteControl` (`ChatViewComposer.tsx:177
preferEnterNewline: isWebRemoteControl`), e não uma opção de usuário:

- Desktop: `preferEnterNewline=false`, Enter envia, Shift+Enter quebra linha.
- Controle remoto Web no celular: `preferEnterNewline=true`, Enter quebra linha, o envio é feito pelo botão.

O composer da v4 continua calculando tudo de forma unificada por `resolveChatEnterSubmits` e passando `isWebRemoteControl` como
`preferEnterNewline`; o gate de viewport móvel continua sob responsabilidade dessa função, e a semântica do celular não pode se espalhar para o desktop.

## IV, Conclusão

As capacidades centrais da caixa de entrada (editor / rascunho / histórico de prompts / cadeia completa de anexos / menções / slash / máquina de estados enviar-parar /
Esc-parar / barra + atalhos de teclado / placeholder dinâmico / política de Enter) estão totalmente alinhadas com a versão antiga. Os itens não integrados são
**acima do escopo do vertical slice da v4** (revisão de código/recuperação de provider) ou **já com prazo encerrado** (guarda de compactação na troca de modelo),
e não omissões.

**Retificação (2026-07-07)**: a auditoria acima cobriu apenas o composer de «sessões existentes»; o **estado de rascunho (sessionId=null) foi auditado por inteiro como ausência**,
o que é uma omissão real e não se inclui na conclusão de «não é omissão». A auditoria complementar está na §V.

## V, Reconciliação do estado de rascunho (draft / estado vazio) — auditoria complementar de 2026-07-07

Linha de base de referência: o caminho de rascunho do `ChatView.tsx` online do z-code-2 (ramos `shouldShowChatViewEmptyState` /
`shouldUseCenteredDraftChatLayout`) + `ChatInputToolbar.tsx` (ramo `taskId=null`).
Suporte atual da v4: `SessionPane` (`sessionId===null` → `draftMode`), `ConversationComposer`,
`V4ComposerToolbar`.

Causa raiz atual em uma frase: o trio da barra na v4 (modelo/profundidade de pensamento/modo) está todo condicionado a `config !== null`,
e `config` vem apenas da projeção de sessão `snapshot.config` — no estado de rascunho não há projeção → os controles não são renderizados; o caminho de escrita
`dispatchConfigCas` também faz skip quando `!sessionId`. A casca de estado vazio (menu do workspace/saudação/layout centralizado) simplesmente não foi integrada.

### 5.1 Superfície de configuração da barra (estado de rascunho)

Solução unificada (em par com 10-protocol-spec §4.2.3 R-19): **no estado de rascunho, leitura e escrita usam a configuração padrão do workspace, carregada no primeiro envio com**
`createSession.config`.

- Superfície de leitura: o `currentValue` de `useToolbarConfigOptions(workspacePath, null, workspaceIdentity)`
  (= padrão do workspace, serviço de superfície de config vivo; quando migrar para o topic v4 `workspace-config` a superfície consumidora não muda).
- Hidratação de catálogos (decisão da segunda reteste em 2026-07-07): depois que o hook antigo `useWorkspacePrepare` foi removido no M5②,
  ninguém inicializa mais os catálogos no estado de rascunho (sempre vazios → controles ocultos, agent não iniciado → primeira escrita de default falha).
  A responsabilidade de hidratação fica com o effect de montagem de `useDraftConfigControl`: quando faltam catálogos, `readWorkspaceState`
  busca e escreve no store (voo único por workspace; aproveita para subir o agent do workspace); durante a hidratação o menu de modelos
  permanece visível com um trigger de placeholder (basta o agrupamento de snapshot do app provider estar pronto para abrir).
- Limite de prontidão dos catálogos (correção de bug em 2026-07-21): `configOptions` e `slashCommands` são dois catálogos independentes,
  e não se pode mais usar «o catálogo de modelos já existe» para representar que ambos foram hidratados. A transição task → draft herda o catálogo de modelos, mas limpa
  os comandos slash da sessão anterior; nesse caso o catálogo slash vazio precisa acionar de novo o mesmo voo único de `readWorkspaceState`
  e gravar de volta no bucket de identidade do workspace atual por `workspaceIdentity?.trim() || workspacePath`.

      task → draft
          ├─ configOptions: preservado ───────┐
          └─ slashCommands: esvaziado ──────┼─ qualquer catálogo não pronto → readWorkspaceState
                                       └─ ambos os catálogos prontos → pula o RPC

  Essa correção apenas repõe a hidratação de catálogos de rascunho no renderer; não altera a entrega de mensagens, o snapshot, a fila nem os limites de owner do desktop continuous ou do web remote replayable.

- Limite conhecido de navegação entre sessões (correção de bug em 2026-07-22): `slashCommands` é um catálogo no nível da identidade do workspace,
  e ao selecionar uma task existente do mesmo workspace não se deve limpar primeiro e esperar o conversation projection preencher; o projection
  só restaura o estado da sessão, não é responsável por escrever os catálogos de workspace consumidos pelo composer. Na recuperação a frio ou quando o catálogo
  está de fato vazio em estado antigo, `useDraftConfigControl` também lê o workspace state de forma independente mesmo com sessão existente, mas não sobrescreve
  a config da task nem aplica a semente global de modelo do rascunho àquela sessão.

      draft / task A: catálogo slash do workspace pronto
                      │ seleciona a task B conhecida (mesma identidade de workspace)
                      ├─ catálogo não vazio ──> preservado como está, composer já utilizável
                      └─ catálogo vazio ──> readWorkspaceState ──> completa o catálogo do workspace

  Essa correção não altera a cadeia principal do desktop continuous nem espalha a hidratação de catálogos para semântica de snapshot, gap, fila ou owner do mobile replayable.

- Autoridade do catálogo de comandos (2026-07-22): o catálogo slash de workspace do protocolo CLI é a única fonte de command.
  A UI remove o `extraSlashCommands` da migração M5, a whitelist embutida e o fallback `/goal` do GLM; `/goal`,
  `/compact`, `/init` e custom command seguem exatamente o que a CLI retorna. O alias privado `/resume-goal` da UI é removido,
  e a retomada de goal volta a usar o `/goal resume` já declarado pela CLI. O limite de envio mantém o roteamento de commands, mas deixa de participar da declaração de catálogos.
- Superfície de escrita: reaproveita o `lib/zcodeWorkspaceDefaultConfigControl.ts` vivo (escreve o default do workspace,
  garantindo a semântica de «a próxima sessão nova herda a última escolha» — o bug online de escrever apenas no draft sem escrever no default já foi corrigido, com o comentário preservado).
- Primeiro envio: `createSession` carrega `config` (partial, já suportado pelo protocolo em `command.ts`), e a CLI faz a mesclagem conforme R-19 entre o valor real do runtime e a config da requisição para obter o valor inicial da sessão; a UI não depende mais de «criar a sessão e só então trocar a config».

| Capacidade                                                          | Origem na versão antiga                                              | Situação atual v4                                                                                        | Disposição                                            |
| ------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Escolha de modelo no estado de rascunho (mostrar o default do workspace + permitir troca) | `taskId=null` do ChatInputToolbar + `useToolbarConfigOptions` | `resolveDraftEffectiveConfig` (composer/draftWorkspaceDefaults) sintetiza config somente para exibição      | **Concluído (2026-07-07)**                          |
| Escolha de modo no estado de rascunho                               | Idem                                                                  | `resolveDraftModeCurrentValue` + ramo draftMode de `V4ComposerModeSwitch`                                    | **Concluído (2026-07-07)**                          |
| Profundidade de pensamento no estado de rascunho                     | Idem                                                                  | currentValue do catálogo de thought com fallback (mesmo effectiveConfig)                                    | **Concluído (2026-07-07)**                          |
| Escolha no rascunho escreve no default do workspace (dupla semântica: primeiro envio atual + herança por sessão nova) | `setWorkspacePreferredModelWithSessionControl`           | `useDraftConfigControl` (escreve default + escrita direta no store pelo catálogo autoritativo) + `config` transportado em `createSession` | **Concluído (2026-07-07)**             |
| Atalhos de teclado da barra Ctrl+M / Ctrl+T / Ctrl+Shift+M valem no estado de rascunho | `useToolbarShortcutBindings`                            | Restaurados naturalmente com effectiveConfig não vazio                                                     | **Concluído (2026-07-07)**; asserção e2e pendente (ver §5.6) |
| Valor inicial não vazio da barra após criar a sessão                 | Settings do protocolo antigo sempre tinha valor                       | A semente R-19 da CLI já está implantada (c7ee7b914)                                                       | **Concluído (lado da CLI)**                           |

### 5.2 Casca de estado vazio (empty state)

| Capacidade                                                                        | Origem na versão antiga                                          | Situação atual v4                                                                                                                                   | Disposição                         |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Menu de troca de workspace (busca/máximo de 5 itens/abrir pasta/entrada SSH remoto/filtro de remote desconectado) | `ChatEmptyWorkspacePreviewMenu` (ChatEmptyState.tsx)       | Componente reutilizado como está; a casca (WorkspaceShellLayout) monta `draftComposerHeader` que passa por V4WorkspaceChatArea/V4ChatPane → SessionPane → composer contextHeader | **Concluído (2026-07-07)**       |
| Seletor de branch do Git (estado vazio, travado para cima)                          | `contextHeaderContent` do ChatView                                | Idem (`avoidPopoverCollisions=false` preservado fielmente da correção antiga)                                                                         | **Concluído (2026-07-07)**       |
| Saudação por horário + logo do ZCode                                               | `ChatView/ChatViewEmptyState.tsx`                                 | Restaurado como `v4/ConversationDraftEmptyState.tsx` (prop compactForRemoteControl convergido para responsividade max-md)                                 | **Concluído (2026-07-07)**       |
| Layout de rascunho centralizado (composer centralizado verticalmente)             | `shouldUseCenteredDraftChatLayout`                                | Ramo draft do SessionPane: saudação + composer (`centered`, max-w-2xl sem sticky) centralizados verticalmente                                          | **Concluído (2026-07-07)**       |
| Âncora e2e `TID_CHAT_EMPTY`                                                       | Área de estado vazio do ChatView                                   | Carregada pelo container centralizado do draft                                                                                                        | **Concluído (2026-07-07)**       |
| Entrada de scratch workspace (área de trabalho temporária)                        | `ChatEmptyScratchWorkspaceDialog` (via menu de estado vazio)       | ✗ (componente vivo e não integrado; a entrada antiga não fica dentro do componente de menu)                                                          | Pendente (confirmar antes a titularidade do gatilho antigo) |

#### 5.2.1 Posição do título em janelas de baixa altura (2026-07-30)

- A altura padrão continua usando o layout centralizado existente de «saudação + dock do composer», sem alterar as distâncias já existentes entre Logo, título, composer, banners e templates.
- O grupo de conteúdo do rascunho adota uma restrição de centralização segura e contínua: com espaço suficiente em cima e embaixo mantém o conjunto como um todo centralizado; quando falta espaço, para de subir.
  A janela desktop continua usando o piso nativo base de `480 × 640px` compartilhado entre páginas, e o renderer é proibido de chamar `setMinimumSize` ou `setBounds` dinamicamente conforme a altura do DOM do
  rascunho, senão a quebra de linha localizada provocada por mudança de largura formaria um laço de feedback de arraste `ResizeObserver → IPC → janela nativa crescendo de volta`.
  O topo do título preserva `52px`, e abaixo do último cartão preserva `16px`; quando o monitor ou a janela atual não consegue acomodar todo o conteúdo, a própria timeline do rascunho
  garante o alcance do conteúdo por rolagem. É proibido escrever a altura total da janela em função de `zh-CN`, `en-US` ou de qualquer amostra de texto atual.
  É proibido alternar abruptamente entre os dois layouts por um breakpoint de altura fixa, evitando que ao cruzar a altura crítica o grupo título + Logo + composer
  salte inteiro. Na largura padrão de tela larga, o título de saudação, o Logo e o dock do composer devem compartilhar
  o mesmo eixo central horizontal; o container de layout de estado vazio não pode deixar o container de saudação voltar ao alinhamento pela borda inicial. No topo e na base usam-se spacers de elasticidade contínua:
  com espaço suficiente o espaço em branco é dividido igualmente para manter a centralização geral original; quando limitado, param respectivamente nos pisos `52px` e `16px`,
  e não se pode usar duas trilhas de Grid `1fr` com pisos diferentes para erguer incorretamente a base até `52px`.
- O título de saudação mantém por padrão `30px`, e o tamanho da fonte não pode ser vinculado à largura da janela, à largura do chat ou a breakpoints fixos de viewport.
  Somente quando o texto do título, após diagramado a `30px`, realmente excede a largura horizontal disponível do próprio título é que se reduz em degraus de `1px` conforme a lacuna real, com mínimo de `20px`; enquanto houver espaço dos dois lados do título, mesmo que a janela já tenha atingido o tamanho mínimo,
  é obrigatório manter `30px`. A medição precisa se basear no texto real após localização, evitando que o chinês encolha sem estar comprimido ou que um texto longo em inglês
  já comprimido continue usando um tamanho de fonte grande.
- A medição de título acima e as distâncias seguras de `52px / 16px` valem apenas para a página inicial de rascunho do desktop. O `/remote` do celular continua usando o
  título compacto de `20px` e o layout centralizado `justify-center + 16px gap`, evitando espalhar para a interface mobile replayable o espaço decorativo e a lógica de medição do estado vazio do desktop.
- A restrição de baixa altura altera apenas o ponto de partida vertical do grupo de conteúdo do rascunho; a distância original entre o título e o dock do composer permanece, e
  a parte excedente continua sendo absorvida pelo container de rolagem da timeline existente. O container de layout do rascunho precisa preservar a altura intrínseca do conteúdo, e não pode usar
  `h-full min-h-0 overflow-hidden` para truncar o transbordo. A timeline de estado vazio do rascunho no desktop começa sempre pelo topo,
  evitando que a semântica existente de ancoragem inferior role para fora da viewport a margem segura do topo; ao sair do estado vazio do rascunho a semântica original de ancoragem inferior da sessão é restaurada.

### 5.3 Lógica de comportamento do rascunho

| Capacidade                                                                   | Origem na versão antiga                             | Situação atual v4                                     | Disposição                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pré-aquecimento de draft session (`draftSessionId`: pré-cria uma sessão real, reaproveitada no primeiro envio) | `useWorkspacePrepare` e afins       | Pré-aquecimento nativo da v4 (§5.4, `useDraftSessionPrewarm`)                                                 | **Integrar (a decisão de «não ressuscitar» foi revogada na quarta reteste de 2026-07-07)**: a decisão original descartava junto a dívida de correções da cadeia antiga de pré-aquecimento e o próprio pré-aquecimento, com a consequência de que a config do rascunho passava a usar o RPC antigo de workspace-default (a resposta `buildWorkspaceState`, sem sessão registrada, criava um app completo na hora, 140-798ms por vez). A forma na v4 está na §5.4 — as três correções da cadeia antiga continuam com prazo encerrado na forma v4 |
| Herança do provider de rascunho ao trocar de workspace (o provider lembrado do workspace de destino tem prioridade) | `workspaceDraftProvider.ts` (vivo) | `App.handleStartDraftInWorkspace` já chama essa função; o onSelectWorkspace do menu de estado vazio é exatamente essa cadeia         | **Já vivo (revisão em 2026-07-07, sem código novo)**                                                                                                                                                                                                                                  |
| Recuperação de provider `onRecoverWorkspaceProvider`                             | Já registrada na §II                                 | ✗                                                                                             | Mantém a decisão da §II: não integrar antes da v4ização das superfícies de configuração/recuperação                                                                                                                                                                                                                                      |

### 5.4 Estado de rascunho = pré-aquecimento de draft session da v4 (decisão do usuário em 2026-07-07: «funcionalidade essencial»)

Forma desejada: **entrar no estado de rascunho já cria a draft session da v4 (`createSession` sem firstInput → phase=draft,
puramente em memória e sem persistir), e ela é o portador do pré-aquecimento** — alinhado à intenção de projeto da §4.2.1 de 10 («se o pane estiver ligado a uma draft session, o servidor já tem uma entidade de sessão»). Benefícios: espera zero no primeiro envio; a escrita de config passa pelo comando CAS nativo da v4 (sem entrar mais no caminho quente de buildWorkspaceState do RPC antigo de workspace-default); a barra lê a projeção da sessão (a semente R-19 dá o valor real do runtime).

Critério de implementação (`useDraftSessionPrewarm` + fiação no SessionPane):

- **Criação**: quando o pane não está ligado a uma sessão (sessionId=null), faz `createSession` em segundo plano; um pane de draft com split explícito
  continua sendo pré-aquecido como pane independente e mantém o isolamento semântico de vínculo. O owner do mesmo rascunho lógico é fixado como
  `{ workspaceKey, paneId, transportGeneration }`: remontagens de componente no mesmo event loop e reexecuções de effect do StrictMode
  precisam reutilizar o mesmo pré-aquecimento pending/ready, sem enfileirar `createSession` de novo. Se uma remontagem após desmontagem real ainda tiver a criação antiga
  em voo, é preciso esperar a aposentadoria do owner antigo terminar.
  Quando `draftRuntimeInvalidationVersion` muda continuamente, só se mantém a geração-alvo mais recente; se a criação antiga ainda estiver em voo, é preciso esperar seu ACK, enviar primeiro a
  limpeza e só então criar a geração mais recente — em qualquer instante há no máximo um `createSession` em voo por owner.
- **Semântica de vínculo inalterada**: externamente o pane continua sendo draft (o activeTaskId da casca continua null, e as decisões de draft no nível da casca como WorkspaceHeader
  não são afetadas); a sessão pré-aquecida é o effectiveSessionId interno do pane, e lease/projeção são assinados normalmente. A UX de rascunho (saudação/centralização/menu de workspace) continua chaveada a pane sessionId===null.
- **Fonte única de intenção para a config do rascunho**: modelo, profundidade de pensamento e modo são escritos primeiro na intenção de rascunho reativa do renderer,
  e a barra reflete na próxima frame; modelo e thought formam uma mesma tupla de configuração, e ao trocar de modelo não se pode herdar o thought do modelo de origem.
  Depois que o pré-aquecimento fica pronto, usa-se apenas o comando CAS da v4 para escrever direto no App existente desse sessionId explícito. O clique no rascunho é proibido de enviar de novo
  `workspace/setDefaultModel|ThoughtLevel|Mode`, e também não pode esperar adifusão do workspace state para atualizar a UI.
- **Aptidão de thought pertence ao modelo alvo**: enquanto a intenção de rascunho não estiver ligada a uma sessão autoritativa, lê-se primeiro o metadata do provider;
  uma sessão já ligada/histórica/fork deve ler `SessionConfigState.thoughtLevels`, projetado atomicamente pelo `listThoughtLevels()` do runtime do Agent a partir do mesmo snapshot/evento de `provider/model/thought`. Modelos como GLM-5.2, completados dinamicamente pela estratégia padrão da CLI, não podem depender do cache de task config legado nem tomar emprestado o catálogo do modelo de origem nem recuar para os cinco níveis genéricos fixados no cliente.
- **Confirmação por projeção e persistência**: a projeção do pré-aquecimento só confirma a config real do runtime; só depois que a projeção bate com o provider/model (e o thought explícito) da intenção mais recente é que a tupla model + thought é persistida por inteiro.
  Uma projeção atrasada não pode sobrescrever uma intenção de rascunho mais nova. Se o pré-aquecimento não estiver pronto, a intenção é criada junto com `createSession.config`;
  depois de pronta, só se reenviam os campos que ainda estão inconsistentes.
- **Ordem e mesclagem**: comandos de config e primeiro envio compartilham a mesma barreira de ordem; o envio precisa esperar a convergência da intenção mais recente. Seleções rápidas consecutivas podem mesclar valores intermediários que ainda não começaram, sincronizando apenas a última intenção; não se deixa um valor antigo ser reproduzido item a item na fila.
- **Primeiro envio**: `sendText` envia direto para a sessão pré-aquecida (anexos são enviados a ela por `attachment/begin -> chunk -> commit`, sem necessidade do esquema de duas etapas «criar sessão vazia e depois enviar anexos») → após o sucesso o pane é ligado formalmente via onSessionCreated.
  Antes de o renderer emitir o primeiro comando de admissão, ele precisa marcar o vínculo original como `promotion-pending` de forma síncrona;
  após o ACK accepted vira `promoted`, e rejeição explícita ou invalidez vira `discarded`. A inicialização de MCP, hooks ou a contrapressão do transport
  podem fazer o Agent já estar rodando enquanto o renderer ainda espera o ACK; nessa janela o owner cleanup não pode tratar aquela sessão como um draft não utilizado e apagá-la.
  Pré-aquecimento ausente/inválido (reinício da CLI faz a sessão em memória sumir, sendText é recusado) → Volta ao caminho existente
  `createSession + config`, sem perda de semântica.
- **Limpeza**: sair sem ter enviado (selecionar outra task/trocar de workspace/fechar o split/desmontar) → `deleteSession`
  da sessão pré-aquecida; o cleanup do effect dá primeiro uma chance de takeover para a remontagem síncrona do mesmo owner, e só limpa depois de confirmar uma saída real.
  Somente sessões pré-aquecidas ainda em `draft` podem ser apagadas automaticamente; `promotion-pending`, `promoted` e `discarded` proíbem
  o cleanup de enviar `deleteSession`, evitando fechar um runtime que já foi admitido ou cujo resultado é desconhecido.
  Quando um `createSession` já emitido não pode ser cancelado, o owner mantém o estado retiring até o ACK chegar e a exclusão ser enfileirada, e nenhum novo
  owner pode contorná-lo criando em paralelo. Orfãos que o renderer não conseguiu limpar a tempo somem com a saída da CLI (estado em memória), o que é aceitável.
- **Propriedade de workspace / transport**: o recurso de pré-aquecimento não é um `sessionId` cru reutilizável entre workspaces, mas um
  binding `{ workspaceKey, paneId, transportGeneration, sessionId, controller, dispatchCommand }` pertencente a um mesmo owner. `workspaceKey` continua sendo uniformemente `workspaceIdentity?.trim() || workspacePath`;
  a troca de transport é distinguida pela identidade de `SessionDataLayer` mantida pelo workspace connection registry; a reconstrução do provider wrapper, que produz uma nova função `sendCommand`, não pode ser confundida com troca de geração. Quando apenas o lease muda dentro do mesmo workspace,
  atualiza-se o lease daquele binding sem reconstruir o pré-aquecimento; quando o workspace ou o transport mudam de geração, o novo render
  deixa de expor imediatamente o binding antigo, e o cleanup do binding antigo só pode apagar a sessão antiga pelo dispatcher que a criou. O ACK de primeiro envio, falhas de assinatura e outras
  fechaduras assíncronas devem capturar e operar o binding original, é proibido operar por engano um binding criado depois via `controllerRef.current` ou um dispatcher global mutável. Essa restrição vale igualmente
  para local, SSH/WSL/Docker e Web shared-host attachment, sem acrescentar caso especial remoto nem runtime separado.
- **Isolamento de lista**: o `isDraftSession` do gateway da CLI (persistence=deferred) já exclui drafts do sessions-index tanto no fanOutToIndex quanto na semente de partida a frio, então a sessão pré-aquecida não
  vaza para a barra lateral como «nova task».
- **Cadeia de degradação**: enquanto o pré-aquecimento falha/não está pronto, a barra volta ao currentValue dos catálogos do workspace (§5.1
  só fornece catálogo de modelos/capacidades; a seleção atual continua sendo a intenção de rascunho do renderer), e a interação não fica bloqueada.

O estado da config de rascunho e a ordem de sincronização são fixos:

```text
toolbar click
  -> renderer draft intent（立即回显）
  -> explicit prewarm sessionId
  -> v4 switchModelConfig | switchCollaborationMode
  -> CLI existing App
  -> projection confirms actual config
  -> persist confirmed model + thought tuple

first send
  -> seal/flush config intent
  -> sendText
```

`workspace/setDefault*` é a interface de compatibilidade do catálogo de workspace e não faz parte da cadeia de interação de rascunho da v4. Mesmo que sua implementação ainda seja chamada por
outras entradas antigas, ela não pode atender a um único clique de configuração por meio de «criar um App temporário completo, carregar plugin/MCP, mapear estado e fechar imediatamente».

#### 5.4.1 Continuidade do composer na promoção do primeiro envio (2026-07-10)

Quando o primeiro envio do rascunho promove de `sessionId=null` para uma session formal, o `ConversationComposer` precisa manter
a mesma instância React e o mesmo DOM do editor, sem desmontar e reconstruir por causa de pais diferentes entre o container centralizado do rascunho e o bottom dock da timeline da sessão.
O estado de rascunho e o estado de sessão compartilham um conversation viewport continuamente montado: no rascunho,
apenas o layout centraliza saudação e composer; após o vínculo formal, apenas o layout move o mesmo composer para o bottom dock.
Esta rodada não adiciona animação de deslocamento.

```text
draft centered viewport
  -> send accepted / sessionId bound
  -> snapshot pending: blank timeline + same visible disabled composer
  -> first userInput projection: normal timeline + same composer dock
```

- Enquanto o primeiro snapshot / a primeira linha `userInput` ainda não chegam após o vínculo, a área de conteúdo da timeline fica em branco; não se exibe
  «envie a primeira mensagem para começar a conversa», e a UI não fabrica otimisticamente uma linha de usuário.
- Uma sessão formal que realmente existe mas tem rows vazias usa igualmente timeline em branco + composer inferior.
- O composer continua sendo limpo após o sucesso do envio, no ACK accepted do comando; a promoção precisa capturar e limpar o escopo de rascunho existente no momento do envio,
  proibindo que, depois da mudança de escopo de `__draft__` para sessionId, sobre a primeira entrada e reapareça ao criar uma nova task.
- subscribe error continua usando layout de erro dedicado; esta seção só restringe a promoção normal de rascunho → sessão.
- desktop e Web no celular compartilham a mesma identidade de componente e o mesmo layout responsivo; não altera os limites de entrega de projeção de `desktop-continuous` /
  `web-remote-replayable`.

### 5.5 Semântica de registro da troca de modelo (decisão da quinta reteste em 2026-07-07)

Decisão do usuário: **a ação de troca é uma intenção, não um fato da timeline**. No estado de rascunho ainda não houve envio de mensagem (captura
sess_54392f61: [modelChange] pendurado acima da primeira mensagem), e trocar durante a edição também é apenas preparação —
nenhum dos dois entra na timeline; depois do envio, só quando o modelo realmente mudou em relação ao turno anterior é que o registro é feito.

- **Momento do marker** (projeção da CLI, spec 10 §config «R-17 detalhes de momento»): o marker `modelChange`
  é decidido por onTurnStarted pelo critério «a identidade provider/model deste turno ≠ a identidade provider/model do último turno efetivamente iniciado»;
  a profundidade de pensamento atualiza apenas `config.thought` e os parâmetros da requisição, não gera
  `modelChange`,
  e é posicionado antes da linha turnHeader do novo turno; o primeiro turno (sem base anterior) nunca gera marker;
  uma variação líquida A→B→A não gera marker. onModelSelected apenas atualiza a config, sem gravar marker
  (a implementação antiga gravava o marker no evento de seleção de modelo, exatamente a causa raiz do bug do estado de rascunho).
- **Identidade do texto do marker** (2026-07-29): o marker da CLI já carrega os IDs de provider/model inicial e final;
  o renderer precisa assinar o snapshot de provider e mapear os nomes de fornecedor. Fornecedores embutidos Z.ai / BigModel mostram apenas
  o modelId; outros fornecedores mostram `provider.name/modelId`, com fallback para o ID do provider quando a config está ausente. Essa regra é consistente com o gatilho de modelo
  e o toast, não altera o schema do marker, seu posicionamento nem as semânticas desktop continuous ou mobile replayable; quando o catálogo for hidratado depois ou o fornecedor for renomeado,
  markers já renderizados precisam atualizar o nome no lugar.
- **toast = aviso de queda de desempenho, não confirmação de troca** (atualizado em 2026-07-29, substitui a correção da sexta reteste de 2026-07-07 e é mais estrito na 2026-07-30 para o limite de rascunho): só uma troca explícita de identidade `provider + model` em uma sessão já vinculada
  mostra imediatamente os textos changed + warning; seleções comuns no estado de rascunho, a recuperação de custom provider por configOptions error
  e o fallback de prewarm não mostram toast. O aviso não espera o ACK da troca e não significa que o comando já tenha sucesso.
  O fallback automático do agent registry reutiliza o mesmo texto quando, no pane em foco de uma sessão já vinculada, observa em tempo real pela primeira vez um frame `online` com uma transição autoritativa A→B originada; prewarm de rascunho, initial/recovery, snapshot histórico, o snapshot online completo que estabelece o primeiro
  applied base, delta duplicado e panes em segundo plano não avisam. O CAS de last-selected do fallback automático só ocorre junto com
  essa callback em tempo real; diferenças de snapshot comuns não escrevem. Os dois estados continuam não sendo escritos pela UI como linha de timeline; o momento do
  marker continua seguindo o item anterior. A cadeia completa de decisão atual está em
  `docs/chat/manual-model-switch-resolution-chain.md`.
- **Determinismo de replay**: o marker é derivado deterministicamente da sequência de eventos (ModelSelected + TurnStarted),
  e a recuperação a frio / o replay de fork usam o mesmo critério; a hidratação do transcript não sintetiza marker de modelChange,
  não havendo problema de migração de histórico.

### 5.6 Critérios de aceitação

- e2e: no estado de rascunho os controles de modelo/modo/profundidade de pensamento são visíveis e o valor = default do workspace; trocar o modelo no rascunho → o `config` da primeira projeção da nova sessão é igual ao valor escolhido (por `createSession.config` + mesclagem da semente R-19); no estado vazio ficam visíveis o menu de workspace / a saudação / a âncora do layout centralizado.
- Matriz de cobertura: pelas regras do repositório, primeiro completar `docs/conversation-session-case-catalog.md` e
  `docs/testing/conversation-session-e2e-coverage-matrix.md` e só então escrever os cases.

## VI, Reconciliação do painel de uso de contexto — sétima revisão em 2026-07-07

Atualização de 2026-07-09: durante a refatoração foi adicionado a `ChatContextUsage` um ramo derivado de `contextCapacityTokens`,
o que fazia o anel `0/max` ser renderizado mesmo quando só havia janela de modelo e uso real igual a 0; isso diverge da versão antiga.
O critério atual foi restaurado: a janela de contexto só é exibida quando `used > 0 && size > 0`; o saldo de Coding Plan /
Start Plan é independente do uso de contexto, mas só pode ser exibido depois de confirmado pelo «modo de conexão do modelo atual»
como OAuth Coding Plan, Team Plan ou Start Plan.

| Capacidade                                                                                                            | Versão antiga                                                                                                                                                             | Situação atual v4                                                                                                                                 | Disposição                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Linha de total (used/size + porcentagem, formato compacto de tokens)                                                                | ✅ exibida só com consumo real positivo                                                                                                                                   | ✅ integrada (`snapshot.usage.contextWindow`); consumo 0 deixa de ser derivado da capacidade do modelo                                               | Nenhuma                                                                                                                                                       |
| **Barra de progresso segmentada + proporção por item do breakdown**                                                                             | ✅ 7 classes de source (messages/system_prompt/meta_user_context/skills/tool_prompt/system_tool_schemas/mcp_tool_schemas), em ordem decrescente de proporção, mostrando só a porcentagem e não os tokens por item (evita leitura de grandezas misturadas) | ❌ o `SessionUsageState` da v4 não tem campo `breakdown`, o componente não recebe dados e o trecho inteiro não é renderizado                                              | **Integrar**: o payload `ModelComplete` da CLI já traz `contextUsageBreakdown` (o core `turn-model-step.ts` só anexa em main_turn) → basta schema aditivo na v4 + projeção + repasse na UI |
| **Taxa de acerto do cache**                                                                                                  | ✅ cumulativa `cacheHit.hitRate` (agregado do turno principal, `recordMainTurnCacheHitUsage`), **exposta apenas com ≥78%** (taxas baixas desviam a atenção da própria capacidade)                                             | ❌ igual acima, o `SessionUsageState` não tem campo `cache`                                                                                                 | **Integrar**: o payload `cacheHit.hitRate` já existe, mesma ligação em três camadas do breakdown                                                                                           |
| **Painel de uso do Coding Plan** (`ChatCodingPlanUsageRemainingPanel`: troca entre fornecedores, saldo restante, clique leva ao página de uso nas configurações e fecha o painel) | ✅ segue apenas a conexão Coding / Team paga atual                                                                                                                                      | ✅ a toolbar da v4 já integrou `codingPlanUsageRemaining`, com gate pelo provider atual + selected key da family; Team Plan tem fallback de entitlement snapshot | Nenhuma                                                                                                                                                       |
| **Painel de saldo do Start Plan** (zai/bigmodel: saldo, loading, clique na entrada de upgrade fecha o painel antes de ir às configurações)                            | ✅ segue apenas a conexão Start Plan atual, e é ocultado quando a mesma marca tem Coding pago ativo                                                                                                          | ✅ a toolbar da v4 já integrou `startPlanBalance`, mantendo o fallback de Start e o gate da conexão atual                                                     | Nenhuma                                                                                                                                                       |
| Quando não há usage mas há dados de plano, o trigger continua aparecendo (o estado de rascunho/nova sessão também consegue ver o uso do plano)                                       | ✅ (`!renderableTaskUsage && hasCodingPlan/hasStartPlan` continua renderizando)                                                                                                          | ✅ só aparece quando a conexão atual é Coding/Team/Start e há saldo exibível ou loading                                                                 | Nenhuma                                                                                                                                                       |
| Entrada de compactação `/compact` (`onSendCompressionCommand`)                                                               | Passado, mas **não consumido** pelo componente (parâmetro morto, `getContextCompressionCommand` sem referência em JSX)                                                           | Também passado                                                                                                                                     | Sem lacuna; o parâmetro morto pode ser limpo depois                                                                                                                 |

Lotes de implementação (executar após aprovação):

1. **Primeiro lote (superfície de dados de usage, puro repasse em três camadas)**:
   - `packages/shared/src/zcode-protocol-v4/snapshot.ts`: `sessionUsageStateSchema` ganha aditivamente
     `cache: { hitRate: number|null } | null` e `breakdown: ContextUsageBreakdownItem[] | null`
     (P-05 conflation inalterado; a extensão de semântica de usage G-02 precisa atualizar em sincronia 10-protocol-spec §4.2.4).
   - CLI `product-projection.ts` em `onModelComplete`: no main_turn, mesclar `payload.cacheHit.hitRate` /
     `payload.contextUsageBreakdown` no patch de usage (seguindo a decisão antiga do reducer «apenas o turno principal pode sobrescrever»).
   - UI `V4ComposerToolbar`: `taskUsage` repassa `cache`/`breakdown` (o `ChatContextUsage` já consome).
2. **Segundo lote (painéis de plano)**: já integrado. Se futuramente se extrair hooks, é obrigatório preservar o gate da conexão atual, o fallback de source do Team
   e o fallback de Start, sem regredir para «se a conta tem plano, mostra o saldo».