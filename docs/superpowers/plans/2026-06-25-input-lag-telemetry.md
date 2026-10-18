# Plano de implementação da telemetria de travamento no input (perf_ui_input_lag)

> **Para workers agênticos:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Goal:** adicionar a telemetria `perf_ui_input_lag` na caixa de input de chat do Lexical, reportando ao ARMS os travamentos em que o processamento de uma única entrada excede o limiar.

**Architecture:** dentro do update listener do `TextContentPlugin`, medir com `performance.now()` o tempo síncrono de "getEditorMarkdown + onChange"; excluir o estado de composição do IME (`editor.isComposing()`) e as reescritas programáticas (update tag customizada); quando for maior que 500ms e menor ou igual a 5000ms, chamar `recordInputLag` da camada de telemetry. A camada de telemetry fica no mesmo arquivo e no mesmo grupo do `perf_ui_stream_stall` existente, e a lógica de decisão é extraída para uma função pura testada em unidade.

**Tech Stack:** TypeScript, React, Lexical, vitest, evento customizado do RUM (ARMS) da Alibaba Cloud.

## Restrições Globais

- A branch atual `feat/input-lag-telemetry` **nunca deve receber commit direto em staging/trunk**.
- A telemetria pertence à cadeia de observabilidade: **falha de envio gera apenas warn e nunca bloqueia o fluxo principal de input** (reaproveitando o `emit()` existente).
- Reaproveitar o grupo existente `UI_PERF_ARMS_GROUP = "ui_perf"`, sem criar novo reporter e sem mexer em `Root.tsx`.
- Limiar `INPUT_LAG_REPORT_THRESHOLD_MS = 500`; limite sentinela `INPUT_LAG_SANITY_MAX_MS = 5000`.
- Comando de teste unitário: `pnpm --filter @zcode/ui exec vitest run test/uiPerfArmsTelemetry.test.ts`.
- Verificação de tipos: `pnpm typecheck` (na raiz, incluindo packages/ui).
- Não escrever E2E pesado no nível de componente: o comportamento de update do Lexical é instável sob jsdom; a lógica de decisão é coberta por testes de função pura.

---

### Task 1: camada de telemetry — constantes, decisão por função pura, função de envio

**Files:**
- Modify: `packages/ui/src/lib/uiPerfArmsTelemetry.ts` (acrescentar ao final do arquivo, depois do trecho de stream stall)
- Test: `packages/ui/test/uiPerfArmsTelemetry.test.ts` (adicionar um `describe("input lag", ...)`)

**Interfaces:**
- Consumes: `emit(payload: ArmsCustomEventPayload)` existente, `UI_PERF_ARMS_GROUP`, `armsReporter` (em nível de módulo, já injetado por `setUiPerfArmsReporter`).
- Produces:
  - `INPUT_LAG_REPORT_THRESHOLD_MS: number`(= 500)
  - `INPUT_LAG_SANITY_MAX_MS: number`(= 5000)
  - `UI_PERF_EVENT_INPUT_LAG: string`(= `"perf_ui_input_lag"`)
  - `shouldReportInputLag(args: { lagMs: number; isProgrammatic: boolean; isComposing: boolean }): boolean`
  - `recordInputLag(params: { lagMs: number; textLength: number; isProgrammatic: boolean; isComposing: boolean; taskId?: string }): void`

- [ ] **Step 1: escrever o teste que falha**

Acrescentar ao bloco de import do topo de `packages/ui/test/uiPerfArmsTelemetry.test.ts` (mesclando com os imports da mesma origem já existentes):

```ts
import {
  INPUT_LAG_REPORT_THRESHOLD_MS,
  INPUT_LAG_SANITY_MAX_MS,
  UI_PERF_EVENT_INPUT_LAG,
  recordInputLag,
  shouldReportInputLag,
} from "@/lib/uiPerfArmsTelemetry.js";
```

Acrescentar depois do último `describe(...)` do arquivo:

