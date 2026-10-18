# Todo 145: preparar os bancos de dados de forma unificada antes de entrar no ZCode

> Status: código implementado e revisado; a aceitação de GUI no desktop / Windows, macOS e no plano de fundo do ARMS ainda não passou, portanto não é marcado como publicável.
> Data: 2026-09-14. Baseline de avaliação do código: `fix-database-migration-startup`, `845391b5dc`.
> Escopo mais recente: refazer o fluxo de inicialização do aplicativo, incluindo a inicialização do banco do Host, o diagnóstico de inicialização do ARMS e a amostragem leve de disco; não modifica os scripts de migração.
> Este documento substitui a lista de execução posterior do Todo 144 e o design de loading por workspace do plano antigo; os registros históricos de verificação continuam preservados, mas não representam aprovação do novo plano.
> Revisão de integridade e alcance do plano: [revisão de início de trabalho](../../../desktop/database-startup-plan-review.md). As evidências atuais de implementação estão em [revisão de implementação](../../../desktop/database-startup-implementation-review.md), que explicita os itens concluídos, os limites de implementação e as aceitações de publicação ainda não aprovadas.

## 1. Objetivo e invariantes

Depois que o usuário abre o ZCode, ele vê primeiro uma página de inicialização independente. Só depois que a preparação dos bancos de dados locais necessários ao boot está concluída é que o Root de negócio normal é montado, o workspace é restaurado e os negócios em segundo plano que dependem do banco são liberados.
Não basta cobrir a interface e deixar os hooks do Root ou o scheduler continuarem acessando um banco ainda não pronto por baixo. Um novo usuário sem workspace também precisa passar pelo mesmo fluxo de inicialização.

- O ID de migration original, o SQL, o checksum, o ledger e a ordem de execução permanecem inalterados; itens já concluídos são validados pelas regras existentes e pulados.
- Não implementar otimização de SQL, executor substituto, batch, novos índices, limpeza de dados ou bifurcação do formato de migração; não promete reduzir o pico de memória ou de disco dos scripts originais.
- Transações e ledger do SQLite decidem a exclusão mútua das migrações e o fato de conclusão; o Host guarda apenas o estado de inicialização atual, sem novo marcador persistido de "migrado" nem lock de arquivo entre processos.
- A inicialização local cobre `tasks-index.sqlite`, o `db.sqlite` das sessões e os outros bancos necessários ao boot descobertos na auditoria. Listar primeiro a lista real; não se pode usar "todos os bancos" para esconder item faltante.
- Não conectar ativamente a todos os ambientes históricos de SSH/WSL/Docker. Bancos remotos são preparados quando a conexão correspondente é estabelecida e não se tornam pré-requisito do boot local.
- Os caminhos devem seguir a resolução real de configuração, incluindo diretório de dados customizado e caminho do banco de sessões; não se pode migrar um banco com caminho padrão e deixar o negócio abrir outro.
- A proteção de leitura de configuração de Provider em processo separado é mantida; esta tarefa não modifica a semântica de conta, Provider ou seleção de modelo.

## 2. Sequência alvo e responsabilidades

```text
Main 创建窗口、启动 Host、转发启动消息
           ↓
Renderer 显示独立启动页，订阅并读取启动快照
           ↓
Host 建立可提前访问的启动控制面
           ↓
解析本地配置和数据库身份（不等待登录、Key、权益或可选网络）
           ↓
准备 Host 数据库：迁移 + 必需的迁移后初始化
           ↓
通过 Agent 自身存储入口准备会话库
           ↓
全部数据库就绪 + 必需服务装配成功
           ↓
启动协调器报告 ready → 放行业务消费者 → 挂载业务 Root / 恢复工作区

任一阶段失败 → failed → 显示诊断和恢复操作
                              ↓ 用户重试
                  新 attempt → 重查配置及真实迁移账本
```

O estabelecimento do canal de estado de inicialização precisa ser anterior às operações de banco de dados bloqueantes; quando a ordem de inicialização dos dois lados difere ou as mensagens chegam cedo, o snapshot precisa conseguir completar o estado.
O Main apenas agenda e repassa e não hospeda a lógica de migração. O Host possui a orquestração de inicialização, o Agent possui a implementação da migração do banco de sessões e a UI apenas exibe o estado e envia a intenção de nova tentativa.
Mesmo antes de o canal de serviços normal ser publicado, a página de inicialização precisa ser capaz de exibir falhas; não se pode depender de `createLocalServices()` ter sucesso para obter o estado.

Estados sugeridos: `starting → preparing_host_storage → preparing_session_storage → starting_services → ready`, e qualquer estágio pode entrar em `failed`.
Os subestágios de cada banco são checking / waiting_for_lock / migrating / committing / ready / failed.
Preservar attempt, identidade do banco, índice do estágio, horário de início, código de erro e ID de diagnóstico; attempts antigos e eventos fora de ordem não podem sobrescrever o estado novo.
Uma falha em `starting_services` deve indicar falha na inicialização de serviços, sem reportar erroneamente falha de migração de banco.

### 2.1 Regras de nova tentativa (restrição de implementação)

Após uma falha de migração, permanecer na página de falha indicando claramente o motivo e a sugestão de tratamento; não repetir automaticamente, não reiniciar o SQL por timeout e não iniciar uma nova migração por recarregar a página. Só o clique do usuário em "tentar de novo" cria um novo attempt; requisições duplicadas durante a execução e de attempts antigos são inválidas. Locks como os do SQLite pertencem à tentativa atual; a nova tentativa limitada de rede do ARMS é um comportamento de telemetria independente e não dispara operações de banco. Banco corrompido ou checksum divergente deve levar ao diagnóstico, sem sugerir que repetir vai corrigir.

## 3. Checklist de tratamento da implementação antiga

