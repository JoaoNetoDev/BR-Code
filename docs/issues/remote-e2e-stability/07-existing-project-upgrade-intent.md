# Ausências de handoff de autenticação, atualização e reinstalação na conexão de projetos existentes

Status: done

## 2026-10-11 Regressão na entrada do projeto atual

Baseline de negócio `d31e735905cf744e75a0a93548a80acabe871ae5`, build `test`.
O lote `r3-server-20261011101534847-c8a52a`, caso `version-snapshot-failure-required`, concluiu a
instalação inicial real via SSH, a criação dos projetos A/B e a instalação da fixture de metadados
de versão antiga. Após clicar em “连接” (“Conectar”) no menu do projeto existente, o assistente não
foi aberto, a página parou em “需要处理 / 重新连接” (“Requer ação / Reconectar”) e o remoto continuou
em `3.14.0`.

- O log de execução confirma que `remote-projects.connectHost` retornou `SourceServerUpgradeRequiredError`:
  `Source Server 3.14.0 must be upgraded to at least 3.15.1`.
- A fixture de falha de snapshot só intercepta a leitura quando o assistente existe; nas 299 amostras
  de execução houve zero requisições. Esta falha ocorreu antes do handoff da intenção de atualização,
  portanto não pode ser atribuída à lógica de recuperação após recusa do snapshot, nem se pode
  afirmar que esse ramo de falha foi coberto.
- A ação de conexão de projeto em `packages/ui/src/project-sidebar/index.tsx` chama diretamente
  `remoteService.connectHost`, sem passar pelo handoff de atualização do assistente usado antes na
  restauração de projetos existentes. Essa cadeia de chamada é coerente com o erro de execução acima.
- As evidências estão em `packages/desktop/.e2e-artifacts/r3-server-20261011101534847-c8a52a-version-snapshot-failure-required/`:
  `version-policy.json`, `test-results.ndjson`, a gravação da falha e os logs em `logs/desktop`.

O lote completo `r3-server-20261011105317614-4a6780` reproduziu novamente: `manual-required` falhou
em 397,3 s e `snapshot-failure-required` em 213,9 s. Em ambos, `finalInstalledVersion` continuou em
`3.14.0` e nenhum `restoredProjects` foi obtido. O teste também tinha uma asserção obsoleta com a
versão pós-atualização fixada em `3.15.0`, que foi alterada para a versão real de instalação inicial
desta rodada; essas duas falhas ocorreram na fase de espera da recuperação, antes de a asserção de
versão ser executada, portanto não podem ser classificadas como falso positivo causado pelo valor fixado.

Esta rodada registra apenas a regressão de negócio, mantém as asserções que falharam e não altera a
implementação de negócio. A variante comum de atualização manual na fila completa ainda precisa de
revisão independente; os registros de correção e de aprovação da versão antiga abaixo são mantidos e
não servem como evidência de aprovação para o baseline atual.

No lote `r3-server-20261011125749338-152f05` do patch de teste 07 na mesma baseline, `serverupdate`
(213,3 s) e `serverupdate-force` (226,7 s) também pararam em “恢复入口没有提供更新操作” (“a entrada de
recuperação não ofereceu a operação de atualização”). Esses dois casos de mesma versão e SHA
diferente não chegaram à confirmação da atualização forçada com tarefa em execução, portanto não podem
ser contados como guard já coberto. As asserções originais e os objetivos independentes permanecem;
após a restauração do handoff de negócio, é preciso continuar validando os ramos de cancelamento/forçado.

No mesmo lote, `version-snapshot-failure-required` falhou após 225,7 s; a versão original de instalação
inicial era `3.15.1` e, ao fim da falha, continuava em `3.14.0`, sem `restoredProjects` nem resultado
`snapshotFailure`. Isso é um bloqueio anterior ao handoff de atualização; as asserções seguintes de
recusa de snapshot e de “apenas uma atualização na retentativa” ainda não foram alcançadas. No mesmo
lote, `manual-required` falhou em 398,4 s e o final continuou em `3.14.0`, sem projetos restaurados.

## A recuperação após a atualização em segundo plano ainda precisa de triagem

