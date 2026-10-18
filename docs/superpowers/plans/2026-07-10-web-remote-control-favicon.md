# Plano de implementação do Favicon do Web Remote Control

> **Para workers agênticos:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** Exibir, na aba do Web Remote Control em navegadores de celular e desktop, o ícone ZCode consistente com o App desktop.

**Arquitetura:** Copiar o ICO multi-resolução existente do desktop tal e qual para o diretório `public` do Vite do Web, preservando o caminho de compatibilidade tradicional `/favicon.ico`; ao mesmo tempo, embutir no HTML de entrada o favicon PNG data URL de 32x32 do App já existente, para que o navegador obtenha o ícone da aba já ao parsear o HTML de entrada. Os testes de regressão restringem simultaneamente o metadata do HTML, a origem do PNG data URL e a consistência binária dos ícones dos dois lados, e a verificação de build cobre a estabilidade do data URL sob prefixos de deploy não-root.

**Stack tecnológico:** Vite 8, HTML, Vitest 4, Node.js 24

## Restrições globais

- Reutilizar diretamente `packages/desktop/build/icon.ico`, sem redesenhar o asset de marca.
- Não adicionar PWA manifest, Apple Touch Icon nem ícone de tela inicial do Android.
- Não modificar o título da página, a tela de inicialização, o tema ou qualquer outra UI.
- Não alterar o fluxo continuous do desktop, o fluxo replayable do celular nem nenhum estado de negócio do controle remoto.
- Usar arquivos comuns em vez de links simbólicos, mantendo compatibilidade com Windows, macOS e Linux.
- O Web Remote Control deve ser compatível com os prefixos de deploy `/remote/`, `/remote/v3/` e `/remote/__test__/`.

---

### Tarefa 1: adicionar e verificar o favicon do Web

**Arquivos:**
- Modify: `packages/web/test/webRemoteControlBootstrapShell.test.ts`
- Create: `packages/web/public/favicon.ico`
- Modify: `packages/web/index.html`
- Modify: `docs/superpowers/specs/2026-07-10-web-remote-control-favicon-design.md`

**Interfaces:**
- Consumes: o ícone do App em tamanho pequeno `public/logo/icons/32x32.png` e o asset de marca `packages/desktop/build/icon.ico`.
- Produces: metadata `<link rel="icon" type="image/png" href="data:image/png;base64,..." sizes="32x32">` independente do base, além do arquivo estático `favicon.ico` tradicional que entra no `dist` após o build.

- [x] **Passo 1: escrever o teste de regressão que falha**

Adicionar em `packages/web/test/webRemoteControlBootstrapShell.test.ts` um helper de leitura binária e o teste:

```ts
function readWorkspaceFile(path: string): Buffer {
  return readFileSync(resolve(process.cwd(), path));
}

function readWorkspaceFileDataUrl(path: string, mimeType: string): string {
  return `data:${mimeType};base64,${readWorkspaceFile(path).toString("base64")}`;
}

it("内嵌与桌面 App 同源的浏览器标签图标", () => {
  const html = readWebIndexHtml();

  expect(html).toContain(
    `<link rel="icon" type="image/png" href="${readWorkspaceFileDataUrl(
      "public/logo/icons/32x32.png",
      "image/png",
    )}" sizes="32x32" />`,
  );
  expect(readWorkspaceFile("packages/web/public/favicon.ico")).toEqual(
    readWorkspaceFile("packages/desktop/build/icon.ico"),
  );
  expect(readWorkspaceFile("public/logo/icons/icon.ico")).toEqual(
    readWorkspaceFile("packages/desktop/build/icon.ico"),
  );
});
```

- [x] **Passo 2: rodar o teste e confirmar que ele falha como esperado**

Run: `pnpm exec vitest run packages/web/test/webRemoteControlBootstrapShell.test.ts`

Expected: FAIL; a falha ocorre porque o HTML ainda não embutiu o favicon PNG data URL de 32x32 do App.

- [x] **Passo 3: adicionar a implementação mínima**

Adicionar em `packages/web/index.html`, após o metadata de viewport, um favicon em data URL gerado a partir de `public/logo/icons/32x32.png`:

```html
<link rel="icon" type="image/png" href="data:image/png;base64,..." sizes="32x32" />
```

Continuar copiando `packages/desktop/build/icon.ico` tal e qual para `packages/web/public/favicon.ico`, preservando a compatibilidade do caminho tradicional de favicon. O uso de um comando de cópia de arquivo não reescreve o conteúdo binário:

```bash
cp packages/desktop/build/icon.ico packages/web/public/favicon.ico
```

- [x] **Passo 4: rodar o teste direcionado e confirmar que passa**

Run: `pnpm exec vitest run packages/web/test/webRemoteControlBootstrapShell.test.ts`

Expected: PASS, 2 tests passed。

- [x] **Passo 5: verificar o resultado do build em caminho de deploy não-root**

Run: `pnpm run build:web-remote-control:test`

Expected: exit 0; `packages/web/dist/index.html` mantém o favicon `data:image/png;base64,` e `packages/web/dist/favicon.ico` existe. Em seguida rodar:

```bash
rg -n 'rel="icon" type="image/png" href="data:image/png;base64,' packages/web/dist/index.html
cmp packages/web/dist/favicon.ico packages/desktop/build/icon.ico
```

Expected: `rg` imprime a linha correspondente, `cmp` exit 0.

- [x] **Passo 6: executar a verificação obrigatória do repositório**

Run: `pnpm typecheck`

Expected: exit 0, sem erros de TypeScript.

Run: `pnpm lint`

Expected: exit 0, sem erros de lint.

- [x] **Passo 7: revisar as alterações e commitar**

Run: `git diff --check && git status --short`

Expected: `git diff --check` exit 0; o status contém apenas a implementação do favicon, os testes, a correção do spec e este plano.

```bash
git add packages/web/index.html packages/web/public/favicon.ico packages/web/test/webRemoteControlBootstrapShell.test.ts docs/superpowers/specs/2026-07-10-web-remote-control-favicon-design.md docs/superpowers/plans/2026-07-10-web-remote-control-favicon.md
git commit -m "fix(web): add remote control favicon"
```