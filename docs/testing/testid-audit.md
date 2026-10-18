# Relatório de auditoria de testid dos componentes de UI

> **Status: instantâneo histórico de auditoria de 2026-03-31.** Os componentes `ChatView`,
> `ChatMessage` e `ChatInputToolbar` listados na tabela foram substituídos pela UI de conversation
> V4; este documento não representa mais a lista atual de lacunas. O posicionamento E2E atual deve
> se basear em `packages/shared/src/test-ids.ts`, nos componentes V4 e nos E2E vigentes.

> Data da auditoria: 2026-03-31  
> Escopo da auditoria: `packages/ui/src/**/*.tsx`, excluindo `components/ui/`  
> Fonte única dos testid: `packages/shared/src/test-ids.ts`

## Especificação

- Cada componente em nível de React (correspondente a uma área funcional visível ao usuário) deve ter um testid de container raiz
- Itens de listas dinâmicas são concatenados com `testId(BASE, suffix)`, por exemplo `testId(TID_TASK_ITEM, taskId)`
- As constantes de testid são declaradas unicamente em `test-ids.ts`; os componentes não têm strings hardcoded
- Os testes E2E e o posicionamento no DOM são feitos inteiramente pelo atributo `data-testid`

---

## Resultados da auditoria

### Componentes sem testid

| Arquivo do componente | testid ausente | Observação |
|---------|--------------|------|
| `SettingsPage.tsx` | `TID_SETTINGS_BACK_BUTTON` | Já definido em `test-ids.ts`, mas o componente não adiciona o testid ao botão de voltar |
| `PermissionDialog.tsx` | testid de container | O diálogo de confirmação de permissão inteiro não tem testid, o E2E não consegue posicioná-lo |
| `ChatPlan.tsx` | testid de container | O painel de exibição de plano não tem testid |
| `ChatErrorBanner.tsx` | testid de container | A barra de mensagem de erro não tem testid |
| `ChatInputToolbar.tsx` | testid de container | A barra de ferramentas inferior (seletores de model/mode/thought) não tem testid |
| `DebugInfoBar.tsx` | testid de container | A barra de informações de depuração não tem testid |
| `NewTaskButtonGroup.tsx` | testid do botão trigger do dropdown | O botão de seta para alternar o provider não tem testid; apenas o botão principal tem `TID_TASK_NEW_BUTTON` |
| `WorkspaceSidebar.tsx` | testid do estado vazio | A div de aviso de estado vazio não tem testid |

### testid definidos mas não utilizados de fato

| Nome da constante | Problema |
|--------|------|
| `TID_PREVIEW_PREV_BUTTON` | `PreviewPane` usa carregamento por rolagem automática e não tem botão explícito de "parágrafo anterior"; a definição do testid é redundante |
| `TID_PREVIEW_NEXT_BUTTON` | O mesmo |
| `TID_WORKSPACE_PATH` | Não é usado em nenhum componente |
| `TID_LOCALE_TOGGLE` | `LocaleSwitcher.tsx` não usa este testid |

---

## Componentes com boa cobertura (para referência)

| Componente | Situação da cobertura de testid |
|------|--------------|
| `WelcomeScreen.tsx` | Completa: form, username, password, button, error |
| `Terminal.tsx` | Completa: container, botão de fechar |
| `SSHDialog.tsx` | Completa: botão trigger, container do diálogo, todos os campos de entrada, confirmar/cancelar |
| `FileTree.tsx` | Completa: container raiz, cada item (sufixo dinâmico) |
| `EmbeddedBrowserPane.tsx` | Completa: container, barra de endereço, avançar/voltar/refresh/debug, webview |
| `PreviewPane.tsx` | Parcial: tem container e botão de fechar, mas define PREV/NEXT sem implementar |
| `TaskList.tsx` | Completa: container, cada item, botão de excluir, estado vazio, botão de configurações |
| `NewTaskButtonGroup.tsx` | Parcial: o botão principal tem testid, o trigger do dropdown não |
| `ChatView.tsx` | Completa: container, lista de mensagens, estado vazio, campo de entrada, botão de anexo, enviar/parar, loading |
| `ChatMessage.tsx` | Parcial: apenas o botão "ver código" dentro da chamada de ferramenta; o bubble da mensagem em si não tem testid |
| `App.tsx` | Completa: header, sidebar, tabs, workspace header, badge de status do ZCode |
| `WorkspaceSidebar.tsx` | Parcial: container principal, lista/item/close de workspace, botão de abrir; falta o testid do estado vazio |
| `SettingsPage.tsx` | Parcial: o container da página tem; falta o botão de voltar |

---

## Sugestões de prioridade de correção

**P0 (forte dependência do fluxo E2E)**
- testid de container de `PermissionDialog` —— o fluxo de permissão não pode ser testado de forma automatizada
- testid de container de `ChatErrorBanner` —— o cenário de erro não pode ser verificado por asserção, nem é possível executar mecanicamente o critério de verificação de que "no conversation case positivo o `ChatViewErrorBanner` não deve aparecer por padrão"

**P1 (posicionamento de áreas funcionais)**
- `ChatInputToolbar` —— cobre os seletores de modelo/modo
- `ChatPlan` —— painel de etapas do plano
- `DebugInfoBar` —— barra de informações de depuração
- trigger do dropdown de `NewTaskButtonGroup`

**P2 (limpeza de redundância)**
- remover `TID_PREVIEW_PREV_BUTTON` e `TID_PREVIEW_NEXT_BUTTON` (ou implementar de fato os botões de paginação)
- remover `TID_WORKSPACE_PATH` (sem UI correspondente)
- adicionar `TID_LOCALE_TOGGLE` em `LocaleSwitcher.tsx`, ou removê-lo de `test-ids.ts`

---

## Modelo de passos de correção

1. Adicionar a nova constante em `test-ids.ts` (com comentário):
   ```ts
   /** Contêiner de confirmação de permissão do PermissionDialog */
   export const TID_PERMISSION_DIALOG = "permission-dialog";
   ```

2. Adicionar `data-testid` no elemento raiz do componente:
   ```tsx
   import { TID_PERMISSION_DIALOG } from "@zcode/shared";
   
   <Confirmation data-testid={TID_PERMISSION_DIALOG} ...>
   ```

3. Se o componente não aceitar a prop `data-testid` (como os componentes ai-elements), envolva-o em uma `<div>`:
   ```tsx
   <div data-testid={TID_CHAT_PLAN}>
     <Plan ...>
   ```