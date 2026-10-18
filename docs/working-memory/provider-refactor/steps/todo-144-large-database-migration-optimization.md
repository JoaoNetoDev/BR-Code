# Todo 144: Proteção de inicialização do banco de dados (otimização de SQL removida do escopo)

> A execução posterior foi transferida para [Todo 145: preparação unificada do banco de dados antes de entrar no ZCode](./todo-145-global-database-startup-loading.md). Este documento mantém apenas o rastro da primeira rodada de implementação; o loading de workspace e o escopo adiado do Host não fazem mais parte da solução atual.

> Status: em ajuste de escopo; em 2026-09-14 o usuário cancelou a otimização de SQL, e o loading de tela cheia antes da inicialização aguarda redesenho.
> Prioridade: P0. Data: 2026-09-14.
> Baseline de criação: `hotfix/3.12.2`, `16c3f15c3f`.
> Autorização atual: em 2026-09-14 o usuário autorizou "começar a execução", com implementação e verificação em banco de dados isolado; a medição de desempenho de 20 GB continua suspensa.

## Escopo mais recente e checklist de execução (tem prioridade sobre o histórico abaixo)

O usuário entendeu que as otimizações existentes não resolvem o problema crítico de pico de memória, e decidiu que este
hotfix não faz otimização de SQL de migração nem continua a implementação de batch.

- [x] Remover os SQL de otimização 0020/0022 e a whitelist de execução; o runner passa a executar diretamente o SQL
      original congelado.
- [x] Remover os testes de plano de execução exclusivos da otimização, preservando a regressão de execução do SQL
      original, a compatibilidade do ledger, as modificações posteriores do usuário e o rollback de falha.
- [x] Remover os campos de versão de execução e de impressão digital de implementação, mantendo apenas o checksum de
      migration existente; sem alterar o SQL original, os IDs, o ledger ou a estrutura do banco.
- [x] Verificar que a inicialização síncrona/assíncrona executa o SQL original; continuar verificando espera de lock,
      flush de estado, ready após commit e recuperação de crash.
- [x] Preparar o escopo e o registro de verificação do MR de draft atual, enviados como atualização junto deste commit;
      não usar os testes históricos de otimização como evidência de desempenho atual.
- [ ] Redesinhar a entrada de inicialização segundo o "loading de tela cheia antes de entrar no ZCode". A liberação de
      workspace existente não atende ao objetivo e não pode ser marcada como concluída.

Este cancelamento reduz apenas a implementação de execução, não reseta o branch, não revoga a proteção independente do
Provider JSON e não modifica o banco de dados do usuário.
SQLite/ledger continuam sendo o único fato de migração; Host/UI apenas observam a fase. Abaixo é preservado o rastro da
primeira rodada de implementação, na qual a otimização de SQL e seus resultados de verificação saíram do escopo de
entrega.

### Verificação deste cancelamento

- Primeiro foi adicionada uma asserção que executa de fato o SQL original, falhando antes do cancelamento (0020/0022
  estavam substituídos) e passando depois.
- Armazenamento, SQL original congelado e runner síncrono/assíncrono, locks reais e recuperação de crash: 4 arquivos com
  55 casos passaram; regressão das migrations antigas e do Reader antigo: 5 arquivos com 46 casos passaram.
- Protocolo e liberação do Host: 2 arquivos com 15 casos passaram; bootstrap Writable flush: 1 arquivo com 1 caso
  passou.
- `pnpm typecheck`, typecheck de adapters/bootstrap da CLI, `pnpm lint` (42 warnings já existentes, 0 erro) e
  `pnpm architecture:check --changed` (0 violation) passaram.
- Na primeira rodada, o teste de bootstrap carregou o adapters/dist antigo e falhou porque a impressão digital antiga de
  execução não correspondia ao novo schema; após reconstruir os adapters, o mesmo teste passou, sem fallback em código de
  produção.
