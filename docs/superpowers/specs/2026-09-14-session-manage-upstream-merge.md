# Branch de gerenciamento de sessão sincronizado com o upstream

2026-09-14: o usuário aprovou mesclar diretamente em `feat/session-manage` o
`feat/multi-device-remote-3-real-ssh-feature` (`243b87c2c0`), sem criar worktree.
Os IDs e definições migrados por este branch ficam deslocados para trás; a migração
do upstream precisa ser executada primeiro.

## Contrato de migração

```text
CLI schema_migration:
  0001..0019 -> 0020_provider_model_selection -> 0021_official_glm_selection
    -> 0022_backfilled_session_reasoning -> 0023_session_soft_delete_outcome

Host:
  tasks_schema_migration: 0001_adopt_task_schema -> 0002_provider_selection
    -> 0003_official_glm_selection -> 0004_project_execution_scopes
  schema_migration: 0005_projects
```

Preservar o SQL histórico do upstream, as entradas de checksum e o formato do journal.
Os IDs antigos deste branch `0020_session_soft_delete_outcome`, `0001_projects` são
aliases históricos dos novos IDs: depois de validar o checksum antigo, reutiliza-se o
resultado já concluído, sem reexecutar a conversão; os registros antigos são mantidos
para que o código antigo os reconheça.
O banco novo ainda executa primeiro os passos do upstream e depois os passos deste
branch. Os aliases servem apenas para o deslocamento de IDs deste branch de
desenvolvimento e não permitem ignorar mudanças de checksum. Se qualquer passo
falhar, nenhum escritor de negócio pode ser liberado.

`touchedTables` declara as tabelas que cada migração pode modificar, e é usado tanto
pelo backup quanto pelos testes de fronteira por tabela; declarações ausentes, vazas ou
inválidas são rejeitadas antes de executar o SQL. O CLI 0020 do upstream declara
`message/part/session_entry`, 0021 e 0022 declaram `session_entry`, 0023 declara `session`.
A migração de tarefas do Host também mantém o backup por tabela do runner compartilhado
e a admissão serial por caminho de banco de dados, preservando o checksum e as colunas
existentes de `tasks_schema_migration`, sem inserir colunas de projeto no schema
histórico congelado.
A restauração do backup usa o journal de cada um; não se pode restaurar os dados de
negócio e manter o registro de "migração concluída".

O CLI continua sendo o único dono dos fatos de sessão, do corpo, da soft delete e do
resultado; o Host continua sendo o único dono da atribuição de projetos e do estado
organizado.
Os dois journals do Host são apenas compatibilidade com a contabilidade histórica e não
geram escrita dupla de estado de negócio.
O Host 0004 move as colunas de diretório de execução de projetos automation/off-peak,
já existentes neste branch, para depois da migração de tarefas do upstream, garantindo
que o Repo independente funcione; não cria projetos nem atribui propriedade. O 0005
continua sendo executado pelo TaskIndexRepo com settings.

## Comportamentos que a mesclagem deve preservar

- A árvore de projetos e o diretório de configuração de roots reais continuam sendo o
  desenho atual; a barra lateral antiga de Group/workspace não é restaurada.
- A entrada de projetos é persistida pelo Host, as tabs servem apenas para navegação;
  settings não ressuscita entradas removidas.
- O handshake remoto preserva as verificações de envio de membro e cancelamento deste
  branch, e integra o dispose de RPC do upstream, a validação de fechamento durante o
  handshake, o fechamento consoante a identidade da conexão, o ponto de publicação
  unificado de reconnect e a Source identity estável.
- O protocolo compartilhado registra ao mesmo tempo as mensagens de preparação do
  workspace do projeto e as mensagens de snapshot de recursos.
- O rascunho salva ao mesmo tempo projectId e initializeFromNewTask; a configuração de
  user scope usa o host base.
- A entrada dedicada de storage-migrate não depende da atualização do provider nem da
  preparação do runtime de ferramentas.

```text
握手 -> 成员/取消/close 校验 -> 唯一 Source owner 发布 -> services 换代
           | 失败                       | 重连
           v                            v
     回收未发布连接              只通知一次有效发布

desktop-continuous -> 同一 Host/CLI 直接实时流
web-remote-replayable -> shared-host attachment -> snapshot/gap 恢复
```

## Cenários de validação

1. O CLI completa nos quatro casos — banco antigo comum, banco já atualizado deste
   branch, banco já atualizado do upstream e banco novo — seguindo a nova ordem; os
   IDs antigos apenas convertem a contabilidade, corpo/soft delete/resultado são
   preservados e a execução repetida não altera os dados.
