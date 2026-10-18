# Plano de Implementação da UI das Ferramentas SendMessage e TaskStop

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** adicionar a `SendMessage` e à `TaskStop` resumos compactos e detalhes estruturados consistentes com o sistema de ToolCall existente, eliminando completamente a exibição de fallback raw JSON.

**Arquitetura:** fixar em `@zcode/shared` o mapeamento do nome canônico da ferramenta para a família de apresentação, de modo que o `resolveToolCallRenderer` da UI roteie apenas por família. O Core reaproveita `ToolResultDisplayPayload` e gera o display `local_agent_message` / `task_stop` a partir do output original, antes do hook e da serialização do model. A UI usa um reader centralizado para ler uniformemente o event em tempo real, os metadados persistidos e as formas compatíveis de provider; o renderer consome apenas campos já validados e mantém fallbacks explícitos para dados antigos.

**Stack técnico:** TypeScript 6, React 19, Vitest 4, react-dom/server, tokens semânticos Tailwind, lucide-react, i18n FormatJS.

## Restrições Globais

- Atualizar primeiro `docs/ui/tool-display-rendering.md` e só então alterar a implementação.
- `SendMessage` e `send_message` em minúsculas mantêm identidades distintas; a segunda continua sendo a superfície unknown/legacy de mailbox.
- A UI usa apenas tokens semânticos de cor, tipografia compacta `text-[13px]`, ícones lucide e o `ToolLayout` existente.
- Compatível simultaneamente com desktop, web, telas estreitas de celular, Zai Light/Zai Dark e chinês/inglês.
- É permitido estender o schema `ToolResultDisplayPayload` existente e a lógica de geração de display do Core; não alterar o contrato de input/output das ferramentas, o conteúdo de model, o comportamento de parada de tarefas em background, o comportamento de mailbox da sessão ou a fronteira desktop continuous / web replayable.
- Não commitar automaticamente conforme o fluxo de trabalho do usuário; ao final da implementação, manter o diff da branch local para revisão.
- As Tarefas 1-4 registram o processo inicial de implementação dos renderers e o código correspondente já existe; os campos finais e a semântica de resumo são definidos pela Tarefa 5, e as correções e verificações desta rodada de review são definidas pela Tarefa 6.

---

### Tarefa 1: Registrar a identidade de apresentação da TaskStop

**Arquivos:**

- Modificar: `packages/ui/test/toolIdentity.test.ts`
- Modificar: `packages/shared/src/tool-identity.ts`

**Interfaces:**

- Consome: `resolveToolCallIdentity(toolCall)` e `getZCodeToolFamilyForName(name)`.
- Produz: identidade canônica `TaskStop` com a família `task-control`.

- [x] **Passo 1: Escrever o teste de identidade que falha**

```ts
it("recognizes current TaskStop as task control", () => {
  expect(resolveToolCallIdentity({ toolName: "TaskStop" })).toMatchObject({
    toolName: "TaskStop",
    family: "task-control",
    isLegacy: false,
  });
});
```

- [x] **Passo 2: Executar o teste e verificar RED**

Executar: `pnpm exec vitest run packages/ui/test/toolIdentity.test.ts`

Esperado: FAIL porque `TaskStop` não está em `ZCODE_KNOWN_TOOL_NAMES` e resolve como `unknown`.

- [x] **Passo 3: Adicionar o nome canônico e a família**

```ts
export const ZCODE_KNOWN_TOOL_NAMES = [
  // existing names
  "TaskStop",
] as const;

export type ZCodeToolFamily =
  // existing families
  "task-control";

const TOOL_FAMILY_BY_NAME = {
  // existing mappings
  TaskStop: "task-control",
} satisfies Record<ZCodeKnownToolName, ZCodeToolFamily>;
```

- [x] **Passo 4: Executar o teste de identidade e verificar GREEN**

Executar: `pnpm exec vitest run packages/ui/test/toolIdentity.test.ts`

