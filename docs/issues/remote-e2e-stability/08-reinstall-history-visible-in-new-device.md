# A desinstalação e reinstalação preservando dados deve manter a identidade do dispositivo original e o histórico

Status: done

## Expectativa original do teste

O guia de SSH do desktop, em “远程机器被重装” (“A máquina remota foi reinstalada”), exige que,
após a confirmação, seja criado um novo dispositivo, a conexão antiga seja arquivada e o histórico
antigo seja preservado, sem misturar o histórico antigo no novo dispositivo.

## Reprodução do histórico real

- Baseline de negócio `a13999a28927f629d0c64080a5096cf8b4f23bae`.
- case `conversation-session-r3-uninstall.test.ts`, lote
  `r3-server-20261010001224807-40c41f`, tarefa `uninstall`.
- Após a instalação inicial, um turno real foi concluído no projeto original, resultando na tarefa
  `sess_3b24f10d-ee85-48b9-b8ab-803cfbbff229`.
- Identidade da instalação original `2a4c7471-3337-4631-a43c-6129aa1ed4b6`. Executado o uninstall
  real pelo CLI, a reinstalação exige confirmação de identidade; cancelar mantém o registro antigo,
  confirmar arquiva o Profile antigo e cria um novo Profile.
- A nova identidade é `c518b19a-5e27-4da8-b96a-3f57a0f5466b`. Depois de escolher efetivamente o novo
  dispositivo e o mesmo diretório, a lista de tarefas visível do projeto correspondente ao novo
  dispositivo contém a tarefa antiga acima, e a asserção `not.toContain` falha.
- `uninstall.json` guarda a tarefa/identidade original, o resultado da confirmação, as linhas de banco
  preservadas e `newInstallationTaskIds`; a verificação do histórico não é substituída por apenas um
  sentinela de arquivo ou pelo cache do App antigo.

## Limites do modelo de dados

O Server mantém a canonical key legada para compatibilidade e fallback; nesta rodada as linhas do
banco ainda usam a SSH route key original. O `SourceServerWorkspaceAliasRepo` procura por diretório um
canonical já existente; a mudança de identidade de dispositivo do App não isolou a visibilidade das
tarefas já existentes nesse diretório de usuário do Server. O teste original tratava a desinstalação e
reinstalação preservando dados como um dispositivo independente, mas no remoto continua sendo o mesmo
conjunto de dados do usuário. Não se pode apagar dados do usuário nem usar o UUID da instalação para
declarar o formato de armazenamento existente.

## Semântica e objetivo da correção após a confirmação (2026-10-10)

Confirmação do usuário: a desinstalação e reinstalação preservando dados deve manter a identidade do
dispositivo original, a conexão e o projeto, com o histórico antigo visível e able to continue a
conversa. Esta versão ainda não foi publicada, portanto não há necessidade de compatibilidade de
estoque com perda de identidade ou dispositivos duplicados. Ponto de partida desta rodada
`1229463da32f09989cc474e0a8641c7f5b183d40`.

A causa raiz é que o allowlist de desinstalação removia `install.json`, fazendo a reinstalação gerar um
novo UUID, e o App arquivava a conexão original criando outro dispositivo; a leitura do histórico em
si está de acordo com a semântica de preservar dados. A correção preserva a marca de identidade
existente no limite de desinstalação do Server, reutilizando a criação atômica atual, a validação de
ownership e a proteção de inicialização da desinstalação, sem alterar o histórico canonical nem o
roteamento de identidade do App.

