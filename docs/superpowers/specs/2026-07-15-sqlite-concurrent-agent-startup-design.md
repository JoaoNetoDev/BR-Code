# Design de Inicialização Concorrente de Múltiplos Agents no SQLite

## Contexto

Tanto os workspaces locais quanto os remotos do ZCode iniciam processos de Agent independentes; os Agents
do mesmo usuário de sistema compartilham `~/.zcode/cli/db/db.sqlite`. O pooling de SSH host em nível de
janela permite que múltiplos workspaces no mesmo host SSH iniciem Agents em paralelo assim que o host fica
pronto, portanto a inicialização do banco precisa suportar a entrada simultânea de vários processos.

Em 2026-07-15, em `mac-studio`, foi observado que, com dois workspaces remotos iniciando ao mesmo tempo: os
dois Agents entraram na migration do SQLite e um deles lançou `database is locked` no migration prelude e
saiu. O App viu apenas `ZCode agent transport closed`, o que se manifestou como o outro workspace do mesmo
grupo não reconectando.

O `migration-runner` atual executa `pragma journal_mode = wal` primeiro e só depois define
`pragma busy_timeout = 5000`; além disso, a criação da tabela `schema_migration` também fica fora da
migration transaction. Portanto, a primeira operação de inicialização que precisa do lock do banco não tem
espera nem proteção de serialização.

## Contrato de Comportamento

1. Agents locais e remotos devem usar a mesma porta de entrada de session-store e a mesma semântica de
   concorrência, sem adicionar branches por tipo de workspace.
2. Quando múltiplos Agents abrem o mesmo session DB, o SQLite é a única autoridade sobre a ordem de
   inicialização; as camadas de UI, Host e reconexão SSH não são responsáveis por serializar a migration do
   banco.
3. A conexão com o banco deve ter um busy timeout limitado já no momento da abertura, e não só depois da
   primeira operação que exige lock.
4. A inicialização do journal mode WAL faz apenas retries limitados para o `SQLITE_BUSY` disputa de escritores
   externos; `SQLITE_LOCKED` falha imediatamente, evitando espera vazia por conflito na mesma conexão. Quando
   já estiver em WAL, a escrita do journal mode não pode ser executada de novo.
5. A criação da tabela `schema_migration`, a validação de checksum, as migrations não aplicadas e a gravação
   do registro de migrations devem ficar no mesmo `BEGIN IMMEDIATE` transaction. Depois de obter o lock de
   escrita, o segundo processo precisa verificar novamente o estado das migrations e não pode reexecutar uma
   migration já submetida.
6. Passado o prazo de espera do lock, o banco deve ser fechado e o erro estruturado `lock_timeout`
   retornado; checksum mismatch, erros de SQL e falhas de abertura, ou seja, erros não relacionados a lock, não
   podem ser retried nem rebaixados.
7. Após o fim da migration, os SessionStorePort existentes, o caminho do banco, o modelo de dados de sessão e
   as APIs de leitura/escrita permanecem inalterados. A inicialização do workspace local, a leitura/escrita do
   histórico, a restauração de sessão e a ordem das chamadas não podem mudar.
8. O store `:memory:` mantém o journal mode `memory` nativo do SQLite; como não é compartilhado entre
   processos, não há troca forçada para WAL, e os testes locais e caminhos de injeção existentes continuam
   utilizáveis.

## Temporização da Inicialização

```text
Agent A                                  Agent B
   |                                        |
   +-- open DB (busy timeout active)        +-- open DB (busy timeout active)
   +-- ensure WAL --------------------------+-- ensure WAL / observe WAL
   +-- BEGIN IMMEDIATE (lock owner)          +-- BEGIN IMMEDIATE (wait)
   +-- create migration table               |
   +-- verify/apply migrations              |
   +-- COMMIT ------------------------------+-- acquire lock
                                            +-- verify migrations (no-op)
                                            +-- COMMIT
   +-- startup continues                    +-- startup continues
```

## Não objetivos

- Não tornar o reconnect dos workspaces do mesmo host SSH serial.
- Não separar o session DB por workspace.
- Não manter o lock de migration na UI, no main do desktop, no Host ou no relay.
- Não fazer retry indiscriminado para qualquer falha de inicialização de Agent.

## Verificação de Regressão

1. Dois processos reais de Agent abrem simultaneamente o mesmo DB novo; ambos completam a migration e o
   migration id final é único e completo.
2. Com um Agent segurando o lock de migration, o outro Agent espera e tem sucesso após o primeiro submeter, em
   vez de lançar imediatamente `database is locked`; o teste de processos concorrentes precisa ser executado
   repetidamente para ampliar a janela de corrida.
3. Quando o lock persiste além do prazo, retorna `SqliteSessionMigrationError(kind=lock_timeout)`.
4. O checksum mismatch ainda retorna imediatamente `checksum_mismatch`, sem ser engolido pelo retry de lock.
5. Todos os testes unitários existentes de session-store passam, provando que não houve regressão de
   comportamento nos caminhos de criação, leitura/escrita e restauração compartilhados pelos workspaces locais.
6. O store `:memory:` completa todas as migrations, validando que a forma de injeção existente do bootstrap
   local não mudou.

## Complemento de 2026-09-14 para Bancos Grandes

O startup de CLI/TUI e de Protocol passou a usar entradas assíncronas; a espera pelo lock externo de WAL e de
BEGIN compartilha um orçamento de 60 minutos, com 25ms de busy nativo por tentativa e backoff assíncrono de
10–200ms. O construtor síncrono mantém a entrada de compatibilidade de 5 segundos; após a migration assíncrona
também é restaurada a política de conexão de negócio de 5 segundos. O SQL longo do SQLite em si continua
executado de forma síncrona, mas cada quadro de controle de etapa faz flush antes, e o Host/UI, por estarem
isolados em processos distintos, continuam exibindo o status.

Migration/ledger continuam inteiramente no mesmo transaction IMMEDIATE, e `ready` só é enviado após o COMMIT
bem-sucedido. SQL/ID/checksum históricos não mudam, e o executor equivalente da allowlist é usado apenas
para itens ainda não lançados em ledger. O design completo, os erros e as boundaries de verificação estão em
`docs/desktop/database-migration-startup-gate-plan.md` e no Todo 144; a inicialização do tasks-index do Host
não faz parte deste loading.