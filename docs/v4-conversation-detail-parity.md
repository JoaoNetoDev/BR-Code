# Paridade de Detalhe da Conversa v4

Este documento registra as regressões de detalhes do z-code-2 que a renderização de sessão v4 precisa recompletar após o refactor. O escopo se limita à camada renderer / adapter e não altera a semântica de protocol, runtime, host process, relay ou session stream.

## Contrato de comportamento P0

### Erro de falha de ferramenta visível

Antes de o `ToolCallRow` v4 entrar na renderização antiga do `ToolCallBlock`, é preciso preservar informação de falha suficiente:

```text
ToolCallRow(status=error)
  -> toolCallRowToLegacyNode
  -> TaskChatToolCall(status=failed, error=erro legível)
  -> getToolCallErrorText
  -> ToolCallBlock / ToolOutput(error)
```

Prioridade de normalização do texto de erro:

1. `row.error.message`
2. `<tool_use_error>...</tool_use_error>` completamente involve em `row.output.text`
3. `row.output.text` não vazio
4. `row.error.code`

Ao mesmo tempo, é preciso preservar no `raw` legado as referências `rawOutput`, `status=failed`, `v4Status` e `output.truncated`, evitando que a renderização de ferramenta ou o diagnóstico percam novamente a causa raiz. `cancelled` não deve ser exibido como erro de falha.

### Detalhe à direita do link de arquivo

Os links de arquivo locais no markdown do assistant continuam passando pelo desvio de host da versão antiga do z-code-2:

```text
MessageResponse file link
  -> onOpenFileLink
  -> WorkspaceShellLayout.handleOpenMarkdownFileLink
      file      -> PreviewPane code viewer
      directory -> WorkspaceFileTree reveal
```

A cadeia de props do v4 precisa ir do shell até cada row renderer: `V4ChatPane` / `V4WorkspaceChatArea` -> `SessionPane` -> `ConversationRowRenderContext` -> `AssistantTextRowView` / `AssistantPreviewCards`. O `MessageResponse` continua responsável pelo sublinhado no hover, pelo context menu e pelo `Open With`; o v4 não reimplementa os estilos visuais.

### Localização de arquivo local no Windows

O clique com o botão direito em "Explorador de Arquivos", passando pelo IPC de platform/preload existente, entra no processo main; arquivos locais chamam `shell.showItemInFolder(path)` apenas uma vez (abre o diretório e seleciona o arquivo) e não executa mais `explorer.exe /select` seguido de uma segunda abertura pelo código de saída. O Explorer pode já ter delegado a abertura e ainda assim sair com código diferente de zero, e esse código não pode ser tratado como motivo para abrir de novo. Um retorno de sucesso significa apenas que a solicitação de localização foi enviada, sem garantir que a janela do sistema já foi exibida. Diretórios no Windows continuam usando `shell.openPath`; o Finder do macOS, o ramo de UNC do WSL e o controle remoto pelo celular mantêm o comportamento original.
Aceitação: caminhos de arquivo com caracteres chineses e espaços emitem apenas uma solicitação de localização e não iniciam um processo filho do Explorer; com o botão direito em uma máquina Windows real, aparece somente a janela do diretório alvo com o arquivo selecionado, sem uma janela adicional da área de trabalho.

Regressão automática: `openInEditor.test.ts` verifica a ausência de chamada de subprocesso; `test/e2e/manual-review/pending/windows-file-reveal.test.ts` verifica a contagem de chamadas reais do IPC preload/main até o shell (exclusivo de Windows, com shell mockado, sem provar a quantidade real de janelas).

## Checklist de auditoria P1

Os detalhes a seguir vêm da comparação com o z-code-2 e são registrados aqui, sem implementação no P0:

- A prioridade de preview de file target no Assistant Preview Card ainda precisa de auditoria separada, evitando que o cartão de diretório contorne o desvio de shell `stat`.
- As tool diagnostics de baixo ruído da versão antiga podem servir para investigar "a task terminou, mas a ferramenta continua exibindo em execução".
- A lógica que suprime o thinking shimmer para foreground active tool call precisa ter sua equivalência no v4 confirmada.
- No `/remote` do celular não há hover; a visibilidade das assistant actions precisa de auditoria separada.
- A entrada de carregamento da saída completa da ferramenta via `output.truncated.ref` no v4 ainda não foi completada.
- Os títulos `Error` / `Result` do `ToolOutput` continuam em texto em inglês e depois precisarão de convergência de i18n.

## Critério de verificação

Desta vez, primeiro se prova a projeção e a cadeia de callbacks com testes unitários de UI:

- `v4ToolCallRowAdapter.test.ts` cobre error somente por output, error marcado por tag, fallback por code e estados que não são de falha.
- `toolCallBlocks.test.ts` cobre que o node adapted com failed exibe o corpo do erro no cartão da ferramenta.
- Testes unitários de wiring de row/session do v4 cobrem os três tipos de callback de abertura (file/code/browser) entrando no `MessageResponse` e no tool row.

O E2E formal de WDIO pode complementar depois com o grupo `VDP`, usando replay fixture para construir failed tool row e link de arquivo local em markdown e afirmar a abertura real do pane à direita / da árvore de arquivos.