```ts
describe("input lag - shouldReportInputLag", () => {
  it("低于阈值不上报", () => {
    expect(
      shouldReportInputLag({
        lagMs: INPUT_LAG_REPORT_THRESHOLD_MS,
        isProgrammatic: false,
        isComposing: false,
      }),
    ).toBe(false);
  });

  it("超过阈值上报", () => {
    expect(
      shouldReportInputLag({
        lagMs: INPUT_LAG_REPORT_THRESHOLD_MS + 1,
        isProgrammatic: false,
        isComposing: false,
      }),
    ).toBe(true);
  });

  it("超过哨兵上限不上报", () => {
    expect(
      shouldReportInputLag({
        lagMs: INPUT_LAG_SANITY_MAX_MS + 1,
        isProgrammatic: false,
        isComposing: false,
      }),
    ).toBe(false);
  });

  it("程序化改写即使超阈也不上报", () => {
    expect(
      shouldReportInputLag({
        lagMs: INPUT_LAG_REPORT_THRESHOLD_MS + 1000,
        isProgrammatic: true,
        isComposing: false,
      }),
    ).toBe(false);
  });

  it("IME 组合态即使超阈也不上报", () => {
    expect(
      shouldReportInputLag({
        lagMs: INPUT_LAG_REPORT_THRESHOLD_MS + 1000,
        isProgrammatic: false,
        isComposing: true,
      }),
    ).toBe(false);
  });
});

describe("input lag - recordInputLag", () => {
  it("超阈上报,payload 字段正确", () => {
    const reporter = makeReporter();
    setUiPerfArmsReporter(reporter);
    recordInputLag({
      lagMs: 642.7,
      textLength: 1280,
      isProgrammatic: false,
      isComposing: false,
      taskId: "t1",
    });
    expect(reporter.calls).toHaveLength(1);
    expect(reporter.calls[0]).toMatchObject({
      name: UI_PERF_EVENT_INPUT_LAG,
      group: UI_PERF_ARMS_GROUP,
      value: 643,
      properties: {
        lag_ms: 643,
        text_length: 1280,
        task_id: "t1",
      },
    });
  });

  it("不满足上报条件时静默", () => {
    const reporter = makeReporter();
    setUiPerfArmsReporter(reporter);
    recordInputLag({
      lagMs: 100,
      textLength: 5,
      isProgrammatic: false,
      isComposing: false,
    });
    expect(reporter.calls).toHaveLength(0);
  });

  it("无 reporter 时不抛", () => {
    clearUiPerfArmsReporterForTest();
    expect(() =>
      recordInputLag({
        lagMs: 9999,
        textLength: 10,
        isProgrammatic: false,
        isComposing: false,
      }),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: rodar o teste e confirmar a falha**

Run: `pnpm --filter @zcode/ui exec vitest run test/uiPerfArmsTelemetry.test.ts`
Expected: FAIL — acusando que `shouldReportInputLag`/`recordInputLag`/`UI_PERF_EVENT_INPUT_LAG` etc. não são exportados.

- [ ] **Step 3: implementar a camada de telemetry**

Acrescentar ao final de `packages/ui/src/lib/uiPerfArmsTelemetry.ts` (depois de `clearStreamStallTracking`):

```ts
// Travamento na caixa de input: mede dentro do update listener do Lexical o "tempo de processamento de uma única entrada" (trecho síncrono getEditorMarkdown+onChange).
// Diferente de stream_stall (lado da saída): aqui é o lado da entrada. Reporta somente os pontos que ultrapassam o limiar, de forma a minimizar o volume de eventos.
export const UI_PERF_EVENT_INPUT_LAG = "perf_ui_input_lag";

// Ponto de partida conservador: captura apenas os travamentos mais graves. Pode ser apertado conforme a distribuição em produção.
export const INPUT_LAG_REPORT_THRESHOLD_MS = 500;
// Acima deste valor provavelmente é breakpoint de debug / aba suspensa / sono do dispositivo; descartar para não poluir a distribuição.
export const INPUT_LAG_SANITY_MAX_MS = 5000;

// A decisão foi extraída para uma função pura para facilitar o teste unitário: reescrita programática (colar/setText/mention/preenchimento de histórico) e estado de composição do IME
// não contam como travamento de digitação; mesmo passando do limiar, são ignorados.
export function shouldReportInputLag(args: {
  lagMs: number;
  isProgrammatic: boolean;
  isComposing: boolean;
}): boolean {
  if (args.isProgrammatic || args.isComposing) {
    return false;
  }
  return (
    args.lagMs > INPUT_LAG_REPORT_THRESHOLD_MS &&
    args.lagMs <= INPUT_LAG_SANITY_MAX_MS
  );
}

