# Arquitetura de Tamanho do Bundle do Desktop

O empacotamento do desktop passou a ter «dois conjuntos de recursos explicitamente estratificados»:

- o runtime do agent local do desktop, preparado para a plataforma atual, entra no instalador
- os recursos exclusivos de remote são produzidos apenas em `mock-cdn/releases/...` e não entram mais no instalador

## Convenções de diretório

- `packages/desktop/bundled-agents/<platform>/`
  - diretório mínimo de runtime da plataforma alvo atual
  - o caminho de produto atual exige apenas `glm/`
  - no mesmo diretório é gerado o arquivo `*-<platform>.tgz`, para facilitar a auditoria e o reuso posterior na distribuição remota
- `packages/desktop/mock-cdn/`
  - ponto de entrada dos recursos remote em modo de desenvolvimento
  - armazena `node`, `server`, `node-pty`, `glm`, `tools` uniformemente no layout `releases/<version>/...`

## Produção

- o instalador de produção não contém mais `remote-assets`
- os recursos remote de produção são distribuídos via o `manifest-<platform-arch>.json` do CDN e o `components/...` compartilhado entre versões
- na primeira conexão remote, os componentes ausentes são baixados conforme o manifest, descompactados no cache local de componentes e montados em `remoteCacheDir/releases/<version>/<platform-arch>/`; acertos posteriores de cache não baixam de novo
- com `ZCODE_ENV=production`, dois CDNs oficiais são embutidos por padrão:
  - doméstico: `https://cdn.codegeex.cn/zcode/electron/releases/<version>`
  - internacional: `https://cdn-zcode.z.ai/zcode/electron/releases/<version>`
- Se a CI configurar `CDN_DOMAIN` / `OSS_PATH_PREFIX`, o pacote de produção expande essas variáveis em tempo de build para uma lista de candidatos de remote CDN.
  O valor padrão do repositório para `CDN_DOMAIN` é unificadamente `cdn-zcode.z.ai`, substituindo a variável global da CI, a validação de prefixo de URL de CDN, a geração de URL de upload para o OSS e o script de pré-aquecimento do CDN; o caminho de publicação padrão continua sendo `zcode/electron/releases`. Ao configurar explicitamente um único domínio ou uma lista de domínios, a resolução de bucket, caminho e conta de pré-aquecimento continua seguindo a ordem da configuração.
  Durante a migração, pode-se usar uma lista separada por vírgulas para que `3.1.3` priorize o novo CDN e mantenha o CDN antigo como reserva; após a troca, basta consolidar as variáveis da CI em um único novo CDN.
- a prioridade padrão é definida por «idioma do aplicativo + fuso horário local»:
  - `locale` em chinês e fuso em UTC+8: prioriza o CDN doméstico, com o CDN internacional como alternativa
  - demais casos: prioriza o CDN internacional, com o CDN doméstico como alternativa
- Se uma lista de `CDN_DOMAIN` for injetada em tempo de build, ela é usada na ordem da lista da CI, sem reordenação por idioma/fuso horário.
- com `ZCODE_ENV=test`, usa-se por padrão a raiz de recursos de teste da rede interna:
  `http://intranet.example.invalid:12345/ssh-remote-assets/<version>`. Esse diretório é gerado pela CI, no job
  `build:remote:assets`, durante o build no ambiente de teste, a partir de `mock-cdn/releases/<version>/manifest-*.json`
  e `mock-cdn/components/`; o diretório contém diretamente `manifest-*.json` e `components/`.
- `remoteCdnBaseUrl` ainda pode ser sobrescrito por variável de ambiente; uma vez definido explicitamente, apenas essa base personalizada é usada, sem aplicar
  os valores padrão de `ZCODE_ENV` nem o roteamento regional de produção
- O modo de download por servidor SSH remoto armazena em cache, sob `~/.zcode/server/asset-cache/` no host remoto, os componentes já verificados e descompactados; o caminho final de instalação continua sendo os diretórios existentes de runtime, server, agent e tools em `~/.zcode/server/`.

## Alternar para o CDN público em modo de desenvolvimento