- O diff entre o migrations.ts e a pasta migrations/ originais e o branch alvo do hotfix é vazio; o banco de dados do
  usuário não foi modificado e nenhuma medição de desempenho de banco grande ou E2E de UI foi executada.
- dep:refs não carrega o projeto CLI adapters; o limite de remoção foi determinado por varredura de referências em todo o
  repositório e por typecheck da CLI e entre pacotes, sem alegar confirmação de zero referências pelo serviço de
  linguagem.

## Histórico da primeira rodada de implementação (substituído pelo ajuste de escopo acima)

## Decisão de escopo deste hotfix

Em 2026-09-14, após discutir a escala das mudanças de inicialização do Host, o usuário confirmou seguir primeiro pelo
escopo do banco de sessões:

- nesta rodada: otimização de SQL, espera de lock, notificação de inicialização, liberação de requisições de negócio e
  loading do `db.sqlite` de sessão.
- posteriormente: [Observabilidade da inicialização do tasks-index do Host](./host-tasks-index-startup-followup.md).
  Esta rodada não altera sua thread de inicialização, sua transação nem a ordem de publicação de serviços.
- A medição de desempenho de 20 GB, a verificação real em Windows/macOS e o rollout gradual de release continuam
  registrados separadamente e não são substituídos por testes com banco pequeno isolado.

## 1. Contexto e objetivo

Parte dos usuários já recebeu a atualização gradual, e parte ainda não migrou; o banco de dados de sessões históricos
pode chegar a 20 GB.
Atualmente o 0020 executa três UPDATEs com condição JSON sobre part, e o 0022 classifica mensagens de usuário históricas e
depois corrige os objetos associados, o que abre espaço para reduzir varreduras e resultados intermediários.
A migração do banco de dados ocorre dentro da transação de inicialização e pode conflitar com a espera de lock de 5
segundos de outros Agents, com o timeout de requisição de cerca de 3 minutos do protocolo comum e com o recolhimento de
processo.
Objetivo: o mesmo hotfix é compatível com usuários que concluíram e não concluíram a migração, reduz o custo de
processamento de tabelas grandes e deixa o usuário entrar no workspace que depende delas depois que a migração real
concluir.
O volume de varredura, o tempo e a análise de memória de 20 GB são, no momento, apenas estimativas estáticas e não
servem como resultado de desempenho nem como limiar de aprovação.

Relacionados:

- [Plano completo de liberação de inicialização, protocolo, erros e solution cross-platform](../../../desktop/database-migration-startup-gate-plan.md)
- [Todo 109: consolidação das migrações de banco de dados e legibilidade de rollback](./todo-109-database-migration-consolidation-and-rollback-readability.md)
- [Contrato de inicialização concorrente de múltiplos Agents no SQLite](../../../superpowers/specs/2026-07-15-sqlite-concurrent-agent-startup-design.md)
- [Isolamento de espera da configuração de chat já mergeado](../../../performance/session-config-blocking-hotfix.md): não
  reintroduzir dependências opcionais de configuração remota na liberação de inicialização.

## 2. Checklist de implementação

### A. Fixar primeiro a semântica e os testes

- [x] Conferir o branch mais recente `dc1026894d`, as definições congeladas 0020–0022 e a origem do caminho de
      config.storage.sessionDbPath.
- [ ] Revisão de release: o contrato de execução vai ao owner do banco para conferência. Não há mudança de schema
      nesta rodada, então a condição de "alterar a estrutura do banco exige sincronização" não foi acionada; ninguém foi
      contatado.
- [x] Estabelecer primeiro um teste diferencial entre o SQL antigo congelado e a nova implementação candidata, e só então
      implementar a otimização.
- [x] Cobrir banco novo, não migrado, migrado, ledger parcial, rollback de falha, downgrade e nova atualização.
- [x] Fixar as asserções de JSON null/ausente, campos desconhecidos, seleção explicitamente vazia, JSON inválido,
      valores de ordenação iguais, campos antigos de downgrade e modificações posteriores do usuário.

### B. P0: consolidar as três varreduras de part do 0020

