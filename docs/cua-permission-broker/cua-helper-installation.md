# Fechamento do ciclo de instalação externo do ZCode Computer Use

## Contexto

O ZCode Computer Use Helper precisa rodar como um `.app` independente para ser um processo responsável separado no TCC do macOS. O pacote de release carrega o Helper já assinado em `ZCode.app/Contents/Resources/cua-helper/`; em tempo de execução ele é validado e copiado para um caminho estável em nível de usuário e então iniciado pelo LaunchServices. Ele não é um subprocesso do Electron e não usa `Contents/Library/Helpers`.

O local de instalação do produto é fixo:

```text
${ZCODE_HOME:-$HOME/.zcode}/computer-use/ZCode Computer Use.app
```

O `ZCode Preview` interno compartilha com a versão de produção as tasks, configurações e credenciais do `ZCODE_HOME`, mas usa um diretório de versão do Helper independente, para evitar que dois Apps de versões diferentes sobrescrevam um ao outro ou acionem a proteção de downgrade ao usar o CUA em sequência:

```text
${ZCODE_HOME:-$HOME/.zcode}/computer-use/preview/ZCode Computer Use.app
```

Esse caminho é injetado pelo Host do desktop via `ZCODE_CUA_HELPER_INSTALL_VARIANT=preview`, o que altera apenas a localização dos componentes de execução do CUA e não muda a raiz dos dados de negócio. A identidade de assinatura dos dois bundles Helper continua sendo `dev.zcode.cua-helper`, portanto o sujeito de autorização de Accessibility / Screen Recording no macOS continua aparecendo como o mesmo `ZCode Computer Use`.

## Origem da instalação

O produto oficial tem apenas uma origem de instalação: `Contents/Resources/cua-helper/ZCode Computer Use.app` dentro do ZCode.app atual. Quando está ausente, inválido ou ilegível, o comportamento é fail-closed direto; o código do produto não tenta baixar pela rede e não há fallback de download. Portanto o portão de build e assinatura precisa garantir que esse Helper arm64 seja entregue junto com o App principal.

As coberturas abaixo pertencem apenas ao modo explícito de desenvolvimento local e não podem ser usadas como configuração de distribuição do produto:

- `ZCODE_CUA_HELPER_DOWNLOAD_URL`: URL completa do zip.
- `ZCODE_CUA_HELPER_DOWNLOAD_BASE_URL`: URL base do diretório de versões.
- `ZCODE_CUA_HELPER_VERSION`: versão esperada do Helper para o pacote baixado localmente.
- `ZCODE_CUA_HELPER_TEAM_ID`: TeamIdentifier de assinatura esperado. **Quando não configurado, o padrão ancora no team oficial do ZCode `8A5X4JJ39T` (equivalente a certificate pinning), e não em um "team ad-hoc qualquer"**; esta variável serve só para sobrescrever explicitamente durante o desenvolvimento ou troca de team.
- `ZCODE_CUA_HELPER_ALLOW_UNSIGNED_LOCAL=1`: somente para depuração de desenvolvimento na própria máquina. Este modo não baixa nada e não passa pela aceitação de assinatura/Gatekeeper de release; quando a origem é o bundled Helper fornecido explicitamente pelo checkout atual, mesmo que a versão seja a mesma, é preciso comparar o conteúdo do artefato e atualizar a instalação atomicamente quando ele mudar, proibindo reutilizar silenciosamente o Helper antigo.
- `ZCODE_CUA_PRODUCT_HELPER=0|false|off` (macOS/Windows): desliga explicitamente o resolver de Helper do produto, que vem habilitado por padrão; uma vez desligado, nenhum host é criado, nenhum Helper é iniciado e nenhum TCC é exibido. Quando não definido ou explicitamente `1|true|on`, o desktop-local inicia o Helper externo sob demanda e injeta o socket/token aleatório apenas no host compartilhado confiável `node_repl`.

## Verificação

