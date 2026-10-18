# Pacote interno de testes ZCode Preview

## Resumo da funcionalidade

| Campo                  | Valor                                                                                                                                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alteração              | Os instaladores desktop de todas as plataformas com `ZCODE_ENV=test` passam a usar a identidade de produto `ZCode Preview`, e o pipeline de MR pode disparar manualmente a cadeia de build, assinatura e notarização de nível de produção                                                                 |
| Superfícies visíveis ao usuário | Nome do instalador, nome do app, registro de instalação do sistema, barra de tarefas/Dock, About, guia de permissões CUA                                                                     |
| Documentos existentes  | `docs/cua-permission-broker/zcode-cua-permission-broker.md`, `docs/cua-permission-broker/cua-helper-installation.md`, `docs/desktop/auto-update-superseded-ready-package.md`                                               |
| Responsáveis de código existente | `packages/desktop/electron-builder.config.js`, `packages/desktop/src/main/desktopRuntimeEnv.ts`, `packages/desktop/src/main/autoUpdater.ts`, `packages/services/src/cua-permission-broker/*`, `.gitlab/ci/30-build.yml` |
| Fora de escopo         | Diretórios separados de conta/tarefa/configuração, scheme de protocolo separado, atualização automática do Preview, execução simultânea de CUA em produção e Preview                                                  |

## Registro de esclarecimentos

| Rodada | Pergunta                                             | Resposta do usuário                            | Limite fixado                                                       | Necessita acompanhamento |
| ------ | ---------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------- | ----------------------- |
| 1      | Nome do pacote de teste                             | `ZCode Preview`                                | `ZCODE_ENV=test` corresponde ao nome de produto Preview             | não                      |
| 1      | Dados e conta isolados?                             | Não isolados, iguais à produção                | Continua compartilhando os dados de negócio `${ZCODE_HOME:-$HOME/.zcode}` | não                  |
| 1      | Atualização/publicação independente?                | Não, sem auto-update, apenas interno           | O Preview não entra no lançamento stable, não inicializa o updater e não força atualização | não |
| 1      | Plataforma e alcance de capacidades                | Todas as plataformas, totalmente utilizável    | macOS, Windows e Linux geram pacotes Preview instaláveis; as capacidades de assinatura já existentes na produção continuam aplicáveis | não |
| 2      | Exige rodar junto com a produção?                   | Sim                                            | A identidade de instalação do SO, o nome do executável e o diretório de runtime do Electron precisam ser separados | não |
| 2      | Conflito de deep link aceito?                       | Aceito                                         | Continua compartilhando `zcode://`, tratado pelo handler padrão atual do sistema | não |
| 3      | Os dois apps usariam CUA simultaneamente?          | Não, apenas um por vez                         | Não adicionar trava de CUA entre apps; apenas garantir que ambos funcionem isoladamente | não |
| 4      | Como o Preview é disparado?                         | Comando manual no mesmo nível do merge/approve de MR | O pipeline de MR exibe `build:preview`; ao clicar, inicia um subpipeline Preview independente do mesmo commit | não |
| 5      | O Preview altera o fluxo de packaging?              | Não; usa o mesmo DAG de build da produção de MR, mudando poucas variáveis de ambiente | O trigger passa explicitamente apenas `ZCODE_PREVIEW_PIPELINE`, `ZCODE_ENV` e `TARGET_OUTPUT_DIR` ao child; o child resolve suas próprias variáveis de runner/job | não |
| 6      | Como o pipeline de teste manual isola artefatos     | Com `ZCODE_ENV=test`, escreve uniformemente em `@electron-preview/<branch>/` no nível superior | MR, pipeline do GitLab Run, Pipeline Trigger API, pipeline de API comum e o child Preview usam a mesma raiz Preview; produção, tag e `ci/*` permanecem inalterados | não |
| 7      | A Pipeline Trigger API suporta recorte de plataforma | Sim                                            | `CI_PIPELINE_SOURCE=trigger` entra no mesmo workflow de web/API e consome `ZCODE_BUILD_PLATFORMS`; sem variável de plataforma, continua automático em todas as plataformas | não |

## Decisões de fronteira

| Fronteira             | Decisão                                                       | Inclui                                                                       | Exclui / poda                                                        | Origem                            |
| --------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------- |
| Tipo de pacote        | `ZCODE_ENV=test` constrói Preview                               | Otimizações de produção, API de ambiente de teste, instalador interno         | Um terceiro valor de ambiente                                        | user + CI atual                   |
| Identidade exibida    | `ZCode Preview`                                                | Nome do bundle macOS, nome do produto Windows, nome do desktop Linux, nome do artefato | Mudar ícone ou sistema de marca da UI | user                             |
| Identidade de sistema | O Preview usa app id / executável / nome de pacote Linux próprios | Instalação e execução lado a lado com a produção                           | Reutilizar `dev.zcode.app`                                           | invariante de execução simultânea |
| Dados                 | Os dados de negócio continuam em `~/.zcode`                    | Tarefas, configurações, credenciais                                        | Garantia de consistência forte para dois processos alterando a mesma tarefa | user                            |
| Dados de runtime do Electron | Diretório por nome de app                                     | Sessão do Chromium, lock de instância única, cache                          | Compartilhar o `userData` do Electron com a produção                | invariante de execução simultânea |
| Deep link             | Continua usando `zcode://`                                     | OAuth, pagamento, abertura de workspace                                     | Garantia de entrega ao app que originou o callback                   | limitação aceita                 |
| Atualização           | O Preview é totalmente desabilitado                           | Polling em background, entrada manual de verificação, gate de force-update   | Feed/canal de atualização do Preview                                 | user                              |
| Principal de permissão CUA | Os dois apps principais podem iniciar o mesmo Helper com identidade assinada | Allowlist de app-id no launcher do Helper, mesma identidade TCC autorizada    | Executar duas entradas de mouse/teclado ao mesmo tempo              | user + arquitetura CUA            |
| Instalação do CUA     | O Preview usa o subdiretório `computer-use/preview`           | Evitar que versões diferentes do App atualizem/rebaixem o Helper entre si     | Isolar tarefas, configurações e credenciais                         | invariante de segurança de versão |
| Assinatura            | O Preview usa a lógica de assinatura de produção com fail-closed | macOS Developer ID + notarização, vsigntool no Windows                    | Gerar silenciosamente um Preview não assinado sem credenciais       | user                              |
| Entrada de CI         | A fase `approve-mr` do MR recebe um job manual opcional `build:preview` | Acionar um child pipeline do mesmo commit de MR, fixando `ZCODE_ENV=test` | Entrada de display fora do MR, bloqueio da construção normal do pacote de produção do MR | user         |
| Artefatos de CI       | O Preview usa um diretório compartilhado próprio              | `@electron-preview/<branch>/`; MR/child Preview usam a source branch, web/API usam o nome da ref | Sobrescrever o pacote de aceitação de produção `@electron/dev/...` | invariante de isolamento de artefato |
| Responsabilidades de CI | O child Preview apenas reaproveita build + notify             | App desktop, instaladores de todas as plataformas, CUA Helper, remote assets, notificação de artefatos no Feishu | test, upload/preload/publish/release                                  | fronteira de pacote interno      |
| Herança de variáveis de CI | `build:preview` não herda as variáveis default do nível superior do parent | Encaminha apenas as três variáveis de controle do Preview; as credenciais de assinatura são remapeadas pelo child workflow do mesmo projeto | Encaminhar diretórios derivados de `CI_PROJECT_DIR` do parent runner | fronteira de fase de variáveis do GitLab |

