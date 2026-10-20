# ZCode Agent roda com o «Node já existente + artefato compilado zcode.cjs» (desktop e remoto)

## Ideia central

O ZCode Agent antes embutia um binário nativo independente `zcode-agent` em cada plataforma (SEA: Node oficial + `zcode.cjs` + recursos da TUI + plugins oficiais), ~180MB por plataforma, contendo **uma cópia própria do Node**.

Mas, tanto no desktop quanto no remoto, o ambiente que roda o agent **já tem uma cópia do Node**:

- **Desktop**: o Host roda em um `utilityProcess` do Electron, `process.execPath` aponta para o Electron Helper, com Node 24.x embutido (Electron 41).
- **Remoto SSH/WSL/Docker**: o archive do Source Server já traz o Node alvo e o usa para rodar o Server CLI/Core e o `zcode.cjs`.

Portanto o agent não precisa carregar mais um Node: basta usar o Node já existente para executar o artefato compilado `zcode.cjs`.

Premissa-chave: **o ZCode Agent não tem nenhum plugin nativo NAPI** — `ripgrep` é WASM/WASI e as demais dependências (cheerio / iconv-lite / jimp / ai-sdk / mcp-sdk / zod etc.) são JS puro. `zcode.cjs` é um bundle de arquivo único gerado pelo esbuild (tudo inline, exceto `@zcode/tui`), o mesmo em todas as plataformas; o caminho do comando `app-server` nunca carrega `@zcode/tui`, então o remoto precisa apenas desse arquivo, sem node_modules, e o desktop também não empacota a TUI.

Ganho: ~180MB → ~16MB por plataforma; o mesmo JS em todas as plataformas; desktop/remoto unificados em uma única forma de agent.

## Modo de execução

**Desktop** (`zcodeAgentProcessManager.ts: resolveElectronRuntimeZCodeAgentCommand`, com `process.versions.electron` como condição de bloqueio):

```
process.execPath  <Electron Helper>
  args: [resources/glm/zcode.cjs, app-server, --stdio]
  env:  { ELECTRON_RUN_AS_NODE: "1" }   // obrigatório, senão o subprocesso é tratado como subprocesso do Chromium e trava na inicialização da GPU
```

**Remoto**: o archive completo coloca o `zcode.cjs` em `runtime/` do release imutável, e o Server Core cria o Workspace Agent conforme o release manifest; não se implanta mais arquivos soltos nem wrapper em `~/.zcode/server/agents/glm/`.

## Implementação

**Versão-alvo do bundle** (`apps/zcode-cli/packages/cli/scripts/build.mjs`)
O `target` do esbuild desce de `node26` para **`node22`**, tomando a menor versão de Node entre os dois runtimes (remoto v22.16). Garante que o mesmo `zcode.cjs` não use sintaxe não suportada pelo runtime-alvo nem no Node 24 do desktop nem no Node 22 do remoto.

**Desktop**
- `zcode-agent-runtime.ts`: o descritor ganha `nodeBundleEntryFile: "zcode.cjs"` + `resolveNodeBundleSegments()`.
- `providerRuntimeResolver.ts`: `findZCodeAgentRuntimeNodeBundle()` localiza `resources/glm/zcode.cjs`.
- `zcodeAgentProcessManager.ts`: `resolveElectronRuntimeZCodeAgentCommand`, inserido entre o dev do monorepo e o fallback para binário nativo.
- Empacotamento: `prepare:agent-bundle` (`prepare-agent-node-bundle.mjs`) compila a cli, faz o stage de `zcode.cjs` em `bundled-agents/<platform>/glm/` e remove o antigo `zcode-agent` nativo; `prepare:runtime-assets` usa-o no lugar de `prepare:glm` na lista local; o electron-builder copia o diretório inteiro `resources/glm`.

**Remoto**
- `@zcode/server-cli stage:remote-assets` gera o archive completo para as quatro plataformas; `runtime/zcode.cjs` usa a mesma identidade de SHA de descriptor que o Server CLI/Core.
- O download local com upload a partir do Desktop e o download direto no remoto SSH só mudam de onde o archive é obtido; no fim ambos entram em `zcode update --from-archive`.
- O `prepare-prebuilds.mjs` legado, o component manifest e a implantação de arquivos soltos deixam de participar das cadeias de desenvolvimento, CI ou publicação.

## Verificação

- `tsc -b packages/rpc packages/shared packages/services packages/server` passa; `oxlint` nos arquivos alterados 0/0.
- A cli foi recompilada com sucesso com `target node22` (dist/zcode.cjs 15.7MB).
- Smoke test: `node dist/zcode.cjs app-server --stdio` sobe normalmente em Node puro e mantém o serviço stdio (sai com código 0 de forma limpa no EOF do stdin), provando que o artefato compilado roda fora do SEA e fora do Electron — ou seja, na forma de execução do wrapper remoto.
- Pendente: uma sessão end-to-end de verificação com um deploy remoto SSH real + um empacotamento desktop real (envolve a cadeia de deploy do web-remote-control; localmente não é possível validar contra um remoto/CDN real).

## Observações

`scripts/download-glm.mjs` (download do binário nativo) e o script desktop `prepare:glm` não entram mais na cadeia padrão; foram mantidos como fallback manual, sem remoção.