# Plano de Implementação do Limite do Serviço Base de Feedback

> **Para agentes de trabalho:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. As etapas usam a sintaxe de caixa de seleção (`- [ ]`) para acompanhamento.

**Objetivo:** Manter o envio de feedback disponível quando uma sessão de workspace SSH está conectando ou desconectada, ligando `FeedbackHost` ao serviço base de feedback do renderizador.

**Arquitetura:** `Root` permanece como a autoridade para o `IServiceAccessor` de inicialização/base e passa seu `feedbackService` explicitamente, através de `RootWorkspaceContent`, para `App`. Os serviços de escopo de workspace continuam dirigindo o comportamento de arquivos, tarefas, terminal, Git, Agente e sessão; o proxy remoto desconectado permanece inalterado.

**Pilha Tecnológica:** TypeScript, React, Vitest, acessores de serviço do renderizador do Electron.

## Restrições Globais

- Atualize a especificação antes da implementação; o design aprovado é `docs/superpowers/specs/2026-07-12-feedback-base-service-boundary-design.md`.
- Não modifique o proxy `ZCODE_REMOTE_WORKSPACE_DISCONNECTED` nem permita que chamadas do workspace remoto caiam para serviços locais de arquivo/tarefa.
- Preserve os limites desktop `desktop-continuous` e mobile `web-remote-replayable`.
- Mantenha o feedback remoto do Web sem suporte; repasse o serviço de feedback já fornecido pelo accessor raiz do Web.
- Preserve macOS, Windows, Linux, temas claro/escuro e o comportamento de internacionalização; esta mudança não introduz alterações visuais ou de texto.
- Comentários sobre a causa do bug devem ser escritos em chinês.
- Execute `pnpm typecheck` e `pnpm lint` antes de concluir.

---

### Tarefa 1: Travar a ligação do serviço de feedback com um teste de regressão

**Arquivos:**
- Criar: `packages/ui/test/feedbackBaseServiceBoundary.test.ts`

**Interfaces:**
- Consome: `RootProps.services: IServiceAccessor`, `RootWorkspaceContent`, `App` e `FeedbackHost`.
- Produz: uma guarda de limite em nível de código-fonte que falha até que o serviço base de feedback seja passado independentemente dos serviços de escopo de workspace.

- [ ] **Passo 1: Escrever o teste que falha**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readSource(path: string): string {
  return readFileSync(path, "utf8");
}

describe("feedback base service boundary", () => {
  it("keeps feedback on the base service when workspace services are disconnected", () => {
    const rootSource = readSource("packages/ui/src/Root.tsx");
    const rootWorkspaceContentSource = readSource(
      "packages/ui/src/root/RootWorkspaceContent.tsx",
    );
    const appSource = readSource("packages/ui/src/App.tsx");

    expect(rootSource).toContain(
      "baseFeedbackService={services.feedbackService}",
    );
    expect(rootWorkspaceContentSource).toContain(
      "baseFeedbackService={baseFeedbackService}",
    );
    expect(appSource).toContain(
      "<FeedbackHost feedbackService={baseFeedbackService} platform={platform} />",
    );
    expect(appSource).not.toContain(
      "<FeedbackHost feedbackService={services?.feedbackService} platform={platform} />",
    );
  });
});
```

- [ ] **Passo 2: Executar o teste para verificar que ele falha para o bug atual**

Executar: `pnpm exec vitest run packages/ui/test/feedbackBaseServiceBoundary.test.ts --reporter=dot`

Esperado: FALHA porque `Root` ainda não passa `baseFeedbackService` e `App` ainda renderiza `FeedbackHost` com `services?.feedbackService`.

### Tarefa 2: Injetar explicitamente o serviço base de feedback

**Arquivos:**
- Modificar: `packages/ui/src/app-shell/types.ts`
- Modificar: `packages/ui/src/root/RootWorkspaceContent.tsx`
- Modificar: `packages/ui/src/Root.tsx`
- Modificar: `packages/ui/src/App.tsx`
- Teste: `packages/ui/test/feedbackBaseServiceBoundary.test.ts`

**Interfaces:**
- Consome: `IFeedbackService` de `@zcode/services` e `RootProps.services.feedbackService`.
- Produz: `AppProps.baseFeedbackService: IFeedbackService` obrigatório; `WorkspaceShellLayoutProps` exclui essa dependência de nível de aplicação.

- [ ] **Passo 1: Adicionar a dependência tipada de nível de aplicação**

Altere a importação de tipo do serviço e as props em `packages/ui/src/app-shell/types.ts`:

```ts
import type { IFeedbackService, IServiceAccessor } from "@zcode/services";

export interface AppProps {
  services: IServiceAccessor;
  baseFeedbackService: IFeedbackService;
}

