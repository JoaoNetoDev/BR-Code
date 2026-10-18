# Revisão de escopo e impacto do Todo 145 (início da execução)

A implementação e a verificação posteriores estão em [Revisão de implementação](./database-startup-implementation-review.md); este documento preserva o rastro de revisão do início da execução, e "a implementar" abaixo é um estado histórico.

Data: 2026-09-14. Conclusão: o objetivo de produto, o escopo excluído e as dimensões de aceitação já são suficientes para entrar na fase A de implementação; isto não significa implementação concluída nem aprovação de release.
Ponto de entrada da execução: [Todo 145](../working-memory/provider-refactor/steps/todo-145-global-database-startup-loading.md). Esta rodada apenas revisa e organiza documentação, sem modificar código de produto e sem continuar os testes de performance.

## Feature Summary

| Campo | Conteúdo |
| --- | --- |
| Developer intent / Capability | Preparo unificado do banco de dados local antes da interface principal, mensagens de falha precisas, observação de disco de baixo custo e diagnóstico via ARMS |
| Change layer / Operating mode | presentation, validation, commit-effect, persistence, recovery; planning |
| Primary seeds | renderer main/Root, Host InitLocal, createLocalServices, TaskIndexRepo, Agent storage bootstrap/runner, ARMS reporter |
| Out of scope | Mudanças de SQL/ledger/checksum, processamento em lote, backup do banco inteiro, pré-conexão remota total, plataforma de telemetria genérica, promessa de performance de 20 GB |

## UI Surface Matrix

| Cenário/entrada | Implementação compartilhada | Estado de exibição/origem padrão | Validação e ação | Autoridade e destino | Isolamento de modo |
| --- | --- | --- | --- | --- | --- |
| Cold start do renderer do Desktop | Casca de inicialização independente ainda a implementar; loading básico reaproveitável | Snapshot do Host; tema/idioma seguem as fontes locais existentes | Monta o Root apenas quando as libs necessárias e os serviços obrigatórios estiverem ready; retry em caso de falha | attempt do Host; transação SQLite/ledger | Vale mesmo sem workspace; não depende da rede da conta |
| Workspace/chat Root | Integração do hook existente ainda a remover | Restaura as tabs normalmente após a conclusão da inicialização | Preserva a admissão do servidor; não reinicia a preparação global ao trocar de tab | Owner original de workspace/Agent | identity/path não se misturam; regra de restauração active-first preservada |
| Workspace remoto | Casca de conexão existente e capacidade de inicialização remota | Fonte de serviços do remoteSessionId correspondente | Só lê o estado de migração após a conexão estar ready; ainda pode reconectar em caso de falha | Banco remoto correspondente | Não espera outros históricos SSH/WSL/Docker; Agents antigos são compatíveis por capacidade |
| Celular /remote | Projeção do estado de inicialização do attachment shared-host | O mesma snapshot do Host, não um runtime independente | Observa e reconecta; recuperação de falha de inicialização segue o owner do desktop | O mesmo ledger do backend | replayable não se espalha para desktop continuous; Main/relay apenas encaminha |
| Web server/CLI independente | Reporter injetado e entrada de armazenamento original | Configuração própria e banco real | Mantém sua admissão de inicialização; sem dependência do SDK do Electron | Seu próprio ambiente de execução | A casca do desktop não é pré-requisito de segurança de dados do backend |

## Shared And Divergent Behavior

| Ponto de atenção | Compartilhado | Divergência e motivo |
| --- | --- | --- |
| UI/componente | Loading básico/i18n podem ser reaproveitados | Reescrita da página de inicialização global; erro de conexão remota não pode ser apresentado como erro de migração local |
| Option source / Default | O caminho do banco segue a resolução da configuração real | Não introduzir Provider/candidatos de modelo nem mudanças de valor padrão; cada banco é preparado de forma independente |
| Validation / Commit effect | Preparar primeiro, negócio depois; erros de segurança unificados | O desktop é responsável pelo owner de retry; o celular observa; o lock do SQL é decidido pelo SQLite |
| Persistence/recovery | SQL, ledger e transação de banco único congelados como estavam | Os dois bancos não fazem rollback cruzado; o relato de estado final da telemetria não se torna fonte do estado de migração |