Esperado: todos os testes passam, incluindo a asserção existente de que `send_message` em minúsculas permanece `unknown`.

---

### Tarefa 2: Rotear ambas as ferramentas para renderers de resumo dedicados

**Arquivos:**

- Criar: `packages/ui/test/messageTaskControlToolCallBlock.test.ts`
- Criar: `packages/ui/src/ToolCallBlocks/renderers/send-message.tsx`
- Criar: `packages/ui/src/ToolCallBlocks/renderers/task-stop.tsx`
- Modificar: `packages/ui/src/ToolCallBlocks.tsx`
- Modificar: `packages/ui/src/i18n/locales/en-US.ts`
- Modificar: `packages/ui/src/i18n/locales/zh-CN.ts`

**Interfaces:**

- Consome: `ToolCallBlockRenderContext`, `ToolLayout`, `useZCodeIntl`.
- Produz: `SendMessageToolCallBlock(context)` e `TaskStopToolCallBlock(context)`.

- [x] **Passo 1: Escrever testes de roteamento/resumo que falham através do ToolCallBlock**

```ts
it("routes SendMessage to a semantic summary", () => {
  const html = renderToolCall({
    toolId: "send-1",
    toolName: "SendMessage",
    kind: "SendMessage",
    title: "SendMessage",
    input: { to: "agent_alpha", summary: "同步结论", message: "请复核结果" },
    output: { status: "success", messageId: "msg_1", delivery: "queued" },
    status: "completed",
    raw: {},
  });
  expect(html).toContain("已发送消息");
  expect(html).toContain("同步结论");
  expect(html).toContain("agent_alpha");
});

it("routes TaskStop to a semantic summary", () => {
  const html = renderToolCall({
    toolId: "stop-1",
    toolName: "TaskStop",
    kind: "TaskStop",
    title: "TaskStop",
    input: { task_id: "task_alpha" },
    output: JSON.stringify({
      message: "Successfully stopped task: task_alpha",
      task_id: "task_alpha",
      task_type: "local_agent",
    }),
    status: "completed",
    raw: {},
  });
  expect(html).toContain("已停止任务");
  expect(html).toContain("task_alpha");
  expect(html).toContain("local_agent");
});
```

- [x] **Passo 2: Executar os testes e verificar RED**

Executar: `pnpm exec vitest run packages/ui/test/messageTaskControlToolCallBlock.test.ts`

Esperado: FAIL porque ambas as chamadas ainda são roteadas para `FallbackToolCallBlock`.

- [x] **Passo 3: Adicionar renderers de resumo mínimos e rotas por família**

```ts
switch (identity.family) {
  case "message":
    return SendMessageToolCallBlock;
  case "task-control":
    return TaskStopToolCallBlock;
  // existing cases
}
```

`SendMessageToolCallBlock` usa `SendIcon`, texto de kind localizado de enviando/enviado, o `summary` do input como texto primário e o `to` do input como texto secundário em monoespaçado. `TaskStopToolCallBlock` usa `CircleStopIcon`, texto de kind localizado de parando/parado, o id de tarefa resolvido como texto primário e o `task_type` do output como texto secundário em monoespaçado.

- [x] **Passo 4: Executar os testes e verificar GREEN**

Executar: `pnpm exec vitest run packages/ui/test/messageTaskControlToolCallBlock.test.ts packages/ui/test/toolCallBlocks.test.ts`

Esperado: todos os testes selecionados passam.

---

### Tarefa 3: Renderizar detalhes estruturados sem raw JSON

**Arquivos:**

- Modificar: `packages/ui/test/messageTaskControlToolCallBlock.test.ts`
- Modificar: `packages/ui/src/ToolCallBlocks/renderers/send-message.tsx`
- Modificar: `packages/ui/src/ToolCallBlocks/renderers/task-stop.tsx`

**Interfaces:**

- Consome: `toolCall.input`, `toolCall.output`, `toolCall.raw.rawInput`, `toolCall.raw.rawOutput`, `toolCall.raw.result.content`.
- Produz: detalhes por campo e suporte a carregamento de campos de snapshot.

