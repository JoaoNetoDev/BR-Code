# Plano de correção da reentrada de instalação no auto-update

**Objetivo:** corrigir, a partir de `v3.15.2`, o travamento causado pela instalação repetida durante
o exit nativo, preservando a capacidade de re-tentativa em caso de falha.

**Arquitetura:** o main do updater é o único detentor das marcas do ciclo de vida da instalação. Reaproveita-se
o comando de instalação existente, o tratamento de erro e as barreiras de exit do Host/Agent, sem adicionar
timers nem novas cópias de estado.

**Stack técnico:** TypeScript, Vitest, Electron, electron-updater, Playwright.

## Passos de execução

1. Atualizar `docs/desktop/auto-update-superseded-ready-package.md`, explicitando a passagem de bastão de
   instalação bem-sucedida, a re-tentativa em caso de falha e os limites entre plataformas.
2. Em `packages/desktop/test/autoUpdaterReadyState.test.ts`, adicionar primeiro os casos de exit assíncrono
   no macOS/Linux, comando repetido e re-tentativa de falha de instalação síncrona/assíncrona; executar e
   confirmar que a implementação antiga falha.
3. Adicionar `packages/desktop/scripts/auto-update-install-reentry-smoke.mjs`, usando um processo Electron
   isolado para clicar no ponto de entrada de instalação via IPC do renderer, executar o staging assíncrono
   / callback de exit do MacUpdater real, registrar o número de instalações e o estado de exit; confirmar que
   a implementação antiga não passa.
4. Modificar `packages/desktop/src/main/autoUpdater.ts`: manter a marca em caso de chamada bem-sucedida,
   liberá-la em erro síncrono e em falha válida, e deixar as falhas seguirem para o tratamento de erro já
   existente; adicionar um comentário em chinês explicando a causa raiz.
5. Executar os testes unitários direcionados, o smoke de Electron, `pnpm architecture:check --changed`,
   `pnpm typecheck`, `pnpm lint` e as verificações de formatação/open-source dos arquivos alterados; registrar
   os resultados reais e as limitações da verificação do pacote de release assinado.
6. Revisar o diff e submeter um Conventional Commit; esta tarefa não faz push nem cria MR.

## Registro de verificação

- Implementação antiga: o teste unitário de liberação de exit no macOS/Linux falha; o smoke de Electron
  observa `before-quit` bloqueado e nova chamada à preparação da instalação.
- Após a correção: passam 93 testes unitários direcionados cobrindo o estado do updater, os quatro tipos de
  pacote de download no Linux, a atualização forçada, o menu do aplicativo e o ponto de entrada de mensagem
  do renderer; o smoke de Electron registra a ordem preparação, entrada de instalação, staging nativo,
  instalação nativa e exit, com uma única chamada de instalação e código de exit 0.
- `pnpm typecheck`, `pnpm lint`, a checagem de arquitetura, a formatação dos arquivos alterados e a checagem
  de termos de concorrentes passaram. O lint tem 68 avisos já existentes.
- Na primeira execução de `ZCODE_PRE_PUSH_BASE=v3.15.2 pnpm verify:pre-push`, os testes relevantes se
  expandiram para 2077 arquivos: 19808 passaram, 3 falharam e 13 foram pulados. As falhas pertencem à build do
  provider e à integração de runtime update, com falta dos módulos `broker/helperConstants` / `broker/server`
  do CUA; os links de dependência locais de desktop/services apontam para um diretório de workspace antigo que
  não fornece essas entradas. Os arquivos com falha não têm alterações em relação à tag, e os casos de build do
  provider reproduzem o mesmo erro de módulo ausente ao serem reexecutados de forma independente.
- Na preparação do MR foi conferido que o manifesto do pacote CUA instalado é consistente com o commit de
  producer fixado, restaurando-se apenas os links de dependência locais incorretos; o pin de producer e as
  declarações de dependência do repositório não mudaram. Os 3 casos com falha passam ao serem reexecutados de
  forma independente, e o gate completo roda normalmente no push.
- O smoke de Electron substituiu o instalador nativo, portanto a substituição do arquivo ShipIt e o reinício
  do pacote de release assinado ainda dependem de verificação antes da publicação; o fluxo completo de produto
  no celular e no Windows não foi reexecutado. Esta alteração não mudou a implementação de comunicação nem de
  preparação de exit dos mesmos.

