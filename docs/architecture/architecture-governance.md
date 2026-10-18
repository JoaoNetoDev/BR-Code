# Portão de Arquitetura Compartilhado e AI Governance

## Objetivo

As regras de arquitetura são uma capacidade comum a todo o repositório e não pertencem a nenhuma refatoração
de negócio específica. Todas as alterações de código passam pela mesma cadeia:

```text
代码变更 → 策略解析 → 依赖图与变更闭包 → 规则检查与 ratchet → 阅读包与报告
```

A primeira versão cobre `packages`, `apps`, desktop, web, server e CLI. As violações existentes entram em um
baseline determinístico; novas violações bloqueiam, e o baseline só pode ser atualizado por comando explícito e
revisão de PR.

## Fontes da Especificação

- O `architecture-policy.yaml` na raiz é a política de nível organizacional: caminhos de módulos, camadas, arestas
  permitidas, limiares globais e exceções.
- O `module.ts` do módulo é a declaração local de dependências: `id`, `requires`, `provides` e entradas públicas.
- O grafo de imports real é gerado a partir do código-fonte e não pode ser mantido manualmente.
- O feature graph descreve apenas capacidades de produto e superfície de impacto, sem assumir responsabilidades de
  portão de arquitetura.

O arquivo de política e as declarações de módulo devem se validar mutuamente, proibindo módulos não cobertos
pela política e dependências desconhecidas nas declarações de módulo.

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
```

O checker local e o do CI são o mesmo. `--changed` resolve o grafo de dependências completo, mas bloqueia apenas
esta alteração e sua closure de impacto necessária; política global, dependências cíclicas e crescimento do baseline
sempre são verificados. O CI não pode atualizar o baseline automaticamente.

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