- [x] **Passo 1: Adicionar testes de renderer com force-open que falham**

Este passo foi substituído pela Tarefa 5. O contrato final de detalhe da `SendMessage` contém apenas destinatário, resumo e mensagem; delivery e todos os ids permanecem ocultos. O contrato final de detalhe da `TaskStop` contém tipo de tarefa, comando e resultado sem repetir o id da tarefa.

- [x] **Passo 2: Executar os testes e verificar RED**

Executar: `pnpm exec vitest run packages/ui/test/messageTaskControlToolCallBlock.test.ts`

Esperado: FAIL porque os renderers mínimos ainda não expõem os campos expandidos.

- [x] **Passo 3: Implementar extração limitada do payload**

Cada renderer deve:

```ts
function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string" || value.trim().length === 0) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}
```

A precedência do input é `toolCall.input` e depois `raw.rawInput`/`raw.input`. A precedência do output estruturado é `toolCall.output` e depois `raw.rawOutput`/`raw.output` e `raw.result.content`; um `toolCall.output` não-JSON ou um `raw.result.content` é exibido apenas como texto de resultado. Renderizar somente os campos do contrato, usar `whitespace-pre-wrap break-words` para prosa, `font-mono` para ids/caminhos/comandos e anexar `ToolSnapshotFieldNotice` fora do painel de detalhe.

- [x] **Passo 4: Executar os testes e verificar GREEN**

Executar: `pnpm exec vitest run packages/ui/test/messageTaskControlToolCallBlock.test.ts`

Esperado: todos os testes de renderer passam e nenhum raw JSON de fallback aparece.

---

### Tarefa 4: Verificar a fronteira completa da UI

**Arquivos:**

- Revisar: `docs/ui/tool-display-rendering.md`
- Revisar: todos os arquivos alterados pelas Tarefas 1-3.

**Interfaces:**

- Consome: scripts de lint/typecheck/test do repositório.
- Produz: um diff de worktree verificado e pronto para revisão do usuário.

- [x] **Passo 1: Executar testes de regressão focados**

Executar: `pnpm exec vitest run packages/ui/test/toolIdentity.test.ts packages/ui/test/messageTaskControlToolCallBlock.test.ts packages/ui/test/toolCallBlocks.test.ts packages/ui/test/readSessionContextToolCallBlock.test.ts`

Esperado: todos os testes selecionados passam sem nenhuma falha.

- [x] **Passo 2: Executar as verificações mecânicas obrigatórias**

Executar: `pnpm typecheck`

Esperado: código de saída 0.

Executar: `pnpm lint`

Esperado: código de saída 0.

- [x] **Passo 3: Revisar o diff de escopo**

Executar: `git diff --check`

Esperado: código de saída 0 e nenhum erro de whitespace.

Executar: `git status --short`

Esperado: apenas os arquivos de spec, plano, identidade, renderer, locale, rota e testes focados deste plano foram modificados ou adicionados.

---

### Tarefa 5: Reduzir a densidade dos resumos de mensagem e parada de tarefa

**Arquivos:**

- Modificar: `docs/ui/tool-display-rendering.md`
- Modificar: `packages/ui/test/messageTaskControlToolCallBlock.test.ts`
- Modificar: `packages/ui/src/ToolCallBlocks/renderers/send-message.tsx`
- Modificar: `packages/ui/src/ToolCallBlocks/renderers/task-stop.tsx`
- Modificar: `packages/ui/src/i18n/locales/en-US.ts`
- Modificar: `packages/ui/src/i18n/locales/zh-CN.ts`

**Interfaces:**

- Consome: slots de resumo primário/secundário existentes do `ToolLayout` e extração limitada de input/output.
- Produz: resumos em forma de frase para `SendMessage` e resumos apenas com id de tarefa para `TaskStop`, com campos expandidos reduzidos.

- [x] **Passo 1: Atualizar os testes de renderer e verificar RED**

