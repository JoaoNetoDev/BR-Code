# dep-refs: script de consulta de referências de export em nível de variável

## Contexto

Está em andamento uma refatoração grande e é preciso apagar bastante código. As lacunas das ferramentas atuais:

- `scripts/dependency-graph.mjs` (já existente, 460 linhas) chega apenas ao **nível de arquivo**, sem conseguir responder "quem usa exatamente este export `createBotSession`"
- `pnpm knip` lista os exports que **ninguém usa**, mas não informa **quem usa os exports que ainda estão em uso**, então não sustenta o julgamento "vou alterar/apagar X, o que é afetado"
- `grep` por nome é contaminado por variáveis homônimas, comentários e strings, ficando impreciso

É preciso uma CLI que, dado um export symbol, liste com precisão todas as posições de referência (baseado em TS LanguageService, não em correspondência textual).

## Objetivos / não objetivos

**Objetivos:**
- Dado `<file>:<exportName>`, listar todas as posições de referência (com arquivo, linha, coluna e trecho de código)
- Listar todos os exports de um arquivo (inventário antes de apagar o arquivo)
- Saída JSON, para que o agent possa consumir com Read/jq
- Distinguir referências comuns de re-exports

**Não objetivos:**
- Não substituir `dependency-graph.mjs` (nível de arquivo) nem `knip` (detecção de unused)
- Não tratar `import()` dinâmico nem referências por string
- Não gerar o grafo completo antecipadamente (consulta sob demanda já basta)

## Design

### Novo arquivo e comando

Novo arquivo `scripts/dep-refs.mjs` (~200 linhas estimadas, baseado em `ts-morph`). `dependency-graph.mjs` não é modificado.

Novo script em `package.json`:
```json
"dep:refs": "node scripts/dep-refs.mjs"
```

Nova dependência: `pnpm add -D ts-morph`

### Forma da CLI

```bash
# 查 export 的所有引用（核心用法）
pnpm dep:refs <file>:<exportName>

# 列文件的所有 export
pnpm dep:refs --list-exports <file>

# JSON 输出
pnpm dep:refs <file>:<exportName> --json
pnpm dep:refs --list-exports <file> --json

# 可选：缩小扫描范围加速
pnpm dep:refs <file>:<exportName> --scope packages/services
```

### Saída (para leitura humana)

Consulta de um único symbol:

```
createBotSession  (function, exported at packages/services/src/bots/botsService.ts:12)

References (3):
  packages/services/src/node.ts:42:8
    > const session = await createBotSession(opts)
  packages/services/test/botsService.messageFlow.test.ts:15:22
    > await createBotSession({ id: '1' })
  packages/server/src/routes/bots.ts:88:14
    > createBotSession(req.body)

Re-exports (1):
  packages/services/src/index.ts:5
    > export { createBotSession } from './bots/botsService'

Note: static analysis only. Dynamic import() and string-based usage not detected.
```

Com zero referências:

```
oldHelper  (function, exported at .../botsService.ts:87)

References (0). Safe to delete (no static references and no re-exports).
```

`--list-exports`:

```
packages/services/src/bots/botsService.ts

Exports (4):
  createBotSession   function    line 12
  BotSessionOptions  type        line 5
  DEFAULT_TIMEOUT    const       line 3
  closeBotSession    function    line 87
```

### Schema da saída JSON

```json
{
  "symbol": {
    "name": "createBotSession",
    "kind": "function",
    "file": "packages/services/src/bots/botsService.ts",
    "line": 12
  },
  "references": [
    { "file": "packages/services/src/node.ts", "line": 42, "col": 8, "snippet": "const session = await createBotSession(opts)" }
  ],
  "reExports": [
    { "file": "packages/services/src/index.ts", "line": 5, "snippet": "export { createBotSession } from './bots/botsService'" }
  ],
  "notes": ["Static analysis only. Dynamic import() and string-based usage not detected."]
}
```

`--list-exports --json`:

```json
{
  "file": "packages/services/src/bots/botsService.ts",
  "exports": [
    { "name": "createBotSession", "kind": "function", "line": 12 },
    { "name": "BotSessionOptions", "kind": "type", "line": 5 }
  ]
}
```

### Escopo de varredura

