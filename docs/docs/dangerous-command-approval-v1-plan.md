# Modo de permissão Guarded V1

## Suplemento de exclusão em massa (2026-09-24)

Apenas estende a camada de reconhecimento, sem refatorar o núcleo de aprovação: `rm` recursivo ou explicitamente em massa, CMD `rd`/`rmdir /s`, CMD `del`/`erase`, `find -delete`, Git clean com force efetivo, Robocopy do Windows `/MIR` ou `/PURGE`. O recursivo e o em massa de `rm` compartilham o ruleId original; os demais IDs novos estão no catálogo abaixo.

- `rm` não exige mais force; confirma com pelo menos dois alvos ou glob não referenciado/não escapado. Não verifica existência de arquivo, duplicatas nem quantidade de expansão do glob. Um único arquivo comum, um único alvo puramente dinâmico ou um glob literal referenciado/escapado não adicionam confirmação; `rm -- -r` não casa, `rm -- -r -f` casa por ter dois alvos. Opções de ajuda/interação não cancelam evidências de perigo conhecidas.
- As opções CMD não diferenciam maiúsculas/minúsculas; `rd`/`rmdir` exigem `/s`, `del`/`erase` confirmam se houver alvo; ausência de alvo e a consulta isolada `/?` não casam, `/p` não substitui uma aprovação única. O `rmdir` de diretório vazio em POSIX/Git Bash não entra.
- `find` apenas em POSIX/Git Bash: pula predicados e argumentos de saída conforme a aridade declarada; cargas de `-exec/-execdir/-ok/-okdir` são apenas puladas, sem correspondência recursiva; aridade desconhecida interrompe a análise, preservando os acertos confiáveis de `-delete` anteriores, sem inferir se a expressão realmente casa.
- Robocopy apenas em CMD/Git Bash: listagens `/L` localizadas com confiabilidade não confirmam; arquivos `/JOB` não são expandidos, argumentos desconhecidos não podem gerar isenção de listagem. A suspensão cancelamento de Git clean precisa ter a condição de `-d` ou pathspec, preservando a ordem original de ajuda, dry-run e cancelamento.
- O fato por palavra ganha internamente `hasUnquotedGlob`, preservando a semântica original de dinâmico/posição; o dialeto chega ao despacho de regras, sem interpretar caminhos POSIX ou `rmdir` como CMD.

- Ainda se excluem PowerShell, expansão de brace/variável/substituição de comando, scripts, configuração implícita, rimraf/shred/truncate, exclusão remota e rollback local do Git; wrapper continua somente env/time/sudo, sem extensão de xargs/find-exec/npx. Não-casado/unsupported segue a política original e não significa seguro.

Atribuição de argumentos — regressão: `rd/s/q target`, `rd target/s/q` e `del/q file` do CMD são reconhecidos como opções coladas de comando embutido; barras em caminhos entre aspas e alvos de redirecionamento não são divididas em opções. O Robocopy do Git Bash reconhece caminhos estáticos de letra de unidade `/c/...`, sem com isso afrouxar a contagem de argumentos de opções desconhecidas ou de `/JOB`. `rm` preserva a varredura de opções perigosas estilo GNU; a contagem em massa também cobre a semântica BSD em que, após o primeiro alvo, `--help` etc. são tratados como nome de arquivo; não sonda plataforma ou sistema de arquivos — quando existe uma interpretação de exclusão em massa, confirma.

Confirmação de escopo seguinte: o `-d/-x` já declarado do BSD find é consumido como opção de pré-requisito com zero argumentos; `find -d . -type f -delete` e `find -x . -type f -delete` devem casar. O argumento de filtro de arquivo glob nu do Robocopy não é complementado por enquanto: por exemplo, `robocopy src dst *.txt /MIR` no Git Bash ainda pode retornar unsupported e executar pela política base YOLO; é uma limitação de cobertura conhecida e não significa que o comando seja seguro.

Cadeia inalterada: matcher → Bash ToolEntry.userApprovalRule → PermissionService → executor/broker → aprovação/rejeição única → resultado original da ferramenta. UI, modos/Plan, subtarefas, automação, persistência e protocolo sem mudanças.

Aceitação correspondente a DCA-V1-19..25: sete classes de exemplos positivos e negativos com rejeição/aprovação de Guarded e execução controlada de YOLO; Hook allow não aprova por procuração, cancelamento não executa, gravação de regras do projeto zero, limpeza de pending. Toda verificação de semântica nativa é feita em diretórios temporários próprios; Windows CMD/Git Bash e a UI de desktop têm evidências separadas. Os novos casos de Desktop permanecem em manual-review/pending e só são promovidos após revisão humana; passagens históricas não servem como evidência desta rodada.

Evidências de execução desta rodada (2026-09-24):

- Testes de reconhecimento primeiro vermelhos: na implementação original, 24 de 35 falhavam; após as três correções de atribuição de argumentos desta rodada, 14 de 58 falhavam, e ficaram verdes após as correções. Seleção final: core 14 suites / 512 tests e bootstrap 8 suites / 52 tests passando. As sete classes e as regressões de aprovação/rejeciação desta rodada passaram por pending/resolve de um broker real em memória, verificando que aprovação tardia é inválida, handler 0/1 vez e gravação de regras do projeto zero; o controle YOLO não adiciona requisições.
- `node apps/zcode-cli/packages/core/tests/fixtures/guarded-deletion-oracle.mjs`: 12 itens passam no Bash do macOS (incluindo as quatro formas de nome de arquivo com opções de cauda do BSD rm); o mesmo script foi executado via SSH na máquina de testes Windows (exemplo de conexão: `dev@192.0.2.10`) para validação CMD/Git Bash, 24 itens passaram, e os diretórios temporários foram limpos. Os comandos reais das 6 regressões Windows desta rodada também foram enviados ao matcher para conferência: as opções coladas do CMD e os caminhos de letra de unidade absolutos do Robocopy no Git Bash casam, `/L` não casa. Não se passa por E2E de Desktop no Windows. Os valores com dois-pontos do Robocopy, as listas XF/XD e a semântica de L foram conferidas simultaneamente contra a [documentação da Microsoft](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/robocopy) e o resultado do comando nativo.
- Pending de Desktop 5/5 e Guarded formal 16/16 passaram, relatório `desktop-e2e-20260924091043202-p16067-b339773b57c600dd`. O caso de Hook dessa execução conjunta liga automaticamente a gravação de tela para revisão manual por causa do pending e, no encerramento, reporta `spawn ffmpeg ENOENT`, portanto não pode ser registrado como aprovação da rodada inteira; sem mexer no código, a reprodução oficial isolada do Hook passou 1/1, relatório `desktop-e2e-20260924091351270-p21173-3b35333ac8b83c4d`. A nova verificação de fixture case-local passou, sem promoção.
- typecheck da raiz, lint (213 warnings / 0 errors), typecheck de E2E/core, lint dos arquivos de produção alterados e a verificação de arquitetura passaram. Todos os scripts de lint do CLI não puderam rodar direto por falta do turbo; desta vez `pnpm --dir apps/zcode-cli -r typecheck` passou em todos os pacotes, o bloqueio de tipos do bootstrap não reapareceu e nenhuma dependência foi modificada. O lint recursivo do CLI e o lint do core ainda falham por max-lines em arquivos não modificados. A auditoria de cobertura continua bloqueada pela inconsistência de metadados do ledger de fixtures do Highspeed, não modificado; as 4 arestas pendentes do mapa funcional são iguais ao HEAD, e o mapa não é alterado nesta rodada.
- Correção dirigida posterior de `find`: as três novas regressões (`-d`, `-x`, `-d -x`) falharam primeiro; após a correção, os três conjuntos matcher/command/approval somaram 364 casos passando, cobrindo argumentos de predicado, carga de exec, aridade desconhecida, aprovação/rejeição/cancelamento de Guarded e o controle YOLO. Oracle nativo no macOS 15/15, com três comandos reais de find conferidos em par com o matcher; glob nu do Robocopy continua unsupported. A verificação completa de tipos da raiz e por pacote do CLI, o lint da raiz, o lint dos arquivos modificados do CLI e a verificação de arquitetura passaram; o lint completo do CLI continua bloqueado pelo max-lines existente. Nada de aprovação/UI é alterado nesta rodada; Desktop E2E e testes nativos do Windows não são reexecutados e suas evidências históricas não são atualizadas.

Esta rodada não corrige os problemas de baseline acima, fora do escopo. O gate completo não passou; não se declara pronto para produção e não há commit/push automático; os novos E2E aguardam revisão humana, e a execução nativa em Linux e a UI de Desktop/mobile no Windows não foram executadas. Estado e núcleo de aprovação não modificados.

## Texto de interface (2026-09-23)

