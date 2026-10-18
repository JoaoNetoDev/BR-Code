# 15 Validação de release unificada do Provider Refactor

> Status: descontinuado (não é mais um Todo independente)
>
> Data: 2026-08-25
>
> Decisão atual: apenas guardar de forma centralizada o escopo de validação pré-release, sem executar por enquanto; não bloqueia a convergência estrutural dos Todos 12–14.
>
> Planos relacionados: [`../plan/plan.md`](../plan/plan.md),
> [`../plan/02-provider-automation-proof.md`](../plan/02-provider-automation-proof.md)
>
> Designs relacionados: [`../design/design.md`](../design/design.md),
> [`../design/registry/configuration.md`](../design/registry/configuration.md),
> [`../design/registry/runtime.md`](../design/registry/runtime.md)

## 0. Posicionamento da tarefa

Este arquivo preserva o registro histórico do escopo de validação de release, mas deixa de ser um ponto de entrada de execução independente. Hoje não há implementação nem validação agendada para ele; se no futuro for necessário um gate de lançamento, deve-se criar um Release Checklist/Todo dedicado com base no processo de release da época e na baseline final de staging, em vez de restaurar este arquivo.

Historicamente, ficou acordado que, se a validação encontrasse problemas, eles seriam tratados assim:

1. O design existente é explícito e a implementação não segue: primeiro fixar o teste que falha e depois fazer o bugfix mínimo;
2. O design não define algo, ou um serviço real não consegue satisfazer o contrato existente: parar a validação e solicitar uma decisão;
3. Falha de ambiente, de conta ou de serviço externo: salvar a evidência e marcar como blocker, sem disfarçar como falha de produto nem como resultado verde;
4. Itens sem evidência real permanecem pending, sem substituí-los por type check, verificação de fixture ou resultado de mock.

## 1. Escopo de validação

### 1.1 E2E críticos de Provider

As quatro pending cases abaixo são mantidas como estão e concluem o review manual, o replay formal, a promoção e a admissão em Docker quando este Todo for retomado:

- Isolamento de identidade do mesmo modelId com Provider ID/Base URL diferentes;
- Prewarm de cold start do Provider Registry e Endpoint da primeira requisição;
- Herança de Provider/Request Auth de Subagent Off-Peak em foreground;
- Visibility de Provider, filtro de enabled/completude de Model, e projeção de Built-in-wins para nomes duplicados e ordenação.

A ordem de validação é fixa:

```text
fixture contract check
        |
        v
pending replay + artifact review
        |
        v
human confirmation
        |
        v
promotion dry-run + apply
        |
        v
case-local replay + default replay
        |
        v
single-spec Docker admission
        |
        v
conversation Docker preset
```

### 1.2 Três cadeias reais de acesso

#### API Key

- A Personal API Key e o Endpoint têm precedência final;
- `api.type/baseURL/access` do Effective Provider entram as-is no ModelFactory/Adapter;
- Um Provider sem API Key não entra no Registry executável;
- Atualizar o Config afeta apenas Models criados depois, e Models já criados permanecem congelados;
- A requisição não relê o Legacy Provider Store nem o Config antigo da CLI.

#### Account

- O Account Built-in Overlay trata apenas os Providers de conta declarados pelo ZCode Built-in;
- Start, Individual e Team Plan usam `family/planKind/accessId` estruturados, e o Team Scope é completado conforme o contrato existente;
- `builtinModelIds` só é sobrescrito quando a interface de benefícios de fato retorna um conjunto de modelos; quando não retorna, os membros Built-in continuam em uso;
- O Personal Overlay continua tendo precedência final;
- Credenciais dinâmicas são resolvidas por requisição, não gravadas no Provider Config, e o servidor continua sendo o responsável pela decisão final de autorização.

#### Request Auth

