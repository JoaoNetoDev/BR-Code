# Registro de reexecução completa das conexões remotas R3 (2026-09-10 ~ 09-11)

> Contexto: após a merge do R3 houve muitas alterações de código, então foi feita uma reexecução completa do e2e de conexão remota (49 cases: standard 37 + special 10 + soak 2).
> Princípio: **falhas falsas de ambiente devem ser corrigidas e eliminadas; defeitos reais de produto não podem ser mascarados e, inversamente, defeitos de produto não podem ser atribuídos indevidamente a defeitos de teste.**
> As evidências detalhadas de cada rodada estão em `.e2e-artifacts/r3-rerun-20260910/ANALYSIS.md` (§1-§61); este documento é o resumo anonimizado thereof.

## Modo de execução

- Runner unificado (`run.mjs`): cada case em container independente + home independente; em FAIL há uma reexecução automática; em caso de falha o container e o home são preservados (`docker stop` mantém o estado do sistema de arquivos para forense); em caso de sucesso são limpos
- Controlador de autocorreção (`recover-all.sh`): polling de fila idempotente; critério de conclusão = marcador de console `[rec] <case> exit=` (nota: `exit=` é o código de saída do processo runner, que é sempre 0; **o critério PASS/FAIL obrigatoriamente lê o `status` de results.json**; essa armadilha já levou o removedor a classificar errado; ver §54)
- Limiar de ambiente (mem_gate, versão corrigida em 0911): só abre um novo case quando o nível de pressão de memória = normal e a margem recuperável ≥ 3000MB (swap used é uma contagem de páginas frias monotonicamente não decrescente, registrada apenas em log e não usada como barreira; §44); durante os testes houve 5 encontros com o OOM killer (§43/§44), e o controlador pode retomar do checkpoint
- Toda injeção de credenciais é feita por variáveis de ambiente; senhas são mascaradas (redactText/redactDir); este documento não contém nenhum material de chave

## Resumo dos resultados (estado final histórico, fechamento completo em 0911 12:48)

| Lote                                  | Total  | PASS   | FAIL                       | BLOCKED |
| ------------------------------------- | ------ | ------ | -------------------------- | ------- |
| standard(replay em container único)   | 37     | 34     | 3                          | 0       |
| special(docker/live/systemd/mobile)   | 10     | 7      | 3(incluindo 1 contado como BLOCKED) | 1       |
| soak(reconnect/dual)                  | 2      | 2      | 0                          | 0       |
| **Total**                             | **49** | **43** | **6**(dos quais 1 era na verdade BLOCKED) | **1**   |

> FAIL 6: r3-install-faults / r3-live-bigmodel-team(=BLOCKED) / r3-provisioning-gui / r3-settings-scopes / r3-terminal / ssh-remote-project-conversation-scope. O estado final histórico é preservado; após a revisão, 2 se confirmaram como defeitos de produto, 2 como defeitos de teste (r3-install-faults e ssh-remote-project-conversation-scope, ambos reexecutados com PASS depois), 1 como suspeita de defeito de produto (terminal) e 1 como invalidação de material de ambiente (BLOCKED).

Encerramento do lote soak: soak-reconnect com 50 rodadas todas verdes; soak-dual com 56 rodadas (rodada de 5 minutos de decisão) todas verdes — reconciliação incremental do eco bidirecional desktop/celular com 0 ausências, 18 rodadas de recuperação após queda de rede todas aprovadas e sem vazamentos. **Zero defeitos no lado do produto; a causa raiz em toda a execução foi defeito no código de teste** (correção do modo de reconciliação com DOM virtualizado, §55).

## Classificação das causas raiz de FAIL

### 1. Defeitos de produto (confirmados, mantidos como FAIL com abertura de issue)

| case                                  | Defeito                                                                                              | Evidência                                                                     | Seção da análise |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------- |
| r3-provisioning-gui                   | A desconexão durante a sincronização não rejeita o RPC antigo, bloqueando o reattach no lane de Provisioning; já corrigido, reexecução completa com PASS em 0911 16:15 | Probes de conexão real e reexecução da GUI, ver o registro de correção abaixo   | §19/§25          |
| r3-settings-scopes                    | Ao escolher o scope "usuário" e criar um agent, o arquivo vai para o home remoto (ambiguidade/atribuição errada) | Container preservado comprova o arquivo no lado remoto                          | §42              |

> Estado posterior: o defeito original de `r3-settings-scopes` se confirma; após a correção em 2026-09-11 a regressão na GUI passou com PASS; veja o registro de revisão no fim deste documento. A tabela acima e o resumo dos 49 cases preservam o enquadramento histórico.