O nome de interface de `guarded` é "自主模式 / Autonomous mode", com a descrição de uma linha abaixo sendo "在有风险时询问 / Ask when there's risk". O Composer de Desktop/mobile e Automation/OffPeak compartilham as traduções em chinês/inglês e o catálogo de modos; os valores internos de modo, comandos de CLI, semântica de permissão, valores padrão e salvar/restaurar permanecem inalterados, continuando com azul-claro e o ícone Edit. A aceitação cobre os nomes em chinês e inglês, a descrição de uma linha e a invariância dos valores de modo.

## Correção da dependência de gravação de tela do E2E de aprovação (2026-09-17)

Depois de promovido, o caso de Hook reproduz por padrão um defeito já reproduzido: após as asserções de negócio, o fechamento forçado da gravação falha com `spawn ffmpeg ENOENT` (relatório de falha (relatório local `desktop-e2e-20260917-105436-295`)). A gravação é evidência para revisão manual, não pré-requisito da funcionalidade de aprovação; ela só é habilitada quando já existe `ZCODE_E2E_MANUAL_REVIEW=1`, junto das duas pausas de leitura de 3 segundos, e o codificador continua usando `ZCODE_E2E_FFMPEG_PATH` / PATH. A reprodução padrão mantém capturas de tela, trilhas de interação e todas as asserções de negócio, não cria gravação nem marca vídeo gerado. Falha na gravação manual continua reportando erro, sem captura engolida.

Verificação: reprodução padrão sem ffmpeg configurado 1/1 (relatório local `desktop-e2e-20260917-110126-662`) passou, com artefato `video_capture_mode=null` e sem vídeo; reprodução com gravação manual explícita 1/1 (relatório local `desktop-e2e-20260917-110306-504`) passou, com artefato marcado `electron_capture_page` e vídeo não vazio. Ambos os caminhos preservam todas as asserções de aprovação e de provider result. typecheck de E2E/raiz, lint (195 warnings / 0 errors), verificação de fixtures, arquitetura e auditoria de cobertura passaram; nenhum código de produção ou fixture de provider foi alterado.

## Distinção visual do Guarded (2026-09-17)

Apenas ajuste de apresentação: o gatilho do Guarded usa o `icon-blue` azul-claro já existente (incluindo hover/estado expandido), o ícone reutiliza o `ShieldCheckIcon` do Edit, e o item de menu usa o mesmo ícone. O Edit antigo, hoje com cor de primeiro plano padrão no componente compartilhado, não é modificado; o YOLO mantém o laranja `warning` e o `ShieldAlertIcon`. Nome, candidatos, valor padrão, semântica de permissão e persistência inalterados.

O único ponto alterado é o `ConfigSelect` compartilhado, que cobre Composer de Desktop/mobile, Automation e formulários de OffPeak; reutiliza tokens de tema, sem novas variáveis CSS ou branches por lado. Seguindo DCA-V1-13, primeiro vêm as regressões de componente e as asserções de ícone/cor do E2E de Guarded já existente, e só então o mapeamento de exibição; nenhuma fixture de provider nova.

Verificação: novas asserções de componente em chinês e inglês ficaram vermelhas e depois verdes, com 4 suites / 70 tests relacionados passando; Desktop E2E 16/16 (relatório local `desktop-e2e-20260917-104756-745`) validou o ícone do menu, as cores computadas reais dos gatilhos Guarded/YOLO e o ciclo de aprovação original. typecheck de E2E/raiz, lint (195 warnings / 0 errors) e verificação de arquitetura passaram. O mobile não foi reverificado em aparelho real, usando os mesmos componentes compartilhados e tokens de tema.

## Escopo de promoção de E2E (2026-09-17)

O usuário confirmou a promoção de `conversation-session-guarded` (16 casos) e `conversation-session-permission-hook-rewrite` (1 caso). Mantêm-se o helper V4 existente, os fixtures case-local e todas as asserções de contagem de execução, regras de permissão, respostas tardias e provider tool_result; apenas o caminho formal e suas referências relativas são migrados, sem alterar o comportamento de produção.

A promoção usa a pré-visualização de `e2e:promote --reviewed` e um apply transacional; falha na auditoria precisa reverter. Para eliminar o bloqueio de documentação de baseline já confirmado, apenas completa-se o registro de abreviações automatizadas de D19/I74/I75, sincroniza-se as estatísticas e regeneram-se os documentos de auditoria desatualizados; não muda o estado de cobertura desses outros casos nem se afrouxa as regras de auditoria. Casos formais devem passar na verificação de fixtures, replay common + case-local, replay padrão, verificação de tipos, lint e verificação de arquitetura.

Desta vez só se promove o ciclo de desktop já existente; não se marca todo o contrato DCA-V1 como concluído: recuperação em celular real, ciclo do scheduler sem supervisão etc. continuam dependendo de decisão do usuário antes do lançamento. A admissão da suíte Docker está fora do escopo desta rodada; migrar o diretório de testes não equivale à aceitação de Desktop Windows ou celular.

Aceitação real desta vez (macOS, caminho formal): replay independente common + case-local do Guarded 16/16 (relatório local `desktop-e2e-20260917-103040-969`) e reescrita do Hook 1/1 (relatório local `desktop-e2e-20260917-103358-154`) passaram; o replay padrão conjunto das duas specs 17/17 (relatório local `desktop-e2e-20260917-103558-120`) passou, sem flaky/skip/falha de infra. A gravação usou o `ZCODE_E2E_FFMPEG_PATH` já existente apontando para um ffmpeg funcional da máquina, sem alterar o helper de gravação.

As duas verificações de fixtures, o typecheck de Desktop E2E/raiz, o lint (195 warnings / 0 errors) e a verificação de arquitetura (0 violations) e a verificação de diff passaram. A auditoria global de cobertura agora está em 101 formal admitted / 0 rejected, 0 contract gaps, 0 stale generated docs; os demais casos pending do baseline não foram promovidos. Comparação literal confirma que os testes só mudaram caminhos relativos de helper/fixture, todas as asserções e fixtures de provider permanecem idênticas; o warning existente de saída `E2E_GUARDED_PARENT_DONE` da verificação de fixture do Guarded foi mantido.

## Feature Summary / registro de esclarecimentos

Em 2026-09-15, substituição dirigida conforme os novos limites confirmados, com baseline no 65e60809b7 já mergeado em staging. O workspace completo antes da substituição (incluindo untracked) foi salvo em backup como stash d4e1e36e29ebc6044600bf5bd81f70bf0f6ca7ae. Sem reset integral, sem restaurar a implementação antiga, sem commit ou push automático. Os registros de execução de 09-10/11 abaixo são apenas evidência histórica e não valem como aceitação desta vez.

Novo `guarded` (confirmação de comandos perigosos), habilitado por escolha explícita. O usuário confirmou as nove regras, a herança por subtarefas e a exclusão de PowerShell; sem pendências de produto. `guarded` = política base YOLO + aprovação única do usuário para comandos perigosos explicitamente identificados; `yolo/build/edit/plan/auto` originais mantêm o comportamento anterior, e `auto` continua não implementado. Sem alterar padrões, sem migrar tarefas/automações/configurações existentes, sem novos booleanos de proteção nem migração de banco. Não é um classificador completo de Auto Mode e não promete segurança para sintaxe desconhecida.

### Compatibilidade com o merge de staging (2026-09-18)

- Mantém estado de Plan independente: `guarded + planEnabled=true` continua sujeito às restrições de Plan; entrar/sair do Plan mantém a permissão guarded e não restaura a antiga troca de estado `mode=plan`.
- A aprovação comum mantém a pré-visualização de ferramenta do staging, a autorização de sessão e o Full access; a restrição `user-once` para pedidos perigosos tem prioridade, não oferece nem aceita autorização permanente de projeto/sessão nem Full access, e não é liberada por `prepareApproval.proceed`.
- O `alwaysAsk`, a pré-visualização e a autorização de sessão das novas ferramentas de workflow seguem o comportamento do staging; os antigos comandos de workflow de CLI removidos não voltam. Subtarefas comuns continuam repassando o mesmo sinal de registro do broker e o origin mais interno.
- O menu de modos mantém a marcação de Plan independente e a semântica de rascunho; a lista de permissões continua substituindo Edit por Guarded; o histórico `edit` pode ser reexibido, e Guarded mantém o azul e o ícone Edit.

```text
submissão {mode: guarded, planEnabled} → único estado de execução do Runtime
  → Plan ligado: decisão de permissão pelo Plan existente
  → Plan desligado: perigo identificado → user-once → broker registrado → aprovação/rejeição única
                        pedidos comuns → pré-visualização de ferramenta existente / Hook / Full access
```

Verificação de merge: typecheck da raiz, typecheck de todos os pacotes do CLI, lint da raiz (206 warnings / 0 errors), verificação de arquitetura, auditoria de cobertura e typecheck de E2E passaram. core na primeira rodada 13 suites / 241 tests, mais 2 suites / 213 tests de aprovação Guarded e regressões do matcher (há interseção, não se soma); bootstrap 7 suites / 37 tests e 2 suites / 9 tests de compartilhado/UI passaram. Desktop E2E 17/17 passou, relatório `desktop-e2e-20260917-165215-454`, sem flaky/falha de infra. Recuperação em Windows/celular real e scheduler sem supervisão não foram reexecutados.