## Escopo de domínio

| Domínio                        | Inclui? | Por que pode alterar comportamento                                                | Fontes principais                                                                                                  |
| ------------------------------ | ------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Ciclo de vida / lançamento desktop | sim   | Nome do produto, app id, instância única, updater, formato de instalação por plataforma e entrada de build manual vivem neste domínio | `packages/desktop/electron-builder.config.js`, `.gitlab/ci/00-workflow.yml`, `.gitlab/ci/preview-child.yml`, `.gitlab/ci/30-build.yml` |
| Permissão / ferramenta / CUA   | sim     | O novo app id do Preview precisa ser aceito pelo Helper pelo requisito de assinatura do mesmo Team | `docs/cua-permission-broker/zcode-cua-permission-broker.md`                                                   |
| Persistência                   | sim     | Os dados de negócio são compartilhados, mas o `userData` do Electron precisa ficar separado para permitir execução paralela | `packages/desktop/src/main/desktopRuntimeEnv.ts`, `packages/services/src/paths.ts`                     |
| OAuth / deep link              | sim     | Os dois instaladores compartilham o scheme, e o sistema mantém apenas um handler padrão | `packages/desktop/src/main/desktopOAuthDeepLink.ts`                                                            |
| Conversation / mobile realtime | não     | Não altera o protocolo Host/CLI, a identidade do workspace nem o delivery kind   | invariante de arquitetura                                                                                        |

## Produtos cruzados de alto risco

| Produto cruzado                          | Risco candidato                                                                        | Tratamento inicial                                                                |
| ---------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Identidade Preview × instalador do SO     | Mesmo app id/pacote/executável sobrescreve a produção ou atinge o mesmo lock de instância | Identidade de sistema própria, aceito                                              |
| Preview × dados de negócio compartilhados  | Dois processos alterando a mesma configuração/tarefa ao mesmo tempo podem competir    | Compartilhamento confirmado pelo usuário; sem promessa de escrita concorrente na mesma tarefa, limitação aceita |
| App id do Preview × verificação do launcher CUA | O Helper hoje só aceita `dev.zcode.app`                                           | Allowlist explícita de dois app-id do mesmo Team, aceito                       |
| Versão Preview × versão de produção do Helper | Compartilhar o caminho do Helper gera conflito de upgrade/downgrade               | O Preview usa `computer-use/preview`, aceito                                    |
| Preview × auto/force update                | Ler o feed stable por engano pode sobrescrever o Preview ou impedir a inicialização   | O Preview desabilita todas as entradas de updater/force-update, aceito         |
| Prod + Preview × `zcode://`               | O callback pode cair no outro app e o state do OAuth não corresponder                 | Aceito pelo usuário, ignorado                                                    |
| Trigger Preview × DAG de produção do MR    | Se o novo job manual for blocking, um MR sem Preview não consegue concluir normalmente | O job permanece opcional; o child pipeline só inicia após o clique, aceito      |
| Child Preview × jobs de release             | Reutilizar a configuração raiz pode enviar arquivos por engano ou sobrescrever o feed stable | O child inclui apenas os fragmentos de build/notify, aceito                |
| Variáveis default do parent × runner do child | `ZCODE_CI_TMPDIR="$CI_PROJECT_DIR/.tmp"` pode degradar para `/.tmp` na fase de trigger sem runner e sobrescrever o default do child com alta prioridade | O trigger não herda os defaults do parent; o job do child usa seu próprio `CI_PROJECT_DIR`, aceito |

## Mapa de conceitos

```text
ZCODE_ENV=test
  |
  +-- MR pipeline: build:preview (optional manual)
  |     -> child pipeline: same MR ref/SHA
  |     -> @electron-preview/<source-branch>/
  |     `-- build + sign + notarize + notify only
  |
  `-- MR / Run pipeline / Trigger API / API pipeline 显式传入 test
        `-- workflow 在 job graph 创建时选择 @electron-preview/<branch>/
  -> build identity: ZCode Preview / dev.zcode.app.preview / zcode-preview
  -> compiled runtime environment: test endpoints
  -> Electron runtime name: ZCode Preview
       -> appData/ZCode Preview (single-instance/session/cache isolation)
  -> business data: ${ZCODE_HOME:-$HOME/.zcode} (shared)
  -> updater: disabled
  -> CUA install: ~/.zcode/computer-use/preview/ZCode Computer Use.app
       -> signed helper identity remains dev.zcode.cua-helper
       -> trusted launcher is prod OR preview app id, same Team pin