### 2. Defeitos de produto (suspeitas, abertas para investigação por issue, mantidas como FAIL)

| case                     | Suspeita                                                                                                                                                                                                        | Seção da análise |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| r3-terminal              | Fluxo de dados PTY do terminal remoto intermitente (saída com 45s sem dados / eco de entrada falhando em 32s, um tipo por rodada); camada SSH já foi descartada; commits suspeitos 6a1de7485c / 9b56031ac2 / 13c82d12e1 | §57              |
| r3-uninstall(parte de orientação) | Após a desinstalação, a orientação de erro do assistente diz "请在连接管理确认身份换代", mas o gerenciador de conexões de fato só tem a entrada "重新安装并连接" — **o texto da orientação não corresponde à entrada real** | §56              |
| r3-uninstall(grupo de reconexão silenciosa) | Após a desinstalação, os três caminhos de reconexão da UI ficam todos travados silenciosamente: ① a orientação de erro de troca de identidade no primeiro conexão é inválida ② o attach da linha do dispositivo é silencioso (§52) ③ ao clicar em "重新安装并连接" abre-se o painel de seleção rápida de diretório, os itens ficam permanentemente disabled e não há nenhuma ação de conexão no main por 10min (evidência em §58:12:05:40-12:15:52 processo principal em branco) | §52/§53/§58    |

### 3. BLOCKED (invalidação de material de ambiente, não é problema de produto)

| case                  | Motivo                            | Tratamento                                                                 |
| --------------------- | --------------------------------- | ------------------------------------------------------------------------- |
| r3-live-bigmodel-team | Material de credenciais live inválido | É preciso entrar novamente no BigModel pelo app local e reexecutar         |

### 4. Defeitos de teste (corrigidos, todos fechados com PASS)

| case                          | Defeito original                                                                                                                                                                  | Correção                                                                                            | Status                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | --------------------------- |
| r3-install-faults             | A falha corrompia o pacote x64, mas o alvo era ARM64; com B online reutilizando a sessão, a validação do pacote não era atingida                                             | Selecionar o pacote pela arquitetura de cada alvo, restaurar no finally; B desconectado explicitamente e retorno explícito ao rascunho local | **PASS(reexecução em 0911 14:43)** |
| ssh-remote-project-conversation-scope | A primeira conexão de conversation não tratava a confirmação de instalação embutida no assistente; o log original expirava antes da execução do cenário de project, com a atribuição de produto em §26/§40 revogada | Chamar primeiro o helper público waitForSSHDirectoryStep e depois manter as asserções originais de isolamento de conversation/project | **PASS(reexecução em 0911 16:32)** |
| r3-uninstall(parte de asserções de negócio) | Container novo sem primeira instalação → o ramo `if` não é alcançado; o contrato de troca de identidade não seguiu o fluxo do produto; a sétima etapa trava no painel de seleção rápida de diretório (defeito silencioso de produto) | Versão de oito etapas: primeira instalação → reconciliação da desinstalação → amostragem de evidência do silêncio → remoção de todas as conexões → reinstalação em primeira conexão totalmente nova → asserção de installationId | **PASS(round 36)**        |
| r3-subagent                   | Critério de filtragem de cwd do processo agent (o cwd é na verdade o home do daemon /home/dev, comprovado na evidência de §59)                                                  | A asserção passa a usar o critério de existência por correspondência de args (≥1 ≤2), com o cwd mantido em facts para observação | **PASS(round 37)**        |
| r3-ui-pairwise                | Confirmação de instalação pendurada do mesmo tipo de §32 (o boundary catch engole o erro)                                                                                       | Inserir waitForSSHDirectoryStep antes de waitForSSHConversation                                             | **PASS(round 38)**        |
| ssh-remote-provisioning-ready | Do mesmo tipo de §32 (o waitUntil de 90s só reconhece ConfirmDialog e não captura o botão inline) + §60: o contrato model-selection foi removido por inteiro em provider-refactor-m2(b10e5e5d80), e tanto o local quanto o remoto passaram a gravar em provider_config.json | Inserir waitForSSHDirectoryStep após o submit; a reconciliação remoto+local passa a verificar a existência de provider_config (o conteúdo contém credenciais e não é lido por estar mascarado) | **PASS(round 42)**        |

## Aprendizados acumulados no lado de testes (metodologia)

