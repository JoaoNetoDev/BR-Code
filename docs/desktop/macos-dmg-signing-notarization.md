# macOS DMG Signing And Notarization

## Contexto

O DMG de release do macOS é o artefato final de distribuição que o usuário baixa pelo navegador e entrega diretamente ao Gatekeeper para avaliação. Na 3.1.2 chegou a ocorrer o caso em que o DMG já havia passado pelo `notarytool` e pela execução de `stapler staple`, mas o próprio DMG não tinha assinatura Developer ID; arquivos baixados com a quarantine do Chrome eram julgados por `spctl -t open/install` como `source=no usable signature`, fazendo com que alguns usuários tivessem falha na instalação.

## Objetivos

- `ZCode.app` continua sendo assinado pelo electron-builder com Developer ID Application.
- O DMG final precisa passar por um `codesign` de Developer ID separado, antes de ser submetido à notarização da Apple.
- Depois que a notarização do DMG for concluída e o `.unnotarized` removido, é preciso passar por `codesign`, `stapler validate` e `spctl -t open`.
- O `ZCode.app` final, os Helpers dentro do pacote e o Helper em nível de usuário após a instalação precisam passar individualmente por `codesign --verify --deep --strict` e `spctl -a -vv -t exec`; os dois Helpers também precisam passar pelo `xcrun stapler validate` local, confirmando que, depois que a assinatura não foi sobrescrita, o staple ainda corresponde ao bundle final.
- A publicação oficial por tag proíbe o upload de `.unnotarized.dmg`; os fluxos de teste, sandbox e MR podem manter artefatos não notarizados para investigação, mas eles não podem entrar no release oficial.

## Fluxo de CI

1. `build:macos:*` importa o p12 do Developer ID Application para um keychain temporário.
2. O `electron-builder` empacota e assina o `ZCode.app`, produzindo `ZCode-<version>-mac-<arch>.dmg`.
3. `ci-collect-artifacts` coleta o DMG como `*.unnotarized.dmg`.
4. `scripts/notarize-macos.sh` executa, sobre `*.unnotarized.dmg`, a assinatura do DMG, a notarização, o staple, a renomeação e a aceitação.
5. Em release estrito, `scripts/notarize-macos.sh` também localiza o `ZCode.app` empacotado por meio de `ZCODE_MACOS_RELEASE_APP_PATH` ou `ZCODE_DESKTOP_DIST_DIR` e reaproveita `scripts/doctor-macos-release-app.sh` para validar o app principal; quando o caminho do app não é encontrado, ocorre fail-closed. O release gate de CUA/Helper define adicionalmente `ZCODE_CUA_REQUIRE_HELPER=1` e valida explicitamente o `Contents/Resources/cua-helper/ZCode Computer Use.app` dentro do app final; quando ausente, ocorre fail-closed.
6. `scripts/upload-oss.sh`, na publicação oficial, aceita apenas os `*.dmg` que passaram por todo o fluxo acima.

## Assinatura Independente e Restrições de Arquitetura do Computer Use Helper

Embora `ZCode Computer Use.app` seja empacotado junto do app principal e copiado para o diretório do usuário em tempo de execução, ele é um sujeito de responsabilidade TCC independente (bundle id
`dev.zcode.cua-helper`) e precisa ser assinado **separadamente** do app principal para obter no sistema as entradas de autorização próprias de Accessibility /
Screen Recording. As restrições relacionadas são:

- **O Helper é entregue junto do ZCode.app, mas roda como bundle independente.** A origem no pacote publicado é fixada como
  `ZCode.app/Contents/Resources/cua-helper/ZCode Computer Use.app`; o instalador do produto, após validar, a copia para
  `${ZCODE_HOME:-$HOME/.zcode}/computer-use/ZCode Computer Use.app`. Não são aceitos download pela rede, `/Applications`,
  `~/Applications` ou `ZCode.app/Contents/Library/Helpers` como fallback do produto; a ausência da origem precisa resultar em fail-closed.
- **O Helper é um bundle independente, mas reaproveita a identidade de publicação do ZCode.** A cadeia de publicação do Helper independente precisa ser assinada com
  `build/entitlements.helper.plist` + hardened runtime como `dev.zcode.cua-helper`; a identidade de assinatura continua sendo o mesmo
  Developer ID Application team/identity de `ZCode.app`, sem necessidade de certificados adicionais nem de custo adicional de conta Apple. O `ZCode.app` e o `ZCode Computer Use.app` dentro do mesmo
  release payload precisam passar pela mesma cadeia de aceitação de notarization/staple;
  depois de aprovada, o Helper pode ser copiado pelo instalador/scriptos como um `.app` independente para
  `${ZCODE_HOME:-$HOME/.zcode}/computer-use/`. ZCode.app é responsável apenas por descobrir, iniciar via LaunchServices, fazer health check
  e injetar socket/token aleatórios nos subprocessos MCP.
- **O executável principal do helper precisa ser um Mach-O SEA.** `scripts/build-cua-helper-app.mjs` usa Node SEA para injetar a entrada do helper
  em uma cópia do executável do Node (substituindo o antigo shell wrapper); antes da assinatura/notarização, ela já precisa ser Mach-O.