| Escopo                                                                                  | Tratamento                                                    | O que precisa ser provado antes de reutilizar                          |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------- |
| Interceptação de migração dentro de `Root.tsx`, `useStorageStartup`, assinatura de snapshot de workspace | Remover a integração antiga e reimplementar conforme o boot do aplicativo | O Root de negócio não é montado antes e a proteção vale mesmo sem workspace |
| `prepareStorage(workspace)` e retry na destruição do workspace   | Não usar como entrada global; auditar chamadas e depois remover ou restringir | Não fabricar workspace e não re-disparar o boot global ao trocar de aba |
| SQL runner original, espera de lock, rollback, ready após COMMIT | Reutilizar item a item conforme o novo design                   | Ainda executa o SQL congelado original, mantém compatibilidade do ledger e espera de forma observável |
| Notificação inicial do Agent e admissão de requisições de protocol | Manter as capacidades necessárias, ajustar a integração e corrigir a propagação de falha | Sem primeira notificação, a saída do processo também produz um estado terminal observável; timeout de RPC comum não regride |
| Componentes de loading, estilos e textos                          | Reutilizáveis conforme a necessidade                           | Não carregam estado de workspace e suportam múltiplos estágios e recuperação de erro |
| Testes de transação, SQL congelado, contenção de lock e recuperação de crash | Manter e usar na aceitação                                    | Executados na nova entrada de boot; resultados antigos aprovados não substituem a regressão desta rodada |
| Hooks de workspace / Root / E2E de inicialização                | Remover asserções inválidas, cobrir novos cenários antes de implementar | Validar a ordem real de inicialização, e não apenas a exibição de componentes |
| Proteção de configuração de Provider em processo separado          | Manter o commit separado e seus testes                         | Não é revertida pela reescrita do boot                                 |

Não usar hard reset do branch inteiro nem reescrever histórico já enviado. Substituir a implementação antiga por commits posteriores; remover protocolos, exports, textos e testes não utilizados, evitando manter dois conjuntos de gates a longo prazo.

## 4. Execução em ordem

### A. Concluir primeiro o spec de inicialização e a auditoria de dependências

- [x] Atualizar `docs/desktop/database-migration-startup-gate-plan.md` para o novo plano, removendo o design atual que conflita com o novo escopo; a trajetória histórica fica no Todo 144.
- [ ] Executar o architecture context/check e a varredura de feature-boundary; ler as instruções do Agent, o DESIGN, os documentos de fatos atuais de controle remoto e o skill de E2E relacionado.
- [ ] Listar a ordem de criação, canal de estado, leitura de configuração, abertura de DB, publicação de serviços, prewarm e início de scheduler/bot/Wiki em Main / Renderer / Host / CLI.
- [x] Verificar um a um AutomationRepo, OffPeakTaskRepo e TaskIndexRepo quanto a construção, ensureReady, migração e correções pós-migração; não se pode equiparar a construção de instância com migração já feita.
- [x] Verificar se o caminho de sessões pode mudar com a configuração do workspace; o conjunto físico de bancos preparados globalmente localmente precisa coincidir com os consumidores seguintes, e um novo banco físico diferente ainda precisa do próprio gate.
- [x] Definir onde a execução síncrona do SQLite ocorre no Host. Avaliar prioritariamente o Worker pertencente ao Host, mantendo o event loop do Host responsivo; se outra unidade de execução for usada, descrever a fronteira e o ciclo de vida no spec.
- [x] Definir a entrada de preparação de armazenamento do Agent que não depende de workspace e as regras de reaproveitamento/fechamento de conexão; o Host não copia SQL nem inicia um Agent de negócio completo para sondar o banco indiretamente.
- [x] Congelar o protocolo de inicialização, a classificação de erros, timeouts, saída, novas tentativas e o contrato de múltiplas janelas, e só então escrever os testes de implementação. Se a auditoria revelar a necessidade de ampliar o escopo de arquitetura já confirmado, comunicar primeiro a lacuna concreta.

### B. Estabelecer primeiro os testes de comportamento

- [ ] Com banco isolado, dados antigos reais e barreiras de estágio, provar que a página de inicialização já é exibida antes da migração do Host e que o Root e os consumidores de banco em segundo plano ainda não entraram.
- [ ] Cobrir novo usuário sem workspace, usuário antigo com migração pendente, ledger parcial, já migrado e modificações posteriores do usuário não sendo sobrescritas.
- [x] Manter a regressão de execução do SQL congelado pelo runner síncrono/assíncrono, dos mesmos dados e ledger, do rollback de erro e do Reader entre versões.
- [x] Adicionar testes de snapshot de falha para falha de inicialização pós-migração do Host, falha de montagem de serviços, ausência do primeiro estado e saída do processo.
- [ ] Cobrir primeiro a classificação de erros da seção 5.1 e os testes de texto de ponta a ponta, cobrindo cause original, falha de commit/limpeza, falta de espaço no disco temporário e erros de IO comuns sem alarme indevido.
- [x] Estabelecer o novo E2E de inicialização, sem que os casos contornem os estágios sob teste com uma fixture que "espera o chat ficar ready".

### C. Implementar a orquestração de inicialização do Host e do Agent

- [x] Estabelecer antecipadamente o canal de mensagens de inicialização, a leitura de snapshot e a entrada de nova tentativa; usar tipagem estrita e schema de runtime, sincronizando mudanças de protocolo com as definições compartilhadas.
- [x] Unificar a entrada de preparação do mesmo banco físico no Host, concluindo serialmente as inicializações necessárias; os repos de negócio reutilizam o resultado, evitando que vários repositórios abram o banco simultaneamente e cada um migra.
- [x] Manter a exclusão mútua do SQLite entre Host e CLI independente; não tratar a deduplicação de preparação dentro do processo como um lock entre processos.
- [x] Ligar à entrada de preparação de SQL original do Agent, garantindo que a notificação de estado seja realmente enviada antes do SQL longo e que ready só ocorra depois do COMMIT.
- [ ] Separar serviços em preparação e inicialização: registro/construção não deve iniciar tarefas de segundo plano que dependem do banco; scheduler, bot, Wiki, prewarm e acesso de controle remoto seguem o gate.
- [ ] Distinguir storage ready de application ready; se a montagem seguinte falhar, manter a página de falha e liberar os serviços/subscriptions/recursos de Worker desta tentativa que não foram publicados com sucesso.
- [x] Corrigir o problema de a falha não ser observável quando o primeiro estado está ausente na implementação antiga; durante a migração, requests comuns e a coleta por o idle não podem matar o processo repetidamente.
- [x] Host e Agent compartilham uma classificação de erros semanticamente consistente, passando códigos de erro seguros de forma explícita; não comprimir todo erro não-BUSY em sql_failed. Preservar o erro original para diagnóstico e não alterar o SQL de migração original.
- [x] Ligar ciclo de vida, duração, erros e amostragem de disco do ARMS conforme a seção 9; falhas de amostragem e de envio não podem mudar o resultado da inicialização.

### D. Ligar a página de inicialização independente