1. **Validação de spec**: o transpile de arquivo único do esbuild não valida exports entre módulos (o incidente do waitForWorkspaceApp está na nota de §56); é obrigatório usar `tsc --noEmit --ignoreConfig` + grep `TS2305|TS2724|does not provide`
2. **Temporização do loader do wdio**: o worker lê spec/helper no momento da inicialização; modificações posteriores ao início do processo leem a versão antiga — depois de modificar a spec é preciso confirmar que o horário de inicialização do wdio na rodada seguinte é posterior ao horário de gravação em disco (registro real em §55)
3. **Reconciliação com DOM virtualizado**: a reconciliação de fechamento total necessariamente falha em rodadas de número alto; a reconciliação incremental por rodada (uma marca recém-enviada precisa estar no fim da janela) + eco com espera (tolerante à remontagem em rodadas offline) é o modo correto (§55)
4. **Armadilha do exit= no controlador**: o valor de exit no marcador de conclusão é o código do processo runner, sempre 0; para classificar PASS/FAIL é obrigatório ler results.json (nota de §54)
5. **Padrão do removedor**: esperar `[rec] <case> exit=` (until com grep -q; não usar contagem com `grep -c` — no zsh, quando não há correspondência, `$()` captura duas linhas e a comparação inteira entra em loop infinito) → sleep 5 → ler o status de results.json → só remover o marcador em caso de FAIL → reagendar no controlador; em PASS não se toca nada; a remoção do marcador é feita por **reescrita completa** (open w + replace, no mesmo caminho e sem trocar o inode, para não perder o monitoramento por tail; escrita de byte único no lugar com r+ seek se mostrou pouco confiável na prática, nota de §59)
6. **Preservação da cena de FAIL**: o `onComplete` do wdio.conf chegou a apagar incondicionalmente o home do case; passou a preservar quando `exitCode!==0 && ZCODE_E2E_KEEP_HOME_ON_FAIL=1` (§47)
7. **Ruído do ssh2**: um REQUEST_FAILURE logo após o keepalive ping é o sshd recusando um global request, é inofensivo e não deve ser interpretado como falha de conexão (§57)

## Histórico de correções no lado de ambiente (eliminação de falhas falsas)

- mem_gate: pausa do polling quando swap > 7500MB, eliminando as mortes em série do OOM killer (5 vezes, §43/§44)
- docker exec -i entregando a confirmação de desinstalação da CLI (stdin em chunks; o canal exec do SSH descarta chunks que chegam cedo, §51)
- Inicialização simulada em x64 no container é lenta → janela de espera de probe/instalação ampliada; adaptação do diretório de teste ao ambiente noexec (os três cases de install-environment)
- As falhas na faixa alta de swap (19:0x/01:5x) foram todas verificadas por reexecução e não servem como base para classificação

## Lista de issues de defeitos de produto (recomendação de abertura)

1. O silêncio da entrada remota precisa ser verificado por causa raiz separadamente: §19 já confirmou e corrigiu como falha de não fechamento do RPC na camada inferior, que bloqueava a barreira de publicação do Provisioning; não se pode continuar atribuindo a openRemoteConversationWorkspace. Abertura de produto em §26/§40 é revogada: na prática a execução não chegou ao cenário de project e, depois da correção do teste de confirmação de primeira instalação, a reexecução completa passou com PASS. §52 e §53 mantêm suas respectivas evidências, e não se deve unificar causas raiz apenas por sintomas de UI semelhantes.
2. Grupo de falhas silenciosas nos caminhos de reconexão da UI após a desinstalação: §56 (texto da orientação incompatível com a entrada) + §58 (nenhuma ação de conexão após clicar em "重新安装并连接", com evidência de 10min de tela em branco no main)
3. Revogar a abertura do travamento silencioso na instalação com falha: §35 já foi refutado pelo log de sucesso original, ver a revisão abaixo
4. Atribuição errada de scope: §42 (scope "用户" gravado no home remoto)
5. Fluxo de dados PTY do terminal remoto intermitente: §57 (suspeita, com a lista de commits suspeitos anexa)

## Revisão e correção de teste do r3-install-faults (2026-09-11)

Conclusão: o "travamento silencioso na falha de instalação" original era um erro de julgamento. A spec corrompia de forma fixa o pacote linux-x64, mas o runner usava um container linux/arm64; run.log:6081 registra o upload de um pacote ARM64 íntegro, 8953 registra remote-connected, 9239 registra workspace-context-bound e só 9413 registra dialog-gone. df13428b é o dispositivo B de controle instalado antes da falha, não um dispositivo sem registro deixado pela falha; a exceção registrada no lote de telemetria não substitui o resultado da conexão.