- **O `ax_native.node` de ABI plain-node precisa estar compilado antes.** O helper SEA em execução carrega, usando um Node embutido (não Electron),
  o `@zcode/zcode-cua/build/Release/ax_native.node` fixado em versão, o que exige **ABI plain-node** (node-gyp rebuild,
  e não o Electron ABI do `@electron/rebuild`). O `@zcode/zcode-cua` já foi adicionado ao `allowBuilds` do `pnpm-workspace.yaml`; o
  build/aceitação do Helper independente precisa verificar explicitamente que esse addon unificado existe e pode ser carregado.
- **Cross-arquitetura (x64 empacotado em runner Apple Silicon).** O `process.execPath` do processo de empacotamento em um runner Apple Silicon
  é um Node arm64 e, se o job x64 não especificar outro Node, o helper SEA será gerado como arm64. O `assertHelperSeaBaseNodeArch` de `build-cua-helper-app.mjs`
  causa fail-closed antes da montagem do SEA e orienta a: definir `ZCODE_CUA_HELPER_NODE_PATH` para o job x64 apontando para um Node
  SEA-capable compilado para a arquitetura alvo, e compilar o `build/Release/ax_native.node` do producer fixado em versão para a arquitetura alvo
  (`--arch=x64`). O job nativo arm64 não precisa de configuração adicional.

## Depuração Local do Helper sem Developer ID

Quando a máquina de desenvolvimento não tem credenciais de Developer ID / notarization, ainda é possível rodar a cadeia CUA
com Helper próprio usando o app ZCode real, mas é obrigatório marcar explicitamente como dev local e isso não vale como evidência de release:

1. Construir localmente `ZCode Computer Use Dev.app` e instalá-lo em
   `${ZCODE_HOME:-$HOME/.zcode}/computer-use/dev/ZCode Computer Use Dev.app`.
2. Iniciar o ZCode App pelo terminal definindo, apenas no ambiente desse processo:
   `ZCODE_CUA_HELPER_ALLOW_UNSIGNED_LOCAL=1`. O resolver de Helper do produto vem habilitado por padrão na versão oficial e nas builds local/dist;
   ele só é desligado definindo explicitamente `ZCODE_CUA_PRODUCT_HELPER=0|false|off`.
   O desktop injeta esse caminho local determinístico no utility host como bundled source; quando ausente, falha diretamente,
   sem fazer fallback para download pela rede.
3. O ZCode.app continua subindo o Helper externo via LaunchServices `open -n -g <Helper.app> --args --socket <path> --token-file <path> --launcher-pid <pid>`,
   de modo que o sujeito de autorização TCC no macOS continua sendo o próprio Helper. O caminho de produto **aceita somente o `--token-file`
   de uso único assinado pelo launcher** (o `helperMain` rejeita um broker de produto sem token-file) e exige o `--launcher-pid` para a
   validação da árvore de processos do par; o `--token` é usado apenas como fallback explícito de dev local e não deve funcionar como caminho de aceitação de produto.

Esse modo só flexibiliza as verificações de TeamIdentifier do Developer ID e de Gatekeeper/notarização; bundle id,
versão, arquitetura e estrutura Mach-O ainda precisam corresponder. Na ausência ou em caso de estrutura incompatível, não há download nem substituição do Helper oficial,
e sim fail-closed. A identidade TCC de um Helper ad-hoc/unsigned é instável e pode exigir nova autorização após um rebuild;
a aceitação oficial ainda precisa usar o Helper assinado, notarizado e stapled.

## Comandos de Aceitação

```bash
codesign --verify ZCode-<version>-mac-<arch>.dmg
xcrun stapler validate ZCode-<version>-mac-<arch>.dmg
spctl -a -t open --context context:primary-signature ZCode-<version>-mac-<arch>.dmg
```

Após a instalação, a aceitação final do app principal e do Computer Use Helper externo:

```bash
pnpm run doctor:macos-release -- "/Applications/ZCode.app"
ZCODE_CUA_REQUIRE_HELPER=1 pnpm run doctor:macos-release -- "/Applications/ZCode.app"
```

Esse comando executa, na ordem:

```bash
codesign --verify --deep --strict "/Applications/ZCode.app"
spctl -a -vv -t exec "/Applications/ZCode.app"
codesign --verify --deep --strict "$HOME/.zcode/computer-use/ZCode Computer Use.app"
spctl -a -vv -t exec "$HOME/.zcode/computer-use/ZCode Computer Use.app"
xcrun stapler validate "/Applications/ZCode.app/Contents/Resources/cua-helper/ZCode Computer Use.app"
xcrun stapler validate "$HOME/.zcode/computer-use/ZCode Computer Use.app"
```

0.5.5 legacy: após o upgrade, o diretório antigo `ZCode CUA Helper.app` ainda pode existir, mas ele não é o alvo de aceitação da instalação atual;
não execute `codesign` / `spctl` no caminho antigo e não trate o resultado como evidência de publicação do Helper desta versão.

O script captura a saída dos comandos acima no caminho de sucesso e só imprime o diagnóstico bruto em caso de falha, evitando que o detalhe verbose
das propriedades internas de `codesign` / `spctl` contamine o log oficial de empacotamento.