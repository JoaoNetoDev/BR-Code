# Preparar o banco de dados de forma unificada antes de entrar no ZCode

Status: em 2026-09-14 implementado, com revisão de código concluída; a validação automatizada e as limitações de plataforma estão em [revisão de implementação](./database-startup-implementation-review.md). A lista de execução e aceitação está no [Todo 145](../working-memory/provider-refactor/steps/todo-145-global-database-startup-loading.md).

## Objetivo e limites congelados

A janela de desktop exibe primeiro uma página de startup independente, e o Root de negócio só é montado depois que o banco de dados local obrigatório e a montagem de serviços estão completos. Usuários novos sem workspace também passam por isso. Os IDs de migração originais, o SQL, o checksum, a ordem de execução, as transações e o ledger permanecem inalterados; não se acrescenta batch, índice, limpeza, fallback de banco vazio nem otimização de SQL. A proteção contra falha de leitura do Provider é preservada.

## Dependências de startup e propriedade

```text
Main cria a janela + Host de escopo da janela
  ├─ Renderer exibe a página de startup independente ← Main repassa ← snapshot de status de startup do Host
  └─ Coordenador de preparação do Host (um por janela, um único attempt em trânsito)
       → resolve o caminho real dos dados
       → Host Worker: migrações originais do tasks-index.sqlite + inicialização dos Repo obrigatórios
       → Worker pertencente ao Host carrega os comandos de armazenamento do CLI correspondente: migrações do db.sqlite original, sai ao fechar
       → createLocalServices / publicação da porta de serviço
       → ready → Renderer monta o Root de negócio; Main inicia o scheduler existente
Falha → failed → permanece na página de erro → usuário clica em retry → novo attempt / releitura do ledger
```

O Host é o único dono do status de startup e do retry; o ledger SQLite é o fato persistido de conclusão. O Main apenas mantém um espelho descartável de notificação, repassa mensagens de controle, registra telemetria e agendaria processos. O status é estabelecido por uma superfície de controle IPC separada e não pode depender de serviços comuns já publicados. Um reload do Renderer lê o snapshot atual e não reinicia migrações. Quando a porta de serviço chega cedo ela é preservada, e antes do ready não se constroi consumidores de serviços de negócio.

Lista de cobertura: TaskIndexRepo, AutomationRepo e OffPeakTaskRepo compartilham o `getTasksIndexDatabasePath()` real; o Worker completa serialmente as migrações originais e as correções de ID histórico/grupo do TaskIndexRepo e a correção de estado remanescente do OffPeak, e só então libera a conexão. No Host, os Repo apenas reutilizam o resultado de preparação de caminho já concluído no startup atual, sem novos marcadores de persistência; uma mudança de caminho refaz a entrada de preparação original. O SQL dentro do Worker compartilha a implementação com os Repo de negócio.

O banco de sessions é resolvido pelo `createConfig` / `getSessionDbPath` do Agent, e a entrada de armazenamento dedicada é devolvida antes do Provider Registry, login, MCP, telemetria e runtime de negócio. O cwd de execução é um diretório real já existente; não se cria nem se vincula um workspace fictício. Um `sessionDbPath` relativo é resolvido e preparado um a um nos diretórios locais de recuperação/aquecimento de startup fornecidos pelo Main (no máximo três); sem diretórios, usa-se o cwd de fallback real. Diretórios são deduplicados, o Worker de vida curta é serial e evita migrar múltiplos bancos grandes ao mesmo tempo. Bancos físicos diferentes acrescentados depois continuam sujeitos à proteção normal de admissão do protocolo do Agent. O protocolo privado de preparação publica primeiro o caminho resolvido para amostragem pelo Host; o caminho não entra no ARMS. O Agent normal mantém a admissão por protocolo por banco físico real, cobrindo troca de configuração ou banco novo depois disso.

O SQLite síncrono do Host fica no Worker ao qual pertence, e o event loop do Host pode amostrar e responder continuamente. O scheduler do Main é adiado até a preparação local bem-sucedida, evitando migrar o mesmo banco antes da hora. O Host não publica RPC comum antes da montagem bem-sucedida dos serviços obrigatórios; aquecimento, bot, Wiki e scheduler não acessam bancos não preparados antes.

SSH/WSL/Docker remotos não se tornam pré-condição do startup local; na conexão, vale a admissão de armazenamento do Agente remoto existente. O celular continua anexado ao shared-host existente, sem iniciar outro Host/runtime; os limites de workspaceIdentity, desktop continuous e mobile replayable são preservados. O attachment de porta durante a preparação espera o Host existente ficar pronto.

## Status, falha e retry