- em desenvolvimento, o padrão continua sendo `mock-cdn/releases/<version>/...`
- para forçar o CDN público em desenvolvimento, defina a variável de ambiente `ZCODE_DEV_REMOTE_ASSET_USE_CDN=1`
- uma vez ativado, o remote deploy deixa de ler `mock-cdn` e entra diretamente na cadeia de download via CDN + cache local
- sem `ZCODE_REMOTE_ASSET_CDN_BASE_URL` definido, a lista de candidatos «CDN principal + CDN reserva» continua sendo gerada conforme as regras de roteamento regional acima
- pode ser combinado com `ZCODE_REMOTE_ASSET_CDN_BASE_URL` apontando para uma base de CDN personalizada
- pode-se definir `ZCODE_REMOTE_ASSET_CACHE_DIR` para sobrescrever o diretório de cache remote; por exemplo, ao iniciar em dev, apontar para o da versão oficial `~/Library/Application Support/ZCode/remote-assets-cache`, reutilizando apenas o cache de recursos remote, sem trocar o `userData` do Electron
- as variáveis de ambiente de remote asset acima podem ser passadas pelo shell ou escritas em `.env.local` na raiz do repositório ou em `packages/desktop`; as variáveis do shell têm prioridade mais alta
- para iniciar com um clique «desktop dev + cadeia remote SSH de produção com download/cache», use `pnpm dev:desktop:remote-prod`

## Cadeia de preparação do agent

Atualmente tanto o desktop quanto o remote usam por padrão o `zcode.cjs` compilado, e não baixam mais o
`zcode-agent` nativo com Node embutido por plataforma:

1. `scripts/build-desktop-agent-cli.mjs` constrói `apps/zcode-cli/packages/cli/dist/zcode.cjs` e constrói e valida os runtimes
   de plugins oficiais necessários ao Dev, como o CUA. `pnpm dev:desktop` executa esse script após o `pre-dev`, e em desenvolvimento o
   resolver prioriza o bundle dentro do próprio workspace.
2. O `prepare:agent-bundle` do empacotamento do desktop grava `zcode.cjs` e os recursos seed dos plugins oficiais em
   `packages/desktop/bundled-agents/<platform>/glm/`, que depois são copiados para o instalador pelo electron-builder.
3. O `prepare-prebuilds.mjs` dos assets remote reaproveita o mesmo `zcode.cjs`, grava-o em
   `packages/desktop/mock-cdn/releases/<version>/glm/<platform>/` para cada plataforma e então produz o artifact de componente; o remoto executa esse bundle com o Node já implantado.

`scripts/download-glm.mjs` e o `prepare:glm` do desktop são mantidos apenas como fallback manual de compatibilidade e não entram nas cadeias padrão de Dev, de empacotamento do desktop ou de preparação de assets remote.

Os motivos:

- o release generator deixa de preparar runtimes de agent de terceiros
- desktop, web e remote deploy passam a consumir a mesma estrutura de recursos do ZCode Agent
- evita levar `node_modules` de desenvolvimento, natives multiplataforma, símbolos de depuração e caches direto para o instalador

### Override do SSH agent em desenvolvimento

`pnpm dev:desktop` constrói primeiro `apps/zcode-cli/packages/cli/dist/zcode.cjs`. Quando
executado em desenvolvimento local e esse arquivo existe, o componente `glm` do SSH remote deploy deixa de usar
o binário nativo `zcode-agent` do mock-cdn/CDN e passa a enviar o `zcode.cjs` local para
`~/.zcode/server/agents/glm/zcode.cjs` no host remoto, gerando um wrapper executável
`~/.zcode/server/agents/glm/zcode-agent`. O wrapper usa o `~/.zcode/server/node` já implantado no remoto para
iniciar esse bundle, de modo que o agent continua rodando dentro da máquina SSH de destino, preservando a semântica
remota de arquivos, Git e terminal cwd.