O lint de todos os pacotes do CLI ainda falha por erro de `max-lines` já existente no staging: browser-control, session-store, workflow, event-reducer e model de contracts, e analyzer/App de debug. Os seis primeiros arquivos não-reducer são idênticos ao staging; event-reducer só ganhou o campo de aprovação única e o próprio staging já excedia o limite; módulos sem relação não são divididos neste merge, e este commit não declara lint completo do CLI passando.

Verificação secundária: comparando os dois pais do merge e AUTO_MERGE, a revisão independente não achou regressão introduzida pelo merge. Execução adicional de 51 suites / 723 tests tudo passando, cobrindo Plan independente, salvamento de modo e fila, aprovação/autorização de sessão de workflow, corrida e projeção de Full access, permissões de Memory/CUA, executor de ferramentas, as nove regras do Guarded e subtarefas/perguntas. typecheck da raiz, lint (206 warnings / 0 errors) e verificação de arquitetura passaram novamente; nenhuma lógica de produção foi alterada nesta rodada, e o Desktop E2E usa a evidência 17/17 pós-merge acima, mantendo inalterados os limites de Windows/celular real/scheduler não reexecutados.

Camadas alteradas: validation, option-source, commit-effect, passagem de padrão em persistence/recovery.

### Branch de compatibilidade de reversão de versão e lista de impactos (2026-09-16)

O usuário confirmou a distribuição de Desktop e dentro do pacote CLI, não tratando divergência de versão como cenário suportado deste recurso. Primeiro reverte-se o branch em que o Host reenvia `switchCollaborationMode` após um `createSession` Guarded vazio bem-sucedido; em seguida, conforme pedido do usuário, reverte-se o preenchimento de `firstInput.mode` e o teste de simulação com schema antigo. O Host retoma a lógica de encaminhamento original de criação, preservando a injeção existente de flag de OffPeak; não se adiciona outra camada de CAS/retry para uma exigência já excluída.

- **Feature Summary**: `validation / commit-effect`; reversão parcial, e as outras alterações não commitadas passam apenas por auditoria de impacto. As nove regras do matcher, o núcleo de aprovação compartilhado, os padrões e o menu de modos ficam inalterados.
- **UI Surface Matrix / State Owners**: o rascunho do Composer de Desktop/celular continua sendo mantido pela UI, `agentConversationTransport -> sendConversationCommandV4 -> CommandInbox -> createSession` compartilha o encaminhamento do Host, e CLI/runtime possui session/mode; após o ACK de sessão vazia, o chamador original continua com sendText/comando. `config.mode` e `firstInput.mode` passam como estão, e o registro de automação não é reescrito.
- **Shared And Divergent Behavior / Invariants**: a criação de Guarded vazio não envia requisições extras, e o Host não completa `firstInput.mode`; preservam-se `config.mode`, o schema estrito de Submission, o bloqueio por falha real na aplicação da configuração, desktop continuous/mobile replayable, o isolamento por workspaceIdentity e o ciclo de vida de permissões existente. Nenhum estado, configuração, protocolo ou persistência novo.

```text
createSession(config.mode) Guarded vazio -> CLI aplica a configuração -> retorna o ACK original -> o chamador original submete a entrada
```

| Feature Relationships / rank | fato de código e tratamento |
| --- | --- |
| must-inspect: reenvio de modo do Host após a criação | `zcodeAgentService.ts::sendConversationCommandV4`: reverte-se a requisição extra; o teste de serviço afirma que apenas um createSession é enviado |
| must-inspect: preenchimento de modo do firstInput pelo Host | revertido; mode ausente não é injetado, mode explícito do chamador não é sobrescrito, e a resolução de modo continua a cargo do caminho original de criação/Submission da CLI |
| evidence-only: simulação de schema antigo | os stubs de teste `oldModeSchema` e o caso de rejeição de versão antiga foram removidos; mantém-se a regressão de criação normal enviando apenas uma vez e repassando o payload intacto |
| should-inspect: bloqueio por falha de aplicação de configuração na CLI | `session-mgmt.ts::createSession` impede continuar após falha de configuração; é tratamento de falha real, não detecção de versão, portanto permanece |
| invariant-only: modo estrito e recuperação de valor antigo | enum de mode, salvar/restaurar, histórico edit/full-auto e contratos broker registered/approvalMode não são detecção de versão de Desktop/CLI, portanto permanecem |

**Codegraph Evidence**: não há ferramenta de codegraph no momento, rastreia-se em duas camadas por diff (incluindo untracked) e pontos de chamada diretos; os seeds principais são as duas funções do Host acima, o branch de criação de SessionPane e createSession/applyRequestedSessionConfig da CLI. O teste de serviço verifica a contagem de comandos, e o E2E de pending do Guarded existente verifica escolha/aprovação do usuário/provider result; não se pode alegar que ele força a cobertura do branch de anexo sem warm-up.
**Graph Drift Candidates / Graph Delta**: os nós existentes de modo Guarded e as invariantes de aprovação no mapa não dependem de detecção de versão, então não há nós ou arestas a mudar; a aceitação de binário de runtime antigo é removida dos requisitos atuais deste recurso, e os registros de execução históricos são mantidos, mas não como requisito vigente.
**Unresolved Questions**: não restam pendências nesta reversão de compatibilidade de versão; não se expande para tratamento de falha de configuração, política de permissão ou compatibilidade de dados históricos.

Verificação desta vez: ambas as reversões primeiro mudaram as asserções do serviço, reproduzindo separadamente a falha de reenvio de switchCollaborationMode e de preenchimento de firstInput.mode, e só então removeram os branches correspondentes; os arquivos de produção do Host agora são idênticos ao HEAD. 58 testes nos grupos services/shared/Composer passaram. typecheck da raiz, lint (43 warnings / 0 errors), architecture check (0 violations), verificação de formatação dos dois arquivos de código e diff check passaram. UI/E2E spec inalterados, Desktop E2E não reexecutado; o branch de UI de anexo sem warm-up continua não aceito e não se usa o E2E de rascunho existente para alegar cobertura. Nada commitado ou enviado.

### Substituição no menu e fechamento de compatibilidade (2026-09-15)

O usuário confirmou: Guarded substitui apenas a entrada Edit no menu, não substitui YOLO e não migra sessões/configurações `edit` existentes.
A camada alterada desta vez é option-source, além da restauração da observabilidade existente; não muda a política de permissão, a temporização da aprovação nem os valores padrão.

| entrada/relação | candidatos, exibição e submissão | autoridade única/limite de compatibilidade | prioridade |
| --- | --- | --- | --- |
| Composer de Desktop/celular → catálogo de modos compartilhado | build/guarded/plan/yolo; rascunho submetido com o Submission | o rascunho/valor restaurado de edit original ainda exibe edit e não vira build/guarded pelo filtro do catálogo | must-inspect |
| Formulários Automation/OffPeak → mesmo catálogo de candidatos | novas escolhas não contêm edit; o edit antigo não modificado é salvo como está | cada um registra o seu, sem escrever na conversa atual nem no padrão global | must-inspect |
| Sugestões de TUI /mode, ciclo de atalhos | plan/build/guarded/yolo; só a escolha explícita submete comando de modo | Runtime é a autoridade; /mode edit explícito antigo e --mode edit permanecem compatíveis | should-inspect |
| Normalização de session/config/protocol | o menu opcional não é lista branca de valores restaurados; edit continua aceito | permissões originais, ida e volta do Plan e persistência não migram | invariant-only |
| Aliases full-auto/full_auto | a restauração mapeia para yolo, e guarded mapeia separadamente | não afeta os aliases existentes de outros providers | must-inspect |
| executor → logger | restaura os níveis, event/module/status/reason e campos de correlação trace/tool originais de evaluated/denied/resolved/hook_race_forfeited | o log é observação derivada e não participa da aprovação; inputSummary só tem tipo/nome de chave/tamanho e não registra o corpo da entrada | must-inspect |

```text
catálogo de modos (novas escolhas) -> Composer/formulários/TUI -> caminho de submissão original -> runtime.mode
edit histórico (valor compatível) -------------------------------> política de edit original
ciclo de vida da aprovação ------------------------------------> log estruturado original
```

Dimensões: entrada × nova escolha/edit histórico × guarded/yolo; poda: sem algoritmo de permissão, gramática de Shell, migração de banco ou mudança de recuperação remota, sem acrescentar todas as permutações. Desktop continuous e mobile replayable não mudam estado nem roteamento. A DCA-V1-13 recebe o subcenário accepted: o menu não tem edit e tem guarded/yolo; depois de escolher Guarded, o ciclo de rejeição de comando perigoso existente continua válido; o schema do edit antigo, a projeção de config, a reexibição em Composer/automação e a política de Runtime ficam inalterados; o mapeamento de aliases não deriva nos dois sentidos. A UI do menu reutiliza o E2E de pending existente, sem modificar os casos já promovidos de perguntas por teclado nem adicionar fixture de provider.

