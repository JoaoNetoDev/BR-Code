# Ferramenta de Exibição de Arquivos

Foi adicionado `packages/ui/src/lib/fileDisplay.tsx`, usado para formatar caminhos de arquivo em fragmentos de exibição padronizados.

Comportamento padrão:

- Exibe o ícone do arquivo
- Exibe apenas o nome principal do arquivo

Capacidades opcionais:

- Ao passar `basePath`, emite o texto de diretório secundário do caminho relativo
- Controla a exibição do ícone e do caminho via `showIcon` / `showFilePath`
- Reutilização direta dentro de componentes React via `FileDisplayInline`
- Reutilização em cenários Lexical / DOM nativo via `createFileDisplayDom`

Exemplo:

```ts
resolveFileDisplayDescriptor("/Users/dev/Projects/element-web/apps/web/src/Avatar.ts", {
  basePath: "/Users/dev/Projects/element-web",
});
```

Semântica da saída:

- file-icon: `typescript`
- file-name: `Avatar.ts`
- file-path: `apps/web/src/`

Atualmente `PromptMentionNode` já usa essa ferramenta, com exibição padrão "ícone + nome do arquivo".

## Ícones de arquivos Office

- `.doc` e `.docx` são mapeados de forma unificada para `word.svg`, `.xlsx` para `table.svg`, `.pptx` para `powerpoint.svg`.
- As extensões Office e os nomes dos arquivos de recursos não têm correspondência de um para um; o mapeamento precisa ser mantido por meio de `EXTENSION_ICON_ALIASES`, e não é possível usar a extensão para concatenar diretamente o caminho do recurso.
- Desktop e Web devem cada carregar os mesmos arquivos de ícone em `public/material-icons`, garantindo que o `file://` local, a Web comum e o `/remote` do celular possam carregar por meio das regras existentes de `BASE_URL`.
- Os ícones apenas expressam o tipo do arquivo e não alteram os limites de capacidade de pré-visualização, edição ou espaço de trabalho remoto dos arquivos Office.