# Arquitetura de Tamanho do Bundle do Desktop

O empacotamento do desktop passou a ter «dois conjuntos de recursos explicitamente estratificados»:

- o runtime do agent local do desktop, preparado para a plataforma atual, entra no instalador
- os recursos exclusivos de remote são produzidos por `@zcode/server-cli stage:remote-assets` em `mock-cdn/releases/...` e não entram mais no instalador

## Convenções de diretório

- `packages/desktop/bundled-agents/<platform>/`
  - diretório mínimo de runtime da plataforma alvo atual
  - o caminho de produto atual exige apenas `glm/`
  - no mesmo diretório é gerado o arquivo `*-<platform>.tgz`, para facilitar a auditoria e o reuso posterior na distribuição remota
- `packages/desktop/mock-cdn/`
  - ponto de entrada dos recursos remote em modo de desenvolvimento
  - armazena uniformemente no layout `releases/<version>/...` o `source-server-release.json` e os quatro archives do Source Server por plataforma

## Produção

- o instalador de produção não contém mais `remote-assets`
- os recursos remote de produção são distribuídos via o `source-server-release.json` da raiz de versão do CDN e o `zcode-server-<platform-arch>.tar.gz`
- na primeira instalação ou atualização explícita, o SHA-256 e o tamanho são validados conforme o descriptor; o modo de download local armazena em cache o archive completo e depois o envia, e o modo de download remote por SSH baixa o mesmo archive na máquina de destino — no final, ambos entram no immutable release installer
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
  `build:remote:assets`, que sincroniza o descriptor e os quatro archives.
- `remoteCdnBaseUrl` ainda pode ser sobrescrito por variável de ambiente; uma vez definido explicitamente, apenas essa base personalizada é usada, sem aplicar
  os valores padrão de `ZCODE_ENV` nem o roteamento regional de produção
- O modo de download por servidor SSH remoto baixa e valida o archive completo em um diretório temporário no host remoto; a instalação final fica em `~/.zcode/server/releases/`, com a troca feita atomicamente via `current.json`.

## Alternar para o CDN público em modo de desenvolvimento

- em desenvolvimento, o padrão é o `mock-cdn/releases/<version>/...` escrito pelo staging do Source Server desta rodada
- para forçar o CDN público em desenvolvimento, defina a variável de ambiente `ZCODE_DEV_REMOTE_ASSET_USE_CDN=1`
- uma vez ativado, o remote deploy deixa de ler `mock-cdn` e entra diretamente na cadeia descriptor/CDN + cache local de archive
- sem `ZCODE_REMOTE_ASSET_CDN_BASE_URL` definido, a lista de candidatos «CDN principal + CDN reserva» continua sendo gerada conforme as regras de roteamento regional acima
- pode ser combinado com `ZCODE_REMOTE_ASSET_CDN_BASE_URL` apontando para uma base de CDN personalizada
- pode-se definir `ZCODE_REMOTE_ASSET_CACHE_DIR` para sobrescrever o diretório de cache remote; por exemplo, ao iniciar em dev, apontar para o da versão oficial `~/Library/Application Support/ZCode/remote-assets-cache`, reutilizando apenas o cache de recursos remote, sem trocar o `userData` do Electron
- as variáveis de ambiente de remote asset acima podem ser passadas pelo shell ou escritas em `.env.local` na raiz do repositório ou em `packages/desktop`; as variáveis do shell têm prioridade mais alta
- para iniciar com um clique «desktop dev + cadeia remote SSH de produção com download/cache», use `pnpm dev:desktop:remote-prod`

## Cadeia de preparação do Source Server

1. `@zcode/server-cli stage:remote-assets` constrói o Server CLI/Core e o bundle do Agent.
2. Os Node, node-pty, plugins oficiais e native tools alvo são coletados por linux/darwin × x64/arm64.
3. Cada plataforma gera um archive completo, gravado em um `source-server-release.json` unificado.
4. O contrato de instalação do archive é o mesmo em desenvolvimento e em produção, sem gerar mais componentes soltos, wrappers ou manifest legado.

O lado desktop e o lado remote consomem a mesma cópia compilada do `zcode.cjs`, sem baixar mais o `zcode-agent` nativo com Node embutido por plataforma:

- `scripts/build-desktop-agent-cli.mjs` constrói `apps/zcode-cli/packages/cli/dist/zcode.cjs` e constrói e valida os runtimes de plugins oficiais necessários ao Dev, como o node-repl-host, o client do Browser Use e o simulador. `pnpm dev:desktop` executa esse script após o `pre-dev`, e em desenvolvimento o resolver prioriza o bundle dentro do próprio workspace; o `stage:remote-assets` também obtém o bundle do Agent por ele.
- O `prepare:agent-bundle` do empacotamento do desktop grava `zcode.cjs` e os recursos seed dos plugins oficiais em `packages/desktop/bundled-agents/<platform>/glm/`, que depois são copiados para o instalador pelo electron-builder.
- `scripts/download-glm.mjs` e o `prepare:glm` do desktop são mantidos apenas como fallback manual de compatibilidade e não entram nas cadeias padrão de Dev, de empacotamento do desktop ou de preparação de assets remote.

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