- [x] Consolidar a conversão de fromModel, toModel e subtask.model em uma única varredura candidata.
- [x] Tratar from/to na mesma linha de timeline/model_change; subtask segue a conversão pelas suas próprias regras.
- [x] Preservar com precisão a condição de disparo de cada campo; linhas sem correspondência não são gravadas e campo
      ausente não é alterado incondicionalmente para null.
- [x] Preservar todos os membros antigos, membros desconhecidos, corpo, referências de anexos, IDs de linha e campos de
      tempo.
- [x] Conferir que o plano de execução realmente reduz as varreduras de part, e não apenas embrulha os três trechos de
      SQL em uma CTE continuando a varrer.

```text
atual: varredura part → from; varredura part → to; varredura part → subtask.model
alvo: varredura part → conversão por tipo e condição de campo → uma atualização por linha correspondente
```

### C. P0: reduzir o escopo da consulta histórica do 0022

- [x] Determinar primeiro as session_entry/session candidatas que atendem à regra original; se as candidatas estiverem
      vazias, encerrar diretamente.
- [x] Limitar as sessões candidatas na entrada da classificação, ou usar uma consulta de índice orientada pelas sessões
      candidatas para obter a mensagem de usuário mais recente.
- [x] Manter a ordem "obter primeiro a mensagem de usuário mais recente e só então verificar modelo/tier"; não pode ser
      trocada por procurar um tier válido mais antigo.
- [x] Manter a ordenação e as regras de empate originais de sequence, time_created e rowid.
- [x] Manter a restrição original "o usuário não modificou nada após a migração e o modelo é consistente", sem corrigir
      sessões sem relação.

### D. P1: conversão de mensagens e resultados intermediários

- [x] Avaliar a consolidação das varreduras das duas UPDATEs de mensagens de usuário/assistente do 0020, preservando as
      condições de disparo e os resultados dos dois tipos.
- [x] Avaliar as colunas de classificação: o 0020 remove `message.*` e carrega apenas session_id/tempo/data; o 0022
      passa a ser uma consulta de índice. A classificação do 0020 apenas por ID, com retorno à tabela, fica como
      comparação de desempenho posterior e não é declarada como implementada.
- [x] Aproveitar primeiro os índices existentes; índices grandes adicionais devem contabilizar custo de construção,
      espaço em disco e ocupação de lock, e não são adicionados por padrão.
- [x] Não tratar o número de chamadas de função SQL como o número de parses JSON completos; os ganhos serão confirmados
      depois por plano de execução e medição.

### E. P0: contrato de execução compatível com o rollout gradual

- [x] Preservar o ID de migration original, a definição do SQL original, o checksum original e o formato do ledger; as
      definições históricas não são modificadas no lugar.
- [x] Revisar e implementar um executor de otimização / executionRevision com whitelist explícita, como uma implementação
      de execução auditável da mesma semântica congelada.
- [x] Itens já registrados continuam sendo validados pelo checksum original e pulados; apenas itens não executados entram
      na implementação otimizada.
- [x] A implementação otimizada é commitada na mesma transação do ledger; sem gravar sucesso antecipadamente, sem
      apagar o ledger e sem pular erro de checksum.
- [x] Preservar a ordem original das migrations e o comportamento de pular item a item; havendo ledger parcial, apenas os
      itens ausentes são tratados.
- [x] O comportamento de erro/rollback da nova implementação também precisa ser equivalente; não basta comparar o
      resultado normal e depois preencher de volta o checksum antigo.
- [x] Usar o Reader/binary real da versão antiga congelada para verificar que o conteúdo continua legível após o
      downgrade, e que uma nova atualização não remigra nem ressuscita configurações que o usuário limpou.

```text
migração concluída → validar o checksum original → pular a varredura grande
migração pendente  → implementação otimizada equivalente → dados e registro de migração commitados na mesma transação
falha na execução → rollback → próxima tentativa usa o ledger real
```

### F. P0: proteção de inicialização de apoio