## MR 2906: limite da correção de CR-01

- Commit original da revisão: `95ed60e166abd70b4d0318d55ff3bba07df8240a`. O sourceCommit / graphCommit do
  grafo de revisão corresponde a esse commit; os arquivos afetados são o código-fonte do updater, o teste
  unitário de ready-state e o smoke de Electron, impactedNodes / relatedTests estão vazios e os três testGaps
  são lacunas candidatas, a serem verificadas contra os testes reais.
- Causa: a falha de download de uma versão mais recente em segundo plano libera incondicionalmente a marca de
  instalação, mas a chamada de instalação antiga ainda aguarda o Promise de preparação de exit; um IPC
  repetido ou um evento de exit pode criar uma nova chamada de instalação.
- Correção: o main passa a deter o ciclo de vida da instalação por meio de um único estado de fase. A fase
  `preparing` não é liberada pelo tratamento genérico de erros; após a preparação, a chamada original reavalia
  o pacote original e o alvo atual e encerra por conta própria; a fase `installing` não é liberada por falha de
  download em segundo plano. Uma falha de instalação válida ainda permite re-tentativa.
- Escopo da alteração: `autoUpdater.ts`, `autoUpdaterReadyState.test.ts`, `auto-update-install-reentry-smoke.mjs`,
  a spec de atualização existente e este plano. O graph antigo não foi reutilizado como snapshot após a
  alteração; a próxima rodada só aceita a revisão/graph correspondente ao novo commit.
- Evidência de regressão: antes da correção, preparação de exit / número de instalações eram 2/2; depois, 1/1.
  Os testes unitários cobrem falha de download durante a preparação em macOS/Linux/Windows, IPC repetido /
  evento de exit e mudança de alvo; o smoke de Electron ganhou o cenário `--preparing-download-failure`,
  usando IPC do renderer para medir a mesma ordem.
- Verificação: passam 97 testes unitários do updater e de seus pontos de entrada; passam os dois smokes de
  Electron (caminho normal e falha de download durante a preparação); passam typecheck, typecheck:e2e, lint,
  architecture e as checagens de formatação e de termos de open-source. O lint ainda tem 68 avisos já
  existentes.
- Esta foi a rodada no modo padrão, tratando apenas as Critical Issues; as sugestões SG-01 / SG-02 e a
  verificação com pacote de release real e em máquinas reais de outras plataformas permanecem pendentes.

## MR 2906: limite da correção de CR-01 / CR-02 na segunda rodada

- Commit anterior à correção: `316628224442d5de50799b7a1cdffb7c43e94950`. O novo reviewer / graph corresponde
  a esse commit: affectedFiles continua em 3, impactedNodes / relatedTests em 0 e testGaps passou de 3 para 4,
  servindo apenas como lacunas candidatas.
- Causa raiz de CR-01: a preparação de exit encerra irreversivelmente o serviço; reavaliar o alvo só depois da
  preparação e cancelar a instalação deixa uma janela inválida. Causa raiz de CR-02: a instalação e o download
  em segundo plano compartilham o contexto do updater, de modo que o estado de download do menu atual não
  permite inferir a origem de um erro nativo assíncrono.
- Correção: nova fase de admissão `admitting`, que bloqueia novas verificações e aguarda o fechamento das
  verificações já aceitas, dos resultados assíncronos e dos Promises de download; o alvo é confirmado antes da
  limpeza do serviço e, após entrar em preparação, o resultado da atualização e o ponto de entrada de download
  ficam travados. O erro de instalação não coincide mais com o download, então o estado de instalação pode ser
  liberado; a falha de staging nativo durante a preparação reinicia o serviço de forma controlada após o fim
  da limpeza.
- Testes primeiro: a implementação antiga falha em 8 novas regressões; após a correção passam 105 testes
  unitários direcionados, cobrindo rejeição antes da limpeza e trava de alvo após a limpeza nas três
  plataformas, admissão de download existente, cache ready síncrono, ordem de erro nativo e eventos repetidos.
  Os testes existentes relacionados passaram a aguardar a conclusão do ciclo de vida, evitando assumir uma
  quantidade fixa de microtasks.
