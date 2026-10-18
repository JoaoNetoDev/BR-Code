# Plano de Implementação de Virtual Scroll no Painel de Menções @

> **Para workers agênticos:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** Substituir o limite rígido (`FILE_MENTION_RESULT_LIMIT = 100`) no painel de menções @ por virtual scrolling, para que os usuários possam navegar e buscar em todos os arquivos do workspace sem degradação de performance.

**Arquitetura:** Usar `@tanstack/react-virtual` para virtualizar a renderização da lista de `MentionPanel` — apenas as linhas visíveis são montadas no DOM. Remover o teto rígido em `fileMentionProvider` e deixar o virtualizador lidar com conjuntos de resultados filtrados arbitrariamente grandes. O pipeline de busca fuzzy (`mentionSearch.ts`) permanece inalterado; apenas a camada de renderização e o limite artificial mudam.

**Stack técnico:** React 19, `@tanstack/react-virtual`, Vitest, Tailwind CSS

---

## Estrutura de Arquivos

| Ação | Arquivo | Responsabilidade |
|--------|------|----------------|
| Modificar | `packages/ui/src/mentions/components/MentionPanel.tsx` | Adicionar virtual scrolling à lista de opções |
| Modificar | `packages/ui/src/mentions/providers/fileMentionProvider.ts` | Remover o limite rígido de 100 |
| Modificar | `packages/ui/src/mentions/mentionSearch.ts` | Adicionar constante de teto suave de exibição (1000) como rede de segurança |
| Criar | `packages/ui/test/mentionPanel.test.ts` | Testes unitários do comportamento de virtual scroll |
| Modificar | `packages/ui/test/mentionSearch.test.ts` | Adicionar teste para tratamento de conjuntos grandes de resultados |

---

### Tarefa 1: Adicionar a dependência `@tanstack/react-virtual`

**Arquivos:**
- Modificar: `packages/ui/package.json`

- [ ] **Passo 1: Instalar a dependência**

```bash
cd packages/ui && npm install @tanstack/react-virtual
```

- [ ] **Passo 2: Verificar a instalação**

```bash
node -e "require('@tanstack/react-virtual')" 2>/dev/null && echo OK || echo FAIL
```

Esperado: OK

- [ ] **Passo 3: Commitar**

```bash
git add packages/ui/package.json package-lock.json
git commit -m "chore: add @tanstack/react-virtual for mention panel virtualization"
```

---

### Tarefa 2: Remover o limite rígido em fileMentionProvider

**Arquivos:**
- Modificar: `packages/ui/src/mentions/providers/fileMentionProvider.ts:8,85-91`
- Modificar: `packages/ui/src/mentions/mentionSearch.ts`
- Modificar: `packages/ui/test/mentionSearch.test.ts`

- [ ] **Passo 1: Escrever o teste que falha — conjunto grande de resultados não é truncado**

Em `packages/ui/test/mentionSearch.test.ts`, adicionar:

```typescript
describe("filterMentionItemsWithOptions – no hard cap", () => {
  const manyItems: MentionItem[] = Array.from({ length: 500 }, (_, i) => ({
    id: `file:src/file${i}.ts`,
    category: "files" as const,
    label: `file${i}.ts`,
    description: `src/file${i}.ts`,
    value: `src/file${i}.ts`,
    markdown: `[src/file${i}.ts](src/file${i}.ts)`,
    keywords: [],
  }));

  it("returns all matching items when no explicit limit is set", () => {
    const result = filterMentionItemsWithOptions(manyItems, "file");
    expect(result.length).toBe(500);
  });

  it("respects an explicit limit when provided", () => {
    const result = filterMentionItemsWithOptions(manyItems, "file", { limit: 10 });
    expect(result.length).toBe(10);
  });
});
```

- [ ] **Passo 2: Executar o teste para verificar que ele falha**

```bash
cd /Users/dev/workspace/z-code && npx vitest run packages/ui/test/mentionSearch.test.ts
```

Esperado: a primeira asserção FALHA — `filterMentionItemsWithOptions` sem limite explícito ainda é limitado em algum lugar, se for chamado de dentro do caminho do provider.