## Feature Relationships

| Rank | From → aresta semântica → To | Motivo e base no código-fonte |
| --- | --- | --- |
| must-inspect | ServicePort do renderer → montagem do Root → hooks | `renderer/src/main.tsx` hoje monta o Root assim que recebe a porta de negócio; a página de inicialização precisa existir antes e de forma independente |
| must-inspect | InitLocal do Host → createLocalServices → sincronização em segundo plano | `host/index.ts`, `services/src/node.ts` têm inicialização em segundo plano durante a montagem; não se pode apenas mover a UI |
| must-inspect | TaskIndex/Automation/OffPeak Repo → ensureReady → mesmo tasks-index | Os três Repos abrem o SQLite; o TaskIndex tem correções pós-migração, e um ledger completo não significa inicialização concluída |
| must-inspect | Bootstrap do Agent → runner de SQL original → COMMIT/erro | `app/session-store.ts`, `migration-runner.ts`; a cause original é preservada mas a classificação é grosseira, e o finally não pode sobrescrever o erro original |
| must-inspect | Erro original → schema → UI/ARMS | `errors.ts`, o `zcodeStorageStartupStateSchema` do shared e `DatabaseStartupLoading` precisam da mesma classificação |
| must-inspect | Telemetria do Main → reporter do SDK → receptor HTTP | O SDK instalado tem sendCustom retornando void e a request não verifica o status HTTP naquela camada; a chamada de envio não é prova de gravação |
| should-inspect | Pré-aquecimento do ambiente/saída na atualização → ciclo de vida do Host | O orçamento de ambiente de 4,5 segundos em `desktopWindowLifecycle.ts` não pode ser aplicado indevidamente a migrações longas; saída/instalação continuam liberando recursos |
| conditional | Conexão remota / attachment do celular → runtime correspondente | Um proxy não conectado não deve disparar falha de DB; não se pode criar Host/Agent extras |
| invariant-only | CommandInbox / owner lease / replay profile | As mudanças de inicialização não alteram a semântica de entradas aceitas, fluxos e restauração de snapshots |
| evidence-only | Regressões de lock antigo/crash/SQL original e E2E pendente | A base de testes pode ser reutilizada, mas a conclusão de que o loading antigo passou não pode ser herdada |

## State Owners And Commit Sinks

| Estado | Exibição/espelho | Owner autoritativo | Commit e persistência |
| --- | --- | --- | --- |
| Itens já migrados | Progresso no Host/UI | Ledger SQLite | COMMIT da transação original |
| Preparo desta execução | Snapshot da UI, espelho de telemetria do Main | Coordenador do Host | attempt em memória; a migração não pode ser retomada a partir de arquivo de telemetria |
| Estado de erro e recuperação | Classificação compartilhada entre UI e ARMS | Executor da fase de falha e o Host | cause original em diagnóstico local; código de segurança entre processos |
| Observação de disco | Agregação no Host, resumo curto no Main | Valor retornado por statfs do SO | Apenas peak/min/resumo de cobertura; não é custo físico exclusivo |
| Estado final de telemetria aguardando envio | Reporter do Main | Confirmação de envio/receptor | Memória limitada e reenvio de no máximo 64 KiB/7 dias; não pode afetar o app ready |

## Must-Preserve Invariants

SQL/checksum/ledger originais inalterados; caminho do banco preparado igual ao caminho do banco de negócio; commit atômico por banco; o Host só fica ready após as correções obrigatórias;
novo usuário sem workspace não faz bypass; falha não cria banco vazio; erro desconhecido não se disfarça de FULL/OOM; telemetria não bloqueia a preparação;
multi-janela/CLI independente usam a exclusão mútua do SQLite; identity remota, shared-host e continuous/replayable inalterados.
Os pontos de prova são o Todo 145 GLOBALDB-01～26, todos aguardando nova verificação de implementação.

## Codegraph Evidence

Entre as ferramentas chamáveis atuais não há codegraph, portanto **a varredura automática de impacto por codegraph não foi executada**. Nesta rodada usamos declaração no grafo semântico e leitura precisa do código-fonte, sem reivindicar a prova estática de grafo de chamadas de depth-2/3.

