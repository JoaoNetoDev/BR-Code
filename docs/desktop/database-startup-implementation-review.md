# Startup do banco de dados global: revisão de implementação

Data: 2026-09-14. Branch: `codex/fix-database-migration-startup`.
O escopo e as regras de recuperação estão em [spec](./database-migration-startup-gate-plan.md); a lista de execução está em [Todo 145](../working-memory/provider-refactor/steps/todo-145-global-database-startup-loading.md).

## Já implementado

- Host com coordenador de attempt único; canal de controle e de snapshot Main/preload independentes; Renderer exibe, fora do Root de negócio, a fase real, a duração, o erro, a cópia de diagnóstico e a saída. Sem retry automático de migração.
- O Worker pertencente ao Host prepara serialmente a migração original／o pós-fix original do tasks-index e, em seguida, prepara a store de sessões pela entrada de armazenamento do bundle de CLI que acompanha. Ambos encerram junto com o Host; não sobe Provider／MCP／Agent de negócio completos.
- O ready só é publicado após a montagem bem-sucedida dos serviços; o scheduler do Main é iniciado com atraso e as requisições que chegam durante a preparação ficam enfileiradas. Novas conexões ao Repo de negócio ainda validam o ledger real e não podem confiar apenas no caminho já preparado em processo.
- O SQL original, o migration ID, as entradas de checksum e o limite de transação por banco são preservados; a exceção original não é sobrescrita por uma segunda exceção de rollback／close.
- O Host faz statfs assíncrono a cada 2 segundos, com no máximo uma consulta em trânsito, e agrega o pico de queda do espaço disponível; em caso de falha, mantém o cache; sem linha de base não reporta 0 e os escopos não são somados.
- Tempos de fase／estado final, erros de segurança e resumo de disco no ARMS; a checagem do retorno HTTP segue a requisição original do SDK reporter, falha explícita no máximo 3 vezes e nenhuma duplicação de requisição ainda em trânsito após 15 segundos sem confirmação.

## Correções feitas nesta revisão

1. O subprocesso CLI independente podia sobrar após a saída anormal do Host, e passou a ser um Worker pertencente ao Host; com o bundle real, validam-se o stdio virtual e o sessionDbPath relativo.
2. O import que inicia o relay no Main precisa ficar depois dos diretórios de dados iniciais, da configuração do Chromium e do bootstrap do ARMS, evitando a leitura de caminhos antigos.
3. Falha na montagem dos serviços proíbe recriar os serviços no mesmo lugar: o usuário é orientado a sair e reabrir; falha de banco ainda permite retry manual e leitura do ledger real.
4. Mesmo sem o primeiro status na saída do Host, gera-se um snapshot de falha; o reload completa o snapshot, e o número de sequência antigo e retries／tentativas antigas／concorrentes são rejeitados.
5. O SQLite é fechado no Worker antes de publicar a conclusão; a passagem do resultado da preparação ainda verifica o ledger, e trocar por um arquivo vazio não pode fingir um ready.
6. O SQLite do Node é carregado no bundle do Worker pela via `createRequire` já existente, evitando que o builder o reescreva para um pacote sqlite inexistente.

## Registro de verificação

- `pnpm typecheck`, `pnpm lint` e `pnpm architecture:check --changed` da raiz passaram; o Lint tem avisos, mas sem erros, e a arquitetura não ganhou violações.
- O `pnpm typecheck` do sub-workspace do CLI não iniciou por falta de turbo neste ambiente; no lugar dele, a verificação sequencial com tsc de adapters, bootstrap e cli passou.
- tsup (incluindo o Worker da store de tasks), o `build.mjs --desktop-agent` do CLI e o build do renderer com Vite passaram.
- As suítes de diff／rollback／lock／crash／Reader da migração original passaram em 7 arquivos e 56 casos; depois, os 3 arquivos e 12 casos do incremental que envolvem preservação de causa raiz passaram.
- Execução final completa: 1710 arquivos passaram, 2 falharam, 2 foram pulados; 14996 casos passaram, 2 falharam, 26 foram pulados. As duas falhas são as de monitorização de arquivo de provider-node, não modificadas, e uma asserção de timing de socket CUA; ao rodar de novo apenas os 2 arquivos, os 38 casos passaram todos, e esses dois também passaram na primeira execução completa; o registro de falha intermitente foi mantido e não se afirma que o comando completo ficou todo verde. Todos os novos casos de startup desta rodada passaram. Os 3 problemas antigos de mock／adaptação de valor de retorno da primeira rodada foram corrigidos e entraram em regressão.
- Executando o tasks Worker final e o Worker do bundle do CLI diretamente no Node: ledger de tasks com 3 itens; o caminho relativo da sessão cair no cwd real informado; o quadro de conclusão mais atrasado que o fechamento; ambos saíram com 0. As sondas só operam em diretórios temporários isolados.
- O tsc por projeto de main/preload/renderer ainda falha: há erros de importação de rootDir／shared, de tipos de navegador e de declarações de Window.zcode e CSS; não foi contado como aprovado. Os novos arquivos de coordenação／amostragem／telemetria não geraram diagnósticos nessa checagem.