```

```text
MR parent pipeline (same source commit)
  |
  +-- approve:merge-request [manual, blocking]
  |     `-- production build DAG -> @electron/dev/<source-branch>/
  |
  `-- build:preview [manual, optional]
        |   forwarded: ZCODE_PREVIEW_PIPELINE / ZCODE_ENV / TARGET_OUTPUT_DIR only
        `-- Preview child pipeline [ZCODE_ENV=test]
              +-- resolve CI_PROJECT_DIR/cache paths in each child runner job
              +-- build:desktop:app
              +-- macOS + Computer Use Helper (sign + notarize)
              +-- Windows + Linux + remote assets
              `-- artifact notifications

Preview child excludes: tests, upload, preload, publish, release
```

```text
workflow path selection
  |
  +-- MR + ZCODE_ENV=test      -> @electron-preview/<source-branch>/
  +-- web/api/trigger + ZCODE_ENV=test -> @electron-preview/<ref-name>/
  +-- MR/web/api/trigger production    -> @electron/dev/<branch>/
  `-- tag / ci/*               -> existing @electron/release or @electron/ci path
```

## Donos do estado

| Estado / fato                 | Autoridade                                      | Espelhos / caches                                       | Evidência                                                    |
| ----------------------------- | ----------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| Flavor de build               | `ZCODE_ENV` em CI/build                         | define de tsup/vite, config do electron-builder         | dry-run/testes de config, metadata dos artefatos             |
| Identidade do app por SO      | config do electron-builder                      | macOS Info.plist, GUID do NSIS, metadata do pacote Linux | inspeção do artefato desempacotado                          |
| Identidade de runtime do Electron | desktop main                                  | `app.name`, `userData`, lock de instância única        | teste unitário de runtime, lançamento simultâneo manual     |
| Raiz dos dados de negócio     | resolvedor de paths de services                 | repositórios de settings/task/credential                 | asserções de path, visibilidade manual de tarefa compartilhada |
| Elegibilidade para atualização | `ZCODE_ENV` compilado no desktop main            | estado do menu/tray/updater do aplicativo               | testes unitários, ausência de rede/log                      |
| Confiança do launcher CUA     | processo Helper assinado                        | string de code requirement                               | teste unitário do peer-verifier, smoke assinado no macOS    |
| Caminho de versão do CUA Helper | env do processo Host + resolvedor do instalador | caminhos candidatos/reaper do helper                    | testes unitários de installer/host, path no sistema de arquivos |
| Variáveis do trigger Preview  | job `build:preview`                             | variáveis de trigger do child pipeline                  | asserção de config de CI                                     |
| Paths de runtime do child     | `CI_PROJECT_DIR` / `$PWD` do job de runner do child | `ZCODE_CI_TMPDIR`, caminhos de cache npm/electron      | no log do runner os caminhos ficam no checkout, e não em `/.*` |

## Dimensões

| Dimensão                   | Valores / classes de equivalência                                       | Origem                  | Inclui?            | Motivo                                                          |
| -------------------------- | ----------------------------------------------------------------------- | ----------------------- | ------------------- | --------------------------------------------------------------- |
| Ambiente de produto        | production / test                                                       | CI + env compartilhado  | sim                 | identidade, endpoint e política de atualização diferem         |
| Plataforma                 | macOS / Windows / Linux                                                 | alvos de packaging      | sim                 | a mecânica de identidade de instalação difere                  |
| Apps instalados concorrentes | apenas prod / apenas preview / ambos                                    | fronteira do usuário    | sim                 | o propósito principal da identidade separada                    |
| Launcher CUA               | prod / preview / app assinado não relacionado                          | requisito de segurança  | sim                 | os dois primeiros aceitos, o não relacionado precisa falhar      |
| Uso de CUA                 | um ativo / dois ativos                                                  | fronteira do usuário    | apenas representativo | os dois ativos são podados pela premissa de uso do produto       |
| Receptor de deep link      | prod / preview                                                          | handler global de scheme do SO | sim           | ambos válidos, mas não determinístico                          |
| Gatilho de atualização      | inicialização / polling / menu / gate de força                         | código do updater       | sim                 | tudo precisa estar desabilitado no Preview                      |
| Dados de negócio           | raiz compartilhada padrão / raiz custom explícita                       | paths de services       | representativo      | a mudança de identidade não pode reescrever a raiz de dados      |
| Pipeline de CI             | parent de MR / child Preview / release de tag                           | workflow do GitLab      | sim                 | a entrada Preview e o isolamento de release dependem da origem do pipeline |
| Comando Preview            | não clicado / em execução / bem-sucedido / falhou                       | trigger manual          | representativo      | não clicado não pode bloquear o DAG de produção do MR            |
| Classe de variável do trigger | controles Preview explícitos / defaults do parent / valores só de job do child | fases de variáveis do GitLab | sim           | apenas controles explícitos podem cruzar a fronteira parent-child |

## Combinações candidatas

