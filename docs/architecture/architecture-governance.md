# Portão de Arquitetura Compartilhado e AI Governance

## Objetivo

As regras de arquitetura são uma capacidade comum a todo o repositório e não pertencem a nenhuma refatoração
de negócio específica. Todas as alterações de código passam pela mesma cadeia:

```text
代码变更 → 策略解析 → 依赖图与变更闭包 → 规则检查与 ratchet → 阅读包与报告
```

As regras só valem para os módulos com `managed: true` (`managedOnly`); os módulos existentes permanecem unmanaged e
não estão sujeitos às regras estruturais. A garantia de que "código novo precisa passar por este conjunto de
restrições" vem de `unmanaged-new-file`: um arquivo de código-fonte adicionado em relação ao baseline e cujo primeiro
ingresso no repositório é posterior a `global.newFilesEnforcedSince` precisa estar dentro de um módulo managed, caso
contrário bloqueia; arquivos não rastreados são sempre considerados novos. A data de vigência evita que branches
longos sejam retroativos e evita conflitos entre branches ao gravar entradas decódigo pré-existente no baseline compartilhado. As
violações existentes entram em um baseline determinístico; novas violações bloqueiam, e o baseline só pode ser
atualizado por comando explícito e revisão de PR.

### Admissão de código pré-existente de um upstream especificado

`build:desktop:app` define `GIT_DEPTH: "0"` no nível do job, para que o Runner baixe o histórico completo antes da
verificação de arquitetura. Um clone raso trunca a cadeia de ancestrais e faz com que commits de admissão já
merged sejam julgados como não merged. Essa configuração age apenas nesse job e não altera a profundidade de clone
dos demais jobs; o verificador continua validando estritamente a relação de ancestralidade dos commits.

Ao mesclar um upstream que contém código-fonte mais novo mas que ainda não habilitou a governança de arquivos
novos, a política pode registrar no `global.acceptedUpstreamCommits` o `commit` do upstream, o SHA completo do
`previousHead` anterior à mesclagem e o motivo da admissão `reason`. Os dois commits precisam existir localmente e já
ser ancestrais do HEAD; a validação antes do commit também aceita ancestrais do `MERGE_HEAD` atual do Git, de modo
que uma mesclagem com `--no-commit` possa ser validada antes de ser commitada. Nome de branch, SHA abreviado, objeto
ausente ou commit que não pertence à mesclagem atual fazem a verificação falhar, sem buscar automaticamente nem
atualizar a política. A admissão cobre apenas os caminhos que existem no upstream e não existiam antes da mesclagem,
sem estender a isenção para modificações de arquivos já existentes.

A classificação abaixo se aplica somente a `unmanaged-new-file`: o arquivo candidato precisa já estar rastreado,
existir com o mesmo caminho no commit especificado e ter o conteúdo Git e o modo de arquivo tanto no staging area quanto no
workspace idênticos aos daquele commit, para poder ser admitido comocódigo pré-existente do upstream. Arquivos modificados,
renomeados, adicionados ou não rastreados continuam exigindo um módulo managed. Edições feitas após a resolução de
conflitos de merge também contam como modificação, e não se substitui a verificação de conteúdo por autor, mensagem
de commit, prefixo de caminho ou data.

```text
push / CI reais / escopo de mudança → candidatos de arquivo novo
  → verificar que o commit upstream fixo já foi merged
  → mesmo caminho, staging area e workspace idênticos ao upstream: isenta apenas o registro de módulo novo
  → demais candidatos: executar a regra de registro de módulo novo
escopo completo de mudança → verificações existentes de estrutura, dependências, ciclos, tipos e testes
```

A admissão não troca o baseline de comparação do push/CI, não altera a changed closure, não grava violações em
`.architecture-baseline.json` e não isenta outras regras dentro de módulos managed; a data de vigência existente não
muda. Ao mesclar novamente um upstream já registrado, os caminhos introduzidos por um commit de admissão anterior
podem casar com o conteúdo original de qualquer upstream já registrado; ainda assim, staging area, workspace e modo
precisam coincidir por completo. Edites locais posteriores, mesmo que já não sejam caminhos novos em relação ao push
base, voltam a exigir o registro do módulo. A aceitação cobre mesclagem idêntica, mesclagem repetida com atualização,
modificação após conflito, divergência entre staging area e workspace, renomeação, arquivo não rastreado,
modificação posterior, commit inválido e o fato de outras regras continuarem bloqueando.

