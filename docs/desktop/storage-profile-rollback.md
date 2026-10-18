# Rollback do storage profile do Desktop

## Decisão

Reverter o isolamento de storage profile do Desktop introduzido em `2a9e692862` e ajustado em `8e3a2ded32`, bem
como a cobertura de caminho Local Host → Agent CLI adicionada por `59548dc60a` para esse isolamento.

Após o rollback, a seguinte semântica histórica é restaurada:

- o diretório padrão de dados do usuário do Desktop, do Host e do Agent bundled volta a ser `~/.zcode`.
- deixa-se de escolher `.zcode-dev`, `.zcode-beta` etc. conforme desenvolvimento a partir do código-fonte, Stable ou
  Preview.
- o `dataBaseDir` da página de configurações continua sendo passado ao Host somente pela `ZCODE_DATA_BASE_DIR`
  existente, usada para a migração de dados do App.
- o Host deixa de injetar `ZCODE_STORAGE_PROFILE`, `ZCODE_STORAGE_DIR` ou `ZCODE_HOME` em subprocessos.
- sessions, plugins, agents, commands, skills, logs e rollout no nível do usuário continuam usando os dados existentes
  em `~/.zcode`, evitando que a atualização apareça como perda de dados históricos.
- caminhos `.zcode/*` dentro do workspace permanecem inalterados.

## Causa raiz

O storage profile injeta a raiz de dados custom do App no Host como `ZCODE_STORAGE_DIR` exato, e esse ambiente é em
seguida herdado pela varredura de recursos do CLI e pelos subprocessos do Agent. Os recursos originais do usuário
continuam em `~/.zcode`, de modo que em tempo de execução sessions, plugins, subagentes e comandos apareciam
simultaneamente como ausentes. A versão 3.7.2 sobrescrevia a raiz do CLI apenas na fronteira de spawn do Agent,
produzindo duas séries de diretórios lidas separadamente por Host/UI e por Agent, sem conseguir restaurar
completamente os dados históricos.

A implementação do rollback também precisa limpar os imports de todos os módulos de storage profile removidos e fazer
com que o path helper de E2E mantido retorne explicitamente o `.zcode` sob o HOME isolado. Restaurar apenas os pontos de
chamada deixando referências estáticas a `zcode-storage-root` faz o build TypeScript do Agent CLI bundled falhar; já
remover as exportações antigas do helper de E2E mantendo os chamadores faz o typecheck do repositório falhar.

## Aceitação

| Case | Condição | Expectativa |
| --- | --- | --- |
| STORAGE-ROLLBACK-001 | Qualquer forma de execução do Desktop inicia o Host | Não injeta storage profile, storage root exato nem `ZCODE_HOME` |
| STORAGE-ROLLBACK-002 | O usuário configura um `dataBaseDir` custom no App | Os dados do App são migrados pela lógica existente; os recursos de usuário do CLI continuam sendo lidos de `~/.zcode` |
| STORAGE-ROLLBACK-003 | Stable/Preview/desenvolvimento a partir do código-fonte acessa os mesmos recursos de usuário | sessions, plugins, agents, commands e skills seguem usando `~/.zcode` |
| STORAGE-ROLLBACK-004 | Abre um workspace com configuração `.zcode` | Os caminhos de agents, commands e skills no nível do projeto permanecem inalterados |
| STORAGE-ROLLBACK-005 | Constrói o Agent CLI bundled e executa o typecheck do repositório | Os adapters não referenciam mais os módulos de storage profile removidos; o helper de E2E resolve fixamente o `.zcode` sob o HOME isolado; ambas as verificações passam |