| ID candidato   | Estado                                         | Evento                              | Alvo/superfície         | Guarda/efeito esperado                                                                                  | Status inicial  | Observações                                |
| -------------- | ---------------------------------------------- | ----------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------ | --------------- | ------------------------------------------ |
| ZPREVIEW-001   | `ZCODE_ENV=test`                                | empacotar                            | todas as plataformas     | Nome Preview e identidade de instalação distinta; build otimizado                                          | aceito          | caso principal de build                    |
| ZPREVIEW-002   | production                                      | empacotar                            | todas as plataformas     | identidade ZCode existente inalterada                                                                    | aceito          | caso de regressão                          |
| ZPREVIEW-003   | prod e Preview instalados                      | iniciar os dois                     | ciclo de vida do desktop | ambas as instâncias continuam rodando com dados do Electron separados                                    | aceito          | smoke manual                               |
| ZPREVIEW-004   | Preview em execução                            | ler tarefas/configs/credenciais     | dados de negócio          | mesmos repositórios `~/.zcode` da produção                                                               | aceito          | sem migração de dados                      |
| ZPREVIEW-005   | Preview empacotado                             | inicialização/menu/config de força  | updater                   | sem verificação de atualização, sem UI de atualização, sem bloqueio por force-update                      | aceito          | sem auto-update                            |
| ZPREVIEW-006   | Preview assinado                               | iniciar CUA                          | Helper no macOS          | o launcher passa o app-id do Preview e o requisito de Team                                             | aceito          | a permissão continua sendo do Helper        |
| ZPREVIEW-007   | produção assinada                              | iniciar CUA                          | Helper no macOS          | o launcher de produção continua passando                                                                 | aceito          | caso de regressão                          |
| ZPREVIEW-008   | app assinado não relacionado                   | forjar o pid do launcher             | Helper no macOS          | falha no requisito do launcher                                                                          | aceito          | caso negativo de segurança                  |
| ZPREVIEW-009   | versões diferentes de prod/Preview              | usar CUA em sequência                | instalação do Helper     | diretórios de versão separados evitam conflito de substituição/rebaixamento                              | aceito          | apenas isolamento operacional                |
| ZPREVIEW-010   | os dois apps em execução                       | abrir `zcode://`                     | handler de scheme do SO  | o handler padrão atual recebe o callback                                                                | ignorado        | limitação aceita                           |
| ZPREVIEW-011   | os dois apps em execução                       | rodar duas sessões CUA simultaneamente | mouse/teclado global    | comportamento não suportado                                                                             | podado          | o usuário afirma que isso não ocorre         |
| ZPREVIEW-014   | pipeline de MR elegível                        | inspecionar a fase `approve-mr`       | UI de CI                  | o job manual opcional `build:preview` existe ao lado da aprovação do MR                                 | aceito          | entrada interna explícita                   |
| ZPREVIEW-015   | `build:preview` clicado                        | criar child pipeline                  | workflow de CI            | mesma ref/SHA do MR; `ZCODE_ENV=test` forçado; path de saída Preview distinto                          | aceito          | não exige variáveis manuais                |
| ZPREVIEW-016   | child Preview criado                           | avaliar os jobs do child              | DAG de CI                 | build completo desktop/CUA/remote e notificação; sem jobs de test/deploy web/release                    | aceito          | fronteira apenas de pacote                  |
| ZPREVIEW-017   | pipeline fora do MR                            | avaliar as regras do job manual       | UI de CI                  | `build:preview` está ausente                                                                            | podado          | a solicitação atual é um comando de nível MR |
| ZPREVIEW-018   | parent de MR com paths default derivados do checkout | clicar em `build:preview`   | variáveis do child pipeline | os defaults do parent não são herdados; os paths de cache/temp do child resolvem a partir do checkout do runner do child | aceito | regressão para `mkdir: /.tmp: Read-only file system` |
| ZPREVIEW-019   | trigger Preview deixa de herdar os defaults do parent | construir pacotes assinados       | workflow do child         | as variáveis de assinatura/notarização continuam mapeadas das protected variables do mesmo projeto       | aceito          | o isolamento de variáveis não pode enfraquecer a assinatura |

## Decisões de poda

| ID da decisão | Combinações podadas                               | Guarda/invariante                                     | Motivo no produto                                       | Cobertura representativa                          |
| ------------- | -------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------- |
| ZPREVIEW-P01  | Os dois apps executando CUA ao mesmo tempo        | Apenas um app por vez usa CUA                        | Não é preciso introduzir lease global de CUA nem novo estado de UI | Verificar separadamente prod/Preview iniciando o Helper |
| ZPREVIEW-P02  | Preview com conta/tarefa/configuração independentes | Dados de negócio explicitamente compartilhados        | O Preview é apenas uma entrada interna de teste         | Verificar que a resolução de paths não reescreve `ZCODE_HOME` |
| ZPREVIEW-P03  | Scheme separado para o Preview                    | O usuário aceita o roubo de deep link                | Evitar mudar a configuração de callback do OAuth       | Manter a asserção de configuração do protocol `zcode` |
| ZPREVIEW-P04  | Canal de atualização do Preview                   | O Preview proíbe atualizações                        | O pacote interno é substituído baixando e instalando de novo | Asserir que updater, menu e force-update estão desabilitados |
| ZPREVIEW-P05  | Exibir o comando Preview em pipeline branch/tag/web | A entrada manual é limitada ao MR                    | Estar no mesmo nível do merge/approve do MR é uma fronteira explícita desta rodada | Asserção estática das regras de CI |
| ZPREVIEW-P06  | Encaminhar cache/temp/defaults do parent          | O trigger só permite controles Preview explícitos atravessarem a fronteira | Paths exclusivos do runner/job devem ser calculados pelo próprio child | Asserção estática da config de CI + log real do child |

## Perguntas para o usuário

Nenhuma questão de produto em aberto no momento. Se futuramente for exigido que os dois apps executem CUA ao mesmo tempo, será preciso abrir um novo projeto de owner/lease global de entrada, que não faz parte desta alteração.

## Casos aceitos