Entradas de teste: databaseStartup / databaseStartupDisk / databaseStartupRelay / databaseStartupTelemetry / hostDatabaseStartup / storagePreparationProtocol / storagePreparationWorker / startupTelemetryDelivery, do desktop; tasksStartupPreparation / zcodeStorageStartupGate, de services; globalDatabaseStartupLoading, da UI.

## Aceitação de release ainda não aprovada

- Electron GUI: mesmo uma BrowserWindow mínima e isolada sai com 133 antes de criar a janela (Trace/breakpoint trap); o WDIO retorna `session not created: Chrome instance exited`. Os novos casos permanecem em manual-review/pending e não se afirma que a GUI passou. Log em `/tmp/zcode-global-startup-e2e.log`; relatório em `packages/desktop/.e2e-artifacts/desktop-e2e-20260914-144856-843/summary.md`.
- Worker empacotado em Windows／macOS, interação de tema／janela, shared-host do celular e regressão real remota ainda não foram executados; testes de Worker em Node não substituem esses resultados de plataforma. A preparação do celular continua com o estado de conexão existente, e nenhuma nova página de fase de banco foi adicionada para o celular.
- A ingestão real no backend do ARMS não foi validada com o envio de eventos de produção; receber confirmação HTTP não equivale a poder consultar no backend. Não há outbox entre reinícios nem checkpoint periódico; um kill forçado do aplicativo inteiro, o estado offline ou o SDK desabilitado podem perder o estado final.
- Não se faz promessa de desempenho de 20 GB nem se reduz a necessidade de recursos de pico da migração original; não foram executados testes sobre bancos de dados de usuários reais.
- A ferramenta codegraph não está disponível: não foi feita varredura automática de blast radius, e foram usados context controlado e revisão manual do código-fonte; não se afirma que o grafo completo de chamadas estáveis prova tudo.

Os logs são mantidos localmente em `/tmp/zcode-global-startup-*`; este arquivo registra conclusões revisáveis e os logs temporários não entram no repositório. Antes do merge／release, é preciso completar a aceitação de GUI e das plataformas-alvo acima.

## Estado de commit

O código e a documentação permanecem no workspace. O repositório exige que mudanças interativas só sejam commitadas depois de E2E aprovado; como o ambiente de GUI está bloqueado nesta rodada, nenhum commit foi criado nem nenhum update foi enviado. Não houve contorno dos hooks de verificação nem casos pending marcados como aprovados.

## 2026-09-15 Correções de dois problemas de review

1. Corrigido o replay de ready do Host antigo: o startup ID que o Main atribui ao Host entra simultaneamente em InitLocal, no snapshot do Host e no ServicePort local; o Renderer só libera quando os dois são da mesma geração. Um novo Host revoga o listener antigo; após a saída, o snapshot antigo passa a ser uma falha de desconexão e mensagens atrasadas da geração antiga não atualizam a janela. O reload de um Host vivo continua reutilizando o mesmo ID.
2. Corrigida a ampliação indevida de um erro de projeto histórico para falha global: o Agent comum e a entrada de preparação compartilham a função assíncrona de escolha de cwd. ENOENT, ENOTDIR, EACCES, arquivo comum etc. seguem a regra existente de diretório alternativo; quando não há diretório alternativo disponível ou o `command.cwd` customizado não satisfaz a condição de fallback, o caminho original é mantido. Erros reais de banco continuam falhando, sem alteração de SQL／checksum e sem fallback de banco vazio.
3. O preflight assíncrono de cwd é colocado antes das verificações finais de admissão／destruição／geração, evitando que um Agent ainda seja derivado quando o aplicativo sai durante a sondagem de diretórios. Apenas a porta de startup local desktop ganhou ID; o scoped attachment do celular, o workspaceIdentity remoto e a semântica continuous／replayable seguem inalterados.