Antes de substituir o Helper existente, o instalador precisa verificá-lo em um diretório de staging. A origem embutida no produto é verificada por build ID, assinatura, bundle id, arquitetura e vínculo do Gatekeeper, sem depender da constante de versão de runtime que já foi resolvida incorretamente como `0.0.0`; a origem de download local ainda verifica a versão:

- O `CFBundleIdentifier` do `Info.plist` precisa ser `dev.zcode.cua-helper`.
- O `CFBundleShortVersionString` ou o `CFBundleVersion` da origem de download local precisa ser igual à versão esperada.
- `Contents/MacOS/<CFBundleExecutable>` precisa conter o arch alvo atual.
- `codesign --verify --deep --strict` precisa passar.
- `codesign -dv --verbose=4` precisa permitir ler um `TeamIdentifier` não ad-hoc, e ele precisa ser igual ao team esperado (padrão `8A5X4JJ39T`, sobrescrevível por `ZCODE_CUA_HELPER_TEAM_ID`). Na verificação de release, um `expectedTeamIdentifier` vazio é recusado diretamente (fail-closed); não se aceita pacote sem team ancorado.
- `spctl -a -vv -t exec` precisa passar, para validar o resultado de Gatekeeper/notarization.

Em caso de falha de verificação, o Helper não pode ser iniciado e o socket/token não pode ser injetado no host compartilhado `node_repl`.

## Modo dev local

> Helper e o bridge de SDK/node_repl do lado do modelo são dois ativos independentes. Quando o Helper aparece como ready mas as ferramentas continuam indisponíveis, é preciso verificar também a build de Dev, o cache de plugins e a cadeia de registro MCP da session descritos em [`cua-dev-mcp-runtime-assets.md`](./cua-dev-mcp-runtime-assets.md).

`ZCODE_CUA_HELPER_ALLOW_UNSIGNED_LOCAL=1` resolve o problema de iteração e teste em máquinas de desenvolvimento sem identidade de assinatura Developer ID. O resolver de Helper do produto vem habilitado por padrão e não exige variável extra; só `ZCODE_CUA_PRODUCT_HELPER=0|false|off` o desliga. Esse modo mantém as verificações de bundle id, versão, arquitetura e estrutura Mach-O, mas permite assinatura ad-hoc/unsigned e pula Gatekeeper/notarization; após passar, o Helper externo continua sendo iniciado pelo LaunchServices pelo caminho do produto, e o socket/token aleatório continua sendo injetado no host compartilhado confiável `node_repl`.

O desktop macOS não empacotado, após habilitar explicitamente o modo unsigned-local acima, prefere o `ZCODE_CUA_BUNDLED_HELPER_APP_PATH` não vazio como origem local bundled; quando não definido, string vazia ou apenas espaços, ele volta para `${ZCODE_HOME:-$HOME/.zcode}/computer-use/dev/ZCode Computer Use Dev.app`. Quando o caminho está ausente ou falha na verificação, o comportamento é fail-closed, sem qualquer fallback para download. O desktop empacotado oficialmente ignora essa sobrescrita de estado de desenvolvimento e sempre usa `ZCode.app/Contents/Resources/cua-helper/ZCode Computer Use.app`, de modo que o shell não consegue reescrever a origem de produção.

O script de inicialização padrão `pnpm dev:desktop` precisa injetar simultaneamente o caminho do Helper bundled do checkout atual e `ZCODE_CUA_HELPER_ALLOW_UNSIGNED_LOCAL=1`. Nenhum dos dois basta: apenas com o caminho, o Host não entra no ramo de confiança de desenvolvimento local e de refresh de conteúdo da mesma versão, e pode continuar iniciando um Helper em `~/.zcode` com o mesmo número de versão mas com ABI nativo já desatualizado.

```text
inicialização dev
  -> injeta o caminho do Helper do checkout + a marca unsigned-local
  -> verifica e compara o Helper instalado com o artefato do checkout
  -> faz refresh atômico se o conteúdo for diferente
  -> inicia o Helper pelo LaunchServices e espera o broker ready
```