O remoto também grava em `.dev-version` um content hash; o reenvio é evitado somente quando esse marcador
corresponde, os recursos necessários estão completos e o SHA-256 real do `zcode.cjs` remoto é igual ao local. Se um
pacote de release ou outro cliente sobrescrever o bundle e deixar um marcador de desenvolvimento para trás, é
obrigatório reenviar; se não for possível verificar o conteúdo real, também se faz novo deploy conforme o caso.
O override não é habilitado em produção, que segue usando estritamente os recursos manifest/component. Para desligar
temporariamente o override durante o desenvolvimento, defina `ZCODE_REMOTE_DEV_AGENT_BUNDLE=0`.

## Quais recursos podem existir multiplataforma mas são proibidos no pacote

- `mock-cdn/releases/<version>/node-pty/linux-x64`
- `mock-cdn/releases/<version>/node-pty/linux-arm64`
- `mock-cdn/releases/<version>/glm/<platform>/`
- `mock-cdn/releases/<version>/tools/<platform>/ripgrep/`

Esses diretórios são pontos de entrada exclusivos para a funcionalidade remote e podem manter várias cópias por
plataforma alvo remota, mas não devem mais ser copiados para o `.app` pelo electron-builder.

## Quais recursos são proibidos no instalador

- natives de plataformas diferentes da plataforma alvo atual no diretório local de agent
- pacotes nativos / prebuilds de plataformas diferentes da plataforma alvo atual em `node_modules`
- optional native dependencies já agrupadas pelo renderer e que o runtime Node do desktop não carrega; atualmente inclui
  `@napi-rs/canvas*`, declarado por `pdfjs-dist` para o ambiente Node
- `node-pty/build`, `node-pty/bin` e `node-pty/prebuilds/<platform-arch>` de plataformas diferentes da atual; o pacote do
  desktop mantém apenas `node-pty/prebuilds/<target-platform-arch>`
- pacotes `@lydell/node-pty-*`, usados apenas para preparar o prebuild alvo; o empacotamento no Linux, no `beforePack`, copia o binário alvo para
  `node-pty/prebuilds/<target-platform-arch>` e mesmo assim precisa excluir esses pacotes de origem
- `mock-cdn/`
- `*.map`
- `*.pdb`
- `*.tgz`
- `*.tsbuildinfo`
- `docs/`, `doc/`, `man/`
- `example/`, `examples/`
- `test/`, `tests/`, `__tests__/`
- markdown que não seja de licença

## Auditoria

`packages/desktop/scripts/audit-bundle-size.mjs` é executado automaticamente após o bundle no macOS e verifica:

- o tamanho total do `.app`
- o volume dos diretórios `Resources/*`
- o volume dos diretórios `Frameworks/*`
- os 30 maiores itens de recurso

Ultrapassar o limiar faz a build falhar diretamente, evitando que o tamanho do pacote volte a crescer.

Além dos limiares de tamanho dos arquivos instalados, o `afterPack` do `electron-builder` e a auditoria mecânica
pós-bundle também precisam verificar:

- que `@napi-rs/canvas*` e `@lydell/node-pty-*` não existem no instalador
- que `node-pty` contém apenas o prebuild correspondente ao `targetPlatform.key` atual, sem artefatos da máquina de instalação ou de outras plataformas alvo
- que `.node`, `.dll`, `.dylib`, executáveis auxiliares nativos `.exe` e o helper sem extensão do node-pty estão marcados como unpack no header do asar,
  e não podem permanecer simultaneamente como payload packed no `app.asar` e em duplicata no `app.asar.unpacked`

A auditoria do conteúdo do asar deve ser feita pelo Node chamando diretamente a CLI `@electron/asar` na versão fixada pelo projeto. É proibido obter a saída a ser analisada via `pnpm exec asar`, para que diagnósticos do pnpm, como workspace engine warning, não se misturem ao stdout e sejam confundidos com entradas do asar.

`pnpm-workspace.yaml#supportedArchitectures` controla apenas quais dependências de plataforma podem ser preparadas na
fase de instalação do workspace, e não pode servir como fronteira de recursos do instalador. O conjunto final de recursos
do instalador precisa ser determinado por `ZCODE_TARGET_OS` / `ZCODE_TARGET_ARCH`.