| Semente | Cadeia direta já verificada | Profundidade/explicação |
| --- | --- | --- |
| createWindow / spawnHostProcess | dom-ready, orçamento de ambiente, ServicePort, remontagem de Host existente | Cadeia local manual; não é resultado de índice completo |
| Root / useStorageStartup do renderer | Montagem após a porta de negócio, preparação disparada apenas pelo workspace | A integração antiga conflita com o novo objetivo de produto |
| ensureReady do Repo / runTasksDatabaseMigrations | mkdir → DatabaseSync → WAL/migração → correções posteriores | Múltiplas entradas para o mesmo banco precisam ser unificadas |
| openStartupSessionStore | getSessionDbPath → openStartup → progresso de migração | O caminho real de config precisa atravessar a nova entrada |
| custom/reporter do ARMS | Captura do payload final → void sendCustom → fetch | A captura original do envio não prova entrega pela rede |

## Graph Drift Candidates / Graph Delta

Semântica de produto já confirmada: a preparação global do banco precede o Root de negócio/a restauração do workspace, e a inicialização do Host está no escopo desta execução; o grafo ainda descreve majoritariamente a inicialização do active-workspace.
Nesta rodada foi adicionado ao capability de inicialização existente o alias, o TODO atual/documento de revisão e sementes de código já existentes de Host/renderer/Repo/erros/telemetria, preservando os IDs de nós e sem escrever o coordenador ainda não implementado como código atual.
Outras derivas irrelevantes do grafo não são corrigidas; o resultado da verificação do grafo completo e das sementes está registrado no registro de verificação desta rodada, e as arestas penduradas antigas não contam como novas.

## Unresolved Questions / pré-requisitos técnicos de implementação

Não há questões de escopo de produto que precisem de nova confirmação do usuário. As tarefas de design abaixo precisam ser concluídas na fase A dentro do escopo já autorizado, e não podem ser puladas antes de alterar a UI:

| Tarefa | Limite de escolha | Evidência de conclusão |
| --- | --- | --- |
| Execução SQLite e correções posteriores no Host | Preferir o Worker pertencente ao Host; reutilizar o resultado da migração, sem repetir inicialização pesada ao reabrir o Repo | Grafo concreto de ciclo de vida/dependências e ponto de entrada de teste de idempotência |
| Preparo do banco de sessão sem workspace | Entrada de armazenamento original do Agent; configuração real consistente com o runtime posterior, sem construir workspace fictício | Prioridade de configuração, comando/protocolo, contrato de fechamento de conexão |
| Canal de inicialização e retry | Observável antes da publicação dos serviços de negócio; snapshot+assinatura, com invalidação do attempt antigo | Projeto do protocolo/schema e dos testes de sequenciamento |
| Confirmação de recepção e reenvio da telemetria | Correção mínima do SDK ou saída suportada, sem desvio temporário | Auditoria da versão empacotada/patch, contrato de recepção HTTP, testes de falha |
| Lista de bancos físicos necessários | tasks-index e session já confirmados; conferir os outros armazenamentos obrigatórios | Caminho/consumidor/condição de prontidão/motivo de exclusão de cada item |

Se a auditoria do código-fonte provar que é necessário mudar esses limites de produto, comunique com o motivo concreto; não peça autorização novamente por escolhas técnicas rotineiras.

## Clarification Log / Boundary Decisions

| Decisão do usuário | Limite fixado |
| --- | --- |
| Não alterar scripts de migração | Sem branches de otimização/batch/checksum |
| Loading antes da interface principal, incluindo o Host | Refazer a orquestração de inicialização e remover a UI antiga de workspace |
| Baixa carga, observando apenas picos significativos | Um único statfs de 2 segundos em voo, agregando apenas a maior queda de espaço observado, sem reivindicar zero IO |
| Diagnosticar mesmo em caso de falha e alertar falta de disco | Mapeamento explícito de FULL/ENOSPC/EDQUOT; mensagem segura com a mesma origem do ARMS; reenvio limitado e confiável |

## Domain Scope / Dimensions / High-Risk Cross-Products