export function recordInputLag(params: {
  lagMs: number;
  textLength: number;
  isProgrammatic: boolean;
  isComposing: boolean;
  taskId?: string;
}): void {
  if (
    !shouldReportInputLag({
      lagMs: params.lagMs,
      isProgrammatic: params.isProgrammatic,
      isComposing: params.isComposing,
    })
  ) {
    return;
  }
  const lagMs = Math.round(params.lagMs);
  emit({
    name: UI_PERF_EVENT_INPUT_LAG,
    group: UI_PERF_ARMS_GROUP,
    value: lagMs,
    properties: {
      lag_ms: lagMs,
      text_length: params.textLength,
      // No estado de rascunho não há taskId; deixa vazio para manter a mesma convenção dos demais eventos ui_perf.
      task_id: params.taskId,
    },
  });
}
```

- [ ] **Step 4: rodar o teste e confirmar a aprovação**

Run: `pnpm --filter @zcode/ui exec vitest run test/uiPerfArmsTelemetry.test.ts`
Expected: PASS (os 8 cases novos ficam verdes e os cases existentes não são afetados).

- [ ] **Step 5: commitar**

```bash
git add packages/ui/src/lib/uiPerfArmsTelemetry.ts packages/ui/test/uiPerfArmsTelemetry.test.ts
git commit -m "feat(ui): perf_ui_input_lag 埋点 telemetry 层(判定纯函数+上报)"
```

---

### Task 2: integração no componente — marcar os updates programáticos com tag e cronometrar o envio no TextContentPlugin

**Files:**
- Modify: `packages/ui/src/LexicalChatInput.tsx`

**Interfaces:**
- Consumes: `recordInputLag` da Task 1; `editor.isComposing()` do Lexical, o `tags: Set<string>` do callback do update listener e `editor.update(fn, { tag })`.
- Produces: constante em nível de módulo `PROGRAMMATIC_UPDATE_TAG = "zcode-programmatic"` (usada apenas dentro deste arquivo, sem consumidor externo).

Explicação: as mudanças desta tarefa são a integração com o runtime do Lexical, cujo comportamento de update é instável sob jsdom, então **não se escreve teste unitário de componente**; a lógica de decisão já está coberta pelos testes de função pura da Task 1. Esta tarefa usa `pnpm typecheck` + `oxlint` como porta de verificação.

- [ ] **Step 1: adicionar a constante da tag de update programático**

Na área de constantes do topo de `LexicalChatInput.tsx` (perto de `const CHINESE_SLASH_ALIAS = "、";`), acrescentar:

```ts
// Reescritas programáticas (editor.update sem tecla do usuário: setText/inserção de mention/preenchimento de histórico etc.)
// recebem esta tag; a telemetria de travamento de input pula o update quando a vê no listener, evitando interpretar uma reescrita em lote como travamento de digitação.
const PROGRAMMATIC_UPDATE_TAG = "zcode-programmatic";
```

- [ ] **Step 2: marcar com tag todos os editor.update programáticos**

Alterar as chamadas `editor.update(() => { ... })` das funções abaixo para a forma com tag `editor.update(() => { ... }, { tag: PROGRAMMATIC_UPDATE_TAG })`. Modificar uma a uma as chamadas `editor.update` destas funções:

1. `replaceEditorText` (cerca da linha 134)
2. `replaceEditorWithSkillMention` (cerca da linha 161)
3. `replaceEditorWithSlashCommandMention` (cerca da linha 189)
4. `appendEditorFileMention` (cerca da linha 216)
5. `appendEditorPlainText` (cerca da linha 247)

Exemplo (`replaceEditorText`; nos demais, acrescentar igualmente `, { tag: PROGRAMMATIC_UPDATE_TAG }` após o `})` de fechamento):

```ts
function replaceEditorText(editor: LexicalEditor, text: string) {
  editor.update(() => {
    const root = $getRoot();
    root.clear();

    // O getTextContent() do Lexical separa parágrafos com \n\n; o tratamento simétrico evita duplicação de quebras de linha
    for (const line of text.split("\n\n")) {
      const paragraph = $createParagraphNode();
      if (line) {
        paragraph.append($createTextNode(line));
      }
      root.append(paragraph);
    }

    root.getLastChild()?.selectEnd();
  }, { tag: PROGRAMMATIC_UPDATE_TAG });
}
```

Atenção: o `editor.update` da linha de aproximadamente 696 em `LeadingChineseSlashPlugin` (que normaliza a vírgula ideográfica para `/`) **também é inserção programática** e precisa receber a tag:

```ts
      editor.update(() => {
        if (!isCollapsedSelectionAtEditorStart()) {
          return;
        }

        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return;
        }

        selection.insertText(STANDARD_SLASH_TRIGGER);
      }, { tag: PROGRAMMATIC_UPDATE_TAG });