O teste de roteamento da `SendMessage` deve exigir `已发送`, o `summary` do input, o conector `给` e o agente destinatário no resumo recolhido. Seu teste de force-open deve exigir apenas os campos destinatário, resumo e mensagem, rejeitando delivery, ids, caminho de output e texto de resultado. O teste de roteamento da `TaskStop` deve exigir `已停止` e o id da tarefa, rejeitando `task_type`; seu teste de force-open deve exigir tipo de tarefa, comando e resultado, rejeitando o rótulo de detalhe `任务 ID` repetido.

Executar: `pnpm exec vitest run packages/ui/test/messageTaskControlToolCallBlock.test.ts`

Esperado: FAIL porque os renderers atuais ainda expõem metadados de output, mostram `task_type` no resumo recolhido e repetem o id da tarefa nos detalhes.

- [x] **Passo 2: Implementar as alterações mínimas de renderer e locale**

Alterar os rótulos de kind de sucesso/em execução da SendMessage para `已发送`/`正在发送` (`Sent`/`Sending`), adicionar um conector localizado `给`/`to` antes do destinatário em monoespaçado e manter o parsing do output apenas para status de falha e texto de tooltip. Remover todos os campos de metadados de output do seu painel de detalhe. Alterar os rótulos de kind da TaskStop para `已停止`/`正在停止` (`Stopped`/`Stopping`), remover `task_type` do `secondaryText` e remover o id da tarefa do seu painel de detalhe.

- [x] **Passo 3: Verificar GREEN e a fronteira do repositório**

Executar: `pnpm exec vitest run packages/ui/test/messageTaskControlToolCallBlock.test.ts packages/ui/test/toolIdentity.test.ts packages/ui/test/toolCallBlocks.test.ts packages/ui/test/readSessionContextToolCallBlock.test.ts`

Esperado: todos os testes selecionados passam sem nenhuma falha.

Executar: `pnpm typecheck && pnpm lint && git diff --check`

Esperado: todos os comandos saem com 0; o lint pode reportar apenas avisos preexistentes fora dos arquivos alterados.

---

### Tarefa 6: Preservar resultados estruturados e completar a semântica de estados terminais

**Arquivos:**

- Modificar: `apps/zcode-cli/packages/contracts/src/tools/tool-result-metadata.ts`
- Modificar: `apps/zcode-cli/packages/core/src/tool/executor/result-display.ts`
- Modificar: `apps/zcode-cli/packages/core/src/tool/executor/call-runner.ts`
- Criar: `apps/zcode-cli/packages/core/tests/tool-result-display.test.ts`
- Criar: `packages/ui/src/ToolCallBlocks/toolResultDisplay.ts`
- Modificar: `packages/ui/src/ToolCallBlocks/renderers/send-message.tsx`
- Modificar: `packages/ui/src/ToolCallBlocks/renderers/task-stop.tsx`
- Modificar: `packages/ui/src/i18n/locales/en-US.ts`
- Modificar: `packages/ui/src/i18n/locales/zh-CN.ts`
- Modificar: `packages/ui/test/messageTaskControlToolCallBlock.test.ts`
- Revisar: `packages/ui/test/reactStableReferences.test.ts`

**Interfaces:**

- Consome: nome canônico da ferramenta, output original de runtime, `ToolCallResult.result.display`, metadados de tool part concluída, `ToolCallBlockRenderContext`.
- Produz: payloads de display estritos `local_agent_message` / `task_stop` e `readToolResultDisplay(raw)` para formas raw de tempo real/persistidas/de provider.

- [x] **Passo 1: Adicionar testes RED para geração de display no Core**

Adicionar testes focados que exigem que `createToolResultDisplay("SendMessage", output)` retorne apenas status de negócio/erro/mensagem, que `createToolResultDisplay("TaskStop", output)` retorne id/tipo/comando/mensagem da tarefa e que `send_message` em minúsculas não produza o display de local-agent.

