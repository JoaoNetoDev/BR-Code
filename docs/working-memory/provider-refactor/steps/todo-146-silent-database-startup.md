# Todo 146: inicialização silenciosa quando não há migração pendente

Data: 2026-09-15; dá continuidade ao Todo 145 e à exibição de inicialização confirmada pelo usuário. Status: implementação e revisão de código concluídas; aceite do Electron GUI / plataforma-alvo ainda pendente.

## Objetivo e contrato de exibição

- Reinício normal e sem migration pendente: Logo original → interface principal, sem título, explicação, cronômetro ou botão de texto ao longo de todo o percurso; sem atraso artificial.
- Depois de confirmar que há migração: atualizar dados locais → salvar as atualizações → concluir a inicialização → interface principal. Banco vazio usa texto de inicialização, e não se fala em atualizar histórico.
- O texto de espera só aparece depois de confirmada a necessidade de migração e enquanto se aguarda o lock; sem confirmação ou sem necessidade de migração, a espera pelo lock mantém o Logo. Erros são sempre exibidos, com retry manual quando aplicável; migração não é reexecutada automaticamente.
- Durante a preparação entre bancos, mantém-se o aviso geral de inicialização/atualização; o texto de salvar só aparece quando o Host indica a fase real de commit do último banco, e o de concluir a inicialização quando o último banco fica pronto ou a montagem do serviço termina. Commits e manutenção de bancos intermediários não anunciam o encerramento antecipadamente.
- Uma vez disparada a exibição por esta necessidade de migração, ela é mantida até o fim desta inicialização; bancos, manutenção e montagem de serviço não regridem para "atualização". O refresh é restaurado a partir do snapshot do Host da mesma geração e um novo attempt reseta os fatos.

```text
SQLite 执行端检查账本 → Host 聚合本次迁移事实 → Renderer 派生静默/迁移/错误
                                ↓
                          同源 ARMS 事实
无待执行项 → 静默维护/服务装配 → 同代 ready + port → 主界面
有待执行项 → 显示提示/拿锁后复查 → 原 SQL/COMMIT → 维护/服务装配 → 主界面
```

## Limites de implementação

- Mantém-se a phase global existente; a manutenção passa a ser independente, como `maintaining`. Novos fatos estruturados de migration: kind (none/initialize/upgrade), quantidade realmente executada e quantidade já commitada; quando o campo é desconhecido, não se infere que não há migração.
- O executor de migração lê o ledger antes de adquirir o lock, como pré-verificação de exibição; ao encontrar BUSY, mantém desconhecido e segue esperando pelo lock pelo caminho já existente. Depois de adquirir o lock, lê o ledger real novamente antes de executar. A pré-verificação não autoriza execução e não altera SQL congelado, checksum, ID de migração nem o limite transacional por banco.
- O Host agrega por ID interno de banco: o kind de necessidade se mantém dentro de um attempt, e as quantidades de execução/commit são somadas a partir do snapshot mais recente de cada banco, sem acumular por causa de notificações repetidas de fase; a montagem do serviço, as falhas e o refresh preservam os fatos. O retry limpa os fatos da tentativa anterior.
- No CLI o novo fato é um campo de protocolo opcional, e as notificações antigas continuam parseáveis; não se enviam novos comandos de controle específicos de armazenamento para remotos antigos. O celular continua shared-host, e desktop-continuous e web-remote-replayable ficam inalterados.
- Dentro do mesmo attempt do Host, o reaproveitamento da preparação bem-sucedida usa o caminho real de banco normalizado conforme reportado pelo CLI; apenas Workers fechados com sucesso podem ser registrados. Falha, retry ou novo Host não reaproveitam o conjunto concluído anterior. Caminhos duplicados, depois da resposta de handshake `reuse`, deixam de ser abertos/migrados, mas ainda exigem confirmação de saída; não se promete eliminar totalmente o custo de inicialização do bundle da CLI.
- A inicialização normal não monta cronômetro/corpo de texto; o RootStartupLoading reaproveita Logo e tema; chinês e inglês ficam sincronizados. A página de erro mantém a capacidade de recuperação.
- O ARMS mantém o tempo total de preparação e o escopo de estatísticas de disco já definidos, acrescentando o tipo de migração e as quantidades realmente executadas/commitadas, distinguindo "sem migração" de "outro processo já concluiu". Não são adicionadas requisições de rede periódicas nem varreduras de disco.
- Não se pula a verificação do banco por meio de uma marca permanente `migrated`, não se remove a manutenção existente e não se muda a estratégia de lock do SQLite; não se afirma que ausência de migração significa zero IO nem se garante inicialização em milissegundos.

## Checklist de execução