O contrato corrigido está no adendo BLD-04/06 de `r3-remote-automation-case-matrix.md`: selecionar o pacote pela arquitetura de cada host remoto, restaurar no finally após a injeção e manter as asserções estritas de falha e de reconciliação da instalação. A nova execução real revelou que, após a primeira instalação, B continua online e reutiliza a sessão, pulando a validação do pacote de instalação; o teste passou a incluir a precondição de desconectar pelo menu de dispositivos e aguardar a mesma identity ficar offline. Após a desconexão, há retorno explícito ao rascunho local. **Em 2026-09-11, 14:42:13–14:43:49 (horário de Pequim), GUI E2E completo com PASS**, test body 66.984s; os resultados históricos dos 49 cases mantêm o registro original.

Verificação: regressão de fixtures novas e teste unitário do resolver real passam 14/14; passam a checagem TypeScript focada das modificações atuais, architecture:check (0 violation), oxfmt e lint (0 errors; 59 warnings existentes). `pnpm typecheck` e `pnpm --filter @zcode/desktop typecheck:e2e` foram executados, mas ficaram bloqueados por 7 erros de tipo ProviderAccessConfig/nullability nos arquivos existentes `r3-docker-transport.test.ts:72–74` e `r3-live-zapi.test.ts:61–64`; desta vez esses dois arquivos não foram modificados.

Novas evidências completas: result.json, test-results.ndjson (último registro passed=true), install-faults.json e install-cancel.json em `packages/desktop/.e2e-artifacts/r3-install-faults-fix-final-20260911/cases/r3-install-faults/`. As quatro falhas A resultam todas em error/none/null; a falha B reporta erro explicitamente e o SHA permanece inalterado; após o cancelamento, none/null; a reconciliação de todos os Hosts aponta para um único Local Host. Por fim, o SHA da instalação após a restauração do pacote é idêntico ao descriptor correspondente de A e a abertura do projeto tem sucesso.

Escopo da verificação: Desktop macOS arm64 → dois containers Linux arm64; a normalização da escolha de pacote para x64/Darwin está coberta por teste unitário, sem declaração de verificação real de GUI nessas plataformas. A verificação se baseia no workspace atual (incluindo modificações preexistentes nos helpers de E2E). Desta vez só testes e documentação foram corrigidos, sem alteração da lógica de estado remote/session do produto.

## Correção e regressão do r3-settings-scopes (2026-09-11)

O §42 original era um defeito real de produto: ao escolher User, os Subagents ainda herdavam o path/identity do active remote workspace,
fazendo com que a configuração do usuário fosse gravada no home remoto. A correção fixa, no scope target dos Subagents, o serviço do base Host para o User comum;
a inicialização de plugins passa a usar apenas o workspace local disponível; o salvamento do User atualiza o contexto dos subagentes existentes com a mesma service authority,
evitando que a ativação remota ou a ausência de workspace deixe de atualizar o cache local, e protege o carregamento remoto ainda inacabado durante a troca.
O Workspace remoto e o Source User explícito continuam usando seus respectivos serviços. O provisioning do Provider de modelo, a topologia de Host
e as cadeias desktop continuous / mobile replayable não mudaram.

Os testes observaram primeiro 4 falhas relacionadas e só depois validaram a correção; a nova corrida na atualização também obteve primeiro uma asserção com falha. No final, os testes unitários relacionados passaram 107/107, cobrindo o scope User/remoto com o mesmo caminho, o estado offline e a ausência de workspace local, a injeção de Source explícito e o isolamento de cache entre authorities. O E2E passou a escolher o workspace de mesmo nome por identity e a verificar arquivos simultaneamente no local e no remoto;
o default da conversation remota é o workspace, e foi removido o enquadramento incorreto de "escolher o último default como se fosse o User remoto".
A entrada de GUI do Source User explícito e a leitura/escrita de outras seções de configuração não foram contadas no escopo de aprovação desta vez.

**PASS real final de GUI E2E: 2026-09-11 15:18:44–15:20:34 (horário de Pequim)**.
Home independente / container Linux arm64, Desktop macOS arm64 reconstruído; o arquivo de User existe localmente e o arquivo de mesmo nome
no remoto está vazio; o arquivo de conversation existe apenas no backing workspace remoto; o arquivo de project existe apenas no projeto remoto;
não há arquivo de mesmo nome de projeto remoto no user/project local; a reconciliação de Host da janela não mudou. A primeira build da correção também teve PASS;
a rodada final cobriu a versão após a convergência do código de cache.