| Case ID       | Setup                                  | Ação                                  | Asserções                                                                                   | Camadas de evidência            | Status E2E                             |
| ------------- | -------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------- | -------------------------------------- |
| ZPREVIEW-001  | `ZCODE_ENV=test`                       | resolver a identidade do electron-builder | A identidade de produto/app/executável/pacote do Preview está correta                    | config                          | verificado                             |
| ZPREVIEW-002  | `ZCODE_ENV=production`                 | resolver a identidade do electron-builder | Toda identidade de produção permanece inalterada                                         | config                          | verificado                             |
| ZPREVIEW-003  | runtime de teste empacotado simulado   | resolver os paths de runtime do desktop | name=`ZCode Preview`, userData do Electron separado                                       | runtime + path do sistema de arquivos | verificado                       |
| ZPREVIEW-005  | runtime de teste empacotado            | inicializar o updater e montar o menu | Não solicita feed, não mostra entrada de atualização, não executa force-update            | runtime + menu + mock de rede   | verificado                             |
| ZPREVIEW-006  | app id do Preview + Team oficial      | Helper valida o launcher              | O requirement é aceito                                                                      | teste unitário de requirement nativo | verificado                       |
| ZPREVIEW-007  | app id de produção + Team oficial     | Helper valida o launcher              | O requirement é aceito                                                                      | teste unitário de requirement nativo | verificado                       |
| ZPREVIEW-008  | outro app id                           | Helper valida o launcher              | O requirement é rejeitado                                                                    | teste unitário de requirement nativo | verificado                       |
| ZPREVIEW-009  | env de Host do Preview                 | resolver o path do Helper             | Usa `computer-use/preview`, o path de produção inalterado                                 | service + path do sistema de arquivos | verificado                       |
| ZPREVIEW-012  | CI de Preview no macOS                 | faltam credenciais de assinatura/notarização | O build falha de forma closed                                                        | teste de script de CI           | verificado                             |
| ZPREVIEW-013  | artefatos Preview das três plataformas | instalar e iniciar, em paralelo com a produção | Os dois processos coexistem e as funções básicas funcionam                              | smoke manual de artefato assinado | ausente                         |
| ZPREVIEW-014  | MR com alvo `main`/`staging`           | criar o pipeline parent               | Existe um job manual opcional `build:preview` na fase `approve-mr`                        | config de CI                    | verificado                             |
| ZPREVIEW-015  | pipeline parent do MR                   | clicar em `build:preview`             | O child usa o mesmo SHA do MR, com `ZCODE_ENV=test` fixo e diretório Preview separado     | config de CI                    | verificado                             |
| ZPREVIEW-016  | child Preview                           | expandir includes e regras de job     | Reutiliza build/assinatura/notarização/notificação de todas as plataformas; exclui testes, deploy web e release | config de CI      | verificado                             |
| ZPREVIEW-018  | variável default do parent referenciando `CI_PROJECT_DIR` | clicar em `build:preview` | O trigger define `inherit:variables:false`; o child não recebe paths derivados do parent como `/.tmp`, `/.npm-cache` | config de CI + log do runner | verificado (config); runtime pendente |
| ZPREVIEW-019  | child Preview do mesmo projeto          | resolver as variáveis de assinatura do workflow | As variáveis de assinatura/notarização da Apple ainda são mapeadas pelo child workflow a partir das protected variables | config de CI | verificado                   |

## Resultados da verificação

- `pnpm typecheck`: passou.
- `pnpm lint`: passou com 0 erros; 59 warnings já existentes do repositório permanecem fora desta alteração.
- `pnpm exec vitest run packages/desktop/test/ciNodeVersionConfig.test.ts`: 1 arquivo passou, 20 testes passaram; cobre o job manual do Preview, o isolamento de herança de variáveis default do parent, as variáveis do child workflow, as variáveis de assinatura, as fronteiras de include e o job de web remote desabilitado.
- Parsing de sintaxe YAML: `.gitlab/ci/00-workflow.yml` e `.gitlab/ci/preview-child.yml` passaram.
- `pnpm test:unit:affected` da baseline de packaging do Preview: expandido para a suíte unitária completa pela regra de pre-push do repositório; 841 arquivos passaram, 6478 testes passaram, 1 ignorado.
- `pnpm test:unit:affected` da alteração do disparo manual desta rodada: passou; o lint-staged selecionou o teste de config de CI, 1 arquivo / 20 testes passaram.
- Validação de schema do electron-builder: as configurações `ZCODE_ENV=test` e `ZCODE_ENV=production` passaram; a identidade Preview resolvida é `dev.zcode.app.preview` / `ZCode Preview` / `zcode-preview` / `_TEST`.
- Scripts de macOS: `bash -n` passou; os caminhos do Preview sem credenciais de assinatura/notarização são cobertos por testes fail-closed.
- Evidência de falha em runtime: no GitLab Runner 18.7.2, o default do parent `ZCODE_CI_TMPDIR="$CI_PROJECT_DIR/.tmp"` era encaminhado pelo trigger e virava `/.tmp`, e o primeiro setup do child falhava com `mkdir: /.tmp: Read-only file system`; a causa raiz foi corrigida com `build:preview.inherit.variables=false`, sem modificar o DAG compartilhado de build/sign/notarize.
- Gate manual restante: repetir `build:preview` em um MR real, confirmando que os paths de temp/cache do child ficam no checkout do runner e que o packaging em todas as plataformas é concluído; instalar os artefatos assinados de macOS/Windows/Linux e validar o ZPREVIEW-013 nos sistemas de destino.

## Backfill da matriz

| Arquivo            | Alteração                                                                            |
| ------------------ | ------------------------------------------------------------------------------------- |
| catálogo de casos  | Este documento serve como catálogo de casos dedicado a release/lifecycle, evitando poluir o catálogo de conversation |
| matriz de cobertura | O `Accepted Cases` deste documento registra o estado planned/missing; após a implementação, atualizar para verified |
| specs de CUA       | Atualizar o allowlist do launcher e o subdiretório de instalação do Helper do Preview |

## Observações de passagem de bastão E2E