A regressão de logs usa executor real e logger capturado, cobrindo allow/ask/deny, broker permitindo/negando, falha de Hook aguardando o broker; afirma campos, níveis, contagens, resumo de entrada sem corpo e handler 0/1 vez.

A ferramenta de mapa de código não está disponível; a verificação é feita pelos pontos de chamada diretos de catálogo/normalização compartilhados, builder de formulários, catálogo da TUI e executor (profundidade 2). O incremento do mapa é o seed do menu de modos e a invariante "ocultar edit não afeta a recuperação"; nenhum owner de estado novo nem questão de produto em aberto. O E2E permanece em manual-review/pending, com evidência anexada após a execução, sem marcar covered antecipadamente.

Verificação de fechamento: 341 testes unitários/de integração relevantes passaram nesta máquina macOS (UI/shared/services 151, core 111, bootstrap 48, adapters 19, CLI 3, TUI 8, mapa Guarded 1), incluindo regressões de contrato de alias, menu e logs que falharam primeiro. Desktop 17/17, 0 flaky/infra: Guarded 16 casos (com nova asserção de menu antes da rejeição de rm) e o caso original de autorização de projeto do Bash passaram, com relatório em summary.md (relatório local `desktop-e2e-20260915132447238-p43341-2120e3d1d2daaee9`). Em logs reais da CLI foram observados o event/module/status restaurados e os campos de correlação trace/request/tool.

typecheck da raiz, typecheck:e2e de Desktop, typecheck de core/tui/cli da CLI, lint (43 warnings/0 errors), architecture check e fixture check passaram; o fixture ainda tem o warning de marcador de saída existente. As asserções de contagem de nós/arestas antigas do grupo inteiro do mapa e a auditoria de cobertura ainda têm estatísticas/documentos gerados com deriva preexistente, e nenhumabaseline sem relação foi alterada nesta rodada. A falha do E2E de perguntas por teclado antigo não foi corrigida/reverificada nesta rodada; itens não aceitos como Windows, recuperação em celular real e scheduler permanecem inalterados. Todas as alterações foram desmarcadas, sem commit/push e sem migração de dados do usuário.

## Catálogo de comandos / decisões de fronteira

| ruleId (prefixo safety.bash.) | acerto explícito |
| --------------------------- | ------------------------------------------------------------------------------- |
| remove-critical-path | rm recursivo, ou pelo menos dois alvos/glob não referenciado e não escapado; sem analisar risco do caminho |
| system-storage | dd, mount, umount, mkfs/mkfs.\*; exceto help/version declarados e listagem de mount sem argumentos |
| git-reset-hard | git reset --hard |
| git-clean-force | force efetivo, exceto dry-run verdadeiro |
| git-push-force | force/force-with-lease/mirror/+refspec efetivos, exceto dry-run verdadeiro |
| git-discard-tree | checkout -f ou checkout/restore com rollback total de ., ./, :/; exceto restore puramente staged |
| git-stash-clear | git stash clear |
| git-worktree-force-remove | git worktree remove -f/--force, incluindo force repetido |
| rsync-delete | delete/del/delete-before/during/delay/after/excluded, exceto dry-run verdadeiro |
| cmd-remove-tree | CMD rd/rmdir /s; exceto ajuda isolada |
| cmd-delete-files | chamada real de exclusão CMD del/erase; exceto ausência de alvo e ajuda isolada |
| find-delete | ação -delete do find em POSIX/Git Bash, sem interpretar cargas de exec |
| robocopy-delete | robocopy /MIR ou /PURGE em CMD/Git Bash, exceto listagens /L localizadas com confiabilidade |

Gramática comum limitada de bash/zsh POSIX; o Git Bash usa a AST do Bash existente; o CMD tem parsing próprio limitado e não empresta as regras de aspas do Bash. Preservam-se palavra a palavra a literalidade, o caráter dinâmico e a posição; extraem-se apenas chamada direta, ordem, AND/OR e pipeline. Strings/comentários/alvos de redirecionamento não são comandos. Alvo dinâmico não apaga um `rm` recursivo + force explícito.

O reconhecimento de comentários REM do CMD precisa excluir alvos de redirecionamento: em `>rem git reset --hard`, `rem` é nome de arquivo e o comando Git seguinte ainda precisa casar; um `rem git reset --hard` real mantém a semântica de comentário. Não se adicionam regras nem se muda a política de unsupported e dos modos antigos.

O primeiro lote de wrappers é apenas env/time/sudo, consumindo opções por uma tabela de aridade declarativa, e precisa incluir `time -o file`. O Git suporta parâmetros de pré-requisito como -C/--git-dir/--work-tree/-c (`-c` apenas pula pelo valor da aridade, sem interpretar o conteúdo da configuração). Aridade desconhecida não é adivinhada; não se expandem scripts, funções, laços, executáveis dinâmicos, substituição de comando, semântica de alias/config do Git, arquivos de pathspec nem cargas do PowerShell. Segue-se o limite de parsing existente de 10000 caracteres.

Resultados matched/notMatched/unsupported: um acerto isolado localizado com confiabilidade tem precedência sobre outros unsupported parciais; estruturas que não podem ser extraídas com confiabilidade não forjam acertos. Não-casado/unsupported mantém a política base YOLO; falha de parsing não adiciona ask e o cancelamento do usuário ainda encerra a execução.

### Contrato de semântica de comandos e isenções (correção de review em 2026-09-15)

A AST do Shell só prova palavras, fronteiras e posição, não prova como o programa chamado interpreta argv. A causa raiz encontrada desta vez foi tratar as opções de cauda `--help/--version` do `rm` como saída de consulta pela varredura genérica de opções; o `rm` nativo do macOS os trata como nomes de arquivo ao encontrar o primeiro caminho. A correção preserva o catálogo de nove itens e o núcleo de aprovação, sem adicionar detecção de plataforma, parsing de executável ou aprovação de sintaxe desconhecida.

- `rm` é uma regra de existência de recursivo + force dentro de uma gramática limitada, sem inferir se o comando realmente apaga; `--help/--version/-i` não cancelam o acerto. Portanto `rm -rf --help` também confirma, uma escolha conservadora do contrato original. `rm --help` sem recursivo + force continua não casando; `-rf` após `--` ainda é apenas um operando.
- O parsing genérico de opções precisa declarar explicitamente `stop-at-operand` ou `interspersed`, sem padrão. Wrappers e parâmetros de pré-requisito do Git param no primeiro operando; a regra de existência do rm, subcomandos do Git e rsync continuam varrendo conforme a gramática declarada. Este é um contrato de reconhecimento e não significa que a implementação do comando seja igual em todos os sistemas operacionais.
- Uma nova isenção precisa declarar a que comando pertence, a posição válida da opção, a aridade, a prioridade de cancelamento e a base de verificação isolada; não se pode derivar todas as implementações do comportamento de ajuda de alguma plataforma. Valores de argumento, operandos após `--` e a mesma palavra em outros comandos não geram isenção.

| regra | condição de eliminação de acerto verificada nesta vez |
| --- | --- |
| rm recursivo + force | sem isenção de opções de consulta/interação; desta vez removidas as isenções de help/version do rm |
| system-storage | apenas `--help/--version` isolado de argumento único e mount sem argumentos; não varre palavras de ajuda em outros argumentos |
| git reset --hard | ajuda do Git, outros modos/patch de reset explícitos; não toma a semântica de varredura do rm |
| git clean force | ajuda do Git, dry-run efetivo; valor do argumento exclude e caminhos após `--` não produzem dry-run |
| git push force | ajuda do Git, dry-run efetivo; force/lease/mirror reduzidos pela respectively opção de cancelamento correspondente |
| git discard tree | ajuda do Git; restore apenas staged; o cancelamento de force no checkout não apaga um alvo de árvore total independente |
| git stash clear | ajuda do Git; stash drop está fora de escopo |
| git worktree force remove | ajuda do Git, no-force efetivo; force repetido ainda casa |
| rsync delete | dry-run/help/version declarados; valores de argumentos como filter/exclude e operandos após `--` não geram isenção |

A verificação tem duas camadas: o core cobre exemplos positivos e negativos desse contrato, posições de argumentos e wrappers; o oracle de `rm` nativo do macOS só valida, dentro de um diretório próprio de mkdtemp, que palavras de ajuda na cauda continuam sendo deletadas. O E2E de pending do desktop muda o exemplo de rejeição de rm para help/version na cauda e afirma que o conteúdo do alvo não muda, que o sentinela de Bash não existe, que há gravação zero de regras de projeto e que o provider recebe a rejeição. Os controles de YOLO original e de aprovação comum de rm são preservados. Aqui não se mistura evidence de oracle com GUI como aceitação completa de todas as implementações de comando; itens como Windows/mobile permanecem inalterados.