No mesmo lote completo, `automatic-required` terminou com o remoto em `3.15.1`, diferente do ramo
manual, que não atualizou. O log registra `source-server-management.updateSource OK (64480.1ms)`; depois
disso houve apenas um ACK de ready da conexão Source, e não se viu o workspace-context-bound dos
projetos A/B originais. O snapshot aguardando a restauração de B ainda preservava identity/path ativos,
mas sem tab correspondente nem remoteSessionId, falhando após 382,8 s.

Esse ramo não pode ser registrado como “a atualização não foi executada”, e também não se pode afirmar
falha de conexão física apenas com base na ausência de uma linha no cache de navegação. O contrato de
restauração automática dos projetos originais é mantido; a triagem deve continuar combinando o
attachment do Source e o owner da navegação de projetos. `optional` já restaurou A/B e o remoto
permaneceu em `3.16.0`. Depois de complementar a espera assíncrona no teste, a reverificação do patch 07
continua sem o aviso de atualização, com A/B restaurados; isso foi registrado separadamente como
[aviso de atualização opcional ausente](21-optional-update-notice-missing.md), para
não confundir com a falha de atualização/restauração dos projetos originais.

O `automatic-required` do patch de teste 07 falhou novamente após 395,2 s: `finalInstalledVersion=3.15.1`,
mas sem `restoredProjects`. Diferente do ramo manual do mesmo lote, que manteve `3.14.0`, a restauração
dos projetos após a atualização em segundo plano ainda precisa de uma correção própria; não é possível
declarar a restauração completa apenas por ter acrescentado o handoff do assistente de atualização manual.

## Entrada de reinstalação após desinstalação na mesma baseline

O `uninstall` do lote completo `r3-server-20261011105317614-4a6780` também não chegou à confirmação de
instalação do projeto original. O `uninstall.json` registra a conclusão das duas confirmações DELETE do
CLI oficial: `current.json`/releases foram limpos, e o installationId original, as configurações, o
histórico e os sentinelas de dados do usuário foram preservados. A task original entrou em estado
offline retido; após clicar em “连接” (“Conectar”) no projeto, não apareceu o assistente “安装并继续”
(“Instalar e continuar”) em 30 s. O último quadro do vídeo da falha mantém a mensagem original, a
página exibe “需要处理 / 重新连接” (“Requer ação / Reconectar”), o projeto na barra lateral continua
offline e nenhuma confirmação de instalação apareceu.

Esta é uma ausência de handoff de reinstalação já observada; ainda não é possível afirmar, apenas pela
semelhança de interface, que a causa raiz é exatamente a mesma do ramo de atualização. O
`remote-projects.connectHost OK (32.3ms)` no log de execução também não prova que a reinstalação foi
concluída. A reexecução direcionada `r3-server-20261011123601821-eca14c` confirmou: após a falha,
`current=none`, releases vazio, remoteSessionId da tab original igual a null, projeto offline e dialog
igual a null. Nenhuma reinstalação silenciosa ocorreu. Não se altera a abordagem para instalar pelo
novo ponto de entrada de dispositivo a fim de contornar o contrato do projeto original.
Diretório de evidências: `packages/desktop/.e2e-artifacts/r3-server-20261011105317614-4a6780-uninstall/`.

## O projeto original sem credenciais não entrou no assistente de autenticação

No patch 08, lote `r3-server-20261011143037600-31012b`, o `projectnavigation` passou pelas verificações
de listagem plana de projetos offline, troca de timeline, anotações de dispositivo, menu de projeto e
entrada de projeto remoto desativado. A fixture deliberadamente não salva a senha SSH; após clicar em
conectar pelo menu do projeto, o Host retornou explicitamente `Connection Profile requires
interactive credentials`, mas não houve assistente de autenticação em 20 s, e o caso inteiro falhou em
86,5 s.

Esta é uma ausência de handoff na falta de credenciais, não uma perda de credenciais: a fixture nunca
guardou senha. As asserções seguintes de isolamento de formulário entre dispositivos e de preservação do
método de download existente ainda não foram alcançadas. O caminho da ação de projeto atual, que chama
diretamente `connectHost`, deve continuar delegando ao fluxo de autenticação existente, sem deixar o
usuário apenas diante de uma falha inaproveitável. A implementação de negócio não foi modificada.