- Os dois smokes de Electron isolados passaram; o evento de novo alvo durante a preparação fica travado, o IPC
  repetido do renderer não reentra, a chamada real de instalação do MacUpdater e a preparação do serviço
  ocorreram uma vez cada e o processo saiu normalmente. O parâmetro `--preparing-download-failure` foi mantido
  por compatibilidade com chamadas históricas; o caso atual verifica que o download concorrente não pode
  iniciar após a trava do alvo.
- O escopo da alteração continua sendo updater / testes unitários / smoke / dois documentos existentes. A
  substituição real do pacote assinado, as máquinas reais Linux/Windows e a regressão completa no celular ainda
  dependem de verificação manual; o modo padrão não tratou as Suggestions.
- Verificação: passam `pnpm typecheck`, `typecheck:e2e` do desktop, lint (68 avisos já existentes, 0 erros),
  architecture (0 violações) e as checagens de formatação e de termos de open-source. Uma checagem adicional e
  independente de `tsconfig.main.json` reportou 77 erros já existentes; comparando com o código-fonte do updater
  anterior à correção por meio do TypeScript compiler host, a quantidade e o conteúdo dos erros são idênticos,
  e nenhum erro de tipo novo foi introduzido nesta rodada.

## MR 2906: limite da correção de CR-01 / CR-02 na terceira rodada

- Commit anterior à correção: `cf09013d43a6ebd476a47ecb45e12158239aeb94`; reviewer / graph correspondem a
  esse commit. As duas Critical da segunda rodada foram confirmadas como resolvidas, mas a recuperação de
  erro nativo após a passagem de bastão da instalação e a admissão de rede pendente voltaram a ser
  bloqueadores. affectedFiles continua em 3, impactedNodes / relatedTests em 0 e as testGaps candidatas são 8.
- Verificação de dependências travadas: a instalação do BaseUpdater lê o downloadedUpdateHelper; a instalação
  do MacUpdater lê o native staging / proxy já estabelecidos; a checagem do manifesto atualiza apenas o
  updateInfoAndProvider e não substitui diretamente o pacote de instalação já baixado. Os eventos de erro de
  checkForUpdates trazem a indicação de origem; os erros nativos não trazem essa indicação.
- Remoção de `admitting` e do conjunto de Promises de rede em espera, confirmando que a instalação trava o
  ready; todos os eventos de verificação tardios, as leituras assíncronas de configuração e as falhas de
  verificações já disparadas não podem reescrever o pacote. O evento de ready do download real é associado ao
  CancellationToken existente e só é publicado após o fechamento bem-sucedido; falha/cancelamento não publica.
  A instalação não depende da conclusão do trabalho de rede nem introduz sincronização por timeout.
- As falhas iniciadas depois do início da limpeza do serviço entram unificadas em `recovering`, com relaunch /
  exit controlados restaurando o Host/Agent e os serviços de controle remoto; o estado final filtra erros
  duplicados e não tenta de novo na janela antiga de um serviço já destruído. O novo processo pode baixar e
  instalar novamente.
- Testes vermelhos: a implementação antiga falha em 11 casos, incluindo verificações pendentes nas três
  plataformas, ready com download não concluído e a janela inválida após erro nativo. Após a correção passam 79
  testes unitários do updater; com as entradas relacionadas e os downloads do Linux, somam-se 109.
- Quatro smokes de Electron: exit normal, mudança de alvo durante a preparação, verificação de segundo plano
  que nunca conclui e recuperação de erro de staging nativo — todos passaram; instalação/preparação ocorreram
  apenas uma vez, a recuperação do erro nativo apenas uma vez e o código de exit foi 0. A substituição real do
  pacote assinado e a verificação em máquinas reais das múltiplas plataformas ainda estão pendentes.
- Verificação: passam o typecheck do projeto, o typecheck de E2E, o lint (68 avisos já existentes), o
  architecture e as checagens de formatação e de termos de open-source. A checagem independente de tipos do
  main continua com os mesmos 77 erros históricos em relação à pré-correção, com 0 novos. O modo padrão não
  estendeu o tratamento para as Suggestions não bloqueadoras.