### Opções desconhecidas, redirecionamento de cauda e seleção de Shell ausente (correção de review em 2026-09-17)

Esta revisão encontrou três lacunas do tipo "deveria casar, mas recaiu em execução silenciosa por YOLO", todas na camada de reconhecimento, sem alterar o núcleo de aprovação, o catálogo de nove itens, os padrões ou o protocolo.

**A estratégia de varredura de opções é uma declaração bidimensional**: `ordering` (`stop-at-operand` | `interspersed`) × `unknown` (`abort` | `continue`), sem padrão.

- Wrappers (env/time/sudo) e parâmetros de pré-requisito do Git usam `stop-at-operand` + `abort`: a aridade das opções desconhecidas determina em qual palavra o comando real começa e, se não for possível adivinhar, tudo vira `unsupported`. `time --unknown rm -rf build` continua `unsupported`.
- `rm`, `rsync` e subcomandos do Git usam `interspersed` + `continue`: opções desconhecidas apenas marcam `unsupported`, sem consumir a próxima palavra nem entrar nas `flags` já reconhecidas, e a varredura continua. Evidências já reconhecidas como recursive+force / `--delete` / `--force` não se invalidam por haver uma palavra desconhecida depois.
- O chamador converge por "acerto tem precedência": primeiro decide a regra pelas opções já reconhecidas; acerto → `matched`; sem acerto e com desconhecida → `unsupported`; senão `notMatched`. É a materialização, dentro de um único comando, de "no catálogo de comandos, um acerto isolado localizado com confiabilidade tem precedência sobre outros unsupported parciais".
- Direção conservadora: o valor de uma opção de valor desconhecido pode ser tomado como flag independente e, no pior caso, resulta em perguntar uma vez a mais. O risco residual é esse valor ser exatamente uma palavra de cancelamento (como `-n`), o que é aceito e registrado, sem introduzir adivinhação de aridade por causa disso.

A tabela de opções em si só complementa os parâmetros de pré-requisito do Git (`-c <key=val>`, `-p`/`-P`, `--bare`, `--exec-path[=path]` etc.): parâmetros de pré-requisito usam a estratégia abort e, se não forem reconhecidos, tornam o comando inteiro unsupported — é o único ponto que exige ampliar a tabela. As tabelas de rm, rsync e subcomandos do Git permanecem iguais — sob a estratégia continue, opções desconhecidas como em `rm -rfx`, `rsync --delete --info=progress2`, `git push --force --no-verify`, `git checkout -f -t` apenas adicionam uma marca unsupported fora de matched, e `bash.ts` só consome matched, portanto a expansão da tabela tem efeito zero em runtime e não vale a pena aumentar a superfície de manutenção por precisão de rótulo de teste.

**Redirecionamento de cauda no CMD**: `git reset --hard 2>nul` e `git reset --hard > out.txt` ficavam inteiramente `unsupported`. A causa raiz é o fechamento em EOF confundir "a palavra do alvo de redirecionamento ainda não foi flushada" com "falta alvo". Contrato: só falta alvo quando nenhum palavra de alvo começou após o símbolo de redirecionamento (`git reset --hard >` continua `unsupported`); quando a palavra de alvo já começou a acumular, o flush de fechamento a descarta como alvo de redirecionamento e o comando casa normalmente.

**Seleção de shell ausente**: `bashShellSelection` como `undefined` é um estado de infraestrutura, não um limite sintático. Assim como em `isRuntimeReadOnlyBashCommand`, quando ausente a correspondência usa a gramática POSIX; `legacy-shell` explícito continua `unsupported`. Não se introduz detecção de plataforma.

**Exemplos fora de escopo**: prefixos `timeout`/`nohup`/`nice`/`exec`/`command`/`xargs` (fora da whitelist de wrappers) e `format` do CMD. Os `git clean -f/-fx/-fX`, o CMD rd/rmdir /s e del/erase que o catálogo antigo de 09-17 desta seção excluía foram incluídos pelo contrato suplementar de 09-24; o catálogo atual acima tem precedência sobre registros históricos de correção.

## Autoridade única e ordem de eventos

```text
runtime.mode -> instantâneo de permissão desta vez (mode, input, cwd) + seleção de Shell da sessão existente
                         |
               guarded ? +---- não ----> caminho de permissão original
                         |
                    regras de comando limitadas
                      /       \
                  casou     não casou/unsupported
                     |             |
              user-once       política base YOLO
                     |
         aprovação do usuário para o requestId atual
                     |
        execução com o mesmo input/shell/cwd

Hook com input modificado -> normalize/schema -> nova decisão -> novo requestId se necessário
broker aprova input modificado -> normalize/schema -> fixa novo input -> execução
desktop continuous -----------\
                              > mesma autoridade de CLI/broker
mobile replayable recuperação/
```

O executor fixa mode/input/cwd desta vez, e o Shell reutiliza a seleção da sessão existente; o ToolEntry produz a capacidade dinâmica de aprovação, o PermissionService a consome, e o matcher não é duplicado na entrada. O approvalMode=user-once explícito percorre broker/event/projeção e não é substituído por uma lista de sugestões vazia. Depois do acerto, o allow do projeto, o allow de PreToolUse e o Hook PermissionRequest não podem aprovar por procuração; pedidos perigosos vão direto ao broker e pedidos comuns mantêm a corrida Hook/broker existente e as semânticas de Memory e prefixo.

Alterações de input por Hook/broker voltam ao mesmo normalize/schema. Reescrita por Hook exige nova decisão de permissão; o requestId antigo termina e, quando o novo input precisar de confirmação, é gerado um novo requestId. No Guarded, allow/modify de um broker confiável com modifiedInput significa que o usuário já aprovou o input modificado: não há nova decisão nem novo pedido de aprovação; ainda assim, fixam-se mode/cwd desta vez e clona-se o input normalizado e congelado para execução. O Shell reutiliza a seleção da sessão existente, sem clone/congelamento adicional por chamada. Input inválido não executa; permissionUpdates de um pedido perigoso são rejeitados e não persistidos. Sem broker, timeout, cancelamento, resposta inválida ou falha, nada executa. Trocar de modo não aprova pedidos pendentes, e a próxima chamada usa o novo mode. Preserva-se o tool_result final, visível ao provider, do feedback de Deny.

### Reversão do instantâneo duplicado de Shell

O owner de shell da sessão existente inicializa a seleção antes da primeira entrada real, e valores já existentes não são atualizados a quente; a recuperação a frio restaura a seleção persistida antes da execução. Trocar Git Bash/CMD durante a aprovação não é um caminho de produto existente, portanto a correspondência e o handler do executor reutilizam diretamente essa seleção, sem novo clone/congelamento de Shell por chamada. Revoga-se o cenário fictício dos testes que modificava diretamente `shell.dialect`, e passa-se a verificar que a seleção da mesma sessão é repassada intacta; input/mode/cwd, cancelamento, ciclo de vida da aprovação e desktop continuous/mobile replayable ficam inalterados, sem migração de configuração.

Aceitação desta vez: primeiro mudam-se as asserções de regressão, com 3 falhas na implementação antiga; após a reversão, core 7 suites / 293 tests e bootstrap 2 suites / 16 tests passaram. typecheck da raiz e do core, verificação de formatação dos dois arquivos de código, verificação de arquitetura (0 violations) e diff check passaram; lint da raiz com 43 warnings / 0 errors. A produção teve apenas call-runner.ts com líquido de 5 linhas removidas; UI/E2E spec inalterados, Desktop E2E ou máquina real Windows não reexecutados; o estado de cobertura continua pending. Nada commitado ou enviado.

O resultado de pergunta/resposta não é reescrita de operação: quando o pedido original tem `sideEffectScope=userInteraction` confiável e a resposta vem do broker, `modifiedInput` representa o preenchimento da resposta e, após validação, o handler executa sem reabrir a pergunta; a modificação de input do Hook continua sendo re-decidida. O uso vem da decisão de permissão existente e a origem vem da corrida de resposta do executor; não se aceita autoexenção declarada no payload da resposta e não se adiciona campo de protocolo/persistência. Desktop continuous e mobile replayable continuam consumindo o mesmo estado final do pedido, sem alterar transmissão nem propriedade de pending. A regressão cobre respostas predefinidas, personalizadas e vazias, respostas inválidas, rejeição e modificação por Hook; o novo E2E de Guarded pendente de revisão verifica que a resposta entra na próxima requisição ao modelo, sem mudar o caso de perguntas por teclado já promovido.

Os valores de modo percorrem o schema estrito de contracts/shared, a submissão/comando V4, os menus de CLI/TUI, salvar/restaurar de sessão, automação e Enter/ExitPlanMode. Desktop/CLI rodam na mesma versão dentro do pacote, sem nova detecção de capacidade de runtime antigo; falha real de configuração/submissão continua não podendo executar silenciosamente. Reutiliza-se o wire shape de options já existente, e qualquer novo campo entre fronteiras precisa de schema estrito.

