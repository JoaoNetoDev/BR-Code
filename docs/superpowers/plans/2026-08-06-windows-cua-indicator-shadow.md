# Plano de Implementação da Sombra do Indicador CUA no Windows

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** Remover a sombra nativa retangular e as bordas duras de recorte CSS do aviso superior do CUA no Windows, mantendo inalterados o tamanho visível do cartão e sua posição superior.

**Arquitetura:** `WindowsCuaOperationIndicator` continua sendo o dono da única `BrowserWindow` transparente com captura excluída. A janela desativa explicitamente a sombra do DWM e envolve o cartão visível original em uma zona segura transparente; a lógica de posicionamento centraliza a janela ampliada, mas compensa a coordenada y com o inset superior, garantindo que a borda superior do cartão continue sendo a work area `+12px`.

**Stack tecnológico:** Electron `BrowserWindow`, TypeScript, HTML/CSS embutido, Vitest.

## Restrições Globais

- Modificar apenas a camada flutuante nativa do Windows, sem tocar em macOS, Linux, Web, mobile ou na cadeia de estados de lifecycle do CUA.
- O cartão visível mantém a largura `234px`/`308px` (chinês/inglês) e a altura `38px`, com a borda superior mantendo work area `+12px`.
- A zona segura transparente é fixa em esquerda/direita `8px`, superior `6px`, inferior `12px`; a janela é `250px × 56px` em chinês e `324px × 56px` em inglês.
- A `BrowserWindow` deve definir explicitamente `hasShadow: false`; a sombra só pode ser desenhada por CSS.
- Preservar `alwaysOnTop`, não focável, mouse pass-through, `setContentProtection(true)`, tema, internacionalização e comportamento de reduced-motion.
- Primeiro ver o teste de regressão falhar por causa da geometria antiga da janela, e só então modificar o código de produção.
- Antes de concluir, executar os testes direcionados, `pnpm typecheck`, `pnpm lint` e `git diff --check`.

---

### Tarefa 1: Fazer a janela transparente carregar a única sombra CSS arredondada

**Arquivos:**

- Modify: `packages/desktop/test/windowsCuaOperationIndicator.test.ts`
- Modify: `packages/desktop/src/main/windowsCuaOperationIndicator.ts`

**Interfaces:**

- Consumes: `createWindowsCuaOperationIndicator(options)`, `indicatorCopy(locale)` e o ciclo de vida existente `positionWindow()`/`loadContent()`.
- Produces: uma `BrowserWindow` com sombra nativa desativada, com zona segura transparente e posição do cartão visível inalterada; sem novos interfaces entre módulos.

- [ ] **Step 1: Escrever o teste falhando do owner da sombra da janela e da geometria**

No primeiro teste de active turn, exigir:

```ts
expect(browserWindowOptions[0]).toMatchObject({
  alwaysOnTop: true,
  focusable: false,
  frame: false,
  hasShadow: false,
  resizable: false,
  show: false,
  skipTaskbar: true,
  transparent: true,
});
expect(windows[0]?.setBounds).toHaveBeenCalledWith({
  width: 250,
  height: 56,
  x: 2_435,
  y: 46,
});
const html = decodeIndicatorHtml(windows[0]?.loadURL.mock.calls[0]?.[0] ?? "");
expect(html).toContain("padding: 6px 8px 12px");
expect(html).toContain(
  "box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08), 0 6px 12px -6px rgba(15, 23, 42, 0.18)",
);
expect(html).not.toContain("box-shadow: 0 4px 12px");
```

Alterar a asserção de work area após nova ativação para:

```ts
expect(windows[0]?.setBounds).toHaveBeenLastCalledWith({
  width: 250,
  height: 56,
  x: 835,
  y: 6,
});
```

- [ ] **Step 2: Executar o teste e confirmar que falha como esperado**

Run:

```powershell
pnpm exec vitest run packages/desktop/test/windowsCuaOperationIndicator.test.ts
```

Expected: FAIL; as options atuais não têm `hasShadow:false`, os bounds ainda são `236 × 40` e o HTML ainda contém a sombra antiga.

- [ ] **Step 3: Escrever a implementação de produção mínima**

Em `windowsCuaOperationIndicator.ts`, definir a largura do copy como a largura do cartão visível e declarar centralmente a zona segura:

```ts
const INDICATOR_CARD_HEIGHT = 38;
const INDICATOR_CARD_TOP_OFFSET = 12;
const INDICATOR_SHADOW_INSET = { top: 6, right: 8, bottom: 12, left: 8 } as const;

function indicatorCopy(locale: Locale): { text: string; width: number } {
  return locale === "zh-CN"
    ? { text: "ZCode 正在操作电脑", width: 234 }
    : { text: "ZCode is controlling your computer", width: 308 };
}

function indicatorWindowSize(locale: Locale): { width: number; height: number } {
  const { width } = indicatorCopy(locale);
  return {
    width: width + INDICATOR_SHADOW_INSET.left + INDICATOR_SHADOW_INSET.right,
    height: INDICATOR_SHADOW_INSET.top + INDICATOR_CARD_HEIGHT + INDICATOR_SHADOW_INSET.bottom,
  };
}
```

`positionWindow()` e `createWindow()` usam `indicatorWindowSize()`; a coordenada y é:

```ts
y: Math.round(
  workArea.y + INDICATOR_CARD_TOP_OFFSET - INDICATOR_SHADOW_INSET.top,
),
```

Novas opções da BrowserWindow:

```ts
hasShadow: false,
```

No HTML, alterar para:

```css
body {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 8px 12px;
}
.indicator {
  width: 100%;
  height: 38px;
  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.08),
    0 6px 12px -6px rgba(15, 23, 42, 0.18);
}
```

A media query de dark usa a sombra escura de duas camadas definida na spec. Adicionar um comentário de motivo em chinês explicando que a margem transparente antiga de `1px` recortava a sombra CSS e que a sombra padrão do DWM causava uma faixa cinza retangular.

- [ ] **Step 4: Executar os testes direcionados e confirmar que ficam verdes**

Run:

```powershell
pnpm exec vitest run packages/desktop/test/windowsCuaOperationIndicator.test.ts
```

Expected: PASS, todos os testes do indicador do Windows passam.

- [ ] **Step 5: Executar os gates do repositório**

Run:

```powershell
pnpm typecheck
pnpm lint
git diff --check
```

Expected: os comandos saem com `0`; o lint permite os warnings já existentes do repositório, mas não pode adicionar warnings para os arquivos desta tarefa.

- [ ] **Step 6: Commitar a implementação e reiniciar o dev local**

Adicionar ao stage apenas os dois arquivos de código/teste desta tarefa, sem incluir `.pnpm-store/` ou `.tmp/`:

```powershell
git add -- packages/desktop/src/main/windowsCuaOperationIndicator.ts packages/desktop/test/windowsCuaOperationIndicator.test.ts
git commit -m "fix(cua): render natural Windows indicator shadow"
```

Parar a árvore de processos atual de `@zcode/desktop dev:local-cli` e então iniciar o processo dev oculto com as variáveis de ambiente abaixo:

```powershell
$env:ZCODE_CUA_DEV_ROOT = "C:\Users\dev\zcode-cua"
pnpm --filter @zcode/desktop dev:local-cli
```

Expected: Electron main, desktop Host, `zcode.cjs app-server --stdio` e `C:\Users\dev\zcode-cua\dist\windows-helper.js` existem.