(Observação: `filterMentionItemsWithOptions` em si não limita por padrão — o limite só é passado por `fileMentionProvider`. O teste na verdade já deve passar, já que a função sem `options.limit` retorna todos os itens. Se passar, isso confirma que a camada da função está correta e que o teto está puramente no provider. Prossiga para o Passo 3 de qualquer forma.)

- [ ] **Passo 3: Remover a constante de limite rígido de fileMentionProvider**

Em `packages/ui/src/mentions/providers/fileMentionProvider.ts`, faça estas alterações:

Remova a constante:
```typescript
// DELETE this line:
const FILE_MENTION_RESULT_LIMIT = 100;
```

Atualize o `useMemo` que chama `filterMentionItemsWithOptions` — remova a opção `limit`:

```typescript
  const items = useMemo(
    () => filterMentionItemsWithOptions(allItems, query),
    [allItems, query],
  );
```

- [ ] **Passo 4: Adicionar uma constante de teto de exibição de rede de segurança em mentionSearch.ts**

Em `packages/ui/src/mentions/mentionSearch.ts`, adicione uma constante de exibição máxima padrão e aplique-a em `filterMentionItemsWithOptions` apenas quando nenhum limite explícito for fornecido, para evitar renderizar acidentalmente 50 mil ou mais itens mesmo com virtualização:

```typescript
/**
 * Safety-net cap for virtualized display. Large enough to never feel
 * "incomplete" to users, small enough to keep fuzzy-sort and virtualizer
 * memory in check for enormous monorepos.
 */
export const MENTION_DISPLAY_CAP = 1000;
```

Atualize `filterMentionItemsWithOptions`:

```typescript
export function filterMentionItemsWithOptions(
  items: MentionItem[],
  query: string,
  options: FilterMentionItemsOptions = {},
): MentionItem[] {
  const effectiveLimit = options.limit ?? MENTION_DISPLAY_CAP;
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return options.requireQuery ? [] : applyMentionItemLimit(items, effectiveLimit);
  }

  return applyMentionItemLimit(
    sortScoredItems(
      items,
      (item) => {
        const labelScore = scoreFuzzyMatch(item.label, normalizedQuery);
        const descriptionScore = scoreFuzzyMatch(item.description, normalizedQuery);
        const valueScore = scoreFuzzyMatch(item.value, normalizedQuery);
        const keywordScore = Math.min(
          ...(item.keywords ?? []).map((keyword) => {
            const score = scoreFuzzyMatch(keyword, normalizedQuery);
            return score === null ? Number.POSITIVE_INFINITY : score + 300;
          }),
          Number.POSITIVE_INFINITY,
        );
        const bestScore = Math.min(
          labelScore ?? Number.POSITIVE_INFINITY,
          valueScore !== null ? valueScore + 25 : Number.POSITIVE_INFINITY,
          descriptionScore !== null ? descriptionScore + 100 : Number.POSITIVE_INFINITY,
          keywordScore,
        );

        return Number.isFinite(bestScore) ? bestScore : null;
      },
      (item) => item.label,
    ),
    effectiveLimit,
  );
}
```

- [ ] **Passo 5: Executar o teste novamente**

```bash
cd /Users/dev/workspace/z-code && npx vitest run packages/ui/test/mentionSearch.test.ts
```

Esperado: TODOS PASSAM. O teste de 500 itens passa (abaixo do teto de 1000); o teste de limite 10 passa.

- [ ] **Passo 6: Commitar**

```bash
git add packages/ui/src/mentions/providers/fileMentionProvider.ts packages/ui/src/mentions/mentionSearch.ts packages/ui/test/mentionSearch.test.ts
git commit -m "feat: remove hard 100-item cap from mention panel, add 1000-item safety-net display cap"
```

---

### Tarefa 3: Virtualizar a renderização do MentionPanel

Esta é a tarefa central. Substituir a renderização ingênua no DOM `section.options.map(...)` pelo `useVirtualizer` de `@tanstack/react-virtual`.

**Arquivos:**
- Modificar: `packages/ui/src/mentions/components/MentionPanel.tsx`

- [ ] **Passo 1: Achatar as seções em uma única lista virtual com cabeçalhos de seção**

O MentionPanel atual renderiza seções → opções. Para a virtualização, precisamos de uma única lista plana em que algumas linhas são "cabeçalhos de seção" e a maioria são "linhas de opção". Isso nos permite usar um único virtualizador.