2. No Host, o schema de tarefas do upstream vem antes do schema de projetos; IDs,
   atribuição e ordem existentes de projetos não são reconstruídos; os journals antigo
   e novo coexistem, o checksum antigo não muda e os campos de automação e ociosidade
   podem ser lidos e gravados.
3. Na ausência de touchedTables, com checksum divergente ou em falha de migração, as
   tabelas de negócio não são modificadas; o backup por tabela cobre as tabelas
   realmente escritas e a restauração limpa o journal correto.
4. Preservar e executar os E2E já existentes de cancelamento de handshake, reconnect
   manual, isolamento de múltiplos profiles no mesmo caminho, remoção de entrada de
   projeto e interação desktop/celular; apenas migrar os localizadores antigos, sem
   apagar cenários.
5. Executar o gate de schema, a checagem de arquitetura, typecheck, lint e os testes
   afetados.
   Operações reais de banco de dados, push e MR não estão no escopo desta
   autorização.

O resultado da execução e as limitações de ambiente estão no registro abaixo.

WCP01 validado junto com o desenho atual de projetos: criar pela UI um projeto local
com root e removê-lo, afirmando a soft delete no banco; em um reinício completo,
mesmo havendo um snapshot antigo de settings do mesmo diretório, o projeto não pode
ser importado de novo nem ressuscitado.
VP28 verifica simultaneamente os dois journals do Host, confirmando que a migração do
upstream e a de diretório de execução terminam antes da migração de projetos.

## Registro de validação da mesclagem

- HEAD do branch original: `00d7538a0e44d79c4dbe5ddc4e5c609233eb8057`; o destino da mesclagem foi fixado em `243b87c2c01ea4da6b5b6b6bdd71c4fab8e54528`.
- Foi criado um branch de proteção antes da mesclagem. Foram resolvidos diretamente no branch atual 37 conflitos de texto.
- O checksum histórico das 22 migrações de CLI e das 3 migrações de Host do upstream é todo idêntico; o SQL/checksum da migração renumerada de CLI deste branch é o mesmo, e a migração de projetos mantém o teste de checksum congelado.
- SQLite/Repo/rascunho etc., especial final: 8 arquivos, 193 casos passando; especial de projetos e atribuição: 21 arquivos, 166 casos passando. Inclui upgrade de ID antigo sem reexecução, rejeição por checksum, rollback de transação, migração concorrente e restauração de backup dos dois journals.
- Handshake de controle remoto, WebSocket, Registry de janelas e attachment do Main: 4 arquivos, 147 casos passando. O caso de simulação de WSL adicionado pela mesclagem corrigiu a poluição de fixtures de janela entre describes, aguardando o ACK do novo attachment.
- Armazenamento/migração de modelos/cold recovery do CLI: 9 arquivos, 163 casos passando. O caso de protocolo atingiu o timeout padrão de 5 segundos quando rodou em paralelo com o build; após cronometrar temporariamente para localizar o custo de subscribe/fork, o diagnóstico foi removido e, executados isoladamente com o timeout original, os 12 casos passaram, sem afrouxar timeout de produto ou de teste.
- Recuperação de UI, roteamento de configurações, workspace identity e rascunho passaram; a nova recuperação persiste apenas lastActiveWorkspace, sem deixar settings antigos ressuscitarem a navegação.
- E2E de desktop (HOME isolado, mock replay): os dois specs, VP28 e WCP01, passaram; validam a ordem das migrações, a ordenação inicial, a remoção de projeto e o reinício completo. O relatório está em `packages/desktop/.e2e-artifacts/desktop-e2e-20260914-040830-608/summary.md`.
- Entrada dedicada `storage-migrate`: 3 casos passando, incluindo primeiro upgrade em processo independente, reinício idempotente e rejeição por checksum.
- `pnpm typecheck`, typecheck do código de produção do CLI, `pnpm lint`, `pnpm db:schema:check`, `pnpm architecture:check --changed` e `pnpm test:architecture` passaram. As novas violações de arquitetura foram 0; o lint teve 0 errors, preservando os warnings já existentes no repositório.

Ao comparar este branch com o upstream não há erros de whitespace; foram mantidas as duas linhas em branco no final de arquivo do document-skills trazidas pelo upstream e os três espaços finais do template de documentação.

Nesta rodada não foi feita integração ponta a ponta com dispositivos SSH/WSL/Docker reais, não foi executada a suíte completa do repositório nem a varredura completa de codegraph de feature-boundary; as conclusões de controle remoto se limitam à regressão de protocolo simulada acima. Não foi iniciado o upgrade do aplicativo sobre um diretório de dados real, nenhum banco de dados de usuário foi modificado e nada foi enviado nem MR criado.