- Fixture de Provider: desnecessário; o endpoint de ambiente de teste é coberto pelos testes unitários existentes de `ZCODE_ENV=test`.
- Fixture de sistema de arquivos: appData temporário, `ZCODE_HOME/computer-use[/preview]`.
- Estratégia de timing: config/paths por funções puras em testes unitários; inicialização paralela dos dois apps por smoke manual de artefato assinado.
- Preset Docker: não aplicável.
- Riscos de review: sintaxe do requirement de assinatura no macOS, instalação lado a lado com NSIS no Windows, nome do pacote deb no Linux, Preview com force-update desabilitado.

## Complemento de 2026-09-13: ZCode Preview para o backend de produção (`ZCODE_PREVIEW_IDENTITY`)

### Necessidade

A equipe interna quer um `ZCode Preview` que conecte ao backend de produção e permita login com contas de produção BigModel / Z.ai, sem criar uma terceira identidade de produto.
No design original, `ZCODE_ENV` determinava ao mesmo tempo o ambiente de backend e a identidade do instalador, de modo que o Preview com `test` só podia fazer login em `bigmodel.cn` / `zcode.z.ai`.

### Decisões

| Item                 | Decisão                                                                                                              | Explicação                                                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Nova variável        | `ZCODE_PREVIEW_IDENTITY=1` (reconhece somente `1`; `0`/vazio = desligado; qualquer outra grafia faz o build falhar) | Interruptor de build; controla **apenas a identidade**, sem tocar no ambiente de backend. A grafia única tem exatamente a mesma semântica da comparação `== "1"` nas regras de CI (estreitado em 2026-09-14, ver abaixo) |
| Semântica de `ZCODE_ENV` | Inalterada, continua indicando apenas o ambiente de backend                              | A exclusão da fronteira original "novo terceiro valor de ambiente" continua válida                                                          |
| Derivação de identidade | `flavor = ZCODE_PREVIEW_IDENTITY verdadeiro \|\| ZCODE_ENV=test ? preview : production`                       | O backend de teste é sempre Preview; o interruptor não consegue transformar um pacote de backend de teste em um `ZCode` oficial |
| Significado da identidade | O conjunto da identidade Preview, não apenas o nome exibido | appId `dev.zcode.app.preview`, nome de app `ZCode Preview`, `userData` do Electron separado, `zcode-preview` no Linux, subdiretório de instalação do Helper `computer-use/preview`, AUMID do Windows |
| Atualização          | A identidade Preview desabilita updater / force-update / menu e entradas de atualização da barra de título nos dois backends | No feed stable há apenas o instalador oficial `ZCode`; instalar no bundle Preview equivaleria a instalar mais uma cópia da versão oficial |
| Sufixo do artefato   | `_TEST` marca somente `ZCODE_ENV=test`; o Preview com backend de produção não tem sufixo | O Preview de produção se distingue pelo productName: `ZCode Preview-<version>-mac-arm64.dmg` vs `ZCode-<version>-mac-arm64.dmg`        |
| Cadeia de publicação  | `ZCODE_PREVIEW_IDENTITY == "1"` é tratado como `ZCODE_ENV == "test"`: todos os jobs de release com `when: never`, e bloqueio rígido em `publish-release.sh` | O Preview com backend de produção continua sendo um pacote interno |
| CUA Helper           | Sem alteração                                                                                                        | O app id continua `dev.zcode.app.preview`, e o allowlist de launcher do Helper já o aceita |

### Constantes de compilação

- `packages/shared/src/env.ts` ganha `ZCodeProductFlavor = "production" | "preview"`, `ZCODE_PRODUCT_FLAVOR` e `normalizeZCodeProductFlavor(value, zcodeEnv)`.
- `tsup.config.ts` / `vite.config.ts` injetam `__ZCODE_PRODUCT_FLAVOR__`; bundles sem define injetado (web, CLI, testes) caem na antiga semântica de eixo único, "seguindo `ZCODE_ENV`".
- O app empacotado **não pode** depender de variáveis de ambiente da máquina: a identidade, assim como o backend, é uma constante de compilação, e o processo principal / renderer apenas leem `ZCODE_PRODUCT_FLAVOR`.

### Locais trocados para julgamento por identidade

| Local                                                                          | Critério anterior           | Critério atual                                                                                       |
| ------------------------------------------------------------------------------ | --------------------------- | --------------------------------------------------------------------------------------------------- |
| `packages/desktop/scripts/desktop-product-identity.mjs`                         | `ZCODE_ENV`                 | `resolveDesktopProductFlavor(env)`; `artifactSuffix` sai do registro de identidade e passa a `resolveDesktopArtifactSuffix(env)` |
| `desktopRuntimeEnv.ts` `isPreviewPackagedRuntime`                               | `ZCODE_ENV === "test"`      | `ZCODE_PRODUCT_FLAVOR === "preview"`                                                                 |
| `index.ts` AUMID / `initAutoUpdater.enabled` / gate de force-update             | `ZCODE_ENV`                 | `ZCODE_PRODUCT_FLAVOR` (`resolveWindowsAppUserModelIdForFlavor`)                                    |
| `desktopApplicationMenu.ts` item de menu "verificar atualizações"               | `ZCODE_ENV === "production"` | `ZCODE_PRODUCT_FLAVOR === "production"`; o submenu de troca de endpoint continua olhando `ZCODE_ENV` |
| `packages/ui/.../WindowsCaptionMenuButton.tsx` `shouldShowDesktopUpdateEntry`   | `ZCodeEnv`                  | `ZCodeProductFlavor`                                                                                  |
| `scripts/notarize-macos.sh` `is_preview_package` / `is_strict_release`          | `ZCODE_ENV=test`            | Somar `ZCODE_PREVIEW_IDENTITY`; o Preview nunca entra em strict release                              |
| `scripts/sign-macos-runtime-binaries.sh` fail-closed                           | `ZCODE_ENV=test`            | `is_preview_package`                                                                                  |
| `scripts/doctor-macos-release-app.sh` variante padrão do Helper                 | `ZCODE_ENV=test`            | Somar `ZCODE_PREVIEW_IDENTITY`                                                                        |
| `scripts/upload-oss.sh` / `scripts/package-cua-helper-release.mjs` `is_strict_release` | `ZCODE_ENV != test`   | Excluir também a identidade Preview                                                                   |
| `scripts/publish-release.sh`                                                    | Rejeita `ZCODE_ENV=test`    | Rejeitar também quando `ZCODE_PREVIEW_IDENTITY` for verdadeiro                                       |
| `scripts/notify-feishu.mjs`                                                    | Título com apenas o ambiente | Em `production` com o interruptor de identidade, acrescentar `· ZCode Preview`; os demais títulos inalterados |