- [x] Estabelecer os estados checking / waiting_for_lock / migrating / committing / ready / failed conforme o plano
      completo.
- [x] Reaproveitar o Agent existente para emitir uma notificação de inicialização estritamente tipada antes de o banco
      estar pronto para uso de negócio, proibindo usar o texto do stderr como protocolo de estado.
- [x] O Host fornece snapshot e assinatura com attempt/generation/sequence, e o Root exibe a fase real e o tempo já
      decorrido, sem porcentagens falsas.
- [x] O SQLite permanece o único coordenador de migração; o ledger é reconferido após obter o lock, e Host/UI não mantêm
      uma segunda trava de migração.
- [x] Distinguir a espera do lock de migração do timeout comum de requisição; durante a migração não são enviadas
      requisições de negócio comuns, evitando que o recolhimento por watchdog cause migrações repetidas.
- [x] A camada de serviço impede que sessões, histórico, Wiki e scheduler/bot que dependem do banco entrem cedo demais;
      não basta adicionar uma máscara de UI.
- [x] A preparação de dados não depende de conta, Key, entitlement ou configuração remota opcional; bancos físicos
      diferentes permanecem independentes.
- [x] Concluir a revisão estática da inicialização síncrona do Host; o usuário confirmou a transferência para tarefa
      posterior, e este loading não cobre a inicialização do tasks-index anterior à publicação dos serviços.
- [ ] Cobrir múltiplas janelas, CLI independente, SSH/WSL/Docker e Web; o celular reutiliza o shared-host, não inicia
      outro runtime e não mistura continuous/replayable.
- [ ] Revisar o orçamento de espera concreto e as estratégias de saída e retry de erro; em caso de falha, o banco é
      preservado, sem criar banco vazio e sem apagar WAL/SHM.

## 3. Aceitação e evidências

- [x] Diferencial: a semântica final de linha da implementação antiga/nova, os campos antigos, a ordem, os timestamps,
      o ledger e o rollback de erro são consistentes.
- [x] Concorrência: quem espera termina normalmente mesmo segurando o lock além dos 5 segundos antigos; o mesmo banco
      migra só uma vez; bancos diferentes não se bloqueiam.
- [ ] Ciclo de vida: crash antes do COMMIT, notificação perdida depois do COMMIT, reload do Root, reconexão no celular e
      ready antigo atrasado são tratados corretamente.
- [x] Rollout gradual: usuários já migrados não são re-escaneados nem têm modificações posteriores sobrescritas;
      primeira atualização e atualização parcial executam corretamente; erro de checksum original ainda falha de forma
      explícita.
- [ ] E2E: confirmar primeiro os casos DBSTART-01～18 do plano completo, entrar em pending pelo e2e-case-lifecycle e
      registrar as evidências de UI/protocolo/DB.
- [ ] Desempenho (quando os testes forem explicitamente liberados): 20 GB isolado, com distribuições de volume por tabela e
      linhas isoladas enormes; comparar varredura/plano de execução, tempo, RSS de pico, espaço de WAL/temporário e tempo
      de retenção do lock.
- [ ] Plataforma: Windows/macOS/Linux, além dos temas claro e escuro, zh/en e viewport de celular; listar explicitamente
      os itens que não puderem ser verificados.
- [ ] Verificações mecânicas: typecheck, lint, architecture:check e os testes diferenciais/multiprocesso/protocolo
      relacionados passaram; o typecheck do E2E passou, mas a execução no desktop foi bloqueada pelo ambiente atual e a
      aprovação geral não pode ser marcada.

## 4. Release e rollback

- [ ] No mesmo pacote, fazer o rollout gradual em etapas "migrado → banco pequeno não migrado → banco grande não
      migrado → multiprocesso/remoto", observando separadamente a taxa de falha e o custo de recursos.
- [ ] O ramo de execução otimizado pode voltar à implementação antiga congelada; migrations já commitadas não são
      reexecutadas ao contrário, e o risco de desempenho antigo precisa ser explicitado.