## Herança por subtarefas / comportamento compartilhado e divergente

Regra de derivação central: quando parent=guarded e o modo child original de um subagent comum/Explore/aninhado é yolo, ele passa a guarded; o resto fica inalterado. Subagentes de workflow dinâmico (dwf) herdam o modo de permissão da sessão de origem (não só guarded): no momento da criação do run, registra-se `subagentPermissionMode` (por exemplo `"guarded"`) em `run-launched`, e todos os subagentes daquele run (inclusive após resume/reinício) rodam nesse modo; sob guarded, comandos perigosos pedem `user-once` ao usuário pelo broker da sessão pai, com origin annotate de subagente (`docs/dynamic-workflow/launch.md`「Permissions inside a run」). Os children de expert/script workflow do `/workflow` antigo continuam excluídos, mantêm yolo interno e não entram na aprovação de comandos perigosos; nenhuma inicialização/recuperação de workflow pode transformar uma tarefa pai guarded em yolo. `plan`/`edit` explícitos são preservados; automações yolo existentes ficam inalteradas e apenas a automação que escolhe guarded por si é habilitada. Sem ninguém online, mas com broker/runtime vivos, o pending é preservado aguardando aprovação online; timeout/cancelamento/saída de processo não vira permissão.

O runtime de subagente comum atual define explicitamente `subagents.enabled=false`, então um child comum não tem caminho executável para criar outro child; esta rodada não adiciona capacidade aninhada. A função de derivação preserva a semântica composável, e as evidências de execução cobrem subagente comum/Explore/frontend personalizado, background comum e os caminhos representativos existentes workflow→Agent, sem alegar validação de aninhamento comum multinível inexistente.

## Ciclo de vida unificado de aprovação (2026-09-15)

O registro síncrono do broker é o contrato padrão; um broker de protocolo que precise de preparação assíncrona fornece, sobre a Promise devolvida nesta rodada, o sinal de conclusão `registered`. O executor o aguarda e então publica o evento; o sinal não guarda cópia de autorização nem de pending, apenas expressa que a tabela de registro original do broker já pode responder. Cancelamento/falha durante o registro incompleto também precisam ser fechados e não podem ficar bloqueados pela espera de registro; um registro concluído tardiamente não pode publicar um pedido já encerrado.

Implementações que embrulham outro broker (como subtarefas roteadas ao broker da sessão pai) precisam encaminhar explicitamente o `registered` interno, usando o tipo de interseção do contrato no tipo de retorno; não se pode depender de uma transparência de identidade do tipo "acidentalmente retorna o mesmo objeto Promise", senão qualquer reescrita por `async`/`.then` descarta silenciosamente o sinal e volta à premissa de registro síncrono (correção de review em 2026-09-17).

Dentro da mesma chamada de ferramenta, a primeira decisão e a re-decisão após a reescrita por Hook compartilham o mesmo `preparedContext` (mode, bashShellSelection, instantâneo de workingDirectory); a re-decisão não pode voltar a um contexto reduzido contendo apenas runtimeScope/cwd, para que o matcher do guarded não falhe silenciosamente no caminho de re-decisão.

Substitui-se o pipeline independente requestUserOnce e a reentrada recursiva resolveToolPermission: o mesmo executor conduz preparação, decisão, registro/publicação, espera, conversão da resposta e estado final. A reescrita de input do Hook apenas reprepara/redecide, sem repetir a cadeia de Hook já executada; modificações já aprovadas pelo broker apenas repreparam, sem nova decisão. O broker mantém o pending, o executor mantém o instantâneo desta execução e não é criado estado duplicado no protocolo.

```text
prepare(mode,input,cwd; sessionShell) -> decide -> allow/deny
                                  |
                                 ask -> register -> publish -> response -> close
                                                               |            |
                              broker approval/answer -> validate -> execute |
                                           Hook rewrite <-------------------+
                                              |
                                         prepare -> decide -> new requestId
```

O uso do pedido vem da capacidade de permissão confiável e a origem da resposta vem do responder real; as respostas de pergunta/resposta do broker apenas completam a interação, enquanto modificações do Hook continuam sendo reescrita de pedido. A primeira validação do modelo preserva o feedback de erro original; todas as modificações de Hook/broker passam por normalize + schema, sem chamar ToolEntry.validateInput de novo após a reescrita. A pré-verificação de semântica da ferramenta continua sendo executada apenas na primeira entrada do modelo, antes de PreToolUse; a validação do próprio handler não muda. Uma aprovação sem modificação executa o instantâneo original; a reescrita por Hook fecha primeiro o ID antigo e só então decide o novo input; já a aprovação pelo broker de um input modificado fecha o pedido original e executa diretamente o novo instantâneo, sem perguntar de novo. Pedidos perigosos não podem persistir autorização. Cancelamento, timeout, ausência de broker, resposta inválida e erros de infraestrutura não executam, preservando os tipos de erro estruturados existentes e sem se disfarçar de rejeição do usuário. Todos os pedidos emitem um único estado final; quando visíveis, já precisam estar registrados e respondíveis, e respostas tardias ou duplicadas não podem aprovar um novo ID.

### Convergência semântica da aprovação após modificação pelo broker (2026-09-15)

O usuário confirmou ajustar apenas a resposta do broker no Guarded: allow/modify + modifiedInput é a aprovação desta vez do input final, e não uma proposta aguardando aprovação. A fonte é o `source` da corrida de resposta, e é proibido o Hook se autodeclarar broker pelo campo de resposta para contornar a re-decisão. O escopo de aceitação de modifiedInput nos modos antigos, a re-decisão por deny/ask do Hook, a conclusão de perguntas, as condições iniciais de proibição da ferramenta e a validação do handler ficam inalterados; não se adiciona entrada de edição na UI, aviso de mudança, campo de protocolo ou estado persistido. CLI/broker continuam sendo o único owner de pending, e as rotas desktop-continuous e mobile replayable não mudam.

Aceitação: allow/modify de A→B perigoso pelo broker pede apenas uma vez e executa B uma vez; schema inválido/resposta de persistência/cancelamento resultam em zero execuções; o instantâneo de mode/cwd não deriva e o Shell reutiliza a seleção da sessão; Hook A→B ainda gera novo ID e re-decide, com a resposta antiga inválida; o broker de protocolo real fecha a mesma projeção e produz o tool_result correto. Como a desktop atual não tem controle de edição de input de operação, não se pode usar operação de UI fictícia para fingir cobertura end-to-end desse branch; re-verificam-se os E2E existentes de Guarded e de substituição por Hook no Desktop, e a aprovação de reescrita é validada por teste de integração de protocolo.

Resultado desta vez: primeiro são adicionadas regressões, e os 4 casos de allow e modify de core/bootstrap falham sob o comportamento antigo; após a mudança mínima de produção, 14 suites / 222 tests relacionados passam. typecheck da raiz, de core/bootstrap e do Desktop E2E e a verificação de arquitetura passam; o lint da raiz fica em 43 warnings / 0 errors e o lint direcionado dos três arquivos de código/teste alterados em 0 warnings / 0 errors. A auditoria de cobertura continua bloqueada pelo D19/I74/I75 existente, pelas estatísticas A-J e pela deriva de três documentos gerados, sem ampliar correções de baseline sem relação.

Verificação de fechamento: a verificação de formatação dos três arquivos de código/teste passou e `git diff --check` passou; a verificação de formatação de arquivo inteiro de spec, catálogo de casos e matriz de cobertura ainda apresenta avisos, e não foi feita formatação completa em documentos grandes que contêm alterações de outras tarefas.

Execução conjunta de Desktop 20260915153836774 (relatório local `desktop-e2e-20260915153836774-p59686-b1102287e558dd4f`) deu 16 passed / 1 failed: a substituição por Hook passou, e o caso RM do Guarded falhou na seleção do modo no menu antes de enviar o prompt. A repetição idêntica do Guarded 20260915154205099 (relatório local `desktop-e2e-20260915154205099-p62115-c388109bef724697`) continuou em 15 passed / 1 failed, parando no mesmo ponto anterior; sem alterar o menu ou enfraquecer asserções, esta rodada não é declarada toda verde. As duas specs continuam em manual-review/pending; Windows, celular e scheduler e demais itens não aceitos permanecem inalterados.

O pedido de execução do Guarded usa o campo de modo estrito já existente. Na criação, falha da configuração guarded bloqueia o firstInput; sessão vazia aplica o modo pelo createSession.config existente e retorna o ACK original, sem novo envio de detecção de modo. A troca real de modo continua usando o comando estrito existente, e o Host não completa mais firstInput.mode. Desktop continuous e mobile replayable consomem a mesma autoridade da CLI; a desconexão do celular não cancela pedidos de runtime vivos. Após reinício da CLI, mantém-se a semântica existente de cancelled/interrupted do hydrate, sem restaurar nós de execução antigos.

