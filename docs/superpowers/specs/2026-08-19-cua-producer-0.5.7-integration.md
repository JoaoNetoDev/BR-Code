# Integração do CUA producer 0.5.7 e convergência do consumer

- Data: 2026-08-19
- Status: implementado, aguardando revisão manual
- Candidato do producer: `zcode-cua@52da434158df32f6d0825db6af1c3d263754c44c`
- Branch de destino: `feat/cua-merge-0817`

## Contexto

O z-code já migrou a fonte de fatos do runtime do Helper para o `@zcode/zcode-cua` fixo, mas o
pin antigo do producer ainda obriga o consumer a manter três categorias de estado duplicado:

1. facade de permission-service de controller status/take/stop, que o renderer já não chama;
2. getters assíncronos de ghost cursor/PiP sempre true, além dos rótulos
   `--permission-mode product` / `--backend broker` sem consumidor em runtime;
3. nomes de app/display/executable do Helper mantidos pelo próprio z-code.

O producer 0.5.7 removeu essas facades/pseudo-configurações e convergiu a identidade estável e de
dev do Helper em canonical constants inseparáveis. O consumer precisa concluir a migração no mesmo
lote; mudar apenas o pin do git geraria um pacote misto com "diretório e plist de app antigo +
executable novo".

Evolução do pin: `d55c5f3a` entrega a convergência da surface do producer; `305df53f` integra
clique estável em screenshot, Zoom/ghost cursor e ciclo de vida de requisição HTTP; `d51e5365`
conecta a verificação de identidade/execução do Helper com inicialização falha à CI obrigatória;
`611304cc` falha fechado diante de reuso de PID durante a espera de saída e nunca envia SIGKILL
para a nova identidade de upgrade; por fim, `52da4341` converge o guia de Skill sobre essa
baseline. O consumer registra apenas essa revision final imutável.

## Arquitetura e ordem de publicação

```text
zcode-cua MR（producer）
  ├─ ports: getStatus / restartHelper
  ├─ product host: ghost=true, PiP=true, background=false
  ├─ raw broker controller protocol + lease 保留
  └─ canonical Helper identity
             │ 固定不可变 commit SHA
             ▼
z-code MR（consumer）
  ├─ Local Host 只实现 getStatus / restartHelper
  ├─ plugin-host 只校验 authority + exact socket + token
  ├─ build/package/desktop 全部消费 canonical Helper identity
  └─ wrapper / skill / lockfile 与 producer 0.5.7 同步

人工 review 顺序：先合 producer MR，再合 z-code MR；本任务不自动合并或打 tag。
```

## Contratos

### Fechamento de runtime do pacote Desktop

- `@zcode/services` conecta o broker do producer ao main do Desktop, ao host e ao scheduler; o
  `@zcode/zcode-cua` JavaScript correspondente precisa ser inlined pelo tsup, sem deixar import de
  pacote cru no bundle final.
- O electron-builder continua excluindo `node_modules/@zcode/**`. Não se pode copiar o código,
  sourcemap, diretórios de build ou o pacote inteiro `ax_native.node` do producer para dentro do
  `app.asar` para corrigir resolução de módulo; as ações nativas continuam sendo carregadas
  apenas pelo Helper independente.
- Testes unitários precisam verificar mecanicamente `noExternal` para os três configurações
  main, host e scheduler; a validação de publicação precisa construir e iniciar de fato o
  pacote, e não usar o sucesso na geração do DMG/ZIP como evidência substituta de inicialização
  bem-sucedida.

### Permission service e controller

- `ICuaPermissionService` mantém apenas `getStatus` e `restartHelper`.
- São removidas do z-code as rotas `getHelperStatus`, `takeController` e `stopController` —
  implementadas apenas para si mesmas e referências de teste — e o re-export de DTO.
- `controller_status` / `controller_takeover` / `controller_stop` do raw broker, o lease do
  controller, a admission, a visual ownership e o orphan reaper são integralmente mantidos.