- [x] O timeout comum de negócio não é ampliado globalmente por causa da estratégia de atualização; não são modificados
      task owner/lease, CommandInbox nem os limites de replay.
- [ ] Listar separadamente no commit e no MR a otimização de SQL, o contrato de execução, a UI/protocolo de
      inicialização e a validação de plataforma, separando o escopo do patch de proteção de leitura do JSON do Provider.

Não fazer neste Todo: COMMIT em lotes, formato de migração parcial em segundo plano, migração complementar a cada leitura
em runtime, backup incondicional de todo o banco, limpeza de dados desconhecidos ou modificação direta do banco de
dados real do usuário.
O critério de conclusão é ter evidências simultâneas de compatibilidade de dados, custo da primeira migração e experiência
de inicialização; apenas exibir loading ou o sucesso final de uma única migração não conta como conclusão.

## 5. Registro de implementação e verificação de 2026-09-14

O código foi entregue e, por pedido do usuário, entrou em commit em branch independente e em MR de draft; o Todo não
é marcado como concluído antes de E2E e aceitação de release.

| Camada | Evidências existentes | Limites |
| --- | --- | --- |
| Diferencial de SQL antigo/novo | `optimized-migrations.test.ts` com 16 casos; linha completa e bytes de JSON, ledger, rollback, campos desconhecidos, trigger customizado; EXPLAIN confirma varredura única de part e consulta de índice de sessões candidatas | banco pequeno isolado; não representa pico de memória nem tempo de 20 GB |
| Coordenação de migração | `async-migration-startup.test.ts` com 4 casos, mantendo um lock de escrita real por 5,1 s; mesmo/diferente banco, excedente de orçamento e rollback de erro | banco grande e diferenças de sistema operacional não testados |
| Regressão de armazenamento existente | `session-store.test.ts` com 44 casos, incluindo inicialização duplicada por dois processos; 5 arquivos com 52 casos das migrations antigas de Selection/Reasoning/Provider e do Reader real antigo | a evidência de downgrade usa o Reader antigo congelado; não executou a GUI antiga completa |
| Recuperação de crash | `migration-crash-recovery.test.ts` com 2 casos reais de subprocesso; remigração após SIGKILL antes do COMMIT e sem remigração quando a notificação se perde depois do COMMIT | Linux atual |
| Notificação de estado e logs | `bootstrap/tests/storage-startup.test.ts` com 1 caso; barreira real de Writable flush, schema estrito, attempt/databaseId/sequence e diagnóstico da mesma origem | os logs de estado são gerados por fase, sem log de SQL linha a linha |
| Host e UI | execução focada mais recente com 6 arquivos e 59 casos: temporização de requisição do protocolo, gerenciamento de processo, liberação, troca de hook/observação no celular e limite de assinatura de controle remoto do Root | relay real no celular/SSH/WSL/Docker ainda aguardam regressão |
| E2E | novo pending `conversation-session-database-startup.test.ts`, com banco antigo real + write lock + refresh de página + conferência dos dados após a liberação | em verificação, ainda promovido à cobertura oficial |

Orçamento de execução: 30 segundos para a primeira notificação do Agent novo embutido; espera total por lock externo de
escrita do SQLite de 60 minutos, com busy nativo de 25 ms por tentativa e backoff assíncrono de 10–200 ms; SQL longo
não ganha timeout automático que mate o processo, e após 10 minutos exibe uma dica de tempo decorrido. No período de
negócio volta o busy timeout original de 5 segundos, e o timeout original das RPC comuns não muda. O Agent antigo
customizado continua compatível com o caminho antigo; a nova semântica de espera é ativada ao receber um frame de
inicialização válido.

Preserva-se o comportamento de compatibilidade original para IDs desconhecidos no ledger histórico, validando apenas o
checksum dos IDs conhecidos atualmente; esta hotfix não adiciona a regra "falhar ao encontrar um ID futuro". Na presença
de triggers não padronizados, executa-se o SQL original congelado; os dois triggers AFTER INSERT de sequence da 0015
original não são afetados pela consolidação do UPDATE.