- [x] Estabelecer a entrada de inicialização fora do Root normal; inicializar tema, idioma e barreira de erro necessários, sem depender do store ou dos serviços de negócio completos.
- [x] Exibir estágios reais como "Preparando dados locais", "Atualizando o índice de tarefas / o histórico de conversas" e "Aguardando outras janelas concluírem a atualização de dados", além do tempo decorrido.
- [x] Não exibir porcentagem falsa nem tempo restante estimado; prompts de longa duração não disparam sucesso, skip nem reinício automático.
- [x] Na falha, exibir causa compreensível, ID de diagnóstico, cópia dos detalhes do erro, opções de nova tentativa aplicáveis e saída; corrupção validada não pode encorajar tentativas infinitas.
- [x] Falta de espaço usa o texto e a entrada de recuperação definidos na seção 5.1; UI e ARMS consomem a mesma categoria padrão de erro, sem inferir o erro a partir do texto traduzido.
- [ ] Suportar chinês e inglês, temas claro e escuro, operação por teclado e redimensionamento da janela; no celular, exibir o estado de preparação/falha do shared-host existente, sem iniciar um segundo runtime.
- [x] Remover o loading global dirigido por workspace; erros de conexão remota voltam ao fluxo de conexão e não podem ser confundidos com falha de DB local, ocultando a entrada de reconexão.

### E. Verificação e limpeza

- [ ] Executar a matriz de aceitação abaixo, salvando evidências de UI, log de estágios, processo e ledger; testes de UI com mock não substituem processo real e E2E.
- [ ] Executar `pnpm typecheck`, `pnpm lint`, `pnpm architecture:check --changed`, a verificação de tipos correspondente do CLI, os testes unitários afetados e o E2E de desktop.
- [ ] Atualizar spec, catálogo de casos e matriz de cobertura; marcar como concluído apenas o que tem evidência real.
- [x] Remover interfaces de workspace inválidas e estados duplicados; confirmar que o diff das definições de migração em relação ao branch alvo está vazio e que o patch de Provider continua presente.
- [ ] Atualizar o escopo final, as evidências e as limitações do rascunho de MR e só então submeter, após as checagens obrigatórias; atualizações de push/MR usam o skill zcode-mr.

## 5. Contrato de falha, rollback e recuperação

A fronteira de transação é calculada por banco de dados e não há promessa de rollback entre bancos. Se o banco do Host commitar e o banco de sessões falhar, o banco do Host permanece no estado já commitado; na nova tentativa, a validação pula as migrações concluídas e executa apenas os itens realmente faltantes.
As correções do Host após a migração podem ficar fora da transação de migração: verificar item a item suas fronteiras de commit, idempotência e efeitos colaterais de inicialização repetida; não se pode considerar o Host pronto só porque o ledger de migração está completo.

- Falha de SQL/COMMIT: respeitar o rollback transacional original; se o próprio rollback falhar, manter o erro original e o estado de recuperação, sem garantir ao usuário que o rollback foi concluído.
- Crash ou encerramento forçado: na próxima vez o SQLite recupera e o ledger é reconferido; uma notificação perdida após o COMMIT não pode disparar transformações duplicadas.
- Disco cheio, permissão, I/O, falha de alocação de memória, corrupção, checksum divergente, retenção de lock acima do orçamento e saída do executor devem ser classificados separadamente; erros desconhecidos preservam um diagnóstico seguro.
- Uma nova tentativa só começa depois que a execução anterior terminou e o estado de limpeza de transação/conexão está claro; quem espera não pode encerrar a migração owner de outra janela.
- Recarregar a página ou desconectar o celular não cancela a migração; ao reassinar, obtém-se o snapshot atual. O fluxo de saída precisa testar tanto o fechamento normal quanto o kill do sistema, e não se pode garantir rollback gracioso para toda terminação do sistema.
- Não apagar DB/WAL/SHM nem o ledger, não criar um banco substituto vazio, não sobrescrever checksum automaticamente e não tratar falha como primeira inicialização.
- Não copiar por padrão um backup do banco inteiro de 20 GB nem usar "espaço restante maior que o tamanho do banco" para fingir um requisito mínimo preciso de espaço. Com o disco cheio, ainda é possível copiar o erro necessário a partir do snapshot de estado, sem depender de o ZIP exportado ter sucesso.
- Logs são registrados por estágio, item de migração e estado terminal, incluindo attempt, estágio, duração, código de erro e identidade de banco anonimizada; sem spam de polling de lock, corpo de mensagem ou API Key.

### 5.1 Identificação e mensagens para falta de espaço e outras falhas

O código atual tem apenas classificações grosseiras como open_failed / lock_timeout / checksum_mismatch / sql_failed; o runner classifica exceções comuns de SQLite que não são BUSY como sql_failed, com o erro original no cause. O schema compartilhado e o loading antigo ainda não conseguem expressar sozinho a falta de espaço de armazenamento. O que muda agora é a passagem e a exibição de erros, não a definição da migração.

| Evidência original                                        | Categoria padrão                         | Comportamento da UI                                                                                                   |
| --------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Código de erro principal do SQLite 13 (SQLITE_FULL)       | storage_full                             | Avisar que o espaço de armazenamento é insuficiente ou que o limite de capacidade foi atingido; é possível tentar de novo após liberar espaço ou verificar a cota |
| ENOSPC em operação de arquivo do sistema                 | storage_full                             | Avisar falta de espaço de armazenamento; não limpar arquivos do usuário automaticamente                        |
| EDQUOT em operação de arquivo do sistema (se exposto)    | storage_quota_exceeded                   | Avisar que a cota de armazenamento é insuficiente; apenas limpar arquivos de outros usuários pode não resolver    |
| SQLITE_BUSY; SQLITE_LOCKED julgados separadamente       | database_busy / database_locked          | BUSY externo segue o orçamento de espera de lock; LOCKED na mesma conexão não repete a espera cegamente e deve reportar diagnóstico de conflito; não é classificado como problema de disco e não encerra outro owner |
| EACCES / EPERM / SQLITE_READONLY explícitos              | access_denied / read_only                | Mensagem correspondente de permissão de acesso/somente leitura; não se pode deduzir a causa específica no SO apenas por SQLITE_PERM |
| SQLITE_NOMEM / ENOMEM explícito (incluindo código estendido reconhecível) | memory_unavailable        | Falha de alocação de memória; não tratar saída desconhecida de processo como OOM comprovado                  |
| SQLITE_CORRUPT / NOTADB / divergência de checksum        | database_invalid / migration_mismatch    | Bloquear, oferecer diagnóstico e canal de ajuda; não apagar o banco, não alterar o ledger e não corrigir automaticamente |
| SQLITE_IOERR / CANTOPEN comuns, exceção desconhecida      | io_failed / open_failed / unknown        | Falha de leitura/escrita ou de abertura, ou causa desconhecida; sem evidência clara do SO não se pode reportar "disco cheio" |

