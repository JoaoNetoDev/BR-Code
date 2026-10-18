# Runtime Ripgrep

## Contexto

- ao executar shell no GUI desktop, SSH remote, WSL e Docker, o ZCode Agent não pode depender de forma confiável de o
  host já ter colocado `rg` no `PATH`
- no mesmo conjunto de ambientes também há problemas com shells GUI / não-login perderem o caminho de `bun` e `nvm`

## Solução

- `packages/shared/src/runtime-tool-runtime.ts` declara de forma unificada as runtime tools embutidas `bfs`, `ripgrep` e
  `ugrep`
- o `ripgrep` do desktop local/SEA e do Linux remote é fixado no Microsoft `ripgrep-prebuilt v14.1.1-1`; macOS
  arm64/x64, Linux arm64/x64 e Windows x64/arm64 baixam todos o arquivo original da Microsoft com SHA-256 fixo a partir de
  `${ZCODE_DEPS_BASE_URL}/native-search-tools/ripgrep-v14.1.1-1`, sem mais serem construídos pelo native-search producer.
  O deployment target dos arquivos macOS escolhidos não é superior a 12.0, o Linux usa arquivos musl estáticos sem
  dependência de glibc e, nas duas arquiteturas do Windows, são rejeitados o CRT dinâmico e dependências de build que
  deveriam ter sido linkadas estaticamente; assim, atualizar o rg não altera o piso de distribuição de sistemas do
  ZCode. O producer Darwin remote mantém temporariamente o recurso histórico `v13.0.0-10`; as duas versões não
  compartilham metadata de versão e o prepare do desktop não expõe mais a entrada de download da versão antiga
- `packages/services/src/runtime-tools/runtimeCommandEnv.ts`, na inicialização de host / server:
  - tenta reproduzir um `PATH` a partir de uma login shell
  - depois anexa o diretório de ferramentas embutidas ao `PATH`; o `rg` mantém a prioridade dos comandos que o usuário já
    tem, e `find` / `grep` são usados pelo prelude de embedded-search diretamente pelo caminho absoluto embutido
  - também injeta `ZCODE_BFS_BINARY`, `ZCODE_RG_BINARY` e `ZCODE_UGREP_BINARY`
- os subprocessos do ZCode Agent continuam herdando esse ambiente pelo runtime env limpo, sem necessidade de tratamento
  separado em cada entrada

## Layout de recursos

### Desktop local

```text
packages/desktop/bundled-tools/<platform>/ripgrep/rg(.exe)
resources/tools/ripgrep/rg(.exe)
```

### Remote

```text
mock-cdn/releases/<version>/tools/linux-<arch>/{bfs,ripgrep,ugrep}/<binary>
~/.zcode/server/tools/{bfs,ripgrep,ugrep}/<binary>
```

O Linux remote (incluindo WSL, SSH Linux e Docker Linux) faz deploy de `bfs 4.1.1-2`, `ugrep 7.8.4-1` e Microsoft
`ripgrep 14.1.1-1`. O Darwin remote continua implantando o histórico `ripgrep 13.0.0-10`, sem migrar junto com o Linux
remote; os assets rg13 da publicação antiga também continuam sendo mantidos.

## Resultado

- na inicialização da GUI local, o ZCode Agent/terminal recupera o `bun` da login shell
- quando o host já tem `rg`, a versão do usuário continua sendo preferida; sem `rg`, o ZCode Agent consegue executar
  diretamente a versão embutida tanto localmente quanto no remote
- desktop/SEA e Linux remote podem usar o `bfs` / `ugrep` embutidos; quando a ferramenta está ausente ou não é
  executável, ainda há fallback para o `find` / `grep` do sistema
