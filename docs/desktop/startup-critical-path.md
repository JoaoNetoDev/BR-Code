# Otimização do caminho crítico de inicialização do Desktop

## Contexto e linha de base

A amostragem de 2026-08-05 sobre logs de cold start de produção e as marks de runtime mostrou:

- Do `initializing local services` ao `local services ready` do Local Host, a mediana das 12 execuções mais recentes foi
  `2.081s`, e a execução mais recente levou `2.208s`.
- Executar duas vezes a mesma sondagem da login shell existente na mesma máquina leva cerca de `0.97s` cada: uma lê apenas `PATH`,
  a outra lê `env -0`. A segunda já inclui `PATH`, de modo que as duas sondagens em série são trabalho duplicado.
- No primeiro segundo após o Local Host ficar ready são produzidas cerca de `146` chamadas RPC; ao restaurar 13 workspaces, as consultas
  list/archive/pin/delete da task list entram na fonte de dados junto com todas as tabs.
- Na última inicialização fria de produção, a entrada utilizável foi estimada em cerca de `5.3s`; entre as marks T0-T5 embutidas, o primeiro
  commit do React levou apenas `24ms`, e a maior parte da espera acontece na inicialização do Host e na restauração dos workspaces após o startup gate.

Este documento define duas mudanças P0 que encurtam apenas o caminho crítico de inicialização da janela local do Desktop, sem alterar o estado
autoritativo de task/session, a semântica de conexão de workspace remoto nem o protocolo de recuperação do controle remoto pelo celular.

## P0-1: coletar antecipadamente, de forma assíncrona, o ambiente da login shell

### Situação atual

```text
renderer dom-ready
  -> fork Local Host
     -> createLocalServices()
        -> zsh -ilc <capture PATH>   ~0.97s, bloqueando o event loop do Host
        -> zsh -ilc 'env -0'         ~0.97s, bloqueando o event loop do Host
        -> constrói os services
        -> publica a porta RPC
```

### Sequência alvo

```text
Inicialização do módulo Main do Desktop
  +-> async shell -ilc 'marked env -0'  --------+
  |                                              |
  +-> app.ready -> cria a janela -> DOM do renderer
                                                 v
renderer dom-ready -> await do snapshot já aquecido -> fork Local Host
                                               -> InitLocal(envPatch)
                                               -> createLocalServices(envPatch)
                                               -> publica diretamente a porta RPC
```

Restrições:

1. A shell é executada apenas uma vez; o mesmo snapshot separado por null fornece `PATH` e os campos de ambiente permitidos para herança.
2. O Main usa `execFile` assíncrono, de modo que a coleta corre em paralelo com a inicialização de Electron/app/window; não se deve usar shell IO síncrono
   no caminho crítico do Main ou do Local Host.
3. O Main é responsável apenas por coletar e repassar o patch de runtime já filtrado, e não escreve o ambiente da shell diretamente no próprio Main.
4. `InitLocal` pode carregar `runtimeProcessEnvPatch`; o Remote Host não reutiliza o patch local, evitando levar o `PATH`, o `SSH_AUTH_SOCK` local ou a
   autoridade de workspace para SSH/WSL/Docker.
5. O Windows hoje não executa a sondagem de shell POSIX e continua usando as regras originais de bootstrap/Node path. macOS e Linux
   usam a mesma implementação assíncrona.
6. A antiga entrada de criação síncrona do Local Host fora do Desktop mantém temporariamente um único fallback de snapshot, garantindo compatibilidade
   com o remote server e com as chamadas de teste; ela não executa mais a dupla sondagem PATH + env.
7. Falha ou timeout no snapshot é fail-open: usa-se o ambiente do processo atual, o bootstrap path POSIX e as bundled tools,
   sem bloquear a inicialização da janela e sem registrar valores de ambiente ou segredos.

### Fronteira de segurança após o feedback de produção de 2026-08-09