Substitua todo o conteúdo de `packages/ui/src/mentions/components/MentionPanel.tsx` por:

```tsx
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

export interface MentionPanelOption {
  id: string;
  label: string;
  description: string;
  meta?: ReactNode;
}

export interface MentionPanelSection {
  id: string;
  title: string;
  options: MentionPanelOption[];
  emptyText: string;
  loadingText?: string;
  loading?: boolean;
  errorText?: string | null;
}

interface MentionPanelProps {
  title: string;
  description: string;
  trigger: string;
  sections: MentionPanelSection[];
  emptyText: string;
  selectedIndex: number;
  onSelect: (index: number) => void;
  onHover: (index: number) => void;
}

type VirtualRow =
  | { kind: "status"; sectionId: string; content: "loading" | "error" | "empty"; text: string }
  | { kind: "option"; sectionId: string; option: MentionPanelOption; flatOptionIndex: number };

const OPTION_ROW_HEIGHT = 44;
const STATUS_ROW_HEIGHT = 40;

function buildVirtualRows(sections: MentionPanelSection[]): VirtualRow[] {
  const rows: VirtualRow[] = [];
  let flatOptionIndex = 0;

  for (const section of sections) {
    if (section.errorText) {
      rows.push({ kind: "status", sectionId: section.id, content: "error", text: section.errorText });
    } else if (section.loading) {
      rows.push({ kind: "status", sectionId: section.id, content: "loading", text: section.loadingText ?? section.emptyText });
    } else if (section.options.length === 0) {
      rows.push({ kind: "status", sectionId: section.id, content: "empty", text: section.emptyText });
    } else {
      for (const option of section.options) {
        rows.push({ kind: "option", sectionId: section.id, option, flatOptionIndex });
        flatOptionIndex += 1;
      }
    }
  }

  return rows;
}

export function MentionPanel({
  title,
  description,
  sections,
  emptyText,
  selectedIndex,
  onSelect,
  onHover,
}: MentionPanelProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const virtualRows = useMemo(() => buildVirtualRows(sections), [sections]);

  const virtualizer = useVirtualizer({
    count: virtualRows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index) =>
      virtualRows[index]?.kind === "option" ? OPTION_ROW_HEIGHT : STATUS_ROW_HEIGHT,
    overscan: 8,
  });

  // Scroll selected option into view
  const selectedVirtualIndex = useMemo(() => {
    return virtualRows.findIndex(
      (row) => row.kind === "option" && row.flatOptionIndex === selectedIndex,
    );
  }, [virtualRows, selectedIndex]);

  useEffect(() => {
    if (selectedVirtualIndex >= 0) {
      virtualizer.scrollToIndex(selectedVirtualIndex, { align: "auto" });
    }
  }, [selectedVirtualIndex, virtualizer]);

  return (
    <div className="mx-3 mb-2 overflow-hidden rounded-xl border border-outline/60 bg-popover shadow-[0_18px_45px_rgba(15,23,42,0.18)]">
      <div className="flex items-center justify-between border-b border-outline/60 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] text-on-surface-muted">{description}</p>
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        className="h-56 overflow-y-auto p-1"
        role="listbox"
        aria-label={title}
      >
        {virtualRows.length === 0 ? (
          <div className="flex h-full items-center justify-center px-3 text-xs text-on-surface-muted">
            {emptyText}
          </div>
        ) : (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const row = virtualRows[virtualItem.index];
              if (!row) return null;

              return (
                <div
                  key={virtualItem.key}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  {row.kind === "status" ? (
                    <StatusRow row={row} />
                  ) : (
                    <OptionRow
                      row={row}
                      isSelected={row.flatOptionIndex === selectedIndex}
                      onSelect={onSelect}
                      onHover={onHover}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusRow({ row }: { row: Extract<VirtualRow, { kind: "status" }> }) {
  if (row.content === "loading") {
    return (
      <div className="flex items-center gap-2 rounded-xl px-5 py-2 text-xs text-on-surface-muted">
        <span className="flex gap-1">
          <span
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent/60"
            style={{ animationDelay: "0ms" }}
          />
          <span
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent/60"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent/60"
            style={{ animationDelay: "300ms" }}
          />
        </span>
        <span>{row.text}</span>
      </div>
    );
  }

  if (row.content === "error") {
    return (
      <div className="rounded-xl px-5 py-2 text-xs text-red-500">
        {row.text}
      </div>
    );
  }

  return (
    <div className="rounded-xl px-5 py-2 text-xs text-on-surface-muted">
      {row.text}
    </div>
  );
}

function OptionRow({
  row,
  isSelected,
  onSelect,
  onHover,
}: {
  row: Extract<VirtualRow, { kind: "option" }>;
  isSelected: boolean;
  onSelect: (index: number) => void;
  onHover: (index: number) => void;
}) {
  const { option, flatOptionIndex } = row;

  return (
    <button
      type="button"
      role="option"
      aria-selected={isSelected}
      className={`flex w-full items-start gap-3 rounded-xl border px-5 py-2 text-left transition-colors ${
        isSelected
          ? "border-outline/60 bg-surface-raised text-on-surface shadow-sm"
          : "border-transparent text-on-surface-muted hover:bg-surface-raised/70 hover:text-on-surface"
      }`}
      onMouseDown={(event) => {
        event.preventDefault();
        onSelect(flatOptionIndex);
      }}
      onMouseEnter={() => onHover(flatOptionIndex)}
    >
      <span className="min-w-0 flex-1 flex">
        <span className="flex items-center gap-2 flex-auto">
          <span className="truncate text-xs font-medium text-on-surface">
            {option.label}
          </span>
          {option.meta ? (
            <span className="shrink-0 text-[10px] text-on-surface-muted">
              {option.meta}
            </span>
          ) : null}
        </span>
        <span className="mt-1 block truncate text-[11px] text-on-surface-muted">
          {option.description}
        </span>
      </span>
    </button>
  );
}
```