Mantêm-se o matcher, a passagem do modo e o roteamento de subagente comum; substitui-se o núcleo de aprovação compartilhado; revoga-se a herança de children de workflow. O ponto final de teste aceito é tarefa correta visível -> resposta do usuário -> pedido original encerrado -> handler 0/1 vez -> provider tool_result, e não "mock de broker chamado".

## UI Surface Matrix / State Owners

### Confirmação substituída após reescrita por Hook: aceitação de interação manual (2026-09-15)

Desta vez só é adicionado um E2E de Desktop `desktop-continuous`, sem mudar a semântica de aprovação de produção. Usa-se modo build, regra ask de Write do projeto e um Hook de comando PermissionRequest real: o modelo pede para escrever A e o Hook reescreve para B depois de a barreira ser liberada; quando o pedido antigo termina, B precisa ser reconfirmado com um novo requestId no composer dock da mesma chamada de ferramenta. O teste produz a aprovação de A por clique real da UI, mantendo temporariamente apenas esse comando original no MessagePort do renderer até B ficar visível e então o entregando intacto, verificando que a aprovação tardia de A não executa B. Finalmente, um clique real em Allow once de B resulta em A inexistente, conteúdo correto de B, PostToolUse uma vez, provider recebendo tool_result de sucesso e regras de projeto inalteradas.

```text
confirmação de A visível → clique da UI em A (apenas adia esse comando) → libera barreira do Hook → confirmação de B visível
                                                        ↓
                      entrega a aprovação antiga de A → B ainda espera → UI aprova B → executa uma vez
```

CLI/broker continua sendo o único owner de autorização; o teste só observa o DOM, registra IDs reais de protocolo e atrasa o pacote original do cliente, sem fabricar eventos de permissão nem modificar estado de negócio. Grava vídeo com Electron capturePage, e as capturas de tela preservam quatro estágios: A/B/depois da resposta tardia/conclusão; registra o tempo de substituição do DOM e não exagera "sem janela dupla" para "sem cintilação". O caso fica em manual-review/pending e entra como representante de re-decisão de modo antigo da DCA-V1-06; não cobre mobile replayable, Windows nem o branch de aprovação de reescrita pelo broker no Guarded, este último aceito de forma independente na seção anterior.

Ritmo de leitura manual: os cartões de confirmação de A e B permanecem 3 segundos extras cada, depois das asserções condicionais passarem, antes do clique. Essa pausa serve só para leitura da gravação e não garante sincronização de estado ou julgamento de sucesso; continuam as esperas condicionais, as asserções de invalidação da resposta antiga, de execução zero/única e de provider result. Na interface atual, a linha de histórico de ferramentas acima ainda mostra o A original do modelo, enquanto o cartão de aprovação abaixo muda para B; desta vez só se melhora a legibilidade da demonstração, sem modificar esse comportamento de exibição de produção.

| cenário | entrada/fonte compartilhada | autoridade e submissão | isolamento obrigatório |
| ---------- | --------------------------------- | ----------------------------------- | ----------------------------- |
| seleção de modo | catálogo de modos do Composer V4/celular/TUI/CLI | draft ou runtime.mode, comando existente | outras tarefas e padrões |
| modo de automação | configuração existente de edição/criação | registro de automação -> runtime | não reescreve a conversa atual |
| aprovação | options de V4/TUI/broker | pending/requestId da CLI -> executor | a UI não calcula perigo, sem persistência no projeto |
| recuperação no celular | projeção shared-host | roteamento do owner existente | replayable não substitui continuous |

O broker possui o pending; o executor possui o instantâneo de input; o sessionStore possui as regras do projeto; a projeção é um fato derivado. `workspaceIdentity?.trim() || workspacePath` é a chave de identidade, e a execução usa workspacePath. Não se cria uma segunda cópia de estado/fila.

## Feature Relationships / Codegraph Evidence

| rank           | ponto de partida compartilhado e cadeia direta                                 | profundidade |
| -------------- | -------------------------------------------------------------------------------- | ------------ |
| must-inspect   | AST do Bash -> ToolEntry -> PermissionService -> permission-flow                  | 2-3          |
| must-inspect   | schema/catalogo de mode -> submission/command -> runtime/persistence              | 2            |
| must-inspect   | factory de workflow/subagent -> child mode/executor                              | 2            |
| should-inspect | broker/event -> buildProtocolPermissionOptions -> V4/TUI                          | 2            |
| invariant-only | continuous/replayable/workspace identity                                          | 1            |
| evidence-only  | testes existentes de permission/BPR/PVD                                            | não representa cobertura nova |

O codegraph não está disponível e a verificação usa pontos de chamada do código-fonte. Graph Drift: o planejamento anterior de intercepção de todos os modos foi substituído por este contrato. Graph Delta: os IDs estáveis de capability não mudam; atualizam-se a isolamento de modo e as invariantes de herança e os seeds reais de código, sem registrar arquivos futuros.

## Dimensões / poda / casos aceitos

Dimensões: mode×match, mode×child, versão de input×resposta, Shell×sintaxe, surface×recuperação. Poda: sem simulação completa de script/ambiente implícito e sem todas as permutações de flags×plataforma×GUI de provider. `unknown` não aumenta ask.

DCA-V1-01/03..08 passam a ser o contrato guarded; 02 mantém PowerShell podado; 09..12 recuperam as extensões de Git/rsync; 13..15 cobrem passagem de modo, herança e controle do yolo original. Aceito não é coberto, e evidência não executada não herda stash antigo.

## Implementation / E2E Handoff

1. spec/catalog/matrix/tool-chain primeiro, e teste falhando antes da implementação de produção.
2. Cadeia de modo -> matcher -> aprovação compartilhada -> projeção multiplataforma, sem reescrever o prefix registry.
3. Cada regra tem pelo menos um ciclo real de rejeição; o caminho de aprovação usa diretório isolado/handler controlado. Verificar contagem de handler, armazenamento de arquivo/regras e o tool_result final do provider.
4. Novos casos começam em manual-review/pending; fixture sintético case-local documenta o motivo, com fast-text comum e temporização controlada de cancelamento/tardio. Arquivos unificados em `.zcode-e2e/<case>`. Promoção só após revisão humana.
5. Git Bash/CMD do Windows precisam de evidência de execução real; sem runner, fica explicitamente como a verificar. Teste de recuperação de celular não se faz passar por E2E de rede física.
6. Executar unit/integration direcionado, typecheck da CLI, typecheck:e2e de desktop, `pnpm typecheck/lint`, verificação de arquitetura e auditoria de cobertura. A deriva de estatísticas do baseline do mapa fica separada, sem se misturar a correções funcionais.

## Verificação desta rodada (2026-09-15)

A seguir estão os resultados nesta máquina macOS após a substituição dirigida, sem herdar estado histórico de cobertura. 666 testes unitários/de integração e 16 E2E de Desktop passaram, o que ainda não equivale à aceitação completa multiplataforma, multi-dispositivo e de agendamento.

| verificação | resultado e ponto final real |
| --- | --- |
| core 19 suites | 353 passed: guarded-*, permission service/broker/race, Memory, Plan, Bash, executor error/trace, interação/eventos de subagente comum, queue intent, controle de permissão CUA original |
| bootstrap 11 suites | 160 passed: registry/command/projection V4 real com resposta imediata, perguntas e rejeição/cancelamento; workflow/script child com execução controlada e pai ainda exigindo aprovação; falha estrita de configuração, passagem de automação, recuperação a frio de SQLite, queue promotion |
| services + shared 3 suites | 125 passed: automationRepo, zcodeAgentService.v4, guardedMode. Os testes de runtime antigo são simulação real de subprocesso com o schema estrito antigo, não binário de versão antiga |
| adapters 1 suite | 19 passed: session-store-model-selection-codec de valor salvo e decodificação |
| TUI 2 arquivos | 8 passed: opções de aprovação/rejeição de resposta de projeto falsificada, sugestões de modo e seleção por teclado, usando tsx + node:test |
| mapa de features direcionado | 1 passed, 3 testes sem relação não executados; seeds de código reais e limites de isolamento valem, e não foi feita varredura de impacto com codegraph |
| Desktop E2E | 16/16 passed, 0 flaky/skip/falha de infra; runId final desktop-e2e-20260915101434963-p76460-ac7d9f68efd32292 |
| gates | `pnpm typecheck` da raiz, typecheck:e2e de desktop, typecheck de core/bootstrap/cli/tui da CLI, `pnpm lint` (43 warnings/0 errors), `architecture:check --changed` (0 violations), `git diff --check` passaram |
| qualidade local/fixture | lint independente de 6 arquivos de executor de aprovação com 0 warnings/0 errors, formatação de 11 arquivos centrais/testes da rodada; fixture check passou, e a única saída é o warning de marcador E2E_GUARDED_PARENT_DONE, que não pertence ao matcher do pedido |