A otimização de desempenho é mantida, mas o pré-aquecimento de ambiente só pode ser um item de aceleração de inicialização com limites definido; ele não pode se tornar um gate de inicialização de ponto único do Local Host.
Os logs de produção já confirmaram dois tipos independentes de falha: as amostras de tela branca no macOS tinham apenas `dom-ready` e depois nunca houve fork do Host; nas amostras
do Windows o Host sobe normalmente, mas, ao expandir o `Path` case-insensitive em um objeto comum, o downstream passa a ler `PATH` e acaba gravando apenas o diretório de bundled
tools no novo `PATH`, sobrescrevendo os diretórios de comandos que o usuário já tinha.

A sequência correta precisa satisfazer:

```text
Import do módulo Main
  -> captura assíncrona por janela da login shell
       | sucesso antes do deadline -> patch filtrado completo
       | falha / hard deadline -> patch de fallback sem shell
       v
renderer dom-ready
  -> espera limitada（não pode esperar a Promise indefinidamente）
  -> fork do Local Host exatamente uma vez
  -> InitLocal sempre carrega o patch completo
  -> o Host nunca executa login shell síncrona por causa do fallback
```

Invariantes de ambiente:

1. Os nomes de variáveis de ambiente do Windows são case-insensitive conforme a semântica do sistema operacional. Quando `process.env`, dotenv e o patch de
   pré-aquecimento são copiados para um objeto comum, todas as variantes de caixa de `Path` precisam antes ser unificadas em um único `PATH`; o ambiente real do processo tem prioridade sobre o dotenv.
2. O patch de fallback precisa ser calculado diretamente a partir do ambiente do processo atual, do bootstrap path da plataforma e das bundled tools; não se pode
   usar `undefined` para acionar o antigo fallback de shell síncrono dentro do Host.
3. A própria coleta da login shell precisa ter um hard deadline; no POSIX, após o timeout o processo deve terminar o grupo de processos dessa coleta e liquidar
   a Promise imediatamente, evitando que processos descendentes do profile herdando stdio façam o `execFile` nunca receber o close.
4. O ciclo de vida da Window precisa ter um deadline independente. Mesmo que uma injeção de teste ou um executor futuro nunca resolva, o Local Host precisa ser
   criado com o fallback; um resultado de pré-aquecimento tardio não pode criar um segundo Host.
5. A primeira janela reaproveita o pré-aquecimento que já começou no import do Main; cada janela nova posterior recolhe de novo de forma assíncrona, evitando
   reutilizar permanentemente um ambiente de shell expirado dentro de um ciclo de vida de processo. Se o Renderer recarregar e já houver um Host, continua
   reaproveitando a porta diretamente, sem esperar nem criar um Host.
6. Os logs registram apenas duração, motivo de sucesso/degradação e ciclo de vida, nunca o conteúdo do PATH, valores de ambiente ou segredos.

## P0-2: restaurar primeiro o workspace ativo e completar os inativos após o primeiro frame

### Situação atual

```text
settings.get
  -> garante o workspace de conversa
  -> restoreTabs([workspace 1 ... workspace N], activeIndex)
  -> todas as tabs entram simultaneamente nos hooks de task/sidebar/session
  -> fan-out de subscriptions de índice e RPC de membership para N workspaces
  -> limpeza do startup gate
```

### Sequência alvo

```text
settings.get
  -> resolve a sessão persistida completa e deduplicada
  -> restoreTabs([active workspace], 0)
  -> limpeza do startup gate -> campo de entrada do active disponível (T6)
  -> browser idle callback após o primeiro frame
     -> completeTabRestore(full persisted session)
     -> preserva o id da tab ativa / o foco atual / as novas tabs abertas pelo usuário
     -> workspaces inativos entram na fonte de dados da task list em background
     -> permite a persistência das tab sessions seguintes
```

Restrições de estado:

- active-first só é habilitado na cadeia de restauração local `desktop-continuous` da janela principal do Desktop. Web, celular
  `web-remote-replayable` e janelas secundárias que não restauram sessão mantêm a situação atual.