Verificação: `pnpm architecture:check --changed` com 0 violation; `pnpm lint` com 0 errors e 59 warnings preexistentes;
oxfmt e diff check dos arquivos alterados passaram; `pnpm exec tsc -b packages/ui` e a checagem de tipos de E2E focada neste case passaram.
`pnpm typecheck` e o `typecheck:e2e` do Desktop foram executados, mas continuam bloqueados pelos 7 erros de ProviderAccessConfig/nullability já existentes em `r3-docker-transport.test.ts:72–74`
e `r3-live-zapi.test.ts:61–64`; desta vez esses dois arquivos não foram modificados.

Evidências finais: `packages/desktop/.e2e-artifacts/r3-settings-scopes-fix-final-20260911/`, contendo
`verification.md`, os logs de cada checagem e `result.json`, `settings-scopes.json` e
`test-results.ndjson` em `cases/r3-settings-scopes/`. O container que falhou originalmente e os relatórios históricos não foram sobrescritos. Não foram executados de fato o Desktop Windows/Linux, o cliente móvel
nem todas as combinações de tema; esta modificação de UI não envolve estilos nem textos e o consumo entre plataformas continua usando as injeções de serviço já existentes.

## Correção da causa raiz e reexecução do r3-provisioning-gui (2026-09-11)

Conclusão: o defeito de produto original se confirma e, após a correção, a GUI E2E completa teve PASS. A causa raiz está no ciclo de vida da conexão física de `ServerRemoteConnection`: fechar apenas o socket/agent sem fazer dispose do ChannelClient faz com que a desconexão durante a sincronização deixe o RPC antigo permanentemente pending; o lane de Environment do Main não consegue terminar e as conexões seguintes são bloqueadas pela barreira de publicação do initialSync; neste caso ainda não se chegou a openRemoteConversationWorkspace.

A correção faz a conexão ser a única proprietária do cliente RPC e do protocolo, liberando-os de forma idempotente na desconexão ativa, no close/error do socket e na falha de handshake, reutilizando o fluxo existente de fechamento de falha de sincronização e de ressincronização ao reonline; sem adicionar atraso ou retentativa e sem contornar a barreira da primeira sincronização. A especificação está em `../remote/provider-provisioning.md`, em "Fechamento da conexão física e das requisições de sincronização".

Os testes primeiro refutaram e só depois corrigiram: foram adicionados 4 regressões de rede reais no formato WebSocket/Duplex × desconexão ativa/fechamento pelo par, todas falhando antes da correção e todas passando depois; também foram cobertos a sincronização de um novo Environment com resposta antiga ainda pendente, a resposta atrasada, a liberação duplicada e a chamada após o fechamento. Os testes relacionados a conexão, recuperação automática de Source, attachment do Main, shared-host/relay do celular e RPC de baixo nível passaram 179 itens ao todo.

A primeira rodada completa da GUI já passou pela restauração de project/conversation e pela sincronização da configuração mais recente, e em seguida expôs um defeito de precondição de teste que estava encoberto pela falha antiga: o B-05 só criava o rascunho depois de trocar o Composer da tarefa A para um Provider temporário, e depois esse Provider era excluído, invalidando a escolha de continuação em A. Na rodada de evidências, `resumedModelConfig` tinha provider/model/thought vazios. O teste passou a criar primeiro o rascunho do B-05 e só depois trocar o modelo, validando explicitamente ao final que A ainda mantém o modelo e o nível de raciocínio originais. Além disso, o critério de conclusão da exclusão foi restrito à navegação do provedor: um nome remanescente na página inteira não pode refutar um RPC de exclusão já bem-sucedido nem a reconciliação do arquivo remoto. Todas as asserções de negócio foram mantidas.

**Em 2026-09-11, 16:14:13–16:15:45 (horário de Pequim), GUI completa com PASS**. facts: initialContainsSeeded, onlineSave, b05ExistingAgentRefresh, deletePropagated, offlineEditsNotSyncedWhileOffline e afterReconnectHasBothOfflineEdits passaram todos; project e conversation foram ambos restaurados com sessions diferentes, a escolha original da tarefa era lifecycle model/disabled e a continuação foi concluída com sucesso. Evidências: `packages/desktop/.e2e-artifacts/r3-provisioning-fix-verified-20260911/cases/r3-provisioning-gui/`. A primeira verificação da correção reconstruiu o código-fonte atual do Desktop e, depois, apenas os ajustes de E2E reutilizaram a mesma build; os artefatos de falha históricos foram mantidos em um diretório separado e o results.json original dos 49 cases não foi sobrescrito.