## Especificação e comportamento de falha original

O guia de SSH do desktop do Feishu, seção “远端版本更新” (“Atualização de versão remota”), e a
especificação principal
[§6.3](../../architecture/r3-source-server-remote-architecture.md#63-版本兼容与远端更新d10)
exigem que, em uma conexão manual explícita, seja iniciada automaticamente uma atualização protegida,
e que, sem tarefas em execução, a operação original continue. Na baseline original de teste, a entrada do
projeto original abre a página correta “更新远端” (“Atualizar remoto”), mas não inicia a atualização
automaticamente.

## Evidências de execução

- Baseline de negócio `a13999a28927f629d0c64080a5096cf8b4f23bae`.
- `conversation-session-ssh-remote-version-policy.test.ts`, `manual-required`.
- Lotes `r3-server-20261009223735233-3b63ee` e `r3-server-20261009234650716-227ddc`.
- O objetivo independente simula o Server 3.14.0 com uma variante de metadados de versão do runtime
  completo desta rodada; o CLI registra que o daemon runtime foi convergido para 3.14.0. Não se usa uma
  string de versão para se passar por uma implementação de negócio antiga.
- A/B já abertos, sem tarefas em execução; conexão clicada a partir do projeto original B. O Host
  reporta `Source Server 3.14.0 must be upgraded to at least 3.15.0`.
- O projeto original e a intenção de diretório são preservados, o assistente exibe “更新远端”
  (“Atualizar remoto”), mas após 180 s de espera a sessão de B continua vazia. O log do Desktop não
  contém o `source-server-management.updateSource` acionado por essa operação; na reexecução,
  `finalInstalledVersion` continua em 3.14.0.

## Julgamento e limites

O teste original mantém isso como uma divergência entre a entrada do projeto original e o contrato de
atualização automática; a confirmação da causa raiz segue na seção abaixo.
Não se torna verde a asserção de “atualização automática” acrescentando um clique em “更新远端”
(“Atualizar remoto”) no caso. A rodada de regressão original não alterou o negócio.
A espera de atualização pelo usuário em segundo plano e a confirmação de atualização forçada possuem
evidências de aprovação independentes, o que não significa que este ramo de atualização automática do
projeto original foi aprovado.

## Causa raiz e correção (2026-10-10)

Ponto de partida da correção `6ea1a0e30e8c62c278cb7c948ea936f8ff5b7704`. O código do assistente, da
entrada de projeto, da ação de atualização e da verificação de compatibilidade do Host é o mesmo da
baseline de negócio original. `requestRemoteProjectConnection` entrega ao assistente a falha de conexão
já concluída como `initialFailure`; `acceptInitialFailure` apenas define o erro e o botão de atualização
e retorna, contornando a lógica de atualização automática já existente no ramo de exceção de
`startRemoteConnection`. A versão 41 do guia e a §6.3 da especificação principal deixam explícita a
atualização automática na conexão manual; a regra de que falhas comuns de conexão não são repetidas
automaticamente não cancela esse contrato de atualização.

A sonda real atual de dispatcher + Hook reproduziu o caso: com o mesmo SSH Profile e o mesmo snapshot de
atualização, o assistente comum chama `updateSource(force:false)` uma vez, enquanto o handoff do projeto
original chama zero vezes; clicar novamente no botão de atualização permite continuar no diretório
original. Esse limite usa E/O de serviço simulado; os erros, as capturas de tela e o resultado de sessão
não restaurada do SSH real histórico foram verificados separadamente, e a sonda não substitui a evidência
de instalação remota bem-sucedida.

A correção consolida a orquestração da atualização obrigatória na mesma função do assistente: tanto o
handoff do projeto original quanto os erros de conexão comum leem o snapshot mais recente do Host, e a
atualização protegida automática é executada uma única vez, apenas quando o remoto está em estado
required. Reaproveitam-se o guard de tarefa em execução, a confirmação explícita do modo forçado, a
intenção de diretório original e o epoch existente; após cancelar ou trocar a intenção, o resultado não
continua a conexão antiga, e a falha preserva a entrada de operação. Se após a atualização continuar
incompatível, não há loop automático. Local desatualizado demais, falha comum e restauração em segundo
plano não recebem nova atualização automática.

```text
Falha na conexão do projeto original / falha na conexão comum pelo assistente
  -> mesma intenção do assistente -> snapshot do Host confirma required no remoto -> updateSource(force=false)
  -> running-task guard: aguardando confirmação do usuário; sucesso: retoma a conexão do diretório original uma única vez
  -> cancelamento / troca de intenção: epoch antigo invalidado, não restaura o projeto antigo
```

Registros de verificação:

- Novas 9 regressões de dispatcher / Hook reais: antes da correção, 7 falharam e 2 casos de controle
  normais passaram; após a correção, os 27 casos dos dois arquivos relacionados passaram. Cobertura:
  primeira sinalização de atualização, estado já “precisa atualizar”, cancelamento/confirmação com tarefa
  em execução, resultado tardio após cancelamento da atualização, falha da atualização, incompatibilidade
  remanescente após a atualização, recolhimento e restauração, local desatualizado demais e falha comum.
- `pnpm test:unit:affected --base 6ea1a0e30e8c62c278cb7c948ea936f8ff5b7704`:
  370 arquivos Vitest / 4379 casos e 28 auditorias Node passaram; não foi executada a suíte unitária
  completa.
- Checagem de tipos raiz, checagem de tipos do E2E, lint, arquitetura, fixture, formatação do código
  alterado e verificação de termos de open source passaram; o lint mantém 81 avisos preexistentes.
- macOS Electron → contêiner SSH Linux arm64 independente,
  `desktop-e2e-20261010-version-fix-manual-required-r2` **1/1 PASS**.
  Apenas a conexão do projeto original B foi clicada, o `updateSource` real teve sucesso, o remoto foi
  atualizado da fixture 3.14.0 de volta para 3.15.0, e A/B mantiveram a identity e o diretório
  originais e obtiveram nova session. Foram adicionadas essas duas asserções de troca de session e os
  artifacts correspondentes; a asserção original de recuperação em 180 s foi mantida. Na evidência de
  build `fresh-stable`, o resumo do código-fonte do assistente é idêntico ao do workspace da correção.
- Na primeira rodada local não havia orçamento externo com o harness de servidor, e o WDIO com o padrão
  de 120 s interrompeu a execução na fase de preparação da fixture, sem chegar à reconexão do projeto
  original. A reexecução completou o orçamento externo de 15 minutos conforme a configuração existente
  `ZCODE_E2E_MANUAL_REVIEW_HOLD_MS=780000`, coerente com o orçamento da própria spec; nenhuma asserção
  de recuperação foi afrouxada nem foi adicionada retentativa de negócio.
- `desktop-e2e-20261010-version-fix-{automatic-required,optional,controller-required}-r2`,
  três variantes independentes, todas **1/1 PASS**: espera em segundo plano, atualização após o clique e
  restauração de A/B; a versão opcional permanece em 3.16.0, os dois projetos são restaurados e “稍后”
  (“Mais tarde”) continua válido ao reabrir as configurações; local desatualizado demais apenas avisa
  para atualizar o próprio desktop, e o archive remoto permanece inalterado. As duas últimas variantes não
  apresentaram log de sucesso de atualização do serviço de gerenciamento do Desktop, e a versão/artefato
  remotos foram preservados. Os três builds reutilizados mantêm o status original
  `unverified-reused-build`; além disso, os resumos dos 5282 artefatos foram comparados um a um com o
  build `fresh-stable` acima, com coincidência total, e o resultado da verificação foi salvo em
  `version-fix-verification.json` de cada run.

Os quatro variantes desta rodada mantêm `manual-review/pending`, sem promoção manual nem admissão em
CI. A entrada de versão continua sendo uma variante de metadados do runtime atual, e não se afirma
validação da implementação de negócio real da 3.14.0. O cancelamento de tarefa em execução, a
confirmação do modo forçado e o resultado tardio são cobertos por testes de fronteira reais de Hook, sem
execução adicional do cenário real de SSH com atualização forçada durante tarefa em execução; não foram
reexecutados os hosts de desktop nativos Windows/Linux nem a cadeia completa do relay móvel. A correção
ajusta apenas a orquestração do assistente na conexão explícita do desktop, sem alterar a
autoridade de Host/protocolo, migração de dados ou continuous/replayable; reverter este commit
restaura o comportamento original do botão de espera.

## Recuperação explícita da falha de snapshot de atualização (2026-10-10)

Após `dcf125265e` introduzir o handoff automático, se a nova leitura do snapshot falhasse, apenas
`upgradeProfileId` era limpo, mantendo-se o erro de atualização antigo; o botão “更新远端” (“Atualizar
remoto”) retornava imediatamente por falta de Profile. A correção limpa o erro de atualização antigo no
mesmo ramo de exceção, exibe a exceção real de leitura e o “重试” (“Tentar novamente”) já existente,
deixando que o usuário reinicie a conexão e a verificação de atualização da linha/diretório originais.
Reaproveita-se o isolamento por epoch, não se usa o snapshot antigo para atualização automática e não se
adiciona retentativa em segundo plano.

- Primeiro foram adicionadas duas regressões de falha, para a conexão comum e para o handoff do projeto
  original, ambas falhando antes da correção; a exceção de snapshot tardia após o cancelamento serviu
  como caso de controle. Após a correção, esses três casos e os casos de Hook originais passaram em
  **23/23 PASS**.
- Verificação afetada (ponto de partida `dcf125265e55416eed962a342250b592c0f46461`):
  **370 arquivos Vitest / 4382 casos e 28 auditorias Node passaram**; a auditoria de inventory do
  helper do E2E, após o ajuste final, passou em **9/9 PASS**. Checagem de tipos, checagem de tipos do
  E2E, lint, arquitetura e fixture passaram; o lint mantém 81 avisos preexistentes.
- `r3-server-snapshot-fix-20261010-r2` **1/1 PASS**: o desktop foi reconstruído e, na fixture real de
  atualização via SSH, foi injetada uma falha transitória de leitura de snapshot; o assistente exibiu os
  detalhes reais do erro e “重试” (“Tentar novamente”), sem atualizar durante a falha; após o clique,
  houve apenas uma atualização, A/B mantiveram a identidade e o diretório originais e obtiveram nova
  session, e a versão final remota foi 3.15.0.
  O `version-policy.json` salva o número de leituras recusadas (2 nesta rodada), o botão, o número de
  chamadas de atualização e o resultado da recuperação; o `snapshot-failure.png` salva a interface de
  falha.
- Na primeira rodada o teste apenas recusava a primeira requisição de snapshot sem parâmetros,
  atingindo a leitura concorrente em segundo plano sem cobrir o assistente, o que não serve como
  evidência de eficácia da correção. O teste passou a manter uma falha transitória de leitura até a
  falha confirmada no assistente e, em seguida, restaurar a leitura para validar a retentativa do
  usuário; o plano de negócio não foi alterado nem as asserções de recuperação afrouxadas.

Esta verificação ainda usa uma variante de metadados de versão do runtime atual, não comprovando a
implementação de negócio real das versões antigas; os hosts de desktop nativos Windows/Linux e o relay
móvel não foram reexecutados. O celular não usa este assistente de conexão explícita do desktop; a
autoridade de Host/protocolo e o owner de recuperação permanecem inalterados.

## 2026-10-12 Revisão da baseline atual e limites da correção

Ponto de partida da correção `07c35ed00085b9bb105d07633488951ff02032c2`. O menu de projeto nos logs
originais ainda chama diretamente remoteProjectService.connectHost, enquanto o RPN-06/§2.2 vigente
exige que, quando houver interação necessária, o caso seja entregue ao assistente único, preservando o
diretório. O dispatcher/assistente Root existente já trata credenciais, atualização protegida e
confirmação de instalação, mas o menu não está conectado a ele; apenas substituir o callback não é
suficiente: a versão nova só restaura a tab ativa, e a entrada antiga do Root retorna imediatamente
ao encontrar uma tab não carregada ou uma entrada de histórico. A regressão real do hook Root sem tab
de projeto confirmou esse limite: os handoffs de autenticação/atualização/instalação e a conexão normal
de dispositivo não foram executados.

```text
Projeto carregado → reconexão no lugar pelo Root → aguardando tratamento → assistente único → diretório original
Projeto salvo e não carregado → connectHost de membro do Host → aguardando tratamento → mesmo assistente → diretório original
                                   └─ sucesso comum apenas restaura o dispositivo, não cria nova tab de navegação
```

Correção recomendada: o menu de projeto do desktop chama a entrada de reconexão existente do Root; o
Root, sem tab, resolve o alvo a partir do diretório local de membros, reutilizando o dispatcher e o
connectHost existentes. Os membros são relidos antes do handoff, e resultados tardios após remoção ou
substituição não abrem o assistente antigo. O estado da conexão, as credenciais e a conexão física
continuam pertencendo ao Host; a restauração de tab do Renderer não é tornada autoridade da entrada de
projeto. Os caminhos não desktop continuam usando a conexão original do Host, sem nova capacidade de
assistente no celular.

Os casos de atualização em segundo plano foram conferidos à parte conforme F5: a inicialização a frio
restaura apenas o projeto ativo, e o outro projeto da lista de compatibilidade antiga deve ser aberto
sob demanda. Não se pode tratar uma tab A não carregada como falha de atualização; a atualização manual
com attachments A/B já em execução mantém as asserções de recuperação.

### Primeira rodada de execução e coleta adicional de evidências

O lote `r3-server-20261012022109986-c4ed79`, usando a baseline atual mais a correção da entrada de
projeto, teve como resultado 5 PASS / 2 FAIL: serverupdate 271,8 s, serverupdate-force 268,9 s,
manual-required 260,0 s, snapshot-failure-required 263,3 s e automatic-required 270,1 s passaram.
As duas últimas falharam: projectnavigation não teve assistente de autenticação; uninstall já tinha
clicado na confirmação de instalação, mas em seguida recebeu source-server-install-required. Não se
considerou a chegada à confirmação de instalação como reinstalação bem-sucedida.

Nova causa raiz de autenticação: SourceServerDirectory.resolveProfileTarget, sem credenciais, lança um
Error comum, perdendo o código público credentials-required já existente; a regressão real de Directory
falhou primeiro e só passou após a inclusão do código na fronteira onde o erro é gerado. A classificação
textual do Root não é ampliada para adivinhar a causa da autenticação. O hook de Flow real da confirmação
de instalação já foi verificado como transmitindo confirmSourceServerInstall=true e limpando o erro
antigo; na próxima rodada, a IPC do Main registra apenas a flag de confirmação e o resultado de retorno,
sem registrar target nem credenciais, para continuar localizando a falha restante da reinstalação.

### Revisão da causa raiz da reinstalação: novo ciclo de recuperação leu uma falha terminal antiga

Na quarta rodada, o Main já confirmou confirmSourceServerInstall=true, excluindo perda de confirmação
na UI/Main. Na sexta rodada, o Registry registrou route=null no momento da confirmação, mas o mesmo
Source ainda tinha o terminal owner de outra linha, com recovery=false e failure=true; só a nova conexão
seguinte entrou na pertenência canônica do Source. A sonda sintética anterior, com recovering na mesma
linha, não cobriu o cenário real, e o caso especial de instalação e o candidato de admissão autorizada
do Manager foram revertidos e não integram a implementação final.

Cenário real: a navegação de projeto usa a linha de metadata sem a senha; a conexão confirmada pelo
usuário carregou a senha, obtendo um route key diferente, mas, após o handshake, continua pertencendo ao
mesmo Source. Quando o Manager republica a conexão física, o antigo owner terminal começa a religar o
workspace de forma assíncrona, mas o recoveryFailure só é limpo quando todas as religações terminam,
enquanto o recoveryReady já havia sido limpo no estado terminal. A nova linha, nesse intervalo, faz join
no owner canônico e lança diretamente o erro de espera de instalação da rodada anterior, apesar de a nova
conexão de instalação já estar estabelecida.

```text
owner antigo: terminal + failure antiga + sem recoveryReady
nova conexão física → religação logical (assíncrona) → join da nova linha → lê a failure antiga por engano
Correção: nova conexão física → novo recoveryReady, limpa a failure antiga → religação logical → join aguarda o resultado do novo ciclo
```

A regressão real do Registry usa as duas chaves de linha agent/password do cenário real, o mesmo Source e
uma barreira de preparação controlada do workspace; antes da correção, obtinha o mesmo erro Remote
connection recovery exhausted do cenário. Na versão final, o beginRecovery existente só é chamado quando
o terminal owner recebe um novo reconnect físico, marcando um novo ciclo recovering; não são adicionados
caso especial de instalação, campo de flight do Manager, retentativa ou timeout. A regressão e os dois
arquivos vizinhos Registry/Manager passaram em 120 casos. O lote do patch final
`r3-server-20261012042036306-3218d0` passou pela reinstalação real (187,4 s), pelo guard de recuperação
(177,4 s) e pela reconexão a frio (187,1 s). O SHA-256 do manifesto de código-fonte é
`3da756d09a6a91969782149c7f1d177124e49e5def287fcfde14ed11d56cd85d`.
As evidências de reinstalação confirmam a preservação do ID de instalação, do Profile, da identidade do
projeto, dos sentinelas de configuração e dos dados do usuário; a session foi substituída, a task original
ainda pode continuar e o conjunto de processos do Host não aumentou.

### Aceitação final no servidor

O lote `r3-server-20261012042909750-5eed5a` reutiliza o mesmo manifesto de código-fonte acima e o build
verificado `beb4f93a0a86d3c6f4d0fab7d21188f5838fd7a07248f9eb7162e7d0db5551ae`; os seis casos passaram.
Junto com os três casos do lote anterior, cobre os sete deste problema mais dois casos vizinhos de
recuperação/inicialização a frio; não houve mesclagem de PASS de patches diferentes.

| Caso                             | Resultado / tempo |
| --------------------------------- | ----------------- |
| serverupdate                      | PASS / 256.9 s    |
| serverupdate-force                | PASS / 255.3 s    |
| uninstall                         | PASS / 187.4 s    |
| version-manual-required           | PASS / 273.6 s    |
| version-snapshot-failure-required | PASS / 231.5 s    |
| version-automatic-required        | PASS / 237.5 s    |
| projectnavigation                 | PASS / 73.1 s     |
| recov                             | PASS / 177.4 s    |
| coldreconnect                     | PASS / 187.1 s    |

Cancelar a atualização forçada mantém o SHA/Core original; a substituição ocorre somente após a
confirmação da atualização forçada. Após a recuperação da falha de snapshot há apenas uma chamada de
atualização; a atualização manual com execução em andamento restaura os dois diretórios originais A/B; a
atualização automática na inicialização a frio restaura o B ativo conforme F5, e A mantém a entrada,
sendo aberto sob demanda. A verificação de autenticação permite que um projeto salvo entre no
assistente sem precisar de tab já existente, e a troca de dispositivo não vaza a senha nem o método de
download do dispositivo anterior. O código final e os testes correspondem arquivo a arquivo ao manifesto
de código-fonte do servidor; depois disso, apenas a documentação de aceitação foi complementada.

### Verificação local e limites de impacto

- `pnpm test:unit:affected --base 07c35ed00085b9bb105d07633488951ff02032c2`: 442 arquivos Vitest,
  5174 casos e 70 verificações Node passaram; a suíte unitária completa não foi executada. Na rodada
  anterior, os testes de build do Web sem alterações falharam por timeout de concorrência; a reverificação
  independente passou em 45 casos e o escopo afetado final passou por completo, sem alteração de timeout
  ou asserção.
- Checagem de tipos, Lint e checagem de arquitetura passaram; o Lint teve 208 warnings preexistentes, 0
  errors, e a arquitetura teve 0 violações.
- A verificação de contrato de fixture dos quatro E2E alterados passou; o server-update mantém o aviso
  preexistente de que a marca de atualização não foi coberta pelo matcher.
- Os cenários de política de versão usam a fixture de metadados de versão do runtime atual, o que não
  comprova a migração de dados de programas reais antigos. A execução no servidor cobriu Linux Electron
  e SSH/Docker reais; não foram reverificados Windows/macOS nativos nem celulares físicos. A conexão não
  desktop continua passando pelo Host original, e a semântica de conexão e de erro do Direct Server é
  mantida pelas novas regressões.
- Não há mudança de formato de armazenamento, migração de credenciais ou de campos de protocolo.
  Reverter este commit volta à implementação original; não é preciso reverter dados de usuário.