Esse modo não baixa o Helper automaticamente, evitando substituir silenciosamente um artefato local ausente por um artefato remoto assinado e evitando sobrescrever por engano um artefato assinado por um artefato de desenvolvimento. Ele só prova que o fluxo local App/Helper/socket/token roda; não prova uma identidade TCC estável nem a entregabilidade de release.

Ao validar conjuntamente o código-fonte ainda não publicado do zcode-cua, execute primeiro `pnpm build` no repositório produtor e depois passe o mesmo diretório absoluto para as duas cadeias de build:

```bash
ZCODE_CUA_HELPER_RUNTIME_PACKAGE_DIR=/absolute/path/to/zcode-cua \
  pnpm build:cua-helper -- --version <version>
ZCODE_CUA_RUNTIME_PACKAGE_DIR=/absolute/path/to/zcode-cua \
  pnpm --filter @zcode/cli build
```

As duas variáveis sobrescrevem apenas a entrada desta build e não modificam o lockfile. Quando não definidas, continua valendo a dependência fixada no repositório; não é permitido sobrescrever só o Helper e deixar o plugin com o frontend antigo embutido, senão o comportamento entre versões seria diagnosticado como uma regressão do Helper.

## Instalação e substituição atômica

O produto copia o Helper de dentro do App para um staging sob a mesma raiz de instalação; o download explícito de desenvolvimento local baixa e extrai para o staging primeiro. Depois que ambos passam na verificação, usa-se o mesmo conjunto de promoção:

1. O Helper existente é renomeado para um backup no mesmo diretório.
2. O Helper do staging é renomeado para o caminho final.
3. Em caso de falha na promoção, o backup é revertido.
4. Em caso de sucesso, o backup e os diretórios temporários são removidos e `.zcode-cua-helper-meta.json` é gravado.

Esse fluxo evita `rename` entre volumes e garante que um Helper não verificado nunca seja colocado no caminho do produto.

## Hardened runtime entitlements (conjunto mínimo)

O Helper é um sujeito de autorização TCC independente (Accessibility / Screen Recording / entrada), e não um renderer Electron comum; os entitlements precisam ser o conjunto mínimo. O conjunto aprovado é **exatamente** (em `packages/desktop/build/entitlements.helper.plist`, asseverado pelo release gate em `packages/desktop/test/runtime-asset-scripts.test.ts`, de modo que qualquer adição falha):

- `com.apple.security.cs.allow-jit` —— o V8 embutido no Node SEA precisa de `MAP_JIT` para JIT sob hardened runtime (W^X).
- `com.apple.security.cs.allow-unsigned-executable-memory` —— o JIT do V8 em algumas combinações de macOS/Node ainda precisa de memória gravável e executável; mantido somente quando `allow-jit` não basta para o SEA fazer JIT normalmente. **Fronteira de aceitação de risco**: esse entitlement enfraquece a proteção W^X e portanto vem acompanhado de "sanitização do env de inicialização (`sanitizeHelperLaunchEnv` remove `DYLD_*`/`LD_*`/`NODE_OPTIONS`, compartilhada pelos dois caminhos de LaunchServices)" e "remoção de `allow-dyld-environment-variables`", garantindo que nenhum canal de injeção externa possa explorá-lo. **Comando de verificação/convergência** (no Helper de release já assinado): `codesign -d --entitlements :- "ZCode Computer Use.app"`; se, em ambiente limpo, a remoção deste entitlement ainda permitir JIT normal do SEA (inicializar e executar um request do broker sem crashar), ele deve ser removido de vez (follow-up: validar no release runner).

**Removidos**: `com.apple.security.cs.disable-library-validation` (R14) — o Helper só carrega o `ax_macos.node` assinado pelo mesmo Team do pacote (padrão `8A5X4JJ39T`), então não é preciso afrouxar a library validation; `com.apple.security.cs.allow-dyld-environment-variables` (R10) — impedir a injeção de `DYLD_*` nesse sujeito de alto privilégio. A configuração mais ampla do App principal (`entitlements.mac.plist`) **não pode** ser reaproveitada diretamente no Helper.