Mantidos por julgamento de ambiente de backend, sem alteração: toda a resolução de endpoints em `zcodeEndpoint.ts`, a configuração do provider de OAuth, os source headers, `resolveZCodeEndpointSelection`, o ramo de test remote assets do `30-build.yml`, a confirmação de saída e o menu de endpoint.

### Entradas de CI

| Entrada                                                          | Variáveis                                                                                                    | Diretório de artefatos                |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Novo job manual `build:preview:production` na fase `approve-mr` do MR | Encaminha `ZCODE_PREVIEW_PIPELINE=1`, `ZCODE_PREVIEW_IDENTITY=1`, `ZCODE_ENV=production`, `TARGET_OUTPUT_DIR` | `@electron-preview/<source-branch>/`, reutilizando `preview-child.yml` |
| Pipeline manual (web / api / trigger) passando `ZCODE_PREVIEW_IDENTITY=1` | `ZCODE_ENV` vazio ou `production`                                                                | `@electron-preview/<ref>/`            |
| Pipeline de MR com `ZCODE_PREVIEW_IDENTITY=1` (criado via API)   | Igual ao anterior                                                                                            | `@electron-preview/<source-branch>/`  |

- `.ci:resolve-zcode-env` (bash + PowerShell) reduz o interruptor a `1` / não definido, e qualquer outra grafia falha.
- Regras do child workflow: a condição de regra de identidade é escrita como `$ZCODE_PREVIEW_IDENTITY == "1" && $ZCODE_PREVIEW_PIPELINE == "1" && $CI_PIPELINE_SOURCE == "parent_pipeline"`, posicionada antes das regras de child de teste; as regras de teste originais permanecem.
- Pipelines de tag / `ci/*` não reconhecem o interruptor; mesmo se injetado pela API, os 7 jobs de publicação de `50-release.yml` ficam com `when: never`.

### Novos casos

| Case ID    | Setup                                                                              | Asserção                                                              | Evidência                                                                                                                  | Status    |
| ---------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------- |
| ZPREVIEW-020 | `ZCODE_ENV=production ZCODE_PREVIEW_IDENTITY=1`                                | O electron-builder resolve como identidade Preview, sem sufixo `_TEST`  | `desktopProductIdentity.test.ts`, carregamento real de `electron-builder.config.js` com quatro combinações | verificado |
| ZPREVIEW-021 | `ZCODE_ENV=test ZCODE_PREVIEW_IDENTITY=0`                                     | Continua sendo Preview; o interruptor não gera um `ZCode` oficial de backend de teste | `desktopProductIdentity.test.ts`                                                                              | verificado |
| ZPREVIEW-022 | renderer / shared com `__ZCODE_PRODUCT_FLAVOR__=preview` + `__ZCODE_ENV__=production` | `ZCODE_ENV=production`, `ZCODE_PRODUCT_FLAVOR=preview`; entrada de atualização oculta | `shared/test/env.test.ts`, `viteRendererConfig.test.ts`, `windowsCaptionMenuButton.test.ts`                | verificado |
| ZPREVIEW-023 | Preview com backend de produção sem credenciais da Apple                     | notarize fail-closed, procurando `*mac-arm64.dmg` (sem `_TEST`)         | `notarizeMacosScript.test.ts`                                                                                 | verificado |
| ZPREVIEW-024 | `publish-release.sh` recebe `ZCODE_PREVIEW_IDENTITY=1`                        | Sai com 1 e não lê segredos                                            | `publishReleaseScript.test.ts`                                                                                 | verificado |
| ZPREVIEW-025 | Configuração de CI                                                               | `build:preview:production` existe e é opcional; as três regras de identidade escrevem no diretório Preview e levam variáveis de assinatura; os 7 gates de release têm condição de identidade | `ciNodeVersionConfig.test.ts`                            | verificado |
| ZPREVIEW-026 | Preview com backend de produção instalado lado a lado com o `ZCode` oficial, login com conta BigModel de produção e sem verificação de atualização | Os dois processos coexistem, o login funciona e o log não tem requisições `[auto-update]` | smoke manual de artefato assinado                        | ausente   |

### Verificação

- `pnpm typecheck`: passou.
- `oxlint` nos arquivos alterados: 0 erros. Dos arquivos alterados, 6 já não eram formatter-clean no HEAD, e apenas as linhas novas foram formatadas.
- `vitest`: `packages/desktop/test`, `packages/shared/test` e `packages/ui/test` na íntegra, 1296 arquivos, incluindo `desktopProductIdentity`, `ciNodeVersionConfig`, `notarizeMacosScript`, `publishReleaseScript`, `notifyFeishuScript`, `viteRendererConfig`, `tsupChunkIsolation`, `desktopRuntimeEnv`, `desktopApplicationMenu`, `shared/env` e `ui/windowsCaptionMenuButton`; a única falha foi `desktopApplicationMenu.test.ts`, cujo mock manual de `@zcode/shared` não tinha a nova exportação `ZCODE_PRODUCT_FLAVOR` — passou depois de adicionar o getter (`dev-cua-plugin-runtime.test.ts`, no novo worktree, exige antes a árvore de pacotes do zcode-cli, sem relação com esta alteração, e passou após o build).
- `scripts/ci/ci-lint-pipeline.mjs`: OK; o YAML alterado é parseável.
- Não executado: clicar em `build:preview:production` na CI real, e o smoke manual do artefato assinado do ZPREVIEW-026.