As adaptações próprias desta mesclagem foram fechadas por responsabilidade: o menu de projetos, a pré-visualização
por arraste e a exibição da conexão de projeto ficam em `project-sidebar`; o salvamento de workflow e a vinculação
de pertencimento de projeto ficam em `project-workflow`; o assistente de conexão de dispositivos fica em
`remote-connection-flow`, mantendo um único controlador de hook e seu closure, sem dispersar o estado por número de
linhas, e preservando as regras de requestId/entry epoch e de descarte de resultados atrasados. A adaptação de
inicialização do armazenamento fica no Host Worker e em `project-storage`, a correção de fatos de subsessão fica em
`task-facts` e a resolução de configuração de subagente do CLI fica em um módulo de configuração puro independente.
Apenas os limites de implementação e as posições de import são ajustados, sem mudar o fluxo de produto, o SQL de
migração ou a semântica de attachment; os casos de uso existentes continuam validando essas entradas públicas.

## Fontes da Especificação

- O `architecture-policy.yaml` na raiz é a política de nível organizacional: caminhos de módulos, camadas, arestas
  permitidas, limiares globais e exceções.
- O `module.ts` do módulo é a declaração local de dependências: `id`, `requires`, `provides` e entradas públicas.
- O grafo de imports real é gerado a partir do código-fonte e não pode ser mantido manualmente.
- O feature graph descreve apenas capacidades de produto e superfície de impacto, sem assumir responsabilidades de
  portão de arquitetura.

O arquivo de política e as declarações de módulo devem se validar mutuamente (regra `manifest-policy-mismatch`),
proibindo módulos não cobertos pela política e dependências desconhecidas nas declarações de módulo.

As arestas de import são construídas segundo a resolução real do Node e do TypeScript: caminhos relativos, os
`imports` do `package.json` (`#src/*`), os `paths` do `tsconfig.json` (`@/*`), nomes de pacotes de workspace mais
`exports` (exports condicionais e alvos `dist/` mapeados de volta para `src/`). O review de 2026-09 identificou que a
primeira versão só resolvia caminhos relativos, de modo que nenhuma aresta era criada para dependências entre pacotes
e module-dependency / deep-import / cycle / layer-direction ficavam cegas a imports `@zcode/*`; isso foi corrigido e
há testes de regressão.

A leitura de configuração usa o parser JSONC do TypeScript, com suporte a comentários de bloco, comentários de fim de
linha e vírgulas finais, preservando globs dentro de strings. Não se pode remover comentários com regex: `@/*`,
`#src/*` e o `src/**/*.ts` seguinte, ou o argumento de script `cache-*/**`, seriam julgados como comentário, fazendo
sumir o pacote inteiro ou o mapeamento de caminho. A regressão exige que os dois aliases acionem uma violação real
de direção de camada.

## Regras

O motor de regras verifica direção das camadas, declarações de dependência de módulo, entradas públicas, dependências
cíclicas, fronteiras de implementação entre UI/Domain, arquivos obrigatórios do módulo, tamanho de arquivos e
contratos, número de métodos públicos e lint disable. O campo owner é emitido nos relatórios, e a gravação de
status precisa ser integrada à mesma interface de regras depois que o módulo de status concreto concluir a
declaração de manifest. A numeração das regras e as sugestões de correção são mantidas centralmente em
`scripts/architecture`; o AGENTS.md oferece apenas a entrada.

## Comandos e Execução

```text
pnpm architecture:check
pnpm architecture:check --changed
pnpm architecture:report
pnpm architecture:baseline:update
pnpm architecture:context <module-id>
pnpm architecture:adopt <module-id> --root <dir> [--layer domain|app|adapters|ui] [--owner <group>]
```

O baseline de comparação de `--changed` é escolhido nesta ordem: `--base <sha>` ou `ZCODE_PRE_PUSH_BASE` > variáveis
de merge request do CI (`CI_MERGE_REQUEST_DIFF_BASE_SHA` etc.) > o sha remoto do stdin do pre-push > `@{upstream}` >
merge-base com a branch padrão (a mesma ordem de `run-affected-unit-tests`, com `origin/staging` prioritário) > `HEAD`.
A segunda linha do relatório imprime o baseline efetivamente usado. O review de 2026-09 identificou que a primeira
versão usava apenas `git diff HEAD`, de modo que em um checkout limpo do CI e no pre-push o diff ficava vazio e o
portão de fato só verificava ciclos; isso foi corrigido.