4 domínios principais: fronteira do processo de inicialização, migração de persistência, exibição/recuperação multiplataforma e telemetria. O enumerador formal atual foca no turno de conversa e não se aplica à prova direta deste fluxo de inicialização; nesta rodada usamos cenários orientados por tabela, sem executar ferramentas de prova formal.
Dimensões: banco novo/antigo/parcial/migrado × checking/waiting/migrating/committing/post-init/service-ready × local/remoto/celular × categoria de falha × se a causa é confirmável × mesmo/diferente banco físico × disponibilidade de amostragem/rede.
Combinações de alto risco: Host já submetido + falha de sessão; falha de COMMIT + nova falha na limpeza; FULL + amostragem ainda com espaço livre; crash de Worker/Host + snapshot antigo; multi-janela + mesmo banco; múltiplos volumes APFS + contagem duplicada; offline + disco cheio + falha de reenvio.

## Candidate Combinations / Pruning Decisions

| Decisão | Status | Motivo/cobertura |
| --- | --- | --- |
| Todo GLOBALDB-01～26 | accepted | O usuário já definiu objetivo e limites; setup/action/assertion detalhados nos cenários do TODO |
| Loading global disparado pelo workspace antigo, IOERR comum informado como disco cheio | bug-candidate | Não permitido pelos novos contratos de inicialização e erro; 02/03/24 |
| Entrar no negócio normal com migração incompleta, pular automaticamente por timeout, apagar o ledger e tentar de novo | pruned | Invariantes de atomicidade e admissão |
| Preparar todos os remotos históricos juntos, iniciar outro Agent no celular | pruned | Limites de conexão remota e shared-host; 15/16 |
| Todas as permutações de OS × erros × temas | pruned | Teste unitário de erros + casos representativos de UI/plataforma, evitando combinações duplicadas |
| Performance de 20 GB, pico instantâneo exato de disco, alcance garantido em offline permanente | ignored/excluído explicitamente | Sem autorização de medição ou impossível garantir; não se fabrica aprovação |

## Accepted Cases / Planning Handoff / Matrix Backfill

| Entrega | Destino | Status |
| --- | --- | --- |
| Requisitos atuais de produto, mapeamento de erros, 26 cenários | Todo 145 | Documentação concluída, testes não executados |
| spec de implementação | database-migration-startup-gate-plan.md | Reescrita da fase A; a versão antiga permanece apenas como referência histórica |
| catálogo de casos / matriz de cobertura | conversation-session-case-catalog.md / testing/conversation-session-e2e-coverage-matrix.md | Nesta rodada foi adicionada a entrada GLOBALDB planned; o antigo DBSTART permanece como histórico |
| Decisões e superfície de impacto | Este documento | Revisão manual do código-fonte concluída, codegraph indisponível |
| Handoff de E2E | e2e-case-lifecycle | planned; primeiro a spec, depois escrever os testes e só então alterar o código |

Os E2E usam HOME/diretório de dados isolados, banco antigo congelado e latch de fase/lock owner/barreira de COMMIT; sem adivinhar o sequenciamento por sleep.
O espaço disponível é insuficiente para validar de forma real o limite de capacidade do SQLite e a classificação por injeção de erro, e não se enche o disco do usuário; sem requisições de modelo e com a validação de negócio necessária seguindo o replay local do caso.
É preciso fornecer um ambiente de desktop executável (antes o Electron quebrava antes dos casos), Worker/subprocesso empacotado em Windows/macOS, e verificação em celular e remoto. São barreiras de release e não impedem começar o design e a implementação de testes unitários da fase A.

## Verificação de documentação desta rodada

`pnpm typecheck`, `pnpm lint` e `git diff --check` passaram. O YAML do grafo é parseável, os IDs de nós são únicos e a verificação de seeds de texto de arquivo/documento/símbolo do capability de inicialização passou; as 4 arestas penduradas existentes não aumentaram. A existência de texto de símbolo não equivale a indexação do codegraph ou análise completa de chamadas; como não há ferramenta automática de codegraph, as limitações da revisão manual são mantidas.
Esta rodada não teve mudança de código de produto, não executou migração, performance de disco ou E2E de UI, e não marcou os 26 cenários planned como aprovados em teste.