O case original passa a verificar a restauração no mesmo dispositivo; confirmação/cancelamento/
arquivamento/isolamento do histórico passam a usar variantes em um ambiente de dados realmente
independente. A especificação está em [Ciclo de vida da identidade R3](../../architecture/r3-source-server-remote-architecture.md#保留数据的卸载重装2026-10-10).

## Implementação e verificação

- O uninstall oficial preserva `install.json`; a limpeza dos demais ativos de runtime e a proteção de
  inicialização via `uninstalled.json` permanecem inalteradas. O App continua usando o caminho de
  restauração de conexão/projeto existente com o mesmo `sourceServerId`, sem alterar a canonical key
  do histórico.
- O aviso de mudança de identidade passa a ser uma mudança da identidade do destino da conexão; a
  confirmação de instalação comum não é mais chamada de “novo dispositivo”; ZH e EN sincronizados.
- A regressão do CLI ficou vermelha antes de ficar verde: a implementação antiga não listava
  `install.json` em `preservedPaths`; a nova implementação verifica que o arquivo de identidade é
  preservado como está, que a reinicialização não troca o ID e que a marca de desinstalação continua
  presente antes da conclusão da instalação. Os 4 arquivos / 78 verificações relacionados passaram.
- Testes raiz afetados (ponto de partida `1229463da32f09989cc474e0a8641c7f5b183d40`): 631 arquivos
  Vitest / 6272 verificações e 28 verificações de auditoria Node passaram; os 4 arquivos / 15
  verificações relacionados ao texto final de confirmação da instalação passaram, sem executar toda a
  suíte de unit tests.
- Checagem de tipos, checagem de tipos do E2E, lint, arquitetura, fixture e a auditoria de 105
  contratos de fila passaram; o lint manteve as 81 advertências existentes. A varredura de terminologia
  só encontrou nomes de branch já existentes na especação atual, sem novos achados.
- macOS Electron → contêiner SSH Linux arm64 independente,
  `desktop-e2e-20261010-reinstall-fix-preserve-data-r2` **1/1 PASS**: uninstall oficial, clique na
  confirmação de instalação a partir do projeto original, instalação real, source/Profile/projeto
  originais mantidos, tarefa antiga visível e continuação de conversa de fato; a session da conexão foi
  renovada. `uninstall.json`, `preserved-history.png` e `build-source-evidence.json` guardam as
  evidências, o build é `fresh-stable` e a lista de desinstalação do archive Linux real foi conferida
  como o conteúdo da correção.
- Na primeira rodada de preservação de dados já foi verificado que o uninstall real preserva a
  identidade, mas o case chamou o helper de espera da página de erro sem clicar na confirmação de
  instalação da página de handoff do projeto original, falhando por “需要先确认安装” (“é preciso confirmar a
  instalação antes”). Após acrescentar a confirmação de instalação real do usuário e esperar a saída da
  página de erro, a execução foi repetida, sem modificar a lógica de negócio nem afrouxar as asserções
  de identidade/continuação de conversa; o artefato da falha da primeira rodada foi preservado.
- `desktop-e2e-20261010-reinstall-fix-replace-environment` **1/1 PASS**: após o arquivamento completo do
  `.zcode` original, foi instalado um ambiente de dados vazio pelo mesmo ponto de entrada SSH; o novo
  UUID dispara a confirmação, cancelar mantém o Profile original, confirmar arquiva a conexão antiga e
  cria um Profile independente. A tarefa antiga é reconciliável no banco arquivado, a lista de tarefas
  visível do novo dispositivo está vazia e a session e o corpo atuais não misturam a tarefa antiga.
  `identity-confirmation.png`, `new-environment-empty.png`, `uninstall.json` e as evidências do build
  `fresh-stable` foram preservados no diretório do run correspondente.
- Ambos os E2E reconstruíram o Desktop, usando o archive de Server/Agent regerado com o código-fonte
  desta rodada; o SHA-256 do arquivo final do Server CLI em execução corresponde ao arquivo
  correspondente do archive usado no E2E, salvo como `final-runtime-check.json`. Os contêineres
  temporários foram limpos; a inspeção das capturas de tela não mostrou obstruções nem textos de
  estado inconsistentes.

As duas variantes mantêm `manual-review/pending`, sem promoção manual nem admissão em CI. O FAIL
original do lote histórico foi preservado, e sua expectativa de que a reinstalação preservando dados
não mostrasse o histórico antigo foi substituída pela semântica confirmada pelo usuário nesta rodada.
Não foram verificados os hosts de desktop nativos Windows/Linux, os modos de conexão de produto
WSL/Docker ou o relay do celular de ponta a ponta; desta rodada não altera os limites de Host/protocolo
nem de continuous/replayable.