- Desktop continuous e web remote replayable continuam anexados ao mesmo Local Host de escopo de
  window; esta entrega não adiciona runtime, session event, snapshot nem estado remoto.

### Autoridade de plugin

- São removidas a injeção e a validação dos argv permission-mode/backend, que não têm consumidor de
  decisão em runtime; o CLI bootstrap uniformemente remove as antigas tags antes do terminator
  `--` antes de chamar o producer, evitando que configurações de versões misturadas continuem
  repassando argv já aposentado. O re-export de injeção do producer preservado em services apenas
  para testes não assume essa canonicalização do consumer.
- Essa canonicalização é desacoplada da injeção de credenciais do broker: o caminho raw local-dev
  explícito sem socket e o caminho de pass-through fora do macOS também precisam limpar as tags
  antigas, mas isso não pode injetar socket/token/authority nem alterar a decisão fail-closed de
  omissão.
- A limpeza e o upsert do socket canônico tratam apenas tokens adjacentes que não começam com
  `--` como valores independentes; em uma configuração malformada, quando uma flag é seguida
  diretamente por outra flag, ela não pode engolir a seguinte nem deixar socket/value antigo como
  positional órfão.
- O official plugin ainda precisa provar, antes do import: official plugin id, authority capturada
  pelo resolver, broker socket exatamente igual ao valor capturado e broker token não vazio.
- Qualquer ausência ou drift em socket/token/authority falha fechado; não se pode substituir pelo
  nome do server ou por tags antigas.

### Identidade do Helper e empacotamento

- O pacote estável usa fixamente `ZCode Computer Use.app`, o pacote de dev usa fixamente
  `ZCode Computer Use Dev.app`, e em ambos o executable é `ZCode Computer Use`.
- O nome de diretório, o `CFBundleDisplayName` e a display policy do broker do pacote de dev usam
  `ZCode Computer Use Dev`; isso não altera o `CFBundleExecutable`. Este último precisa continuar
  usando o `HELPER_DISPLAY_NAME` do producer (`ZCode Computer Use`) e não pode ser derivado do
  nome do app de dev.
- build, electron-builder, release zip, notarize, doctor, runtime resolver e CI usam o mesmo
  conjunto de constants do producer; os entrypoints JavaScript executáveis de build/dev importam os
  constants diretamente, e os literais em shell/CI, onde não é possível importar módulos, são
  comparados mecanicamente por testes unitários e por `HELPER_APP_NAME` /
  `HELPER_DISPLAY_NAME`, sem depender mais de sincronização manual. O z-code deixa de copiar o
  nome de exibição padrão.
- A CI do Helper precisa ler o SHA imutável do producer dinamicamente do catálogo do workspace; o
  próprio comando de extração precisa ser executado de fato por um teste unitário em Node com o
  texto original do script da CI, e é proibido fazer apenas uma checagem de existência de string. As
  regex em shell/YAML não podem escapar `/` duas vezes, sob pena de o Node 24 encerrar o job de
  Helper de duas arquiteturas com erro de sintaxe após o native build.
- O feature graph precisa registrar o build/release do Helper como um nó de serviço comum entre
  Computer Use e a engenharia de build-release, e registrar `ZCode Computer Use.app` /
  `ZCode Computer Use Dev.app` como o contrato atual; o seed antigo `cua-helper-build` não pode
  continuar descrevendo nomes de app já aposentados.
- `assembleHelperApp` não recebe mais `displayName`: o bundle id decide de uma só vez o diretório
  do app, o nome do plist e o executable, e sobrescrita parcial é proibida.
- 0.5.5 legacy: o antigo `ZCode CUA Helper.app` pode ter ficado no diretório do usuário; o TCC
  continua identificando pelo bundle id/identidade de assinatura já existentes. Este lote não faz
  remoção de diretário nem kill por nome de processo sem prova.