```

- [ ] **Step 3: cronometrar e enviar dentro do TextContentPlugin**

Substituir `TextContentPlugin` (cerca das linhas 397–427) pela versão abaixo. Pontos de mudança: incluir `recordInputLag` no topo dos imports; dentro do callback do listener, envolver `getEditorMarkdown + onChange` com `performance.now()`, ler `tags` e `editor.isComposing()`, calcular `lagMs` e passá-lo a `recordInputLag`. O `taskId` é passado por meio de uma nova prop opcional.

Primeiro acrescentar na área de imports do arquivo (perto de `import { logger } ...`):

```ts
import { recordInputLag } from "./lib/uiPerfArmsTelemetry.js";
```

Depois substituir `TextContentPlugin`:

```tsx
function TextContentPlugin({
  onChange,
  taskId,
}: {
  onChange?: (text: string) => void;
  taskId?: string | null;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!onChange) {
      return;
    }

    return editor.registerUpdateListener(
      ({ dirtyElements, dirtyLeaves, editorState, prevEditorState, tags }) => {
        if (dirtyElements.size === 0 && dirtyLeaves.size === 0) {
          return;
        }

        // Cronometragem do travamento de input: envolve o ponto quente de tratamento "serialização completa + rerender síncrono do onChange".
        const startedAt = performance.now();

        const nextText = getEditorMarkdown(editorState);
        const previousText = getEditorMarkdown(prevEditorState);
        if (nextText === previousText) {
          return;
        }

        onChange(nextText);

        const lagMs = performance.now() - startedAt;
        // Reescrita programática e estado de composição do IME não contam como travamento de digitação (a decisão faz curto-circuito dentro de recordInputLag).
        recordInputLag({
          lagMs,
          textLength: nextText.length,
          isProgrammatic: tags.has(PROGRAMMATIC_UPDATE_TAG),
          isComposing: editor.isComposing(),
          taskId: taskId ?? undefined,
        });
      },
    );
  }, [editor, onChange, taskId]);

  return null;
}
```

- [ ] **Step 4: passar o taskId para o TextContentPlugin**

O componente `LexicalChatInput` já tem a prop `taskId` (cerca da linha 804, `taskId: string | null`). Passá-la ao plugin no JSX (cerca da linha 945):

```tsx
          <TextContentPlugin onChange={onChange} taskId={taskId} />
```

- [ ] **Step 5: verificação de tipos**

Run: `pnpm typecheck`
Expected: PASS, sem novos erros de tipo.

- [ ] **Step 6: lint**

Run: `pnpm --filter @zcode/ui lint`
Expected: PASS (sem novos avisos; a escrita do segundo argumento objeto de `editor.update` está de acordo com as regras do oxlint).

- [ ] **Step 7: regressão nos testes unitários**

Run: `pnpm --filter @zcode/ui exec vitest run test/uiPerfArmsTelemetry.test.ts test/lexicalChatInputEnter.test.ts`
Expected: PASS (o teste de telemetry e os testes existentes de comportamento de Enter do Lexical não são afetados).

- [ ] **Step 8: commitar**

```bash
git add packages/ui/src/LexicalChatInput.tsx
git commit -m "feat(ui): 输入框卡顿接线 perf_ui_input_lag(打程序化 tag+计时上报)"
```

---

## Self-Review

**Cobertura da spec:**
- Evento `perf_ui_input_lag` + grupo `ui_perf` → Task 1 Step 3.
- Ponto de medição no `TextContentPlugin` envolvendo getEditorMarkdown+onChange → Task 2 Step 3.
- Limiar 500 / sentinela 5000 → constantes da Task 1.
- Mede apenas o tempo síncrono, sem perseguir paint → Task 2 Step 3 (`performance.now` no início e no fim, sem rAF).
- Exclusão do IME (`editor.isComposing()`) → Task 2 Step 3 + decisão da Task 1.
- Exclusão das reescritas programáticas (update tag) → Task 2 Step 1/2 + decisão da Task 1.
- Falha gera apenas warn → reaproveita `emit()` (implementação existente, chamada diretamente na Task 1).
- Campos value/lag_ms/text_length/task_id → Task 1 Step 3 + asserções de teste.
- Sem model/texto do conteúdo/número de mentions → de fato ausentes do payload.
- Decisão extraída para função pura com teste unitário → Task 1.
- Sem E2E pesado de componente → explicação da Task 2.
- Sem mexer em Root → nenhuma das duas tarefas tocou `Root.tsx`.

**Varredura de placeholders:** sem TBD/TODO; cada passo de código traz o código completo.

**Consistência de tipos:** os nomes de parâmetro de `shouldReportInputLag` / `recordInputLag` (`lagMs`/`textLength`/`isProgrammatic`/`isComposing`/`taskId`) são consistentes na definição da Task 1, na chamada da Task 2 e nas asserções de teste; a constante de nome de evento `UI_PERF_EVENT_INPUT_LAG` é uniforme ao longo do plano; a constante de tag `PROGRAMMATIC_UPDATE_TAG` é definida e usada dentro da Task 2.