Fases: `starting → preparing_host_storage → preparing_session_storage → starting_services → ready`, e qualquer fase pode entrar em failed. Subfases de banco de dados: checking / waiting_for_lock / migrating / committing. O status carrega ID de startup/attempt, número de sequência monotônico, hora de início, fase, stderr e ID de diagnóstico; snapshot e evento têm a mesma fonte.

**Nunca há retry automático após falha de migração.** O usuário vê primeiro a causa e as sugestões de tratamento, e só ao clicar em 「重试」 a próxima preparação começa; cliques repetidos durante a execução, requisições de attempts antigos e notificações atrasadas não podem criar um segundo executor. Bancos já submetidos com sucesso não voltam atrás; bancos com falha se recuperam pela transação do SQLite e o ledger é verificado de novo. A exceção original tem precedência sobre exceções de rollback/close/notificação, e não se promete rollback atômico de todo o startup multi-banco. Checksum divergente/banco corrompido exige tratamento diagnóstico, e não se encoraja cliques repetidos. Se o banco de dados já está pronto e a falha ocorreu na fase de montagem de serviços, a dica é sair e reabrir: não se constroem serviços de novo dentro de um Host possivelmente parcialmente montado, evitando efeitos colaterais duplicados em background.

O orçamento para o primeiro status de startup é de 30 segundos; travas de escrita externas esperam no máximo 60 minutos, e o busy timeout de negócio continua em 5 segundos. Não há kill automático de processo nem skip de timeout para SQL longo. 10 minutos serve apenas para exibir um aviso de espera. Uma saída anormal do executor ou um canal de status desconectado é observável como falha; a saída do usuário continua usando a limpeza de janela/Host existente, sem iniciar outra migração.

A classificação de erros inspeciona o código estruturado da cause original e o primary code do SQLite (`errcode & 0xff`): FULL/ENOSPC/EDQUOT, permissão, IOERR, CANTOPEN, NOMEM, banco corrompido, checksum, timeout de trava e saída desconhecida. O texto de erro não é usado para inferir disco cheio ou OOM. FULL pode vir do disco temporário ou de um limite de capacidade, e não pode ser negado só porque o disco do banco principal ainda tem espaço.

Mensagem de espaço insuficiente: **Espaço de armazenamento insuficiente ou limite de capacidade atingido, não foi possível concluir a atualização dos dados. Verifique o espaço disponível nos discos do diretório de dados e do diretório temporário do sistema, libere espaço ou ajuste a cota de armazenamento e tente novamente.** A página de falha oferece ID de diagnóstico, copiar diagnóstico, retry manual (quando aplicável) e sair. O conteúdo copiado não inclui Key/conta/corpo de chat. A página de startup reaproveita as normas de tema, internacionalização e responsividade, e não exibe porcentagem falsa.

## Observação de disco e ARMS

Vale o contrato do §9 do Todo 145. Cada escopo de escopo de armazenamento identificado de forma confiável registra `max(0, baselineAvailable - minObservedAvailable)`; o nome deixa explícito que se trata do pico de queda do espaço disponível observado, e não de bytes físicos exclusivos da migração. Por padrão, um statfs assíncrono a cada 2 segundos, no máximo uma consulta por vez, e consultas lentas são puladas sem enfileirar; não se percorre diretórios, não se lê conteúdo de DB, não se registra array por amostra nem log de disco. O Worker SQL fica isolado da amostragem.

A linha de base precisa ser anterior à escrita para que o pico de todo o percurso possa ser calculado; chegadas tardias/falhas são marcadas como partial ou unknown, e valores desconhecidos não são preenchidos com 0. Escopos iguais compartilham a linha de base, múltiplos escopos não são somados; após rollback o histórico de menor folga é preservado, e o estado terminal usa o cache, sem depender de o disco com defeito voltar a ser legível.

O Host envia ao Main snapshots agregados e limitados, o Main mantém o resumo mais recente, e mesmo que o executor crash o valor observado pode ser reportado. O ARMS envia apenas início, fases, estado terminal e o resumo de disco do estado terminal; esta versão não envia checkpoints de rede periódicos nem implementa outbox entre reinícios, e o app morto no meio pode ficar sem estado terminal. São registrados attempt, duração, status, erro unificado e qualidade/defasagem da amostragem; não são enviados caminho, mensagem, Key nem todas as amostras.

**O retry limitado do envio é totalmente separado do retry do banco de dados.** O resultado do envio distingue enfileiramento pelo SDK, aceite HTTP na recepção e consultabilidade em background. HTTP não-sucesso, exceção de rede/timeout admitidos com backoff limitado e event ID estável para facilitar a deduplicação; falha de envio não bloqueia o startup nem a página de erro. Se um resumo entre reinícios for implementado, o outbox de estado terminal tem limite de 64 KiB/7 dias e, com o disco cheio, a escrita vai para a memória. Não se promete entrega de 100% quando offline, com o disco cheio e com o app inteiro morto ao mesmo tempo.