- O Renderer restaura o último projeto ativado por `lastActiveTabIndex`, inclusive um remote desconectado.
  `resolveStartupLocalWorkspaceSessionIndex` decide apenas o alvo de pré-aquecimento local do Main, podendo diferir do projeto
  ativado pelo Renderer; isso não altera a semântica de auto-reconexão remota desabilitada.
- O preenchimento dos inativos precisa ser um merge: não pode reconstruir a tab ativa já restaurada, não pode roubar o foco e não pode sobrescrever
  as tabs de settings/workspace que o usuário abriu antes do preenchimento.
- active-only é uma projeção transitória, não um novo fato persistido. Até que o preenchimento dos inativos termine ou falhe, a persistência de
  tabs não pode gravar o estado active-only de volta em `lastWorkspaceSession`.
- Quando `requestIdleCallback` não está disponível, usa-se um fallback com timer assíncrono; ambos precisam ser canceláveis, e após o unmount da Root
  não se pode modificar o store da janela antiga.
- Uma falha no preenchimento registra um erro no UI logger e libera o persistence gate; a entrada da inicialização continua disponível.

active-first é um estado de restauração em duas fases interno do Renderer, e não um snapshot completo de workspaces publicável para fora:

```text
pending
  -> active-ready
       | Renderer: permite a primeira tela e a entrada do workspace ativo
       | Main/TaskRealtimeBus: ainda espera, não publica workspaceKeys=[active]
       | Web remote: ainda espera, não publica snapshot de workspace único
       | persistence: ainda fechada
  -> complete
       | mescla os workspaces inativos
       | publica o scope completo de workspaces
       | abre o persistence gate
```

Restrições complementares:

1. `syncWindowTabs`, `syncWebRemoteControlWorkspaces`, o índice de tasks do controle remoto Web e o scope de telemetry que depende do conjunto completo de workspaces
   só podem consumir as tabs depois de `complete`. O desktop continua `desktop-continuous` e o celular continua
   `web-remote-replayable`; aqui não se introduz nenhum estado novo de replay/snapshot.
2. Se o usuário fechar a tab ativa inicializada entre `active-ready` e `complete`, o preenchimento precisa tratar esse fechamento como intenção do usuário
   desta janela e não pode readicioná-la a partir do snapshot persistido antigo. Tabs de workspace/settings abertas no período e o foco atual continuam sendo preservados.
3. A restauração completa continua usando `workspaceKey = workspaceIdentity?.trim() || workspacePath` para a igualdade de identidade; a execução de arquivos e a
   exibição continuam usando `workspacePath`.

## Aceitação e testes

A automação precisa cobrir:

1. Uma única chamada assíncrona de shell gera simultaneamente o `PATH` de login e os campos de herança permitidos; em caso de falha, usa-se o fallback.
2. `InitLocal` repassa o patch pré-computado ao Local Host, e `createLocalServices` usa o valor injetado sem disparar a shell.
3. A window não cria um novo Local Host enquanto o patch não está pronto; o reload do renderer reutiliza o Host existente sem esperar nem reconstruir.
4. A primeira fase do active-first tem apenas um workspace, a fase adiada repreenche a ordem original e preserva o id da tab ativa e o foco.
5. Nenhum snapshot active-only é persistido antes da conclusão do adiado; o agendamento é cancelável.
6. O restore remoto, o replayable de Web/celular e o comportamento de workspace identity continuam passando nos testes existentes.
7. Entradas `Path` do Windows geram um `PATH` único que preserva os diretórios do usuário; o ambiente do processo do Host também não tem chaves duplicadas por caixa.
8. Promises de pré-aquecimento que nunca resolvem, que rejeitam e que resolvem tardiamente criam apenas um Local Host e usam o patch de fallback completo
   após o deadline.
9. A fase active-only não publica snapshot de workspace único para o Main nem para o controle remoto do celular; o preenchimento não revive a tab ativa fechada pelo usuário.

Verificação mecânica: `pnpm typecheck`, `pnpm lint` e o Vitest pertinente; a verificação de desempenho usa o mesmo conjunto isolado de dados de
workspace/sessão de produção, com pelo menos 3 execuções de cold start antes/depois de cada versão, relatando a mediana e as mudanças nas duas etapas de
Local Host ready e T6, sem usar um único melhor valor como conclusão.