## Complemento de 2026-09-14: correções de review — entradas de atualização esquecidas e conjunto de valores verdadeiros do interruptor

Depois do merge do MR !2636, o bug scanner apontou dois pontos, ambos válidos, corrigidos nesta rodada:

### CR-01 Tray e entrada por comando ainda liberavam a verificação de atualização com base em `ZCODE_ENV`

- Local esquecido: o item de menu "verificar atualizações" do tray em `desktopTray.ts`, e o ramo `DesktopCommandIds.CheckForUpdates` de `desktopCommandHandlers.ts`. Com o Preview de backend de produção, ambos chamavam `checkForUpdateMenuClick`, e `initAutoUpdater({ enabled: false })` apenas limpa o polling e retorna, deixando a instância do electron-updater sem configurar (feed placeholder `http://localhost:8081`, `autoDownload` não definido como false); a verificação manual fazia uma requisição real ao feed placeholder.
- Correção: o critério dos dois locais passou a ser `ZCODE_PRODUCT_FLAVOR === "production"`; e em `autoUpdater.ts` foi adicionado `autoUpdaterDisabledForProductFlavor` no escopo do módulo, definido por `initAutoUpdater({ enabled: false })`, e `checkForUpdateMenuClick` verifica esse bit depois do gate de build — ao casar, retorna `dev-skipped` e registra `[auto-update] skip manual check: updater disabled for this product flavor`, sem tocar na instância do updater. A semântica de desabilitado passou de "cada entrada decidindo por si" para "fail-closed dentro do módulo".
- Critérios `ZCODE_ENV` não alterados (todos de semântica de backend, mantidos): `setZCodeEndpointOverride`, o submenu de endpoint, `resolveZCodeEndpointSelection`, a confirmação de saída, remote assets e os ramos e2e de logger/telemetry.

### CR-02 O conjunto de valores verdadeiros do interruptor era inconsistente entre a camada YAML e a camada de scripts

- Problema: as três regras de roteamento de identidade do workflow e os sete gates de publicação de `50-release.yml` fazem uma comparação exata `$ZCODE_PREVIEW_IDENTITY == "1"`, enquanto `resolve_zcode_env`, o resolvedor de identidade e todos os scripts aceitam `1/true/yes/on`. Com `ZCODE_PREVIEW_IDENTITY=true`, o roteamento deixa de casar (cai em `@electron/dev/…` e os gates de publicação não disparam), mas a camada de script trata isso como ligado e produz um pacote de identidade Preview dentro do diretório de aceitação de produção.
- Decisão: **estreitar para uma única grafia, `1`** (`0`/vazio = desligado), sem afrouxar com regex no YAML. Razão: um valor precisa de apenas um tipo de comparação em YAML, bash, PowerShell e Node; manter a comparação exata na camada de regras do GitLab é o menos propenso a erros.
- Locais corrigidos: `resolve_zcode_env` (bash + PowerShell) aceita apenas `1` / `0` / vazio, e qualquer outro valor falha; o `isPreviewIdentityRequested` de `desktop-product-identity.mjs` faz `throw` direto para outros valores (tsup / vite / electron-builder falham de forma fechada no build, e um `ZCODE_PREVIEW_IDENTITY=true pnpm bundle:desktop` local não produz silenciosamente um pacote oficial); os cinco scripts shell, `publish-release.sh`, `package-cua-helper-release.mjs` e `notify-feishu.mjs` passam a reconhecer apenas `1`; a coluna de valores verdadeiros da tabela de decisões acima foi atualizada.
- As regras YAML e os gates de publicação permanecem inalterados (`== "1"` já era a semântica desejada).

### Novos casos

| Case ID    | Setup                                                                     | Asserção                                                                        | Evidência                     | Status    |
| ---------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------- | --------- |
| ZPREVIEW-027 | Chamar `checkForUpdateMenuClick` após `initAutoUpdater({ enabled: false })` | Não chama `checkForUpdates` / `setFeedURL`, envia `dev-skipped` ao renderer e registra o log de desabilitado | `autoUpdaterReadyState.test.ts` | verificado |
| ZPREVIEW-028 | `ZCODE_PREVIEW_IDENTITY` assumindo `true/yes/on/false/no/off/2`          | O resolvedor de identidade lança `expected 1 or 0`                             | `desktopProductIdentity.test.ts` | verificado |
| ZPREVIEW-029 | Configuração de CI                                                         | As duas implementações de `resolve_zcode_env` não contêm lista de valores `true/yes/on` | `ciNodeVersionConfig.test.ts` | verificado |
| ZPREVIEW-030 | Preview com backend de produção empacotado clicando em "verificar atualizações" no tray | A entrada não existe                              | O módulo do tray não tem testes unitários; será coberto junto com o smoke manual do ZPREVIEW-026 | ausente |

### Verificação

- `pnpm typecheck`: passou. `oxlint` nos arquivos alterados: 0 erros; apenas as linhas novas foram formatadas (incluindo a longa linha de chamada de `notify-feishu.mjs` remanescente da rodada anterior).
- `vitest`: `autoUpdaterReadyState`, `desktopProductIdentity`, `ciNodeVersionConfig`, `desktopCommandHandlers`, `desktopApplicationMenu`, `desktopMainIpcPlatform`, `notifyFeishuScript`, `publishReleaseScript`, `notarizeMacosScript`, `runtime-asset-scripts`, `uploadOssScript`, `macosReleaseAppDoctor`, `viteRendererConfig`, `tsupChunkIsolation` e `electronBuilderLinuxPackageTargets` — 15 arquivos, 263 casos aprovados.