## Verificação e entrega

Escrever testes antes de implementar, isolando bancos temporários, sem usar o banco real de usuários e sem medir performance de 20 GB. GLOBALDB-01 a 26 no Todo 145; novos casos de UI entram como manual-review/pending e não são promovidos por conta própria. É obrigatório validar compatibilidade das migrações congeladas, bancos novos/velhos/já migrados, retry manual, ausência do primeiro status, falhas de lock/commit/limpeza, ausência de amostragem de disco, falha de SDK, reload, admissão de serviços e limpeza de recursos de processo.

Executar architecture check, typecheck, lint, testes unitários afetados, build do desktop e E2E de startup. Depois do desenvolvimento, revisar o diff real, os limites entre plataformas e os caminhos de recurso/erro. Verificações não executadas ou bloqueadas pelo ambiente são registradas explicitamente; testes antigos passando não representam aceitação da nova experiência de startup.

## Esclarecimentos de limite durante a implementação

- A conexão de Repo exclusiva do startup espera a trava de escrita externa dentro do Worker, e as correções pós-migração também usam o orçamento de espera do startup; após a preparação a conexão é fechada, e a política de 5 segundos dos Repo de negócio permanece.
- `http_received` significa apenas que a requisição original do SDK retornou sucesso HTTP. O SDK atual não oferece AbortSignal; uma requisição única que não completa em 15 segundos é registrada como não confirmada, sem sobrepor nova conexão. Falha explícita/HTTP não-sucesso faz no máximo três tentativas. Esta versão não implementa outbox entre reinícios, e offline ou com o app inteiro morto ainda pode haver apenas o evento de início; não se afirma entrega garantida.
- O resumo de disco sem linha de base obtida usa um evento unavailable separado, sem misturar 0 na distribuição de picos.

- Revisão de ciclo de vida corrigida: a preparação de sessions também é feita pelo Worker pertencente ao Host, que carrega a entrada de armazenamento dedicada do bundle do CLI correspondente (quadro de controle stdio virtual). Não se inicia um subprocesso separado que segura a trava, e quando o Host é morto a thread termina junto com o processo. O ciclo de vida de subprocesso do Agente de negócio comum não muda. O modo de armazenamento do CLI não altera o nome do processo do Host, e um cwd explícito é passado para resolver caminhos relativos de banco.

## 2026-09-15: geração de Host e correção de diretórios de projeto inválidos

- O Main atribui a cada novo Host de escopo de janela um databaseStartupId único, usado como startupId do coordenador do Host e também colocado nas mensagens de ServicePort locais inicial e de reload. Ele identifica apenas a geração do processo e não substitui o ledger do banco, o workspaceIdentity ou o task owner.
- Há apenas um relay de startup válido por janela; quando um novo Host se vincula, a escuta de controle do relay antigo é revogada. Depois que o Host antigo sai, seu espelho passa a transport_closed e não pode reproduzir ready; status atrasado da geração antiga não atualiza a janela atual. Espelhos de falha continuam disponíveis para leitura de refresh da janela atual.
- O Renderer precisa receber o ready e a porta de serviço com o mesmo startupId para montar o Root de negócio; estado primeiro/porta primeiro são ambos aceitos, e ID ausente ou cruzado entre gerações não libera. O reload reutiliza o ID de um Host vivo e não reexecuta migrações. O protocolo de attachment scoped do celular e o replayable remoto não mudam.

```text
Main aloca B → InitLocal(B) → status do Host(B)
           └→ ServicePort(B)
Renderer: ready(B) + port(B) → Root
          ready(A) + port(B) → continua esperando
```

- O Agente original e a preparação global compartilham a escolha assíncrona de diretório de trabalho: quando o caminho do projeto não existe, é ENOTDIR, não tem permissão ou não é um diretório, o diretório de fallback só é adotado se o fallback original estiver disponível; o comportamento original é mantido no caso de `command.cwd` customizado, que não pertence ao cenário de fallback de workspace padrão.
- Isso trata apenas do cwd de execução; erros de abertura de banco, leitura de configuração, disco cheio e permissão de banco continuam falhando, sem trocar de banco nem criar fallback de banco vazio. Após o novo preflight assíncrono, cancelamento/destruição/geração são reconferidos antes do spawn real.
- Regressão: saída/reconstrução do Host antigo depois do ready, mensagens atrasadas da geração antiga, as duas ordens de chegada, reload de Host vivo, porta sem ID; ENOTDIR real, arquivo comum, injeção de EACCES, fallback indisponível, e erros reais de SQL que continuam falhando. O E2E ganha GLOBALDB-27/28, mantidos como pending.