- Os runbooks atuais de operação, assinatura, notarização, instalação e diagnóstico precisam tratar
  apenas `ZCode Computer Use.app` como alvo de aceitação; o nome antigo só pode aparecer em notas de
  resíduo com a marca `0.5.5 legacy`, evitando que `codesign` / `spctl` validem silenciosamente um
  pacote antigo.

### Pin e skill

- O catálogo do workspace mantém apenas um git pin canônico de `@zcode/zcode-cua`.
- A versão do wrapper package/plugin/bootstrap, o producer commit da spec raster final, a skill
  embutida e o `upstream.json` precisam estar sincronizados com o candidato 0.5.7.
- O script de sync da skill aceita apenas um pin canônico e grava um upstream ref explícito; não
  pode exigir o alias helper-runtime já removido nem gravar nomes de branch locais temporários nos
  metadados de publicação.

## Testes e portões

- Atualizar/adicionar primeiro os testes de contrato e só então alterar a implementação.
- service: inventário da facade de permission, estado de autorização/restart, atestação final
  TOCTOU, runtime Windows e o caso de UI de "não fazer RPC de controller automaticamente".
- AX read-only, backend Electron e contrato subjacente do instalador do Helper são mantidos em
  regime de exclusividade pelo producer; o z-code remove as três cópias de testes-espelho que já
  derivaram, mantendo apenas os testes de fronteira de consumer de product wiring, permission UI,
  Local Host e packaging.
- CLI/plugin: ausência e drift de authority/socket/token falhando fechado; sem
  permission-mode/backend.
- packaging: app stable/dev, plist, executable, allowlist do zip, caminhos de recursos do
  electron-builder, caminhos de staging da CI e provenance do producer coerentes; o display name e
  o executable do app de dev precisam ser verificados separadamente, para que
  `ZCode Computer Use Dev` não seja confundido com o executable.
- Documentação de operações e feature graph: todos os caminhos executáveis, comandos de aceitação
  de assinatura e contratos de build apontam para o app canônico; o nome antigo permanece apenas
  como aviso de resíduo `0.5.5 legacy` explícito. A limpeza de unit tests de 2026-10-15 removeu a
  guarda de correspondência do texto da documentação; os artefatos executáveis continuam sendo
  aceitos conforme o build/release real do Helper, sem tratar a correspondência de texto como
  cobertura de comportamento.
- version/skill: coerência de versão, execução real do sync da skill, asserção de single-pin e
  instalação congelada.
- Obrigatórios: `pnpm typecheck`, `pnpm lint`, unit tests relacionados, `pnpm build:cua-helper`
  e `pnpm package:cua-helper:release:dry`. Itens que não possam ser concluídos no macOS atual em
  máquina real ou na CI precisam ser listados como pendentes no MR, sem restaurar por
  compatibilidade os estados duplicados já removidos.

### Ledger de migração de posse de testes

Remover os testes-espelho do consumer não equivale a remover a barreira de regressão. A tabela
abaixo usa o producer commit fixo como fonte de fatos e lista os testes de comportamento do
producer e os smokes cross-package que permanecem no z-code; o MR do producer precisa passar
primeiro o `pnpm test` completo e o MR do consumer passa em seguida os smokes correspondentes, o
build/release do Helper e os unit tests de todo o repositório. Os caminhos são relativos à raiz de
cada repositório.