- [ ] **Passo 2: Verificar que o app compila**

```bash
cd /Users/dev/workspace/z-code && npm run build
```

Esperado: nenhum erro de TypeScript ou de build.

- [ ] **Passo 3: Teste manual de fumaça**

Abra o app, digite `@` no campo de chat. Verifique:
- O painel abre com a lista de arquivos
- As setas navegam e rolam corretamente
- Digitar uma query filtra a lista
- Selecionar um item insere a menção
- A rolagem é fluida, sem travamentos visíveis

- [ ] **Passo 4: Commitar**

```bash
git add packages/ui/src/mentions/components/MentionPanel.tsx
git commit -m "feat: virtualize mention panel list with @tanstack/react-virtual"
```

---

### Tarefa 4: Testes unitários do MentionPanel virtualizado

**Arquivos:**
- Criar: `packages/ui/test/mentionPanel.test.ts`

- [ ] **Passo 1: Escrever testes para o helper buildVirtualRows**

Como `buildVirtualRows` é a lógica central que achata seções em linhas virtuais, extraia-a como um export nomeado para teste (ou teste-a indiretamente). A abordagem mais simples: exportá-la de `MentionPanel.tsx` e testar a lógica de achatamento diretamente.

Em `packages/ui/src/mentions/components/MentionPanel.tsx`, adicione `export` à função `buildVirtualRows`:

```typescript
export function buildVirtualRows(sections: MentionPanelSection[]): VirtualRow[] {
```

Exporte também o tipo `VirtualRow`:

```typescript
export type VirtualRow =
```