Por padrão, carrega todo o código-fonte dos workspaces e os testes:
- `packages/*/src/**/*.{ts,tsx,mts,cts}`
- `packages/*/test/**/*.{ts,tsx}`
- `apps/*/src/**/*.{ts,tsx,mts,cts}`
- `harness/**/*.{ts,tsx}`

(test precisa ser varrido, senão um export "referenciado por testes" seria julgado incorretamente como unused)

`--scope <glob>` sobrescreve o escopo padrão; por exemplo, `--scope packages/services` carrega apenas esse pacote, o que torna a inicialização muito mais rápida.

### Pontos-chave de implementação (API do ts-morph)

| Passo | API |
|---|---|
| Criar o Project | `new Project({ tsConfigFilePath: 'tsconfig.base.json', skipAddingFilesFromTsConfig: true })` |
| Carregar explicitamente os source files | `project.addSourceFilesAtPaths(globs)` |
| Encontrar o export indicado | `sourceFile.getExportedDeclarations().get(name)` → `Declaration[]` (sobrescritas com o mesmo nome retornam vários) |
| Encontrar referências | Para cada declaration, obter um `Identifier` (`getNameNode()` ou equivalente) e chamar `identifier.findReferences()` |
| Distinguir re-export | Percorrer cada nó de referência e subir aos pais: se estiver sob `ExportDeclaration` / `ExportSpecifier` → entra em reExports; caso contrário entra em references |
| Pular a própria declaration | O resultado das referências inclui a posição da declaration; filtrar por file+line |
| Listar exports | Percorrer o Map inteiro de `sourceFile.getExportedDeclarations()` |
| Inferir kind | `getKindName()` da declaration: `FunctionDeclaration` → function, `VariableDeclaration` → const, `TypeAliasDeclaration` → type, `InterfaceDeclaration` → interface, `ClassDeclaration` → class |

### Tratamento de casos limite

| Situação | Comportamento |
|---|---|
| `export *` | ✅ getExportedDeclarations atravessa automaticamente |
| Alias em `import { foo as bar }` | ✅ findReferences acompanha o alias |
| import type-only vs import de valor | ✅ ambos são encontrados |
| Cadeia de múltiplos re-exports (a → b → c) | ✅ findReferences atravessa |
| Sobrecargas homônimas (várias declarations) | Mescla as referências de todas as declarations, removendo duplicatas |
| Arquivo inexistente / symbol inexistente | Código de saída 1, com erro claro no stderr |
| Caminho em string de `import()` dinâmico | ❌ não detectado; a saída mostra um aviso em notes |
| Symbol não informado na linha de comando | Sugere usar `--list-exports` primeiro |

### Desempenho

O ts-morph leva cerca de 10-30 segundos para carregar o monorepo inteiro (custo fixo de uma consulta). Consultas seguintes que usam `--scope` para reduzir a um único pacote ficam na casa dos segundos.

Não há cache (a complexidade de implementação não compensa; o knip já cobre o cenário de "lote").

### Colaboração com as ferramentas existentes

Fluxo recomendado (escrito no comentário do script / em `dep:refs --help`):

1. `pnpm knip` → obter a lista de exports unused (instantâneo)
2. Para exports suspeitos, usar `pnpm dep:refs file:name` para ver os referenciadores concretos
3. Decidir o que pode ser apagado / o que exige alterar antes os chamadores

## Modos de falha

- **ts-morph falha ao carregar (problema de configuração do tsconfig)**: sair imediatamente, jogando o erro como está no stderr, sem forçar tolerância a falha
- **findReferences retorna vazio mas a declaration foi encontrada**: situação normal (zero referências), com a dica de "safe to delete"
- **Nome do symbol digitado errado**: sugerir `--list-exports` para listar todos os exports daquele arquivo como referência

## Testes

- Predominantemente teste manual:
  - Rodar em um export conhecido como referenciado e comparar a contagem de referências com um grep de forma aproximada
  - Rodar em um export reportado como unused pelo knip; deve retornar `References (0)`
  - Rodar `--list-exports` em `packages/services/src/bots/botsService.ts` e comparar visualmente
- Não se escreve teste automatizado: o script depende do estado de compilação de todo o monorepo, e o custo de testes unitários é maior que o benefício.