| Espelho removido do z-code                      | Owner de comportamento / testes executáveis do producer 0.5.7                                                                                                                                                                                                                 | Fronteira de consumer mantida no z-code                                                                                                                                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cuaPermissionBroker.axReadOnly.test.ts`      | `test/native/windows-app-ref-resolution.test.ts`、`test/broker/ax-action-dispatch-status.test.ts`、`test/broker/capture-app-incremental-contract.test.ts`、`test/request-access-read-only.test.ts`                                                     | `packages/services/test/cuaPermissionBrokerNodeHelper.test.ts` verifica a seam de Helper/Node pinado; a integração de product/runtime no Windows continua no consumer                                                                                            |
| `cuaPermissionBroker.electronBackend.test.ts` | `test/request-access-read-only.test.ts`、`test/electron-screenshot-display-provenance.test.ts`、`test/windows-capability-truthfulness.test.ts`、`test/open-application-identity-conjunction.test.ts`、`test/macos-background-application-open.test.ts` | `packages/services/test/cuaPermissionBrokerHelperHost.test.ts` e `cuaPermissionBrokerNodeHelper.test.ts` verificam a montagem Local Host→producer e a inicialização fail-closed                                                                                    |
| `cuaPermissionBrokerHelperInstaller.test.ts`  | `test/broker/helper-install-variants.test.ts`、`test/broker/helperInstaller.production-source.test.ts`、`test/broker/helperInstaller.build-id-promotion.test.ts`、`test/standalone/helper-launch/{installer,downloader,signature-verifier}.test.ts`    | `packages/services/test/cuaPermissionBrokerHelperAppBundle.test.ts`、`cuaPermissionBrokerHelperReaper.test.ts`、`packages/desktop/test/{cuaHelperRuntimeProvenance,runtime-asset-scripts}.test.ts` verificam montagem do app, limpeza, empacotamento e provenance do pin |
| `cuaControllerServiceRouting.test.ts`         | `test/broker/{controller-admission,controllerCoordinator,controllerLease}.test.ts` mantêm a arbitragem interna do Helper; não se restaura a facade de RPC de desktop já aposentada                                                                                                               | Os testes negativos de UI mantêm a restrição da remoção da superfície de configurações; a limpeza de 2026-10-15 removeu a guarda de palavras proibidas no código-fonte do consumer, e ela não deve mais ser vista como cobertura de comportamento do RPC                                                                                                                                |
| `cuaGhostCursorSettingsWiring.test.ts`        | `test/broker/product-host-launch-policy.test.ts` trava ghost/PiP sempre ativos e background desligado no product                                                                                                                                                         | `cuaPermissionBrokerHelperHost.test.ts` verifica apenas a fiação do product host, sem duplicar a implementação de política do producer                                                                                                                                                    |

Este ledger só permite remover espelhos quando os testes owner ainda existirem e o gate completo do
producer passar; se o caminho do producer for renomeado ou o local de comportamento mudar, esta
tabela e os testes correspondentes do producer precisam ser atualizados antes de ajustar os smokes
do consumer.

## Verificação da implementação

- O ledger de posse de testes foi executado de fato contra o producer commit fixo: 18 files /
  122 tests no producer e 9 files / 261 tests de fronteira no consumer, todos passando.
- Typecheck da raiz e typecheck dos 22 pacotes do CLI passaram no Node 24.14.0.
- Regressão direcionada de CUA/desktop: 19 files / 423 tests passando; authority, skill e
  configuração do CLI: 188 tests passando.
- Unit de todo o repositório: 1307 files passando, 1 skipped; 11396 tests passando, 11 skipped.
- `build:cua-helper` passou no Node oficial autocontido 24.14.0, com artefato
  `ZCode Computer Use.app`; o dry-run de release passou, faltando apenas a identidade real de
  assinatura no ambiente atual.
- `build:cua-helper:dev` passou no Node oficial autocontido 24.19.0 (após o bloqueio de acesso ao
  keychain da identidade dev estável nesta máquina, foi usado o escape hatch adhoc explícito
  suportado pelo script); o bundle real é `ZCode Computer Use Dev.app`, com `CFBundleName` /
  `CFBundleDisplayName` iguais a `ZCode Computer Use Dev` e com `CFBundleExecutable` e o único
  arquivo Mach-O arm64 ambos iguais a `ZCode Computer Use`. Esta verificação cobre apenas a
  identidade do bundle de dev e não substitui o gate de assinatura de release.
- Root lint com 0 errors (o repositório já tem 37 warnings). O `fmt:check` da raiz continua
  bloqueado pelo HTML de Electron fiddle já existente e por `gb2312.js`; os arquivos alterados
  nesta entrega passam na formatação, e a Skill upstream foi mantida como está para preservar o
  provenance byte-for-byte do producer.