Crie `packages/ui/test/mentionPanel.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  buildVirtualRows,
  type MentionPanelSection,
} from "../src/mentions/components/MentionPanel.js";

function makeOptions(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `opt-${i}`,
    label: `Option ${i}`,
    description: `Description ${i}`,
  }));
}

describe("buildVirtualRows", () => {
  it("returns empty array for empty sections", () => {
    expect(buildVirtualRows([])).toEqual([]);
  });

  it("produces one option row per option with correct flatOptionIndex", () => {
    const sections: MentionPanelSection[] = [
      { id: "files", title: "Files", options: makeOptions(3), emptyText: "No files" },
    ];
    const rows = buildVirtualRows(sections);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.kind === "option")).toBe(true);

    const indices = rows
      .filter((r): r is Extract<typeof r, { kind: "option" }> => r.kind === "option")
      .map((r) => r.flatOptionIndex);
    expect(indices).toEqual([0, 1, 2]);
  });

  it("shows loading status row when section is loading", () => {
    const sections: MentionPanelSection[] = [
      { id: "files", title: "Files", options: [], emptyText: "No files", loading: true, loadingText: "Loading..." },
    ];
    const rows = buildVirtualRows(sections);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "status", content: "loading", text: "Loading..." });
  });

  it("shows error status row when section has error", () => {
    const sections: MentionPanelSection[] = [
      { id: "files", title: "Files", options: [], emptyText: "No files", errorText: "Failed to load" },
    ];
    const rows = buildVirtualRows(sections);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "status", content: "error", text: "Failed to load" });
  });

  it("shows empty status row when section has no options and is not loading", () => {
    const sections: MentionPanelSection[] = [
      { id: "files", title: "Files", options: [], emptyText: "No files found" },
    ];
    const rows = buildVirtualRows(sections);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "status", content: "empty", text: "No files found" });
  });

  it("assigns continuous flatOptionIndex across multiple sections", () => {
    const sections: MentionPanelSection[] = [
      { id: "files", title: "Files", options: makeOptions(2), emptyText: "" },
      { id: "symbols", title: "Symbols", options: makeOptions(3), emptyText: "" },
    ];
    const rows = buildVirtualRows(sections);
    const optionRows = rows.filter(
      (r): r is Extract<typeof r, { kind: "option" }> => r.kind === "option",
    );
    expect(optionRows.map((r) => r.flatOptionIndex)).toEqual([0, 1, 2, 3, 4]);
  });

  it("handles large option sets efficiently", () => {
    const sections: MentionPanelSection[] = [
      { id: "files", title: "Files", options: makeOptions(1000), emptyText: "" },
    ];
    const start = performance.now();
    const rows = buildVirtualRows(sections);
    const elapsed = performance.now() - start;

    expect(rows).toHaveLength(1000);
    expect(elapsed).toBeLessThan(50); // should be essentially instant
  });
});
```

- [ ] **Passo 2: Executar os testes**

```bash
cd /Users/dev/workspace/z-code && npx vitest run packages/ui/test/mentionPanel.test.ts
```

Esperado: TODOS PASSAM

- [ ] **Passo 3: Commitar**

```bash
git add packages/ui/test/mentionPanel.test.ts packages/ui/src/mentions/components/MentionPanel.tsx
git commit -m "test: add unit tests for MentionPanel virtual row building"
```

---

### Tarefa 5: Verificação final de integração

- [ ] **Passo 1: Executar todos os testes existentes relacionados a menções**

```bash
cd /Users/dev/workspace/z-code && npx vitest run packages/ui/test/mentionSearch.test.ts packages/ui/test/mentionPanel.test.ts
```

Esperado: TODOS PASSAM

- [ ] **Passo 2: Executar a suíte completa de testes do pacote UI**

```bash
cd /Users/dev/workspace/z-code && npx vitest run packages/ui/test/
```

Esperado: TODOS PASSAM, sem regressões.

- [ ] **Passo 3: Verificação de build**

```bash
cd /Users/dev/workspace/z-code && npm run build
```

Esperado: build limpo, sem erros.

- [ ] **Passo 4: Teste manual E2E de fumaça**

Abra o app e verifique:
1. Digite `@` — o painel abre e mostra os arquivos (indicador de loading → lista)
2. Role para baixo — virtual scrolling fluido, sem lacunas em branco
3. Digite uma query (por exemplo, `pack`) — a lista filtra instantaneamente
4. Aperte a seta para baixo 20+ vezes — a rolagem acompanha a seleção suavemente
5. Pressione Enter — a menção é inserida corretamente
6. Abra `@` em um workspace grande (1000+ arquivos) — sem lag visível

- [ ] **Passo 5: Commitar (se algum ajuste foi necessário)**

```bash
git add -A
git commit -m "fix: address integration issues from virtual scroll migration"
```

## Complemento de 2026-04-03

- Cada item candidato do painel de menções de arquivos reutiliza uniformemente `packages/ui/src/lib/fileDisplay.tsx`.
- Assim, o ícone de arquivo, o nome do arquivo e o caminho do diretório no painel `@` ficam consistentes com o mention token no campo de entrada, reduzindo o problema de um mesmo caminho aparecer de forma inconsistente em locais diferentes.