O SQLite usa o errcode numérico original (extraindo os 8 bits baixos quando houver código estendido) e uma causa estruturada para julgar; o ERR_SQLITE_ERROR genérico do Node não substitui os códigos granulares do SQLite, e é proibido corresponder apenas à mensagem em inglês. A leitura da cadeia de causes precisa ser limitada e à prova de loops, com serialização explícita dos campos permitidos entre Worker/IPC.
Se for identificado um limite explícito de capacidade como max_page_count do banco, avisar limite de capacidade; o próprio SQLITE_FULL não prova que o espaço livre de algum disco é zero. O disco onde ficam os arquivos temporários também pode estar sem espaço, e não se pode dizer diretamente "o disco D está cheio" sem confirmação. [Definições de erro do SQLite](https://www.sqlite.org/rescode.html#full)

Texto padrão (finalizando conforme DESIGN e i18n):

> O espaço de armazenamento é insuficiente ou o limite de capacidade foi atingido; não foi possível concluir a atualização dos dados.
> Verifique o espaço disponível nos discos do diretório de dados e do diretório temporário do sistema, libere espaço ou ajuste a cota de armazenamento e tente novamente.

Entradas: tentar de novo, copiar os detalhes do erro e sair; caminhos de falha específicos já confirmados aparecem apenas nos detalhes locais, sem adivinhar o caminho do banco principal como o caminho do arquivo temporário que falhou. Uma nova tentativa espera a limpeza desta tentativa terminar e então prepara conforme o ledger real, sem contornar a migração e entrar direto no negócio.
A amostragem de disco é apenas auxiliar: um rollback após o erro que libera espaço não muda a categoria original storage_full. Espaço livre final maior que zero, ausência de amostragem e falha de amostragem não podem sobrescrever um erro explícito de falta de espaço.
A classificação de erros cobre abertura, SQL de migração, COMMIT e correções pós-migração; exceções secundárias de rollback/close/PRAGMA de recuperação são registradas separadamente, sem sobrescrever a causa da primeira falha de migração e sem afirmar "rollback concluído com segurança, dados íntegros" antes de o estado de recuperação ser confirmado.

Aceitação: testes isolados que gerem FULL a partir do limite real de capacidade do SQLite e testes unitários com objetos de erro explícitos do SO; injeção de falhas para cobrir os demais erros de sistema de arquivos, sem encher o disco do usuário. O E2E de UI afirma que o texto, as ações e o código de erro padrão coincidem; não se pode provar que todos os caminhos reais de disco cheio do SO passaram usando uma fixture de limite de capacidade.

## 6. Orçamento de espera (sugestão da nova implementação, a ser escrito no spec na fase A)

| Cenário                | Regra sugerida                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Loading global         | Sem um timeout total que mate o processo no prazo; o estado é determinado pelas fases e pelo ciclo de vida do executor |
| Primeiro estado do plano de controle de inicialização | Mantém-se por enquanto 30 segundos, mas apenas para estabelecer o plano de controle; precisa ser estabelecido antes do SQL longo e não vale para a migração inteira |
| Espera de lock de escrita do SQLite | Mantém-se por enquanto o limite de 60 minutos com backoff assíncrono; independente do busy timeout de 5 segundos do negócio comum, com falha explícita ao exceder o orçamento |
| Executando o SQL original | Sem timeout de SQL que mate o processo automaticamente; não é possível declarar morto pela falta de atualização de progresso, porque um SQL síncrono pode durar muito |
| Prompt de longa duração  | Após 10 minutos, mostrar a explicação da duração e continuar esperando; não é prazo final e não promete memória ou espaço suficientes |
| Requisições de negócio comuns | Manter os timeouts originais; a espera do gate de migração é separada da contagem de tempo das requisições de negócio |

O thread de execução e o canal de estado devem garantir que a janela continue responsiva; "SQL sem timeout" não pode ser usado como desculpa para UI sem estado ou loading eterno após a saída do processo.

## 7. Matriz mínima de aceitação

Tudo abaixo está pendente de execução e não herda as marcações de concluído dos TODOs antigos.

| ID          | Cenário                                                          | O que precisa provar                                                                     |
| ----------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| GLOBALDB-01 | Novo usuário sem workspace, sem conta/Key e com a rede indisponível | Após a preparação bem-sucedida dos bancos locais obrigatórios, entra no fluxo normal de primeiro uso |
| GLOBALDB-02 | Execução pausada durante a migração do banco antigo do Host        | A página de inicialização já está visível, o estado é legível, a janela responde e o negócio ainda não iniciou |
| GLOBALDB-03 | Host concluído e migração longa do banco de sessões                | As fases mudam corretamente; só entra no Root quando os dois bancos e os serviços estão prontos |
| GLOBALDB-04 | Já migrado, parcialmente migrado e dados modificados pelo usuário depois da migração | Não repete itens concluídos nem sobrescreve modificações posteriores; compatibilidade com SQL/checksum/ledger originais |
| GLOBALDB-05 | Banco de sessões falha depois do sucesso do Host, com nova tentativa | Não reverte o banco do Host já commitado; a transação não commitada da sessão é recuperada; sem necessidade de reconstruir a configuração |
| GLOBALDB-06 | Falha nas correções pós-migração do Host e falha na montagem de serviços obrigatórios | Não simula ready, atribui o erro corretamente e a nova tentativa não produz efeitos colaterais duplicados nem vazamento de recursos |
| GLOBALDB-07 | Múltiplas janelas / CLI independente acessando o mesmo banco e bancos diferentes | O SQLite do mesmo banco é exclusivo e não migra duas vezes; bancos diferentes não misturam estados |
| GLOBALDB-08 | Espera de lock além dos 5 segundos antigos e além do orçamento     | O primeiro caso consegue completar com sucesso; o segundo é diagnosticável e não encerra o owner do lock |
| GLOBALDB-09 | Kill forçado antes do COMMIT e notificação perdida após o COMMIT  | O subprocesso real se recupera corretamente, com ledger e dados consistentes                          |
| GLOBALDB-10 | Primeiro estado ausente, crash de Worker/Agent e quebra de IPC      | Há estado observável de falha/reconexão, sem loading eterno sem feedback                             |
| GLOBALDB-11 | Recarga de página, dupla clique em tentar de novo e ready antigo atrasado | Não reinicia nem cancela a migração; o novo attempt não é sobrescrito por estados antigos     |
| GLOBALDB-12 | Erros de FULL, permissão, I/O, checksum e banco corrompido            | Causa clara e entrada de recuperação segura, sem falso sucesso nem fallback para banco vazio |
| GLOBALDB-13 | Diretório de dados customizado e configurações diferentes de banco de sessões | O banco preparado coincide com o que o negócio realmente abre, sem reportar prontidão global por engano |
| GLOBALDB-14 | Disparo simultâneo de scheduler / bot / Wiki / prewarm            | O gate no servidor é efetivo, não depende de máscara de UI e não duplica a fila accepted |
| GLOBALDB-15 | Boot local com histórico remoto, falha de conexão remota e Agent antigo | Não conecta ativamente a todos os ambientes, não reporta falha de rede como erro de DB e o protocolo antigo tem comportamento de compatibilidade explícito |
| GLOBALDB-16 | Pareamento de celular, reconexão e acesso durante a preparação do shared-host | Não inicia outro runtime; os limites desktop continuous e celular replayable permanecem |
| GLOBALDB-17 | Windows/macOS/Linux, tema, idioma e tela estreita                  | Visível, operável, sem tela branca; caminhos de recursos de Worker/subprocesso funcionam após o empacotamento |
| GLOBALDB-18 | Cold start de banco já migrado, saída e novo início                 | Sem Agent/Worker residuais desnecessários, tarefas de segundo plano duplicadas ou regressão evidente de inicialização |
| GLOBALDB-19 | Eventos do ARMS, troca de fase, texto de falha e nova tentativa      | Fronteiras de tempo precisas, UI e telemetria com a mesma origem de erro, deduplicação de estado terminal e payload final dentro do orçamento de atributos |
| GLOBALDB-20 | Espaço disponível cai durante um SQL longo e depois se recupera   | A amostragem roda de forma independente; salva a maior queda em relação à baseline inicial e a recuperação do espaço após rollback não apaga o pico |
| GLOBALDB-21 | Múltiplos volumes, arquivo inexistente, falha de sondagem, exceção do SDK e modo offline | Valores ausentes não viram zero, distingue-se por volume, a preparação do negócio segue normal e não há bloqueio por varredura ou envio |
| GLOBALDB-22 | Crash do executor de migração, encerramento forçado do app e apenas evento de início | Distingue-se falha confirmada de estado terminal desconhecido; não se fabricam erro de SQL, pico real ou envio garantido |
| GLOBALDB-23 | SQLite FULL / ENOSPC / EDQUOT; amostragem ainda com espaço ou ausente | Classificação e texto precisos, sem depender da amostragem para identificar e sem apontar o disco errado |
| GLOBALDB-24 | IOERR / CANTOPEN / permissão / NOMEM / saída desconhecida de processo  | Sem falso relatório de disco cheio ou OOM, informação desconhecida preservada e UI e telemetria com a mesma origem |
| GLOBALDB-25 | Falha de COMMIT ou de correção pós-migração, com falha posterior de rollback/close | Causa original preservada, limpeza e estado de nova tentativa claros, sem alegar conclusão do rollback |
| GLOBALDB-26 | Espaço no disco do banco principal, falha no temporário e espaço já recuperado na nova tentativa | Não se nega FULL com a folga do disco principal; o pico antigo é preservado, o novo attempt é independente e o ledger está correto |

O teste de performance de 20 GB continua suspenso e só será medido após autorização explícita; nesta rodada há apenas validação funcional com banco isolado. Não se pode inferir, pelo sucesso com um banco pequeno, que usuários com pouca memória ou pouco disco necessariamente terão sucesso na migração.
Validações de plataforma, remota, E2E ou de performance que não puderem ser concluídas precisam permanecer explicitamente como pendentes; não se pode entregar apenas porque o loading apareceu.

## 8. Limites de publicação e entrega

- O mesmo pacote cobre usuário novo, migração inacabada e usuário já migrado; a escolha da migração é decidida pelo ledger real, e não por número de versão ou marcador de UI.
- Até o novo plano ser aprovado, o MR atual permanece como rascunho. Validar primeiro a inicialização com banco já migrado e depois o não migrado, concorrência, recuperação de falha e multiplataforma; a publicação exige a execução separada do processo de release.
- Reverter o código de inicialização não executa migrações de banco já commitadas; o rollback do pacote inteiro segue o contrato existente de legibilidade entre versões, sem apagar ledger ou dados.
- A entrega desta rodada é o TODO, a revisão manual de impacto e o índice de documentação; não houve código do novo plano, varredura automática por codegraph, teste de runtime ou publicação.

## 9. Diagnóstico de inicialização e amostragem de disco do ARMS (complemento de 2026-09-14)

O usuário pediu o envio do tempo decorrido, status e erros da preparação unificada de bancos de dados, além de registrar, na medida do possível, o pico de disco durante a migração. Esta seção é um plano a implementar e não indica que os dados já foram coletados ou já chegaram ao ARMS.

Restrição adicional do usuário: a monitorização não pode adicionar carga relevante a dispositivos com pouca memória e pouco espaço restante. Tempo/status/erro são prioritários, e o pico de disco é um diagnóstico degradável; não se busca precisão de pico e não se adia ready por causa da telemetria.

### 9.1 Integração e responsabilidades

Entradas de fatos existentes:

- `packages/desktop/src/main/desktopArmsCustomEvent.ts`: unifica o payload custom, o contexto de versão/plataforma da aplicação e a captura E2E antes do envio final.
- `packages/desktop/src/main/desktopRemoteUsageArmsTelemetry.ts`: implementação de referência para o agregado e envio de fatos de Host/ciclo de vida no Main.
- `packages/services/src/storage/adapters/volumeProbe.ts`: sondagem assíncrona de capacidade de volume com stat/statfs, retornando null em caso de falha; a reutilização precisa passar por interface de domínio ou injeção de dependência, sem importar direto o adapter interno entre domínios.
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/storage-startup.ts`: entrada de notificações de migração existente; o novo plano gera UI e telemetria a partir do mesmo estado de inicialização, sem inferir estado a partir do texto do log.

```text
Host/Agent 启动事实 ──→ 启动协调器 ──→ UI 阶段与安全错误提示
                            └─────→ 有界诊断事件 ──→ Main 既有 ARMS 出口

Host 独立采样器 ──异步读取所在文件系统可用空间──→ 本地聚合 ──→ 磁盘摘要事件
      ↑
SQLite 在 Worker / Agent 执行，同步 SQL 不能阻塞采样器
```

O Main não faz parsing de DB e não é responsável pela máquina de estados da migração nem por sondagem de negócio de disco. O Reporter entra por injeção, e Web/CLI independente não dependem do SDK do Electron.
A telemetria não espera login; é enviada conforme a configuração de coleta e os switches existentes, sem introduzir requisições de rede obrigatórias para a inicialização. Se o ARMS não estiver pronto, estiver offline ou lançar erro, o tratamento é limitado e não pode bloquear a migração, o ready ou a página de erro.

### 9.2 Critérios de tempo, status e erro

- `startup_id` identifica a inicialização desta janela, `attempt_id` identifica a preparação/nova tentativa e os sub-attempts de banco são associados a ela; recarregar a página não registra uma migração extra.
- **Tempo total de preparação dos bancos**: desde o início da resolução da configuração necessária/preparação dos bancos pelo coordenador até todos os bancos obrigatórios e a inicialização de banco serem bem-sucedidos, ou essa fase falhar; inclui a espera de lock e não inclui a montagem posterior dos serviços de negócio.
- **Tempo de liberação da interface principal**: desde o início da ação do coordenador até os serviços obrigatórios estarem prontos e o app ready ser emitido; separado do tempo de preparação dos bancos. Da criação da janela à primeira tela pertence às métricas de boot já existentes e não deve ser fabricado por subtração de relógio de parede entre processos.
- Para cada banco, registrar separadamente verificação, espera de lock, execução da migração, commit e inicialização pós-migração. Dentro de um processo usar relógio monotônico; entre processos, passar a duration já calculada; a duração total entre bancos é medida separadamente pelo coordenador, sem somar cegamente períodos paralelos.
- O status inclui started / fase atual / success / failed / interrupted ou unknown; as mudanças de fase vêm do estado autoritativo e não precisam ser reenviadas pelo Renderer.
- O erro registra a fase de falha, o tipo de banco, o migration ID quando disponível, o error code padrão, uma chave estável de mensagem de UI, o tipo de ação de recuperação e o diagnostic ID. O texto de UI e o envio vêm da mesma classificação de erro; não é possível exibir "disco cheio" e ao mesmo tempo enviar um erro SQL desconhecido.
- O ARMS não recebe diretamente a message original da exceção, caminhos completos, SQL, conteúdo de conversa ou Keys. Resumos de erro legíveis por humanos usam modelos seguros; o cause original fica no mecanismo local de diagnóstico existente e é anonimizado.
- O SDK aceitar o envio não significa que o backend já armazenou; kill forçado ou queda de energia podem perder eventos finais. Apenas um evento de início não pode ser contado diretamente como falha de migração, muito menos afirmar OOM.

Divisão de eventos sugerida (schema a congelar na implementação):

| Evento                            | Frequência/métrica principal                                                                               | Uso                                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `database_startup_started`        | Uma vez por attempt                                                                                        | Registra o início da preparação e se correlaciona com os eventos seguintes    |
| `database_startup_stage`          | Uma vez por mudança real de fase; value é a duração da fase anterior                                      | Localiza em qual banco, espera de lock ou execução ficou travado             |
| `database_startup_result`         | Um estado terminal por attempt; value é a duração total da preparação                                   | Taxa de sucesso, motivo da falha, novas tentativas, P50/P95/P99                |
| `app_startup_ready` ou resumo de falha correspondente | Um estado terminal por tentativa de liberação; value é a duração do coordenador até app ready/falha | Distingue travamento na montagem de negócio após a conclusão do DB           |
| `database_startup_disk`           | Um resumo terminal por scope observado; no máximo um resumo agregado a cada 5 minutos em migrações longas  | Preserva o último estado observado de espaço e evita a ausência total de evidência final quando o executor quebra; não envia amostra por amostra |

Priorizar a coleta completa para poucos eventos de started/result/error, sem herdar a proporção padrão da amostragem de papel de recurso de alta frequência; se for necessário amostrar, amostrar de forma consistente por attempt e registrar a proporção.
Os identificadores de correlação de started/result servem apenas para diagnóstico e não são dimensão de agregação de alta cardinalidade; a taxa de sucesso precisa considerar amostras offline/não fechadas e não pode simplesmente usar started menos result como número de falhas.
O código de telemetria de recursos existente indica um orçamento de 20 atributos para ARMS custom; os campos públicos finais também consomem cota. Na implementação, verificar os limites do SDK/plataforma, dividir por evento e testar o payload final, sem enfiar todos os campos de fase e de disco no mesmo evento.

### 9.3 Uma métrica principal de disco, distinguindo amostragem de entrega

O usuário pediu que a métrica fosse decidida por princípio e pelas diferenças entre sistemas operacionais, evitando enviar uma grande quantidade de valores difíceis de explicar e garantindo que a falha preserve e entregue o resumo tanto quanto possível. Candidatos anteriores como tamanho de múltiplos arquivos e amostragem a cada 10 segundos foram removidos da lista atual; o processo histórico está preservado nos commits do Git; e os pequenos testes existentes não servem como evidência do custo real de IO de disco nem da confiabilidade multiplataforma. Nesta rodada não foram adicionados testes de performance nem implementação de telemetria.

#### Métrica principal e painel

A métrica principal usa **a maior queda de espaço disponível durante a preparação**:

```text
A0 = 开始准备前，目标文件系统的有效可用字节数
Amin = 本次准备期间有效样本中的最低可用字节数（包含 A0）
observed_available_drop_peak_bytes = max(0, A0 - Amin)

例：开始可用 30 GB → 最低可用 18 GB → 回滚后可用 29 GB
    上报峰值下降量 12 GB，不用结束差值 1 GB 代替。
```

Essa é a **variação líquida observada** do sistema de arquivos alvo, e não a ocupação física exclusiva da migração, o volume total escrito, um limite superior de espaço necessário nem um pico instantâneo exato. Escritas/liberações de outros programas, a coleta do sistema e ajustes de cota podem alterar o número e até mascarar o crescimento da própria migração; o nome da métrica e o painel precisam preservar o sentido de "observado".
Base da escolha: em relação ao comprimento lógico dos arquivos DB/WAL, ela observa o efeito conjunto de arquivos temporários e da alocação real de blocos dentro do mesmo pool de espaço; em relação a percorrer arquivos contando blocos físicos, ela dispensa varrer ou enumerar arquivos temporários e evita lidar com a atribuição complexa de blocos clonados.

O painel padrão exibe apenas: duração total da preparação, resultado/fase de falha/categoria de erro e o pico de disco acima. Manter `min_available_bytes` como campo auxiliar de investigação de falhas, colapsado por padrão na exibição; capacidade total, comprimento inicial/final/máximo de cada arquivo e amostras por rodada não são enviados rotineiramente.
Cada resultado válido mantém poucas informações de qualidade: metric_version, estado da baseline/coverage e o tempo entre a última amostra e o fim; sem baseline ou amostras válidas, omitir a métrica e não preencher 0. Apenas uma amostra inicial não prova que o crescimento foi zero.
Os resultados principais são deduplicados por attempt; checkpoint e terminal são claramente distinguidos, e a taxa de sucesso e a distribuição do pico final usam apenas os terminais; attempts não fechados são analisados separadamente e não somados como falha ou sucesso.

#### Critérios por sistema operacional

| Sistema  | Entrada unificada e critério                                                                                          | Fronteira de interpretação que precisa ser preservada                                                                 |
| -------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Windows | `bavail * bsize` retornado pelo statfs assíncrono do Node; conferir o mapeamento CallerAvailableAllocationUnits do libuv empacotado | Usar a quantidade disponível para o chamador; o total ocioso que ignora a cota do usuário não pode servir de substituto; compressão NTFS e arquivos esparsos fazem o comprimento lógico não ser igual à ocupação física |
| macOS   | Mesmo critério de blocos disponíveis do statfs, sem misturar a capacidade do Finder ou estimativas de Foundation para usos específicos | Volumes APFS do mesmo contêiner compartilham espaço, e clonagem/snapshot alteram a alocação física; leituras de volumes diferentes podem refletir repetidamente a variação do mesmo pool e nunca devem ser somadas diretamente |
| Linux   | Mesmo `bavail * bsize` do statfs, sem misturar unidades de statvfs nem `bfree`                                   | Reflete a quantidade disponível para usuário comum retornada pelo sistema de arquivos, mas não garante incluir todos os limites de cota/inode/metadados de usuário; comportamentos como ext4/Btrfs/overlay precisam ser entendidos por classificação |

Princípio geral: unificar "a variação de espaço disponível informada pelo SO", sem alegar que os três SOs são completamente equivalentes em cotas, espaço recuperável e estratégia de alocação. Manter a análise agrupada por plataforma. SQLITE_FULL também não significa que esse valor é necessariamente zero.
Referências: [Node StatFs](https://nodejs.org/docs/latest-v24.x/api/fs.html#class-fsstatfs)、[semântica de cota do chamador no Windows](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getdiskfreespaceexa)、[fs\_\_statfs do libuv no Windows](https://github.com/libuv/libuv/blob/v1.x/src/win/fs.c)、[statfs do macOS](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/statfs.2.html)、[espaço compartilhado do APFS da Apple](https://support.apple.com/en-gb/guide/mac-help/sysp560a2952/mac)、[statfs do Linux](https://man7.org/linux/man-pages/man2/statfs.2.html).

Quando os dois bancos locais estão por padrão no mesmo sistema de arquivos, todo o attempt de preparação compartilha uma única amostragem contínua, sem resetar a baseline ao fim de cada banco. Sistemas de arquivos alvo diferentes geram o mesmo tipo de resumo por scope; há um pico por scope e os picos de cada volume não são somados em um valor global. Sem prova de que são o mesmo pool de espaço, não se combina; não se usa letra de unidade nem st_dev para se passar por identidade de disco físico.
Pode-se aplicar statfs diretamente no diretório real do banco, sem necessidade de subir camada por camada procurando o ponto de montagem. Diretórios inexistentes devem, na resolução do caminho de inicialização, herdar um ancestral existente, em vez de repetir a exploração a cada tick. O sistema de arquivos do diretório temporário só entra como scope adicional quando confirmado de forma confiável; sem varredura de disco inteiro e sem alegar cobertura de um diretório temporário desconhecido.

#### Controle de custo e baseline

- Por padrão, a cada 2 segundos, um statfs assíncrono por scope alvo; cancela-se o stat de arquivo de 4 vezes por rodada. Manter apenas A0, Amin, contagem e tempo, sem salvar série temporal, sem gravar amostra por amostra em disco e sem passar pela rede do ARMS.
- No máximo uma requisição de sistema de arquivos em trânsito por amostrador, com polling por scope; quando uma chamada lenta não retorna, o tick é pulado e nada se acumula. O IO de arquivo assíncrono do Node/libuv ocupa o thread pool, e uma implementação que paraleliza até preencher o pool dentro de "uma rodada" não pode ser considerada limitada em concorrência.
- Não varrer conteúdo de arquivos/diretórios, não consultar SQL de estatísticas do banco, não disparar checkpoint/fsync e não criar novos processos de amostragem. O amostrador principal fica no Host, que ainda responde, e o SQLite é executado no Agent existente ou no Worker de migração planejado.
- Iniciar a primeira consulta o quanto possível depois de resolver o caminho real; apenas a baseline concluída antes do início da escrita da preparação correspondente entra no critério completo. Não adicionar barreiras de inicialização com espera infinita por telemetria; baseline tardia é marcada partial/late e não pode ser misturada à mesma distribuição dos picos completos; sem baseline, manter duração/erro e marcar unavailable.
- Manter o mínimo do início ao estado terminal; após a falha, não resetar o pico e não exigir uma nova sondagem bem-sucedida para permitir o envio. Pode-se tentar uma coleta adicional no estado terminal, mas ela não pode bloquear a página de erro nem o ready, e o espaço após a coleta terminal não pode ser tratado como pico histórico.
- slow/unavailable apenas reduz a completude da observação e não sobrescreve o erro de migração. Consultas assíncronas de metadados ainda podem sofrer espera de lock do sistema de arquivos ou IO real; o fundamento é o número fixo de consultas, não uma garantia de custo zero.

#### Preservação na falha e entrega ao ARMS

```text
Host 采样并维护摘要 → 每次摘要变化时向 Main 镜像最新诊断（至多每 2 秒一次，小消息）
执行者失败         → Host 生成 failed + 已有峰值 → Main 上报终态
Host 退出          → Main 复用既有进程退出事实 + 最近诊断镜像 → 上报 interrupted
整应用强退         → 依赖此前已送达 checkpoint / 已持久化终态补报；不能保证尾部值
```

A imagem espelhada no Main é dado de telemetria descartável e não se torna coordenador de migração, ledger de conclusão ou decisor de nova tentativa. O reload da UI não reporta de novo; a falha não depende de o Renderer estar montado, do usuário estar logado, de exportar um ZIP de logs ou de ler novamente o disco com falha.
O checkpoint agregado existente de 5 minutos pode ser mantido, mas o painel oculta esses registros intermediários e mostra apenas o estado terminal ou o resumo não fechado mais recente. A frequência de checkpoint pertence ao orçamento de confiabilidade de rede e não pode ser confundida com a frequência local de amostragem de 2 segundos.

Lacunas de SDK já identificadas (instalação atual de `@arms/rum-electron` 0.0.3): `sendCustom` retorna void; o request do reporter do Electron retorna fetch diretamente e não verifica o status HTTP nessa camada; o reporter básico depende do reject da requisição para disparar o retry configurado. Não se pode afirmar sucesso de rede apenas com try/catch(sendCustom) ou com asserções de captura beforeReport/E2E, nem assumir que um HTTP 500 necessariamente tem retry. É preciso conferir os patches reais de empacotamento e a configuração efetiva final antes da implementação.
Entradas de fato: `node_modules/@arms/rum-electron/dist/index.mjs` (electron-reporter/request), `@arms/rum-core/lib/model/reporter.js` (tryRequest) e `packages/desktop/src/main/desktopArmsCustomEvent.ts` (captura antes do envio).

- [x] Completar na saída unificada de telemetria um contrato de resultado de envio confirmável: distinguir entrada na fila do SDK, sucesso de recepção HTTP do receptor e consultabilidade no ARMS; HTTP não-sucedido e exceções de rede explícitas entram em retry com backoff limitado; quando o SDK não suporta cancelamento, timeout apenas marca não confirmado, sem duplicar requisições ainda em trânsito e sem modificar os timeouts de negócio da inicialização.
- [x] Reutilizar primeiro o que o SDK suporta; se o SDK não fornecer a confirmação de envio/retry confiável necessários, abrir no spec um escopo mínimo de correção do SDK com regressão, sem enviar do Host um HTTP cru que contorne o filtro público.
- [x] Estados terminais chave usam deduplicação por event_id estável e um supplement de envio com limites de memória/contagem/tempo; registrar event_time para impedir que o supplement do próximo boot se misture a um novo attempt.
- [ ] Se for necessário supplementar após reinício, persistir apenas um resumo de estado terminal pendente muito pequeno, com limite total sugerido de 64 KiB e TTL de 7 dias, sem gravação por amostra; se a escrita falhar, continuar enviando em memória sem bloquear a página de falha. Essa fronteira substitui a limitação absoluta anterior de "não criar fila de retry persistente" e não se expande para um sistema genérico de armazenamento de telemetria. Remover após o recebimento bem-sucedido; envios duplicados são deduplicados por event_id.
- [x] Quando o volume do banco está cheio e o resumo também não pode ser gravado em disco, só se pode depender da memória do processo vivo e da rede disponível; não se alegar que a gravação ou o upload têm sucesso garantido. Queda de energia do aplicativo, offline prolongado, SDK desativado e recusa do ARMS não garantem entrega, e não se pode ocupar recursos indefinidamente nem impedir o usuário de sair só para buscar "entrega garantida".
- [ ] Usar injeção de falhas para validar a preservação do pico já existente após FULL, a saída do executor/Host, a ausência da primeira amostra, o SDK não pronto, HTTP não-sucedido, queda de rede e a deduplicação do supplement. O caminho de confirmação de envio precisa inspecionar de fato a resposta, e não apenas verificar que um sendCustom mock foi chamado.
- [ ] Na aceitação de publicação, conferir com um evento isolado cujo envio é permitido o armazenamento e a consulta reais no ARMS, quantificando perdas/suplementos; nesta rodada não se envia telemetria de produção nem se roda teste de performance de migração.

A promessa de entrega deve ser formulada assim: falhas recuperáveis preservam as métricas observadas, com confirmação e retry limitado quando há rede disponível, e supplemento após reinício quando as condições permitem. Não se promete capturar o pico real em todos os cenários nem entrega em 100%.

## 10. Entrega desta rodada e pendências de aceitação (2026-09-14)

- Foram implementados dois tipos de Worker pertencentes ao Host, a casca de inicialização antes do Root de negócio, canal de estado/controle independente, nova tentativa manual, erros seguros, amostragem limitada de 2 segundos e confirmação de recepção HTTP do ARMS.
- Falha na montagem de serviços oferece apenas sair e reabrir; o Worker já saiu e não é possível reassemblar serviços dentro de um Host onde parte dos serviços já foi criada. Não há rollback global entre bancos.
- Esta versão usa o resumo na memória do Main vivo e retry de rede limitado, sem implementar o outbox/suplemento opcional após reinício nem o checkpoint periódico. Requisições com timeout não se acumulam; não se promete entrega garantida em kill forçado/offline.
- O celular continua usando a interface existente de conexão/reconexão do shared-host, e o attachment é adiado durante a preparação; não há UI nova de fase de banco para o celular. A regressão de celular e remota ainda aguarda validação em ambiente executável.
- O novo E2E foi escrito em manual-review/pending e ainda não foi promovido; o Electron quebra com SIGTRAP antes de criar a janela, e testes unitários e sondas de Worker em Node não podem ser tratados como aceitação de GUI.
- Resultados de verificação, correções de revisão e entradas de log estão registrados de forma centralizada na revisão de implementação; itens não marcados não são substituídos por resultados de aprovação do plano antigo.

## 11. Correções da review de 2026-09-15

- [x] A reconstrução do Host revoga o listener de inicialização antigo e não reproduz ready após a saída; estado e porta de binding inicial/reload ficam vinculados ao mesmo startup ID da geração atual.
- [x] Quando o projeto histórico está indisponível, usa o cwd fallback assíncrono compartilhado com o Agent comum; erros reais de banco continuam sendo falha.
- [x] Testes unitários adicionais, teste de propagação de ID e E2E pending GLOBALDB-27/28; tipos/Lint/arquitetura e build aprovados.
- [ ] Submeter depois que o E2E de desktop passar: o Electron mínimo deste ambiente também gera SIGTRAP, com registro na revisão de implementação.