- [x] Atualizar spec, catalog e coverage matrix.
- [x] Teste primeiro: reinício sem migração, inicialização, atualização, disputa de lock, rollback do fato de commit, agregação/refresh/retry do Host, reaproveitamento do mesmo banco, exibição sem texto e de erro, ARMS.
- [x] Novos fatos no executor e no protocolo estrito; estado de manutenção independente.
- [x] Agregação do Host e reaproveitamento do caminho de sucesso atual.
- [x] UI silenciosa, exibição de migração por fatos, dois idiomas e telemetria.
- [x] Verificação de tipos, lint, gate de arquitetura, regressão de migração congelada, build, probe de execução isolada, revisão pós-desenvolvimento.
- [ ] Aceite do Electron GUI / plataforma-alvo: o E2E foi atualizado e executado, mas falhou por ambiente antes da criação da sessão, portanto não conta como aprovado.
- [x] Registrar os resultados e commitar; a falha de ambiente do GUI é registrada como está, sem promover de pending e sem alegar aprovação.

## Casos de aceite

| ID | Cenário | Asserções |
| --- | --- | --- |
| SILENTDB-01 | Migração concluída, reinício mantendo lock de escrita | Logo visível, sem corpo/botão algum, Root não montado antecipadamente; após liberar, entra |
| SILENTDB-02 | Banco vazio/antigo | Distinção inicialização/atualização; exibição só após a necessidade ser confirmada; ready só depois de COMMIT/fechamento |
| SILENTDB-03 | A outra conexão segura o lock e conclui as migrações restantes | Esta conexão não reexecuta; a necessidade já existiu, execução/commit = 0 |
| SILENTDB-04 | Falha no meio do SQL | Mostra erro; a contagem de execução real pode ser diferente de zero e a de commit é 0; retry manual cria novo attempt |
| SILENTDB-05 | Bancos mistos e reload | Mesmo que só um banco precise de atualização a exibição funciona; manutenção/próximo banco não invertem a ordem dos avisos; snapshot da mesma geração é restaurado |
| SILENTDB-06 | Mesmo banco de sessão real, cwd diferentes | Apenas a primeira preparação bem-sucedida; caminhos relativos apontando para bancos diferentes não são mesclados; falha não é reaproveitada |
| SILENTDB-07 | ARMS | kind/execução/commit com a mesma origem do Host; tempo total e estatísticas de disco existentes preservados |
| SILENTDB-08 | Chinês/inglês e tema | Inicialização normal sem texto visível; textos de erro e migração visíveis e correspondentes aos fatos reais |

O E2E continua usando o pending spec conversation-session-database-startup; sem DB real de usuário e sem teste de performance de 20 GB.

## Registro de implementação e verificação

- regressão final concentrada no app: 11 arquivos, 144 testes passando; depois, regressões de espera de lock duplicada antes/depois da pré-verificação: 6 testes de preparação de tasks passando. A regressão estendida anterior, com relay, disco e espera de serviço: 12 arquivos, 54 testes; a regressão estendida de Repo: 4 arquivos, 110 testes.
- regressões de migração assíncrona e session-store do CLI: 2 arquivos, 52 testes; SQL congelado e recuperação de crash: 2 arquivos, 7 testes. Apenas a pré-verificação/notificação mudaram; as definições de migração do banco de tasks e todo o SQL de migração do banco de sessão permanecem textualmente iguais ao HEAD, e o cálculo de checksum e a releitura do ledger dentro do lock foram preservados.
- passam o typecheck da raiz, o lint (45 warnings / 0 errors), o architecture (0 violations), a verificação de tipos do E2E de desktop e o build tsc de adapters/bootstrap da CLI. Passam os builds de tsup e Vite do desktop e o bundle da CLI.
- probe isolado com Worker embutido real: banco de tasks vazio 3/3, banco de sessão vazio 22/22; ao reabrir, novamente none + 0/0 e ledger inalterado; o reuse só envia caminho/quadro de conclusão. Nenhum banco de usuário foi tocado e não foi feito teste de performance de 20 GB.
- teste de montagem real do React: sem corpo nem cronômetro durante o período silencioso; cronômetro ligado depois de confirmada a migração; falha limpa o cronômetro e o retry limpa a exibição. Commits/manutenção de bancos intermediários não exibem salvamento global nem encerramento.
- correções da revisão: um COMMIT bem-sucedido publica imediatamente o fato de commit, e uma falha de fechamento posterior não zera a contagem de commits; cada fase de aquisição de lock, antes e depois da pré-verificação, publica a espera de forma independente, e uma espera desconhecida não engole o aviso posterior à confirmação da migração; quando o realpath assíncrono termina, verifica-se se o Worker já saiu, evitando escrita tardia.
- Os casos E2E foram atualizados (espera silenciosa de lock, refresh, reconstrução do Host, DOM sem texto ao longo de tudo após liberar o lock) e a execução falhou antes da criação da sessão do navegador: `session not created: Chrome instance exited`. Relatório: `packages/desktop/.e2e-artifacts/desktop-e2e-20260915073633586-p297237-e0c4161e03b58901/summary.json`. O pending não é promovido; Windows/macOS, controle remoto do celular e a ingestão de fundo do ARMS ainda não foram medidos.
- Logs: `/tmp/zcode-silent-startup-*.log` na máquina local. O silent é apenas um contrato de exibição, e a verificação do banco/a manutenção original continuam sendo executadas; o cache vale apenas para a preparação bem-sucedida da mesma tentativa e não oferece salto permanente entre inicializações. Não há promessa de queda no tempo total de migração nem de memória, e a frequência de amostragem de disco não muda.