Executar: `apps/zcode-cli/node_modules/.bin/vitest run packages/core/tests/tool-result-display.test.ts`

Esperado: FAIL porque apenas o display `file_diff` existe e `createToolResultDisplay` não aceita um nome de ferramenta.

- [x] **Passo 2: Implementar schemas de display estritos e geração no Core**

Estender a união discriminada com `local_agent_message` e `task_stop`. Alterar `createToolResultDisplay` para receber o nome canônico da ferramenta, validar o schema correspondente do output de runtime e retornar apenas os campos exigidos pela UI. Manter inalterado o caminho limitado existente de `file_diff` para todas as ferramentas.

- [x] **Passo 3: Verificar GREEN no Core e comportamento de file diff inalterado**

Executar: `apps/zcode-cli/node_modules/.bin/vitest run packages/core/tests/tool-result-display.test.ts packages/core/tests/tool-executor-trace.test.ts`

Esperado: todos os testes selecionados do Core passam, incluindo a asserção existente de event `file_diff`.

- [x] **Passo 4: Adicionar testes RED para formas de entrega da UI e estados terminais**

Adicionar testes de renderer para `raw.result.display` em tempo real, `raw.display` persistido, `raw.rawOutput.display` de provider, parsing explícito do envelope de hook legacy, falha de negócio da SendMessage e rótulos `denied`/`stopped` de ambas as ferramentas. Adicionar asserções de que nenhum estado sem sucesso renderiza o verbo de sucesso.

Executar: `pnpm exec vitest run packages/ui/test/messageTaskControlToolCallBlock.test.ts packages/ui/test/reactStableReferences.test.ts`

Esperado: FAIL por falta do reader de display, rótulos terminais incompletos, output de TaskStop augmented por hook e props JSX inline.

- [x] **Passo 5: Implementar o reader da UI, a matriz de status e props JSX estáveis**

Criar um único reader estrito para as três localizações raw de display. Preferir os campos de display em ambos os renderers, manter apenas formatos de output legacy explícitos como fallback, adicionar rótulos localizados de ação para parado/negado e memoizar props não primitivas do `ToolLayout` com `useMemo`.

- [x] **Passo 6: Verificar GREEN na UI e compatibilidade**

Executar: `pnpm exec vitest run packages/ui/test/messageTaskControlToolCallBlock.test.ts packages/ui/test/reactStableReferences.test.ts packages/ui/test/toolIdentity.test.ts packages/ui/test/toolCallBlocks.test.ts packages/ui/test/readSessionContextToolCallBlock.test.ts`

Esperado: todos os testes selecionados passam; `send_message` em minúsculas permanece unknown e os renderers existentes permanecem inalterados.

- [x] **Passo 7: Executar as gates completas do repositório**

Executar em série: os testes completos da UI, os testes relevantes do pacote CLI, `pnpm typecheck`, `pnpm lint` e `git diff --check`. Depois executar os cases E2E Electron existentes de SendMessage/TaskStop sem adicionar código apenas para preview.

Resultado da verificação: os testes completos da UI passaram (3810), os testes relevantes da CLI passaram (101), os typechecks da raiz e da CLI passaram, o lint da raiz passou apenas com avisos preexistentes, as fontes da CLI alteradas passaram no oxlint direcionado e os dois cases E2E Electron existentes passaram. O lint completo da CLI aninhada ainda falha em erros preexistentes de max-lines e relacionados fora desta alteração.

---

### Tarefa 7: Limitar o display da TaskStop e remover detalhes terminais vazios

**Arquivos:**

- Modificar: `docs/ui/tool-display-rendering.md`
- Modificar: `apps/zcode-cli/packages/contracts/src/tools/tool-result-metadata.ts`
- Modificar: `apps/zcode-cli/packages/core/src/tool/executor/result-display.ts`
- Modificar: `apps/zcode-cli/packages/core/tests/tool-result-display.test.ts`
- Modificar: `packages/ui/src/ToolCallBlocks/toolResultDisplay.ts`
- Modificar: `packages/ui/src/ToolCallBlocks/renderers/task-stop.tsx`
- Modificar: `packages/ui/src/i18n/locales/en-US.ts`
- Modificar: `packages/ui/src/i18n/locales/zh-CN.ts`
- Modificar: `packages/ui/test/messageTaskControlToolCallBlock.test.ts`