`architecture:adopt` registra um diretório como módulo managed: infere `requires` a partir dos imports reais, gera o
esqueleto de cinco peças que faltar, registra no arquivo de política e preserva os comentários. A razão de existir é
tornar "registrar o módulo" mais barato do que "contornar as regras".

O checker local e o do CI são o mesmo. `--changed` resolve o grafo de dependências completo, mas bloqueia apenas
esta alteração e sua closure de impacto necessária; política global, dependências cíclicas e crescimento do baseline
sempre são verificados. O CI não pode atualizar o baseline automaticamente; `baseline:update -- --changed` substitui
apenas as entradas dentro da closure de mudança, sem descartar os registros fora dela. Os caminhos de arquivo das
violações e do baseline são caminhos posix relativos à raiz do repositório, estáveis entre máquinas. Os testes de
regressão do próprio verificador são `pnpm test:architecture`, já integrados ao `verify:pre-push` e à tarefa de lint
do CI.

### Enumeração de Arquivos pelo Git e Cache do CI

A tarefa de empacotamento macOS de 2026-09-10 falhou na fase de enumeração de arquivos: o `.electron-builder-cache`
mantido pelo Runner não era ignorado pelo Git, e a saída de `git ls-files --others --exclude-standard` excedeu o
buffer padrão do `execFile`. A correção fica a cargo da entrada existente de coleta de mudanças em
`scripts/architecture/index.mjs`, sem alterar módulos de negócio, política ou baseline.

- Na raiz, `.electron-builder-cache/`, `.electron-cache/`, `.pnpm-store/` e `.npm-cache/` são caches persistentes do
  CI e entram no `.gitignore`; os caminhos de cache do CI e as exclusões de limpeza são preservados, em vez de
  resolver o problema apagando o cache a cada execução.
- Arquivos já rastreados continuam sendo comparados com `HEAD`, e arquivos não rastreados continuam respeitando o
  Git ignore. Os dois comandos usam saída em streaming separada por NUL, evitando um limite fixo de `maxBuffer`,
  sem aparar espaços dos caminhos nem quebrar nomes de arquivo não ASCII.
- A entrada de coleta faz merge e deduplica dos nomes de arquivo; quando um processo Git falha, a verificação é
  recusada, e falha ou saída parcial não é tratada como “nenhuma mudança” aprovada. Não são adicionados cache,
  versão ou processo em background, nem alterada a semântica de baseline de comparação do CI.

```text
Git diff / 未跟踪文件枚举
  -> 流式解析 NUL 分隔路径
  -> 两个进程均成功后合并去重
  -> 既有架构检查
任一 Git 失败 -> 检查失败
```

A validação usa um repositório Git temporário cobrindo mudanças não rastreadas e rastreadas acima de 1 MiB, ignore de
cache, caminhos especiais e propagação de falha do Git. Afeta apenas as verificações de desenvolvimento/CI, sem
envolver a UI de produto, o runtime ou migrações de dados persistidos.

## Fluxo de Trabalho do Agent

O skill [architecture-governance](../../.agents/skills/architecture-governance/SKILL.md) se aplica a alterações de
código e é pulado em tarefas puramente de documentação. Antes de modificar o código, identifique os módulos
esperados e verifique o baseline atual; depois da modificação, verifique novamente. Em casos de mudança de
ownership entre módulos, de ownership de estado ou de contrato ambíguo, gere o pacote de leitura
`architecture:context`; em alterações locais com contrato claro, leia apenas os contratos, specs e testes
relevantes. Spec, escopo de verificação e condições de conclusão seguem uniformemente o
[AGENTS.md da raiz](../../AGENTS.md), sem redefinição neste arquivo.

O pacote de leitura é gerado a partir do código e da política, e contém o `module.ts`, o `contract.ts`, exemplos,
testes de contrato, um CONTRACT.md curto, contratos de dependências diretas, owner, arestas permitidas e os testes
afetados do módulo alvo, sem copiar a implementação completa.