Relatório de desktop: summary.md final (relatório local `desktop-e2e-20260915101434963-p76460-ac7d9f68efd32292`). As nove classes de comandos perigosos foram rejeitadas uma a uma, o sentinela de execução do Bash inteiro não existe; aprovação em diretório isolado e o controle YOLO original executam apenas uma vez; respostas predefinidas, personalizadas, vazias, rejeitadas e de child comum entram na requisição real do provider. Cada E2E compara o ruleset de permissões do projeto no SQLite e confirma gravação zero. Tudo continua em manual-review/pending, sem promoção e sem marcação de covered.

Esta rodada também passou na primeira reprodução de 16 casos de desktop (desktop-e2e-20260915100036387-p61529-1f9fd964072a1a29), e depois registraram-se as regressões canceladas no meio e reexecutou-se a versão final acima. Com build completo de Bootstrap e Desktop rodando ao mesmo tempo, 6 casos atingiram o timeout existente de 5 segundos; após a conclusão dos builds, as mesmas 11 suites foram reexecutadas com `--no-file-parallelism`, com 160 passando (13.51s), sem aumentar timeouts de teste nem mudar asserções.

Os 43 warnings do lint da raiz, os 10 warnings do lint do diretório core e os 26 warnings do lint do diretório bootstrap estão todos em lógica que não é nova nesta rodada. O script de lint original do bootstrap reportava No files found por causa da regra de ignore, então foi usado `exec oxlint src --no-ignore` para escanear de fato, com 0 errors; não se tratou "não escaneado" como aprovado.

### Gates e evidências de execução ainda pendentes

- **Auditoria de cobertura não passou**: o baseline de merge já tinha o "—" de D19, o caminho pending de I74 e o "同上" de I75, que não são abreviações registradas; as estatísticas de totais/accepted/missing/referenced de A-J são 181/178/53/77, enquanto o real é 184/181/56/80; três documentos de decision gerados estão stale. Cada ponto foi conferido contra o HEAD, sem alterar entradas sem relação. No momento, metadados de fixture pending 0 rejected e contrato formal 0 gaps.
- **A regressão da baseline estendida tem 1 falha**: o strict snapshot batches de subagent-background.test.ts ainda afirma que a mensagem não contém system-reminder, mas o incoming-message.ts do baseline de merge já passou a incluir esse wrapper de segurança. O módulo de produção e o teste estão ambos idênticos ao HEAD, e a reexecução isolada reproduz; os outros 25 passam. Não se altera a semântica de notificação nem se apaga asserção para mascarar problema de baseline.
- **Git Bash/CMD do Windows**: há apenas testes unitários de parser limitado, sem evidência de shell real num runner Windows; resultados de macOS não substituem isso.
- **Celular/reinício**: protocolo/registry/projeção reais e cancelamento já foram verificados, mas ainda não rodou o ciclo completo de hydrate com desconexão e reconexão no celular, competição entre dispositivos e reinício de um processo Runtime real. Mantêm-se as rotas existentes de clientMode/deliveryKind, owner/stale-run e workspaceIdentity, sem nova cópia de pending.
- **Agendamento real de automação**: já foram verificados persistência do registro, passagem pelo protocolo e manutenção do pending com broker vivo sem ninguém online; falta o ciclo real scheduler -> Host -> CLI com aprovação/rejeição após entrada em operação. A espera de broker controlada não pode ser tratada como aceitação do scheduler real.
- **Execução enfileirada**: já existem asserções de falha de criação de configuração com zero execuções, recuperação a frio de SQLite e preservação/promoção de queue mode; ainda não há evidência de execução completa do consumo automático enfileirado até o handler perigoso. A divergência de runtime antigo foi excluída pelo limite de distribuição dentro do pacote e não exige mais aceitação de binário antigo; o teste de simulação do schema antigo de firstInput foi removido.

### Comandos de reprodução (2026-09-17, atualizados para o caminho formal)

```sh
E2E_PROVIDER_REPLAY_FIXTURE_PATH=packages/desktop/test/e2e/fixtures/upstream/common.json,packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-guarded.json pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/conversation-session-guarded.test.ts'
pnpm --filter @zcode/desktop e2e:fixture:check -- --spec './test/e2e/conversation-session/conversation-session-guarded.test.ts'
pnpm --filter @zcode/bootstrap exec vitest run --no-file-parallelism tests/guarded-interaction-lifecycle.test.ts tests/guarded-permission-options.test.ts tests/guarded-projection.test.ts tests/guarded-workflow.test.ts tests/automation-port.test.ts tests/v4-native-session-mgmt.test.ts tests/v4-native-model-config.test.ts tests/v4-native-interaction-background.test.ts tests/workflow-effective-selection.test.ts tests/session-selection-cold-resume.test.ts tests/v4-native-queue.test.ts
pnpm typecheck
pnpm --filter @zcode/desktop typecheck:e2e
pnpm --filter @zcode/core --filter @zcode/bootstrap --filter @zcode/cli --filter @zcode/tui typecheck
pnpm lint
pnpm architecture:check --changed
pnpm audit:conversation-session-coverage
```

### Volume de alterações e backup

Contado sobre o workspace inteiro em relação ao HEAD, incluindo staged, unstaged e untracked; fixtures contam como testes e o mapa de features conta como documentação, sem artefatos de build/E2E:

| categoria | arquivos | adicionados | removidos | líquido |
| --- | ---: | ---: | ---: | ---: |
| código de produção | 73 | 1314 | 489 | 825 |
| testes / fixture | 27 | 3348 | 273 | 3075 |
| documentação / mapa | 5 | 286 | 0 | 286 |

Em relação ao backup completo anterior à substituição, a parte de produção tem 15 arquivos com +604/-663, líquida de 59 linhas a menos; inclui remover o approval-once.ts independente, convergir os antigos branches de permission-response/re-decisão e adicionar o limite unificado de pedido/preparação de input. As capacidades base de mode/matcher são preservadas. O stash de backup completo d4e1e36e29ebc6044600bf5bd81f70bf0f6ca7ae continua existindo; nenhum stash antigo foi restaurado, nada foi commitado ou enviado e não houve nova chamada de modelo, migração de banco ou migração de configuração do usuário.

Os 11 resultados de desktop de 09-10/11 são mantidos apenas como relatório antigo (relatório local `desktop-e2e-20260910155146785-p680-77d38a5a440d10e6`) e não contam para a aceitação desta rodada.

## Aceitação da correção de review do matcher (2026-09-15, independente do registro de substituição de aprovação acima)

- O código de produção alterou apenas `guarded/command.ts`, `options.ts`, `git.ts` e `wrappers.ts`, com +20/-11 nesta rodada, líquido de 9 linhas; a isenção de consulta do rm foi removida e o chamador passou a declarar explicitamente a estratégia de varredura. Núcleo de aprovação, modo, protocolo, valores padrão e persistência não foram modificados.
- Testes primeiro vermelhos depois verdes: 7 falhas antes da mudança de implementação, incluindo negação de Guarded com execução bem-sucedida, ausência de pedido do usuário, falta de casamento nos três dialetos e o oracle de rm nativo do macOS; após a correção, 6 suites / 182 tests passaram. Ordem de palavras/combinação de wrappers nos três dialetos é evidência de contrato de parser, não evidência de runtime do Windows.
- Reforçam-se os exemplos positivos e negativos já existentes; os contraexemplos já suportados exigem explicitamente `notMatched` e não podem se camuflar de `unsupported`; acrescentam-se valores de argumento de clean/push/rsync, isenções verdadeiras e comparações de prioridade de cancelamento. O `/bin/rm` nativo só apaga alvos próprios de mkdtemp, confirmando que palavras de ajuda na cauda são mesmo nomes de arquivo.
- E2E de pending do Desktop: 16/16, 0 flaky, 0 falha de infra; o arquivo/diretório alvo do rm permanece após a rejeição, o sentinela de Bash não existe, as regras de projeto não mudam e o provider recebe a rejeição real; aprovação comum, YOLO original, perguntas e child comum de controle passaram. Relatório desta vez (relatório local `desktop-e2e-20260915112613933-p58677-ff66706217d193de`). A verificação de contrato de fixtures passou, e o único warning continua sendo o marcador de saída `E2E_GUARDED_PARENT_DONE` existente.
- `pnpm typecheck` da raiz, typecheck do core, typecheck do Desktop E2E, lint da raiz (43 warnings/0 errors), lint do core (10 warnings/0 errors) e verificação de arquitetura (0 violations) passaram; os warnings não estão nos arquivos modificados desta vez.
- A auditoria de cobertura continua bloqueada pelas abreviações de baseline D19/I74/I75, pelas estatísticas A-J e por 3 docs gerados stale, já conferidos contra o HEAD; os metadados de fixture pending desta rodada têm 0 rejected. Windows, recuperação de celular, scheduler e binário antigo permanecem como itens não aceitos, sem promoção nem marcação de covered, sem commit/push.