- [x] **Passo 1: Adicionar cobertura RED para um display de TaskStop superdimensionado**

Exigir que o comando e a mensagem projetados permaneçam dentro de 16 KiB UTF-8 cada e que exponham `truncated: true` quando qualquer um dos campos for encurtado.

- [x] **Passo 2: Implementar a projeção de display da TaskStop limitada em bytes**

Limitar ambos os campos antes de o display sair do Core, preservar code points UTF-8 válidos, anexar um marcador explícito de truncamento e estender o schema/reader de display com a flag opcional.

- [x] **Passo 3: Adicionar cobertura RED para detalhes terminais**

Exigir que as razões de negado/parado apareçam como resultado quando disponíveis e que uma TaskStop terminal sem campos de detalhe não tenha afordância de expansão nem painel vazio.

- [x] **Passo 4: Implementar a disponibilidade de detalhes terminais**

Reutilizar `context.errorText` para todos os estados terminais sem sucesso e habilitar o toggle do `ToolLayout` somente quando existir pelo menos um detalhe visível ou um aviso de truncamento.

- [x] **Passo 5: Executar a verificação focada e a do repositório**

Executar os testes focados de Core/UI, typechecks, lint, `git diff --check` e revisar o diff final de escopo.

---

### Tarefa 8: Remover o comando repetido da TaskStop da linha de resultado

**Arquivos:**

- Modificar: `docs/ui/tool-display-rendering.md`
- Modificar: `apps/zcode-cli/packages/core/tests/tool-result-display.test.ts`
- Modificar: `apps/zcode-cli/packages/core/src/tool/executor/result-display.ts`
- Modificar: `packages/ui/test/messageTaskControlToolCallBlock.test.ts`
- Modificar: `packages/ui/src/ToolCallBlocks/renderers/task-stop.tsx`

**Interfaces:**

- Consome: `TaskStopOutput`, payload de display `task_stop` e o envelope JSON legacy explícito da TaskStop.
- Produz: um resultado de exibição de sucesso conciso, preservando o output original da ferramenta, o conteúdo de model e as mensagens arbitrárias de resultado do provider.

- [x] **Passo 1: Adicionar cobertura RED para a projeção de display no Core**

Exigir que um output contendo `message: "Successfully stopped task: task_alpha (pnpm test)"` e `command: "pnpm test"` mantenha `command` inalterado, mas projete `message: "Successfully stopped task: task_alpha"`.

- [x] **Passo 2: Implementar a compactação exata da mensagem padrão no Core**

Comparar a mensagem original com o template de sucesso completo gerado. Compactar apenas em caso de correspondência exata; depois aplicar o orçamento de display UTF-8 existente. Não mutar o output da TaskStop nem o conteúdo de model.

- [x] **Passo 3: Adicionar cobertura RED para output legacy persistido**

Renderizar uma TaskStop sem metadados de display cujo output JSON contenha a mensagem de sucesso padrão e o comando. Exigir que o texto do comando apareça uma vez, que o resultado conciso permaneça visível e que uma mensagem de resultado customizada permaneça inalterada.

- [x] **Passo 4: Implementar a normalização exata do legacy no renderer da UI**

Normalizar apenas a mensagem exata `Successfully stopped task: <taskId> (<command>)` antes de renderizar o campo de resultado de sucesso. Mensagens de resultado de falha, negado, parado e sucesso customizado permanecem intocadas.

- [x] **Passo 5: Executar a verificação focada e a do repositório**

Executar os testes focados de Core/UI, ambos os typechecks, lint, `git diff --check` e revisar o diff final de escopo.