## Resultados medidos em 2026-08-05

A linha de base usou um worktree detached do mesmo commit anterior à mudança; antes e depois, o bundle de produção foi construído e a mesma fixture
de storage isolado, com 15 workspaces persistidos, foi copiada. Cada rodada usou um processo Electron novo, dados de usuário novos e um clone do
banco de dados, executando 5 vezes cada em alternância baseline/optimized; como o cache de arquivos do sistema operacional não foi limpo, aqui "cold start"
significa partida de processo frio, sem pressupor o cache frio da máquina inteira, que é incontrolável.

| Métrica | Mediana antes | Mediana depois | Variação |
| --- | ---: | ---: | ---: |
| De T0 até o campo de entrada utilizável (T6) | 5,441ms | 3,249ms | -2,193ms (40.3% mais rápido) |
| Inicialização do Local Host | 2,707ms | 17ms | -2,690ms (99.4% mais rápido) |
| Startup gate após o commit do React | 3,278ms | 579ms | -2,699ms (82.3% mais rápido) |

O novo snapshot único e assíncrono da login shell em si ainda tem mediana de cerca de `1,626ms`, mas ele começa na inicialização do módulo Main e se
sobrepõe ao Electron ready, à janela e ao carregamento do renderer; nas 5 rodadas ele sempre terminou antes da criação do Local Host, portanto não entra mais no caminho
crítico do Host. A redução na etapa do Host não se converte um a um em redução de T6, porque a prontidão de Agent/provider e o carregamento do renderer já
tinham alguma sobreposição; a conclusão perceptível pelo usuário é a melhora de mediana de `2,193ms` em T6.

## Caminho-limite seguinte: App Shell retomável, e não SSR

SSR tradicional não é a proposta da próxima fase. O renderer do Desktop já é um recurso estático local, e o primeiro commit do React
amostrado custa cerca de `24ms`; mover o JSX para uma pré-renderização em Main/Node ainda exigiria hydration e não eliminaria as esperas de Host, autenticação,
provider e RPC de workspace, apenas adicionaria dois ambientes de renderização e risco de UI obsoleta.

O objetivo real da próxima fase é separar "pode digitar" de "todos os dados já foram validados":

1. Gravar continuamente, de forma atômica, uma projection de inicialização versionada e mínima; não depender apenas do callback de saída normal, porque crash,
   atualização forçada e desligamento do sistema podem pular a coleta de saída.
2. A projection contém apenas a identity/purpose do workspace ativo, a ordem das tabs, campos de exibição limitados de task row, drafts não enviados
   e preferências de UI; não guarda token, credential, conversas completas, estado autoritativo de execução em andamento nem capacidade de conexão remota.
3. Na criação da janela, o Main injeta a projection uma única vez junto com o bootstrap. O Renderer inicializa sincronamente os stores de tabs/sidebar/draft
   antes de qualquer RPC de serviço e monta primeiro o campo de entrada editável; o Send entra em pending local antes de o Host ficar ready e depois segue
   a cadeia de comandos autoritativa original.
4. Host, settings e o índice de sessions/tasks são restaurados em paralelo em background, validando a projection por schema version, storage profile,
   workspace identity e hora de atualização; em caso de divergência, a substituição é parcial, e não um reset da página inteira.
5. A restauração de listas longas continua fatiada e colocada em `requestIdleCallback`; entrada, troca de workspace e envio são ações críticas do usuário e
   não podem ir para idle callback.
6. Opcionalmente, salvar uma captura da janela como cover de inicialização, o que só melhora o tempo de "ver a interface", não conta como T6 e não pode
   cobrir o App Shell real, que já é editável.

Esse caminho deve permitir que "ver a interface" e "começar a digitar" aconteçam antes de o Host ficar ready; a projection autoritativa completa de
task/session continua sendo concluída pela restauração em background. O orçamento concreto precisa ser redefinido com base na linha de base pós-mudança P0, sem
prometer milissegundos fixos na fase de design.