## Ordem de Avanço

Primeiro estabelecer a política, o grafo de dependências, o baseline e o padrão de relatório; depois ativar as
regras estruturais de alta confiança; em seguida validar contract, manifest de módulo e pacote de leitura com
Project/Session como exemplo completo; por fim expandir para workspace identity, identity, model, automation,
plugins/MCP e outros domínios. Não é permitido duplicar um conjunto de portões para um único domínio.

## Boundaries Explícitas

Não introduzir IoC/Event Center genérico não validado, não manter um segundo grafo de dependências OWNERS manual,
não deixar o feature graph substituir a política e não fazer migração do repositório inteiro de uma só vez. O volume
de código por camada não precisa ser equilibrado, e a aceitação foca em se os pontos de decisão, as boundaries,
as corridas e o escopo de leitura convergiram.

## Boundary de Integração do Todo103

O diretório de módulos da política precisa conter `packages/provider/src` e `packages/provider-node/src`, extraídos
na refatoração atual, para que o checker descubra o código-fonte e gere os pacotes de leitura correspondentes.
Mantém-se o mesmo registro unmanaged dos demais módulos existentes desta rodada, sem ampliar a fusão para uma
migração de contract/manifest em todo o repositório e sem atualizar o baseline automaticamente. As zero violações
sob o `managedOnly: true` atual indicam apenas que as regras ativadas não acusaram erros; isso não prova que todas
as dependências cross-domain existentes passaram na verificação mecânica, e a interseção Provider/Selection ainda
passa por revisão manual bidirecional.

O lint independente do CLI trata ocódigo pré-existente de `max-lines` dos arquivos originais de um upstream especificado da mesma forma: depois
de rodar os argumentos oxlint originais de cada pacote, apenas aceita o diagnóstico cuja Caminho, conteúdo e modo
batem com o staging area e o workspace tanto no commit fixo quanto no estado atual. As demais regras de lint continuam
bloqueando; arquivos modificados neste branch, arquivos novos e commits upstream ausentes ou não merged não têm a
admissão. A lista de admissão é gerada do Git a cada execução, sem baseline de contagem de linhas por arquivo e sem
escrever disable no código-fonte.

A entrada `lint` do CLI enumera os comandos oxlint declarados em packages/tools, preservando o cwd, os argumentos e
a configuração de cada pacote. Comandos que não são oxlint ou saídas não interpretáveis falham explicitamente, sem
deixar passar silenciosamente um pacote novo. O resultado reporta ao mesmo tempo os diagnósticos de contagem de
linhas aceitos e os erros que continuam bloqueando.

O armazenamento de sessão do CLI, as migrações, o gateway e a montagem de inicialização, quando longos demais, mantêm
a implementação original e não são quebrados em fragmentos que compartilhem todo o estado interno. O contexto de
modelo e o lease de residência, independentes de protocolo, vão para a entrada pública de session-execution,
eliminando a dependência inversa do V4 sobre o diretório do protocolo antigo; o runtime e o registro continuam sendo
os owners do estado.

### Regra de contagem de linhas (decisão de 2026-10-10)

O limite padrão de código-fonte comum passa de 400 para 800 linhas. Registro de módulo, direção de dependências,
entradas públicas, dependências cíclicas e verificação de contratos permanecem estritos; não se pode quebrar um
arquivo em fragmentos que compartilhem todo o estado interno para atender à métrica de linhas.

Os arquivos do CLI desta integração que já existiam e ultrapassavam 800 linhas, e o hook de conexão remota movido
para um módulo, são registrados no `.oxlintrc.json` da raiz por caminho exato como warning de contagem de linhas,
mantendo o diagnóstico e permitindo o commit. Os demais arquivos acima de 800 linhas ainda dão erro, e as outras
regras de lint não são rebaixadas. Ocódigo pré-existente de contagem de linhas dos arquivos originais de um upstream especificado continua
aceito pela verificação de conteúdo do commit fixo, sem aceitar isenção em nível de diretório.

O disable de contagem de linhas original do hook de conexão remota passa a ser um warning de caminho exato; o
portão de arquitetura registra apenas a exceção de contagem de linhas desse arquivo, e a dependência de módulo e as
demais regras continuam sendo executadas.