- O Config só guarda `access.type = "request-auth"`;
- A Request Auth Source é montada apenas como dependência de execução do Model daquela execução;
- Quando falta material do período de execução, um erro de autenticação tipado é retornado antes da IO de rede;
- A Request Auth não entra no Personal Config, na Registry View, no Session Snapshot, na persistência nem nos logs.

#### Validação por replay do Reasoning

- Validar que a continuação de turno do DeepSeek Anthropic usa replay do padrão canônico de reasoning;
- Não manter synthetic empty-thinking, hardcode de model ID nem Compatibility Config;
- Se houver um problema de protocolo isolado no servidor, ele é decidido de novo como problema de contrato do Adapter, sem restaurar o contêiner de compatibilidade genérico já removido.

### 1.3 Configuração histórica e persistência

- Uma instalação nova monta o Registry normalmente com Built-in + Personal vazio + Account atual;
- O antigo `.zcode/v2/config.json` recebe um backup de hash de conteúdo antes da migração no mesmo caminho e é substituído atomicamente pelo Personal Config oficial versionado;
- O antigo `model-providers.json` serve apenas como fonte única e somente leitura, não é modificado e não retorna ao Registry estável;
- Os fatos explícitos do usuário de um Custom Provider migram integralmente para o Personal; de um Built-in Provider só migram as diferenças explícitas do usuário;
- `modalities` legadas e campos de capacidade achatados já publicados são convertidos apenas na fronteira privada do importer, sem entrar no Config/Runtime atual;
- Catalog enrichment, Preset, fatos remotos de modelos estáticos e hardcodes de modelos específicos não são cristalizados em Personal;
- Em falha de migração, backup, parsing ou verificação de completude, o arquivo original é preservado e nenhuma configuração nova pela metade é produzida;
- Arquivos oficiais com `schemaVersion` seguem apenas a migration de versão adjacente e não voltam ao importer Legacy sem versão;
- Inicializações repetidas não repetem a migração, e sobras de arquivos antigos não sobrescrevem um Personal Config já estabelecido;
- A migração única do Key do Account Personal Coding Plan no Credential Store permanece com responsabilidade separada da migração do Provider Config.

### 1.4 Artefatos de release e inicialização multiplataforma

- Tanto o ambiente de desenvolvimento do Desktop quanto o pacote de release localizam `config/provider/zcode-builtin.json`;
- CLI/TUI/SEA conseguem materializar e ler o mesmo Built-in Config a partir de ativos embarcados ou de um caminho explícito;
- A build do Server consegue iniciar usando ativos embarcados ou variáveis de ambiente explícitas suportadas;
- macOS, Windows e Linux usam o `.zcode/v2/config.json` do Environment atual, com validação de caminho, permissões, file lock, escrita atômica e comportamento do watcher;
- `ZCODE_DATA_BASE_DIR`, diretórios de teste isolados e caminhos explícitos de Built-in/Personal não geram contaminação entre Environments;
- Cold start, restart normal, atualização de Config e recuperação após falha dão um ciclo de vida de Config/Registry consistente;
- Os artefatos empacotados não deixam de fora o Built-in Config nem carregam API Keys reais ou credenciais de teste.

### 1.5 Gate final de release

- Testes direcionados de Provider, Provider Node, Services, Bootstrap, Core, Adapters, Shared e Desktop/UI;
- `pnpm typecheck`, `pnpm lint`, `pnpm fmt:check` e `pnpm test:unit` da raiz;
- Build de release afetado e smoke por plataforma;
- Replay formal e suite Docker dos E2E promovidos;
- Verificações mecânicas de zeragem de Legacy/Hardcode/segunda fonte de fatos;
- O registro do Release Candidate resume commits, ambiente, comandos, artefatos, limitações conhecidas e blockers.

## 2. Enquadramento de equivalência

“Uma instalação nova é consistente com a atualização histórica” não significa que ambas produzam incondicionalmente exatamente a mesma configuração. Um usuário histórico pode ter API Key, Custom Provider, modelo customizado e sobrescritas explícitas. O enquadramento correto é:

