# Contexto de Elemento Web

O navegador embutido do ZCode suporta adicionar elementos da página ao contexto da conversa no desktop.

## Fluxo

1. O botão de seleção de elementos da barra de ferramentas do navegador entra em picking mode.
2. O `EmbeddedBrowserPane` injeta temporariamente o picker via Electron `webview.executeJavaScript`.
3. Ao passar o mouse, a página exibe internamente um destaque e um popup com informações básicas; ao clicar, o elemento atual é coletado e o modo é encerrado; Esc cancela o estado de seleção.
4. O Renderer dispara o evento `zcode:web-element-context-add-to-chat`.
5. O composer do chat exibe um chip do elemento web e, ao enviar, concatena o contexto em um bloco de texto Markdown.

## Ligação do Composer V4

O V4 não adiciona campos de protocolo; o contexto de elemento web continua sendo contexto de texto do prompt; o chip é apenas um invólucro visual do composer e do transcript.

```
EmbeddedBrowserPane
  -> zcode:web-element-context-add-to-chat
  -> ConversationComposer/useWebElementContexts
       workspaceKey = workspaceIdentity?.trim() || workspacePath
       transient in-memory contexts[]
  -> WebElementContextAttachmentChip
  -> submit:
       visible text + buildPromptWithWebElementContexts(...)
       contextAttachmentCount > 0
  -> SessionPane:
       parseV4VisibleSlashCommand(..., { contextAttachmentCount })
       contextAttachmentCount > 0 => do not consume /goal or /compact locally
  -> createSession/sendText
  -> ConversationRowView:
       parsePromptWebElementContexts(row.text)
       visible content + read-only WebElementContextAttachmentChip
```

## Fronteiras de Estado no V4

- O chip do composer só existe na memória do composer React atual; trocar de sessão, trocar de workspace ou recarregar a página limpa tudo.
- A persistência de rascunho salva apenas texto/editorState, não o contexto de elemento web.
- Após o envio bem-sucedido o contexto é limpo; em caso de falha o chip e o texto digitado são mantidos para facilitar a reenvio.
- `contextAttachmentCount` é usado apenas para a proteção de slash-commands no app e não entra no payload do protocolo v4.
- Copy/edit/retry do transcript usam o `row.text` original, portanto o bloco de contexto Markdown não se perde.

## Fronteiras

- A lógica de coleta roda apenas dentro do `webview` do desktop, sem passar pelo host process ou por service.
- Web / celular não leem DOM entre sites diretamente; a primeira versão não suporta essa capacidade.
- O contexto é atribuído ao workspace atual por `workspaceIdentity?.trim() || workspacePath`.
- Workspace remoto no V4 deve continuar passando `workspaceIdentity`; é proibido filtrar o contexto apenas por `workspacePath`.
- Não lê cookie, localStorage nem sessionStorage, e não coleta o value atual do input; campos de senha são mascarados.
- O conteúdo enviado ao ZCode Agent é texto Markdown puro, compatível com o provider atual.

## Campos Capturados

- URL e título da página
- nome da tag, role, accessible name
- selector e XPath
- texto visível e texto próximo
- whitelist segura de atributos
- bounding rect visível
- resumo de estilos computados: color, background color, font family, font size, font weight, display
- trecho de HTML sanitizado

Todos os campos de texto grandes são truncados antes de entrar no prompt.