export interface WorkspaceShellLayoutProps extends Omit<AppProps, "baseFeedbackService"> {
}
```

Insira `baseFeedbackService` imediatamente após `services`. Substitua apenas a cláusula `extends AppProps` em `WorkspaceShellLayoutProps`; não copie nem remova seus membros atuais.

- [ ] **Passo 2: Passar a dependência através de `RootWorkspaceContent`**

Atualize a importação de tipo, a declaração de props, a desestruturação e a invocação de `StableWorkspaceApp` em `packages/ui/src/root/RootWorkspaceContent.tsx`:

```ts
import type { IFeedbackService, IServiceAccessor } from "@zcode/services";

interface RootWorkspaceContentProps {
  workspaceScopedServices: IServiceAccessor;
  baseFeedbackService: IFeedbackService;
}

export function RootWorkspaceContent({
  workspaceScopedServices,
  baseFeedbackService,
}: RootWorkspaceContentProps) {
}

<StableWorkspaceApp
  services={workspaceScopedServices}
  baseFeedbackService={baseFeedbackService}
/>
```

Adicione o membro da interface após `workspaceScopedServices`, adicione o parâmetro desestruturado após o mesmo campo e adicione a prop JSX imediatamente após `services`. Preserve todos os outros parâmetros e props JSX atuais.

- [ ] **Passo 3: Passar o serviço de inicialização/base a partir de `Root`**

Adicione a prop na chamada existente de `RootWorkspaceContent` em `packages/ui/src/Root.tsx`:

```tsx
<RootWorkspaceContent
  workspaceScopedServices={workspaceScopedServices}
  baseFeedbackService={services.feedbackService}
/>
```

Insira a nova prop imediatamente após `workspaceScopedServices`; preserve as demais props do local de chamada.

- [ ] **Passo 4: Fazer `FeedbackHost` usar apenas a dependência base explícita**

Atualize a desestruturação de `App` e o host de feedback em `packages/ui/src/App.tsx`:

```tsx
export function App({
  services,
  baseFeedbackService,
}: AppProps) {
  return (
    <>
      {/* Bugfix: 反馈是应用级能力，必须固定走本机 base host；SSH session 连接中或断开时，
          workspace-scoped services 会切成断连代理，不能让反馈提交跟随远程 session 失效。 */}
      <FeedbackHost feedbackService={baseFeedbackService} platform={platform} />
    </>
  );
}
```

Adicione a prop desestruturada após `services`. Substitua a expressão de uma linha atual do `FeedbackHost` pelo comentário de causa em chinês e pela nova expressão; preserve o JSX circundante do command center e do workspace shell.

- [ ] **Passo 5: Executar o teste focado para verificar que ele passa**

Executar: `pnpm exec vitest run packages/ui/test/feedbackBaseServiceBoundary.test.ts --reporter=dot`

Esperado: PASSA com 1 teste aprovado.

- [ ] **Passo 6: Executar os testes relacionados de feedback e de serviços de workspace**

Executar: `pnpm exec vitest run packages/ui/test/feedbackSubmitForm.test.ts packages/ui/test/feedbackCenter.test.ts packages/ui/test/useWorkspaceServices.test.ts --reporter=dot`

Esperado: PASSA sem falhas. Isso verifica o comportamento existente de envio de feedback e confirma que o proxy remoto desconectado permanece protegido.

- [ ] **Passo 7: Fazer o commit da implementação**

```bash
git add packages/ui/src/app-shell/types.ts packages/ui/src/root/RootWorkspaceContent.tsx packages/ui/src/Root.tsx packages/ui/src/App.tsx packages/ui/test/feedbackBaseServiceBoundary.test.ts
git commit -m "fix(feedback): keep submissions on base service"
```

### Tarefa 3: Concluir a verificação do repositório

**Arquivos:**
- Apenas verificação; nenhum arquivo de produção deve mudar.

**Interfaces:**
- Consome: o commit de implementação da Tarefa 2.
- Produz: evidências frescas de teste, typecheck, lint e diff para o handoff.

- [ ] **Passo 1: Executar novamente o teste de regressão focado**

Executar: `pnpm exec vitest run packages/ui/test/feedbackBaseServiceBoundary.test.ts --reporter=dot`

Esperado: PASSA com 1 teste aprovado.

- [ ] **Passo 2: Executar as verificações de projeto do TypeScript**

Executar: `pnpm typecheck`

Esperado: código de saída 0 sem erros de TypeScript.

- [ ] **Passo 3: Executar o lint**

Executar: `pnpm lint`

Esperado: código de saída 0 sem erros de lint.

- [ ] **Passo 4: Inspecionar o conjunto final de alterações**

Executar: `git status --short && git log -3 --oneline && git show --stat --oneline HEAD`

Esperado: árvore de trabalho limpa; o último commit de implementação contém apenas os quatro arquivos de origem da UI e o teste de regressão, enquanto os commits de documentação anteriores contêm a especificação aprovada e este plano.