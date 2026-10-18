# Design de captura de tela automática no relato de problemas

## Contexto

O "问题上报" (relato de problema) do menu de ajuda no topo hoje apenas abre o diálogo
genérico "提交反馈" (enviar feedback), sem anexar automaticamente a cena da tarefa que o
usuário estava vendo. O feedback de tarefa pelo botão direito, o feedback de tarefa no menu
"mais" do Header e o feedback de falha de conexão remota já capturam a janela Electron atual
via `IPlatformService.captureWindowScreenshot()` e passam o resultado como
`FeedbackSubmitDraft.screenshots` para o formulário de feedback.

Este requisito pede que, ao clicar em "问题上报" no menu de ajuda, a captura de tela da
tarefa da janela atual seja colocada automaticamente na área de screenshots do diálogo
"提交反馈".

## Objetivo

- Ao clicar em "问题上报" no menu de ajuda, capturar primeiro o quadro atual da janela atual
  e só então abrir o diálogo "提交反馈".
- A captura de tela deve aparecer na área "截图" já existente do formulário de feedback; a
  contagem e a capacidade de remoção reutilizam o `FeedbackScreenshotPicker` atual.
- O alvo da captura é a cena da tarefa da janela atual sem o diálogo de feedback que será
  aberto em seguida.
- No desktop, usar a capacidade de captura de tela da plataforma Electron já existente; na
  Web, no Web móvel ou quando a captura falhar, abrir o diálogo de feedback normalmente,
  sem screenshot anexado.
- Não alterar o comportamento dos itens de menu "给产品提需求" (sugerir uma melhoria de
  produto), "用户社群" (comunidade de usuários), "产品文档" (documentação do produto) e
  "导出日志" (exportar logs).

## Não objetivos

- Não adicionar capacidade de edição, recorte ou anotação de screenshot.
- Não alterar o protocolo de upload do feedback, os campos do ticket ou a lógica de upload
  de logs.
- Não modificar o relay de controle remoto, o processo main, o stream de session/task,
  snapshot, queue nem a semântica de recuperação replayable.
- Não rebaixar a capacidade de screenshot para a camada de serviço ou para o estado de
  negócio do controle remoto.

## Base da implementação atual

- `packages/shared/src/platform.ts` já define `captureWindowScreenshot?(): Promise<WindowScreenshotResult | null>`, e o comentário deixa claro que o fallback Web pode retornar `null`.
- `packages/desktop/src/main/desktopMainIpcPlatform.ts` já captura a janela atual via `BrowserWindow.fromWebContents(event.sender).webContents.capturePage()`.
- `packages/desktop/src/preload/index.ts` e `packages/desktop/src/renderer/src/main.tsx` já expõem `captureWindowScreenshot` ao serviço de plataforma da UI.
- `packages/ui/src/WorkspaceHelpMenuButton.tsx` é o componente onde fica a entrada do menu de ajuda para o screenshot; atualmente `handleOpenIssueReport` chama apenas `openFeedbackSubmit(...)`.
- `packages/ui/src/feedback/FeedbackSubmitForm.tsx` já suporta inicializar a área de screenshots a partir de `initialDraft.screenshots`.

## Design

### Comportamento da entrada

O item de menu "问题上报" de `WorkspaceHelpMenuButton` passa a ser tratado de forma assíncrona:

1. O usuário clica no item de menu.
2. A UI chama o helper de captura segura.
3. O helper chama `platform.captureWindowScreenshot?.()`.
4. O helper converte o resultado bem-sucedido em `FeedbackAttachmentDraft[]`; devolve um array vazio quando não há capacidade, quando retorna `null` ou quando lança erro.
5. A UI chama `openFeedbackSubmit({ type: "bug", module: "其它", severity: "P2-中", includeLogs: true, screenshots })`.

A chamada de captura ocorre antes de `openFeedbackSubmit`, portanto no Electron o que é
capturado é a janela atual da tarefa, sem o próprio diálogo de feedback.

### Fronteira do helper

Adicionar um pequeno helper de UI, por exemplo `packages/ui/src/feedback/feedbackScreenshotDraft.ts`:

```ts
import type { IPlatformService } from "@zcode/shared";
import type { FeedbackAttachmentDraft } from "@/feedback/feedbackStore.js";

export async function captureFeedbackScreenshotDraft(
  platform: Pick<IPlatformService, "captureWindowScreenshot">,
): Promise<FeedbackAttachmentDraft[]> {
  const screenshot = await platform.captureWindowScreenshot?.().catch(() => null);
  return screenshot ? [screenshot] : [];
}
```

Esse helper trata apenas da montagem do draft de UI; não gera log, não mostra toast e não
faz retry. Falha na captura de tela normalmente não é um erro do fluxo principal de envio
de feedback, então a degradação silenciosa garante que o diálogo de feedback ainda abra.

### Compatibilidade

- Desktop: reutiliza a capacidade de captura via IPC já existente.
- Web: `captureWindowScreenshot` pode não existir ou retornar `null`; o diálogo de feedback continua abrindo.
- Controle remoto do celular: não se adiciona runtime, host ou estado de controle remoto separado; apenas lê a capability opcional da plataforma na entrada de UI atual, mantendo inalterada a fronteira das cadeias replayable/continuous.
- Tema e internacionalização: não se adiciona texto visível, não se altera estilo; o diálogo de feedback continua usando os componentes e os textos de i18n existentes.

## Testes

- Adicionar testes unitários para `captureFeedbackScreenshotDraft`:
  - quando a captura tem sucesso, retorna um array com um `FeedbackAttachmentDraft`;
  - quando `captureWindowScreenshot` retorna `null`, retorna um array vazio;
  - quando `captureWindowScreenshot` lança erro, retorna um array vazio.
- Adicionar ou atualizar testes de componente para `WorkspaceHelpMenuButton`:
  - após clicar em "问题上报", esperar a Promise da captura e só então chamar o `openSubmit` do feedback store, com o screenshot incluído no draft;
  - quando a captura falha, mesmo assim chamar `openSubmit`, com `screenshots` como array vazio no draft.
- Verificação mecânica completa:
  - `pnpm typecheck`
  - `pnpm lint`

## Riscos e pontos de regressão

- Se a Promise da captura ficar lenta, o diálogo de feedback atrasa para abrir. A captura atual é local à janela e o tempo esperado é muito curto; se for necessário otimizar depois, pode-se abrir o diálogo primeiro exibindo um estado de carregamento da captura, mas isso ampliaria a área de impacto do formulário de feedback.
- Se a captura no Electron falhar, o usuário ainda consegue enviar texto e logs; a degradação de comportamento é aceitável.
- Esta alteração não toca na cadeia de upload do feedback, portanto não altera o formato do arquivo de screenshot, o limite de tamanho nem o teto de 6 imagens.