> Com a mesma versão Built-in, o mesmo estado de conta e a mesma intenção explícita do usuário, o Personal Config gravado diretamente e o Personal Config obtido por migração de uma configuração antiga publicada devem resolver Providers/Models efetivos equivalentes e formar uma montagem de requisição equivalente.

A migração preserva apenas os fatos que o arquivo antigo expressava explicitamente e que pertencem ao usuário, sem buscar reproduzir o Effective Snapshot acidental que o sistema antigo deduzia por Catalog, Preset, sincronização remota ou hardcode de nome de modelo.

## 3. Relação com os demais Todos

```text
Todo 12：Selection 最终校验归位
        |
        v
Todo 13：目标 Host / Environment 选择权威
        |
        v
Todo 14：Factory、MCS、Legacy DTO 和死代码机械归零
        |
        v
Todo 15：统一真实验证与发布证据（历史草案，已废弃）
```

- O Todo 11 continua como rascunho independente; se será implementado exige uma decisão à parte, e não é decidido sorrateiramente por este Todo de validação;
- Esta seção preserva apenas a relação entre fases daquela época, e não pode servir como ordem de execução atual nem como promessa de aceitação;
- Os testes unitários e a aceitação mecânica dos Todos 12–14 já foram fechados separadamente;
- A validação de release futura não restaura este arquivo; quem a define passa a ser o Release Checklist final, com base na baseline da época.

## 4. Exclusões explícitas

- Remote Provisioning, edição remota de Settings e sincronização de Config;
- Novas capacidades de produto de Provider/Model ou Access Type;
- Parâmetros de Agent como `modelContextBudget.strategy`;
- Alterar a semântica de produto de pacotes de conta, interface de benefícios ou autenticação do servidor;
- Novos designs de Queue, Goal, Background, máquina de estados de recuperação ou mobile replayable;
- Alterar fatos de configuração Built-in de PDF/Audio já confirmados;
- Restaurar Legacy Catalog, Preset, fatos remotos de modelos ou hardcode de runtime de modelos específicos só para fazer a validação passar.

## 5. Condições para retomar a execução

Só depois de atender às condições abaixo este Todo passa de “Draft” para “pendente de execução”:

1. Os Todos 12–14 estão concluídos, ou foi decidido explicitamente que esta release não inclui algum deles e o risco foi registrado;
2. O branch candidato já foi integrado à baseline de staging alvo e as mudanças estruturais entraram em congelamento;
3. O ambiente gráfico do Desktop, o daemon do Docker, a máquina de build de plataforma e as contas/credenciais de teste necessárias estão disponíveis;
4. As pessoas responsáveis pelo review manual das quatro E2E pending e o local de guardado dos artefatos estão definidos;
5. As contas, cotas, ambientes e regras de log redigido usados na validação com serviços reais foram confirmados;
6. Há alguém responsável pelo bugfix em caso de falha de validação e pelo fluxo de decisão de design, sem mudar o enquadramento depois que os resultados aparecem.

## 6. Definição de conclusão

1. Os três tipos de Access têm evidência de requisição real ou de ambiente isolado equivalente;
2. Instalação nova, atualização histórica, restart e atualização de Config têm resultados revisáveis;
3. Desktop, CLI/TUI/SEA, Server e os artefatos de release da plataforma alvo conseguem carregar o mesmo conjunto de fatos de Provider/Model;
4. As quatro E2E de Provider concluem a confirmação manual, o replay formal e a admissão em Docker combinada;
5. O gate de release completo passa, e todas as falhas têm atribuição clara;
6. Nenhum problema de ambiente, pending case ou item não executado foi escrito como verde;
7. O registro de aceitação do Release Candidate sustenta a decisão de lançamento, de rollback e de remoção posterior do importer Legacy.