Verificação: passam a checagem de tipos focada do Host/Main e dos novos testes de ciclo de vida; Lint com 0 errors (59 warnings originais) e architecture com 0 violations. `pnpm typecheck` e `pnpm --filter @zcode/desktop typecheck:e2e` foram executados, mas continuam bloqueados pelos 7 erros de tipo originais em r3-docker-transport:72–74 e r3-live-zapi:61–64. Não houve reexecução em máquina real Windows/WSL; os limites do cliente móvel são cobertos pelos testes focados de shared-host/relay, sem execução de GUI no celular.

Teste adicional de recuperação automática: `r3-transport-loss` passou na mesma build corrigida, cobrindo a troca de session do grupo A/B após a desconexão durante a execução, a continuidade da tarefa remota e a conclusão do bloqueio de permission após a recuperação de uma desconexão, com o sentinela executado apenas uma vez. As amostragens de permissionDialogId antes e depois do caso são ambas null, o que não permite provar a continuidade do ID da requisição. Evidências: `packages/desktop/.e2e-artifacts/r3-provisioning-fix-verified-20260911/cases/r3-transport-loss/`.

## Revisão e correção de teste do ssh-remote-project-conversation-scope (2026-09-11)

Conclusão: revoga a qualificação de produto de "silêncio na entrada conversation dentro de project" em §26/§40. As pilhas de falha dos quatro logs de execução originais param todas na linha 55 da spec não modificada, ou seja, na primeira conexão de conversation; project e a task + ficam respectivamente nas linhas 64–74 seguintes, ainda não executados. Na última rodada, todas as 1201 polling devem ter apresentado `dialogOpen=true`, o que contradiz a descrição `false` de §40; o histórico vazio do projeto não prova que o project bind tenha perdido o histórico.

O `waitForRemoteConversationTab` do teste só tratava o antigo ConfirmDialog e deixava passar o "安装并继续" embutido no assistente SSH. Primeiro, com os componentes reais de etapas de conexão atuais, foi executado o script de polling original dos logs históricos: o botão de confirmação não é clicado e o estado permanece dialogOpen=true/tabs=[]; o helper público funciona tanto na versão em inglês quanto na versão em chinês, e a probe isolada passou 3/3. A correção chama o helper já existente `waitForSSHDirectoryStep` após o submit de `connectSSHConversation`, tratando a confirmação de instalação/de fronteira, e só então executa as asserções originais de identity/session/ativação de conversation; não foi afrouxado o contrato de sessions independentes de project/conversation nem o de Host único, e nenhum código de produto foi modificado.

**Em 2026-09-11, 16:31:12–16:32:14 (horário de Pequim), GUI E2E completa com PASS**, test body 26.505s, sem retentativas. Container Linux arm64 novo, home independente, Desktop reconstruído a partir do workspace `9267b534287a1248a32dfb03feeea0e9d3cf9fff`. run.log:4324 registra o botão de instalação embutido e 7600 registra o fechamento do assistente; em seguida o project e o novo attachment de conversation completaram o bind separadamente, e as asserções de remoteSessionId independente original, de tab ativa atual e de Host da janela inalterado passaram todas.

As novas evidências estão em verification.md e nos arquivos result.json, test-results.ndjson e run.log de `packages/desktop/.e2e-artifacts/r3-project-conversation-fix-20260911/cases/ssh-remote-project-conversation-scope/`. Os logs de falha originais, os containers e o results.json dos 49 cases foram preservados. O bundle histórico do aplicativo foi limpo e o manifest não registra SHA; a aprovação desta vez prova apenas o workspace atual acima; a fase histórica de falha foi conferida com os scripts e as pilhas originais preservados.

Verificação: passam o fixture check, a checagem de tipos de E2E focada, o oxfmt, o architecture (0 violation) e o lint (0 errors, 59 warnings preexistentes). `pnpm typecheck` e o `typecheck:e2e` do Desktop foram executados, mas continuam bloqueados pelos 7 erros de tipo já existentes, não modificados, em r3-docker-transport:72–74 e r3-live-zapi:61–64. Não houve execução real do Desktop Windows/Linux nem da GUI móvel; desta vez só a precondição de teste foi corrigida, e a implementação de produto do desktop-continuous e do shared-host/replayable do celular permanece inalterada.