Ambiente de diagnóstico: inicialmente o desktop E2E falhou antes da criação da sessão no navegador, e o log confirmou que
o X server virtual não tinha `/usr/bin/xkbcomp`. As dependências foram extraídas apenas em `/tmp`; não se modifica a
instalação do sistema nem a configuração real do usuário. Os resultados seguintes seguem os artefatos do E2E.

### Verificação complementar final (ambiente atual)

- Uma regressão real de subprocesso adicional descobriu e corrigiu: ao quitar a requisição de inicialização antiga, mesmo
  com 0 RPC pendentes, a migração não pode entrar na reciclagem por idle. `zcodeAgentProcessManager.test.ts` passou com
  40 casos; a política ociosa original é restaurada depois do ready.
- Execução focada mais recente de biblioteca de sessão/crash/notificação de inicialização: 5 arquivos com 67 casos
  passaram; a liberação do App em execução focada passou antes com 6 arquivos e 59 casos, e depois o gerenciador de
  processo recebeu o 40º caso acima.
- `pnpm typecheck`, `pnpm lint` (42 warnings já existentes, 0 erro), `pnpm architecture:check --changed` (0 violation),
  typecheck do CLI bootstrap e `typecheck:e2e` do desktop passaram.
- Último artefato do desktop E2E:
  `packages/desktop/.e2e-artifacts/desktop-e2e-20260914103736847-p37727-53170acac47dff56/summary.md`. O caso ainda não
  chegou a executar e o ChromeDriver falhou ao criar a sessão. Depois de completar o display virtual, um aplicativo
  Electron mínimo que chama apenas `app.whenReady()` / `new BrowserWindow()`, sem carregar o ZCode, ainda sai com
  `Trace/breakpoint trap` (`/tmp/zcode-migration-electron-minimal.log`); portanto o ambiente atual não tem condições de
  concluir a verificação de UI de desktop, e isso não é marcado como falha nem como aprovação de caso de negócio.
- Ainda falta verificar em ambiente de desktop funcional o loading/refresh/liberação em sucesso, o retry em falha,
  tema/idioma/viewport de celular e a cadeia remota real. A medição de 20 GB não foi executada e nada foi publicado.
  Tendo ciência das limitações de verificação, o usuário pediu renomear o branch, fazer push e abrir o MR, e deixou
  explícito que nesta rodada o trailer de sessão do Agent é ignorado; nenhum ID é adivinhado.
- codegraph não foi usado. `dep:refs` não carrega o projeto CLI bootstrap, e a remoção do helper de sincronização do
  protocolo antigo se baseia na verificação de referências em todo o repositório e no typecheck após a troca de entrada,
  sem alegar confirmação de zero referências pelo serviço de linguagem.

### Baseline de commit e autorização

2026-09-14: o branch de origem passou a `fix-database-migration-startup`, com alvo `hotfix/3.12.2`. Primeiro houve
fast-forward até `5d7165d328` (telemetria de exceções da CLI) e então as mudanças desta rodada foram mescladas de volta,
sem conflitos; o gerenciador de processo e o protocolo compartilhados com a nova telemetria passaram por regressão
focada, com 7 arquivos e 72 casos, e o typecheck passou. A proteção de leitura do JSON do Provider é um commit
independente, no mesmo MR de draft do Todo 144 para revisão; na fase de draft, os itens pendentes de E2E/plataforma/
desempenho acima são mantidos.

Regressão ampliada antes do push: a primeira varredura de related cobriu 971 arquivos, com 970 passando; 6 casos do Root
update overlay falharam porque o mock antigo de `useWorkspaceServices` devolvia o primeiro argumento (o caminho) sem
alteração. Depois de corrigir o contrato de serviço do test double, os 6 casos passaram em execução focada; o código de
produção não ganhou um fallback de serviço vazio apenas por causa dos testes.