## 2026-09-15: startup silencioso quando não há migração pendente (Todo 146)

Esta seção substitui a regra antiga de "exibir texto em todas as fases de preparação". Detalhes em [Todo 146](../working-memory/provider-refactor/steps/todo-146-silent-database-startup.md). O startup normal mostra apenas o Logo; o texto de inicialização/upgrade, salvamento e conclusão de startup só aparece depois de confirmar que existe migration a executar. A falha sempre aparece. A manutenção deixa de reportar migrating; um check transacional vazio não exibe resultado de upgrade. O Host agrega o tipo de migração do executor e as contagens realmente executadas e submetidas, e o Renderer e o ARMS consomem o mesmo fato de origem. O precheck SQLite serve apenas para exibição; depois de pegar a trava de escrita o ledger é reconferido, e o SQL/ID/checksum/fronteira de transação originais não mudam. O banco de sessions bem-sucedido nesta execução é reutilizado pelo caminho real, e falha e novo attempt não reutilizam. Silencioso não significa pular manutenção nem garantir zero IO.

## 2026-09-15: reportar o último número aplicado antes da migração

- Objetivo: localizar o ponto de partida da migração em conjunto com o `app_version` atual e o `migration_id` de falha já existente, sem subir o ledger completo nem o checksum.
- Depois que `BEGIN IMMEDIATE` tem sucesso e antes de executar qualquer SQL de migração de versão, o executor lê do ledger pequeno a última entrada em ordem decrescente de ID; os números congelados são ordenados por número sequencial com zeros à esquerda. Um ledger recém-criado e vazio registra `null`, e falta de trava ou de leitura bem-sucedida registra o campo ausente. Commit/rollback posteriores não podem sobrescrever esse ponto de partida.
- O opcional `migration.lastAppliedMigrationId` é transmitido pelo protocolo de startup estrito existente. O Host preserva o ponto de partida de cada banco reconhecido neste attempt, registrado separadamente para banco de tasks e banco de sessions, preservado na falha e limpo no retry; os pontos de partida de cada banco não são enfiados na estatística acumulada de migrações.
- No timing existente de `database_startup_result`, envia-se ainda uma `database_startup_baseline` por banco, com value=1 e atributos `database_id` (identificador/hash interno já existente), `database_kind` (tasks-index/session) e `last_applied_migration_id` (número/none/unknown). O ID do evento inclui o identificador do banco para distinguir bancos diferentes no mesmo attempt. Não há repetição após o primeiro envio; falhas precoces em que nenhum banco foi reconhecido não forjam um evento de ponto de partida.
- Número de ledger inválido não é enviado em texto bruto e é marcado como unknown; falhas reais de leitura seguem o caminho de exceção de banco já existente. UI, amostragem de disco, SQL/checksum/transação de migração, shared-host do celular e limites continuous/replayable permanecem inalterados, sem nova interação, e o E2E GUI existente não precisa de modificação.

```text
SQLite pega a trava → lê o ponto de partida → migração original/COMMIT ou falha
                  ↓                 ↓
            protocolo de status original → Host preserva por banco → Main reporta no resultado da preparação
```

Aceitação: none em banco vazio, ponto de partida exato em banco antigo, reabertura já no número mais recente; outro escritor submete antes e seu resultado é lido; falha na execução preserva o número anterior à migração; unknown é distinguido de ausência de registro; múltiplos bancos não se confundem, snapshot repetido não repete o envio e o retry manual limpa; SQL e checksum originais inalterados.

Registro de verificação: 7 arquivos/39 itens do lado da aplicação e 4 arquivos/60 itens do CLI (migração original/lock assíncrono/recuperação de crash/session-store) passaram; `pnpm typecheck` e `pnpm lint` da raiz (45 warnings / 0 errors), architecture (0 violations), tsc de adapters/bootstrap do CLI, lint de adapters e tsup do desktop passaram. O Worker de tasks real, após o build, foi verificado em bancos temporários isolados: banco vazio com ponto de partida null; quando só falta a 0003, ponto de partida 0002 e 1 item submetido; ao abrir de novo, ponto de partida 0003 e 0 itens executados. Nenhuma interação de UI/E2E foi modificada e nenhum evento de produção foi enviado ao ARMS; a ingestão em backend ainda precisa ser verificada. Os logs estão em `/tmp/zcode-migration-baseline-*.log` na máquina local.