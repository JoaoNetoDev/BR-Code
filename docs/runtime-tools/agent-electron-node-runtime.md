# ZCode Agent roda com o «Node já existente + artefato compilado zcode.cjs» (desktop e remoto)

## Ideia central

O ZCode Agent antes embutia um binário nativo independente `zcode-agent` em cada plataforma (SEA: Node oficial + `zcode.cjs` + recursos da TUI + plugins oficiais), ~180MB por plataforma, contendo **uma cópia própria do Node**.

Mas, tanto no desktop quanto no remoto, o ambiente que roda o agent **já tem uma cópia do Node**:

- **Desktop**: o Host roda em um `utilityProcess` do Electron, `process.execPath` aponta para o Electron Helper, com Node 24.x embutido (Electron 41).
- **Remoto SSH/WSL/Docker**: no deploy é entregue um `node` independente (`<REMOTE_BASE>/node`, v22.16.0) usado para rodar `zcode-server.cjs`.

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

**Remoto** (sem Electron, reaproveitando o mecanismo já existente no dev): fazer o deploy de `zcode.cjs` para `~/.zcode/server/agents/glm/zcode.cjs` e então escrever um **wrapper com o mesmo nome** (é a entrada executável `zcode-agent` que o resolver espera):

```sh
#!/bin/sh
set -eu
runtime_root="${ZCODE_SERVER_RUNTIME_ROOT:-$HOME/.zcode/server}"
exec "$runtime_root/node" "$HOME/.zcode/server/agents/glm/zcode.cjs" "$@"
```

Assim o provider runtime resolver **não precisa de nenhuma mudança de código para o remoto** — ele continua procurando o executável `zcode-agent`; o que encontra é o wrapper, que usa o node remoto para executar `zcode.cjs`.

## Implementação

**Versão-alvo do bundle** (`apps/zcode-cli/packages/cli/scripts/build.mjs`)
O `target` do esbuild desce de `node26` para **`node22`**, tomando a menor versão de Node entre os dois runtimes (remoto v22.16). Garante que o mesmo `zcode.cjs` não use sintaxe não suportada pelo runtime-alvo nem no Node 24 do desktop nem no Node 22 do remoto.

**Desktop**
- `zcode-agent-runtime.ts`: o descritor ganha `nodeBundleEntryFile: "zcode.cjs"` + `resolveNodeBundleSegments()`.
- `providerRuntimeResolver.ts`: `findZCodeAgentRuntimeNodeBundle()` localiza `resources/glm/zcode.cjs`.
- `zcodeAgentProcessManager.ts`: `resolveElectronRuntimeZCodeAgentCommand`, inserido entre o dev do monorepo e o fallback para binário nativo.
- Empacotamento: `prepare:agent-bundle` (`prepare-agent-node-bundle.mjs`) compila a cli, faz o stage de `zcode.cjs` em `bundled-agents/<platform>/glm/` e remove o antigo `zcode-agent` nativo; `prepare:runtime-assets` usa-o no lugar de `prepare:glm` na lista local; o electron-builder copia o diretório inteiro `resources/glm`.

**Remoto**
- `zcodeAgentBundleWrapper.ts` (novo): `REMOTE_AGENT_BUNDLE_NAME` + `buildRemoteAgentBundleWrapper()`, uma única semântica de wrapper compartilhada entre dev e produção.
- `zcodeAgentDeploy.ts`: remoção da restrição «somente binário nativo»; passa a ① `installFile` instalar `zcode.cjs` em `agents/glm/zcode.cjs`, ② gravar o wrapper em `agents/glm/zcode-agent`. A verificação de skip passa a validar tanto o wrapper quanto o bundle.
- Em produção, `glm/zcode.cjs` acompanha sempre a versão do app/server do ZCode: quando o `zcode-server.cjs` principal entra no caminho de deploy por mudança de versão do app, força a atualização de `glm`; o modo de upload local precisa sobrescrever o arquivo vindo do release atual do app, e o modo de download remoto precisa atualizar o cache remoto pelo conteúdo dos componentes do manifest atual antes de sobrescrever — evitando reinstalar um `zcode.cjs` antigo de mesma versão semântica de runtime mas com hash de conteúdo diferente. Quando a versão do app não muda, `glm` não é mais verificado nem retransmitido isoladamente.
- `zcodeAgentDevDeploy.ts`: reaproveita o wrapper compartilhado acima (remove a cópia local).
- mock-cdn (`prepare-prebuilds.mjs`): `stageRemoteAgentBundles()` coloca o `zcode.cjs` em `releases/<ver>/glm/<platform>/` de cada plataforma após compilar a cli, substituindo o download do binário nativo por plataforma; o componente glm passa a reaproveitar required-paths como `["zcode.cjs"]`. O mecanismo de tar.gz / manifest / sha dos componentes permanece igual, apenas o arquivo dentro do pacote troca de binário para JS.

O resolver **não precisa de alterações no remoto**: o nome do wrapper continua sendo `zcode-agent`, alcançado por `findZCodeAgentRuntimeBinary`.

## Verificação

- `tsc -b packages/rpc packages/shared packages/services packages/server` passa; `oxlint` nos arquivos alterados 0/0.
- A cli foi recompilada com sucesso com `target node22` (dist/zcode.cjs 15.7MB).
- Smoke test: `node dist/zcode.cjs app-server --stdio` sobe normalmente em Node puro e mantém o serviço stdio (sai com código 0 de forma limpa no EOF do stdin), provando que o artefato compilado roda fora do SEA e fora do Electron — ou seja, na forma de execução do wrapper remoto.
- Pendente: uma sessão end-to-end de verificação com um deploy remoto SSH real + um empacotamento desktop real (envolve a cadeia de deploy do web-remote-control; localmente não é possível validar contra um remoto/CDN real).

## Observações

`scripts/download-glm.mjs` (download do binário nativo) e o script desktop `prepare:glm` não entram mais na cadeia padrão; foram mantidos como fallback manual, sem remoção.