Verificação: primeiro rodaram-se as regressões novas, que falham na implementação antiga; após a correção, a ordem de chegada da porta e os casos entre gerações foram fortalecidos separadamente, e no final os 8 arquivos e 87 itens passaram todos (`/tmp/zcode-startup-fixes-verified-tests.log`). O typecheck da raiz, o typecheck:e2e do desktop, o lint (45 warnings / 0 errors), a architecture (0 violations) e os builds com tsup e Vite passaram. O tsc de Main／preload／renderer ainda tem os problemas de baseline anteriores (comparados com o log de 14 de setembro) e não foi contado como aprovado; os novos arquivos de ID／admissão／cwd não geraram diagnósticos.

Os novos E2E GLOBALDB-27/28 entraram na spec de pending original. A execução real do WDIO falhou antes dos casos: `session not created: Chrome instance exited`; uma Electron BrowserWindow mínima, sem carregar o projeto, também sai com SIGTRAP. Relatório: `packages/desktop/.e2e-artifacts/desktop-e2e-20260915-030844-230/summary.md`; logs em `/tmp/zcode-startup-fixes-e2e.log` e `/tmp/zcode-startup-fixes-minimal-electron.log`. Não se transforma uma falha de ambiente em aprovação da aceitação de GUI.

Esta rodada também cumpre a exigência de só commitar depois de E2E interativo aprovado; as correções ficam no workspace, sem commit／push.


## 2026-09-15 Nova revisão e entrega

- Na revisão somente leitura, os 12 arquivos de teste relevantes passaram 35 itens, com log em `/tmp/zcode-startup-second-review-tests.log`.
- Sondas de evento isoladas confirmaram duas bordas não tratadas: antes do binding do Host, o botão de saída não tem listener para recebê-lo; e fechar a janela durante a migração remove o listener de telemetria do estado final do Host, deixando de reportar esta interrupção e o resumo de disco em cache. Ainda não se reproduziu uma falha real de criação de fork, e a sonda de recepção do botão não pode ser tratada como evidência de falha de criação de processo. O período inicial do startup normal, antes de o Host ser criado, também não tem quem receba a saída.
- Em 2026-09-15 o usuário exigiu explicitamente commitar, enviar e fornecer o link do MR com o código atual; a entrega segue essa autorização, mantendo os problemas de borda acima e sem ampliar o escopo da implementação. O registro anterior de "sem commit/push" descrevia o estado da época; após esta entrega, valem o Git e o MR.
- O MR permanece em Draft; o bloqueio do ambiente Electron GUI, o empacotamento nos sistemas-alvo, o teste real do controle remoto do celular e a validação da ingestão no backend do ARMS continuam incompletos e não são marcados como aprovados. Os hooks de commit e push são executados normalmente, sem contorno de verificação.


## 2026-09-15 Todo 146: startup silencioso conforme a necessidade real de migração

Os detalhes de execução e o registro de verificação estão em [Todo 146](../working-memory/provider-refactor/steps/todo-146-silent-database-startup.md). O lado de execução apenas faz o preflight somente leitura do ledger e reporta kind / executedCount / committedCount; o Host agrega por banco e zera nesta tentativa; o Renderer deriva a exibição a partir dos fatos, e o nome da fase não dispara diretamente o texto de upgrade.

- Sem itens pendentes (ou ainda não confirmados), o Logo é mantido durante todo o trajeto; não se monta temporizador de texto e também não se exibe texto ao entrar no manutenção original／montagem de serviços. Erros continuam com aviso e com a entrada de recuperação manual já existente.
- Depois de a necessidade ser confirmada, mantém-se o aviso de inicialização／upgrade; o commit intermediário de banco e a manutenção não anunciam salvamento／conclusão global; no commit real e final do banco pode-se exibir salvamento, e no pronto final／montagem de serviços exibe-se a conclusão do startup. Fases muito rápidas são simplesmente puladas de forma natural, sem atraso artificial nem porcentagem.
- A preparação de um único Host reutiliza o caminho de store de sessões real já fechado com sucesso; retry／novo Host não reutilizam; a restrição de que o ready e a porta do Host antigo devem ser da mesma geração é preservada.
- O ARMS ganha o tipo de necessidade de migração e as contagens de execução／commit, mantendo os fatos conhecidos em caso de falha; não se adicionam amostragem nem tarefas de rede periódicas. Não haver migração não significa zero IO nem ausência de espera por lock.
- O SQL congelado, as entradas de checksum, o migration ID e o limite de transação por banco não foram alterados. A revisão de código e os testes em execução foram concluídos; o ambiente de GUI ainda falha antes de entrar nos casos, e continua-se complementando antes do release a validação de plataforma-alvo, de GUI e da cadeia do celular.