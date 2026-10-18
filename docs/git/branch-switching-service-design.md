# Design de capacidade subjacente de troca e criação de branches do Git

Data de atualização: 2026-04-15

## Posicionamento do documento

Este é um design incremental para a arquitetura Git existente e para as capacidades de serviços subjacentes, com foco em:

- leitura da lista de branches locais
- troca de branch
- criação de branch e troca
- retorno de causa de bloqueio estruturada em caso de falha na troca

Este documento discute apenas o design da capacidade subjacente do Git, sem detalhar interação de UI, estilo de pop-up ou detalhes de formulário.

## Estado atual de implementação

Até 2026-04-15, a capacidade subjacente já foi implementada conforme a solução deste documento nos seguintes locais:

- `packages/shared/src/git.ts`
  - novos DTOs compartilhados para lista de branches locais e troca/criação de branch
- `packages/services/src/git/git.ts`
  - `IGitService` expõe `getLocalBranches`, `switchBranch`, `createBranchAndSwitch`
- `packages/services/src/git/repo/gitCliRepo.ts`
  - nova leitura de branches locais com `git for-each-ref`
  - nova troca com `git switch --no-guess` e criação com troca via `git switch -c`
  - novas verificações de conflito / operação em andamento antes da troca, e mapeamento estruturado dos resultados de falha
- `packages/services/test/gitService.test.ts`
  - testes de integração com repositório Git real, cobrindo caminho de sucesso, no-op, troca permitida com working tree sujo, bloqueio por sobrescrita, conflito, operação em andamento, nome de branch inválido, branch já existente e occupation por worktree

## Contexto

O projeto atual já possui uma camada de serviço Git estável:

- `packages/shared/src/git.ts` define os DTOs de Git
- `packages/services/src/git/git.ts` define o `IGitService`
- `packages/services/src/git/gitService.ts` é responsável pela agregação de semântica de alto nível
- `packages/services/src/git/repo/gitCliRepo.ts` é responsável pelo encapsulamento fino da CLI do Git

As capacidades existentes já cobrem:

- resolução de repositório
- status / diff / comparação de branches
- stage / unstage / discard / commit
- identity / refresh

Portanto, este requisito não deve introduzir um novo canal de camada de plataforma, nem contornar a cadeia existente `GitService -> GitCliRepo -> Git CLI`.

## Objetivos

- Fornecer à UI uma fonte de dados estável de "branches locais já obtidas no projeto atual"
- Oferecer capacidade real de troca de branch
- Oferecer a capacidade de "criar branch e trocar"
- Em caso de falha na troca, retornar uma causa de bloqueio estruturada que possa orientar a UI
- Manter a abstração unificada entre local / remote / web
- Preservar o comportamento nativo do Git, sem restringir artificialmente a "não é permitido trocar se houver alterações não commitadas"

## Não objetivos

- Não fazer stash, troca forçada, nem descartar alterações e depois trocar
- Não fazer navegação e pull de branches remotas
- Não fazer renomeação / exclusão de branch
- Não fazer fluxos de trabalho complexos do Git como rebase, merge, cherry-pick, submodule
- Não prometer o painel de commit da UI diretamente neste design

## Decisões centrais

### 1. Seguir o modelo de bloqueio nativo do Git

Não adotamos a regra de produto "proibir a troca sempre que existirem alterações não commitadas".

Motivos:

- O Git nativo permite trocar quando "existem alterações não commitadas, mas elas não serão sobrescritas pela branch de destino"
- Se a camada de produto aplicar uma regra única, ela será mais conservadora do que o Git e ficará inconsistente com a expectativa do usuário
- O que a UI precisa sinalizar são os "bloqueios reais", e não "o repositório não está limpo o suficiente"

Portanto, a lógica de troca se baseia no resultado real do `git switch`.

### 2. Não fornecer uma interface booleana `canSwitch` isolada

Não recomendamos adicionar interfaces como `canSwitchToBranch(): boolean`.

Motivos:

- O Git não possui um comando de troca em dry-run estável, completo e de baixo custo
- Prever apenas com base em `status` facilmente diverge do resultado real do `git switch`
- Bloqueios como sobrescrita de arquivos `tracked`, sobrescrita de arquivos `untracked` e operações em andamento devem ter como fonte autoritativa o resultado real do comando de troca

Portanto, recomendamos que `switchBranch` / `createBranchAndSwitch` retornem diretamente um resultado estruturado:

- sucesso: retorna o novo `summary`
- falha: retorna `issues`

Se a UI precisar de um aviso leve antes do clique, pode continuar reaproveitando as capacidades existentes `summary`, `getChanges` e `getIdentity`, mas não deve tratá-las como julgamento final de admissão.

### 3. A capacidade de branches continua dentro do domínio de serviço Git existente

A nova capacidade continua localizada em:

`Types -> Config -> Repo -> Service -> Runtime -> UI`

Não adiciona capacidade a `IPlatformService`, nem cria um canal separado.

## Escopo das capacidades

### 1. Lista de branches locais

Usada para apoiar a UI na exibição das "branches locais já existentes no repositório atual".

Restrições:

- lista apenas `refs/heads/*`
- não lista remote-tracking branches
- branch é um conceito de nível de repositório, não é recortada por subdiretório de workspace
- se estiver em detached HEAD, `currentBranchName` fica vazio, mas a lista de branches locais ainda é retornada

### 2. Trocar de branch

Recebe como entrada o nome da branch local de destino e tenta trocar.

Comportamento:

- em caso de sucesso, retorna o resumo mais recente do repositório
- se trocar para a branch atual, é considerado sucesso no-op
- se o Git nativo bloquear a troca, retorna a causa de bloqueio estruturada

### 3. Criar branch e trocar

Por padrão, cria a nova branch a partir do `HEAD` atual e troca.

A primeira versão só garante:

- o usuário informa o nome da branch
- é possível passar opcionalmente `startPoint`
- não infere automaticamente branch remota
- não define automaticamente estratégias de tracking complexas

## Design das interfaces

Recomendamos adicionar 3 métodos ao `IGitService`:

```ts
getLocalBranches(params: GitRepositoryRequest): Promise<GitLocalBranchListResult>;
switchBranch(params: GitSwitchBranchRequest): Promise<GitBranchMutationResult>;
createBranchAndSwitch(params: GitCreateBranchRequest): Promise<GitBranchMutationResult>;
```

Recomendamos adicionar os seguintes tipos de requisição:

```ts
export interface GitSwitchBranchRequest extends GitRepositoryRequest {
  targetBranchName: string;
}

export interface GitCreateBranchRequest extends GitRepositoryRequest {
  branchName: string;
  startPoint?: string;
}
```

## Design dos DTOs compartilhados

Recomendamos adicionar os seguintes tipos em `packages/shared/src/git.ts`.

### Lista de branches

```ts
export interface GitLocalBranch {
  name: string;
  isCurrent: boolean;
  upstreamName: string | null;
  commitHash: string | null;
  commitTimestampMs: number | null;
}

export interface GitLocalBranchListResult {
  headRefType: GitHeadRefType;
  currentBranchName: string | null;
  branches: GitLocalBranch[];
}
```

Recomendação de ordenação:

- branch atual primeiro
- as demais em ordem decrescente de data do commit mais recente
- em caso de empate de tempo, por nome em ordem crescente

### Resultado de troca/criação

```ts
export type GitBranchMutationAction = "switch" | "create-and-switch";

export type GitBranchMutationIssueCode =
  | "invalid-branch-name"
  | "branch-already-exists"
  | "target-branch-not-found"
  | "tracked-changes-would-be-overwritten"
  | "untracked-changes-would-be-overwritten"
  | "conflicts-present"
  | "operation-in-progress"
  | "branch-in-other-worktree"
  | "unknown";

export interface GitBranchMutationIssue {
  code: GitBranchMutationIssueCode;
  message: string;
  paths?: string[];
  detail?: string | null;
}

export interface GitBranchMutationResult {
  ok: boolean;
  action: GitBranchMutationAction;
  branchName: string | null;
  didChange: boolean;
  created: boolean;
  summary: GitRepositorySummary;
  issues: GitBranchMutationIssue[];
}
```

Explicação da semântica:

- `ok=true` e `didChange=true`: a troca foi realmente concluída
- `ok=true` e `didChange=false`: sucesso no-op, por exemplo trocar para a branch atual
- `ok=false`: bloqueado por regras nativas do Git, ou entrada inválida

## Design da camada Repo

Recomendamos adicionar as seguintes capacidades ao `GitCliRepo`:

```ts
listLocalBranches(workspacePath: string): Promise<GitLocalBranchListResult>;
switchBranch(workspacePath: string, targetBranchName: string): Promise<GitBranchMutationResult>;
createBranchAndSwitch(
  workspacePath: string,
  branchName: string,
  startPoint?: string,
): Promise<GitBranchMutationResult>;
```

### 1. listLocalBranches

Comandos recomendados:

```bash
git for-each-ref refs/heads \
  --format=%(refname:short)%00%(upstream:short)%00%(objectname)%00%(committerdate:unix)
```

Pontos de design:

- usa um formato estável, evitando fazer parsing de saída legível por humanos
- o `cwd` continua sendo executado com `repoRoot`
- em caso de detached HEAD, pode não haver nenhum `isCurrent=true` em `branches`

### 2. switchBranch

Comandos recomendados:

```bash
git switch --no-guess -- <branchName>
```

Na implementação real, para evitar que o `--` prejudique a estrutura do comando, recomendamos usar:

```bash
git switch --no-guess <branchName>
```

Pontos de design:

- `--no-guess` evita que o Git adivinhe automaticamente via remote-tracking branch e crie uma branch local
- faz primeiro uma verificação mínima de pré-condição: repositório existe, nome da branch de destino não é vazio
- o julgamento real de bloqueio se baseia no stderr e no exit code do `git switch`

### 3. createBranchAndSwitch

Recomendamos validar primeiro o nome da branch:

```bash
git check-ref-format --branch <branchName>
```

Depois executar:

```bash
git switch --no-guess -c <branchName> [startPoint]
```

Pontos de design:

- cria por padrão a partir do `HEAD` atual
- `startPoint` é mantido como ponto de extensão subjacente; a UI da primeira versão pode não expô-lo
- se a branch já existir, retorna diretamente um erro estruturado, sem criação por sobrescrita

## Modelo de bloqueio

### 1. Bloqueios que devem ser repassados diretamente e estruturados

#### Arquivos tracked serão sobrescritos

Mensagem comum do Git:

- `Your local changes to the following files would be overwritten by checkout`

Mapeado para:

- `tracked-changes-would-be-overwritten`

#### Arquivos untracked serão sobrescritos

Mensagem comum do Git:

- `The following untracked working tree files would be overwritten by checkout`

Mapeado para:

- `untracked-changes-would-be-overwritten`

#### Existem conflitos no momento

Pode ser detectado rapidamente pelo `isConflicted` existente no `status`, e também pode ser analisado no stderr em caso de falha.

Mapeado para:

- `conflicts-present`

#### O repositório tem uma operação em andamento

Por exemplo merge, rebase, cherry-pick, revert, bisect.

Recomendamos que a camada repo adicione uma verificação leve:

- `MERGE_HEAD`
- `CHERRY_PICK_HEAD`
- `REVERT_HEAD`
- `REBASE_HEAD`
- `rebase-merge/`
- `rebase-apply/`
- `BISECT_LOG`

Mapeado para:

- `operation-in-progress`

A razão é que esses estados nem sempre são reportados pelo `git switch` com semântica de erro estável o suficiente; identificá-los antes facilita a explicação pela UI.

#### A branch está em uso em outro worktree

Nas mensagens comuns do Git aparece:

- `is already checked out at`

Mapeado para:

- `branch-in-other-worktree`

### 2. Situações que não devem ser tratadas como bloqueio

- repositório sujo, mas essas alterações não serão sobrescritas pela branch de destino
- existem arquivos untracked em caminhos não relacionados, e a branch de destino não ocupará esses caminhos
- trocar para a branch atual

Todas essas situações devem seguir, na medida do possível, o comportamento nativo do Git.

## Design da camada Service

O `GitService` continua assumindo a responsabilidade de "fechar a semântica de alto nível".

Comportamento recomendado:

- `getLocalBranches` retorna diretamente o resultado da camada repo
- `switchBranch` / `createBranchAndSwitch` relêm `getStatus` após o sucesso na camada repo
- aplica um mapeamento unificado sobre os resultados de falha brutos retornados pelo repo, garantindo que a UI sempre receba um DTO estável

Recomendamos uma consolidação adicional na camada service:

- se o `workspacePath` atual for um subdiretório de monorepo, as operações de branch continuam agindo sobre o `repoRoot` inteiro
- o `summary.workspacePath` retornado preserva a perspectiva do workspace atual, mantendo a UI consistente com as demais capacidades de Git

## Cache e refresh

Atualmente o `GitCliRepo` internamente reaproveita as operações em andamento:

- `resolveRepository(workspacePath)`
- `getStatus(workspacePath)`

A troca e a criação de branch são operações reais de escrita, que podem alterar:

- `branchName`
- `trackingBranchName`
- `ahead/behind`
- `isDirty`
- a linha de base de diff / comparação de branches

Todas as opções acima mudam.

Portanto, recomendamos adicionar um método de invalidação de cache no nível do repo, por exemplo:

```ts
invalidate(workspacePath: string): void;
```

e chamá-lo após as seguintes operações:

- `stage`
- `unstage`
- `discard`
- `commit`
- `switchBranch`
- `createBranchAndSwitch`

Isso evita reaproveitar snapshots antigos de antes da troca durante o refresh.

## Fluxo de chamada recomendado

### 1. Abrir o dropdown de branches

1. A UI chama `getLocalBranches`
2. Exibe a lista de branches locais
3. Destaca a branch atual conforme `isCurrent`

### 2. O usuário clica para trocar para alguma branch

1. A UI chama `switchBranch`
2. Se `ok=true`
   - atualiza o estado do repositório com o `summary` retornado
   - dispara o refresh dos dados relacionados
3. Se `ok=false`
   - decide o texto do aviso com base em `issues`
   - se a causa do bloqueio estiver relacionada a alterações não commitadas, pode orientar o usuário a entrar no fluxo de commit

### 3. O usuário informa um novo nome de branch e confirma

1. A UI chama `createBranchAndSwitch`
2. Em caso de sucesso, atualiza o estado do repositório
3. Em caso de falha, exibe o erro estruturado

## Relação com a capacidade de commit

Este design não precisa de uma nova capacidade subjacente de `commit`.

Motivos:

- o serviço atual já possui `stagePaths`
- o serviço atual já possui `commit`
- o serviço atual já possui `getIdentity`
- o serviço atual já possui `getChanges`

Isso significa que, se a UI quiser posteriormente implementar "ao detectar um bloqueio, orientar o usuário a fazer commit antes de trocar", a capacidade subjacente já é suficiente.

A abordagem recomendada é:

- primeiro completar "troca falha -> retornar issues estruturadas"
- deixar a UI decidir se exibe a orientação para commit

em vez de introduzir diretamente neste design uma ação combinada como `commitAndSwitch`.

## Sugestões de teste

Recomendamos adicionar cobertura em `packages/services/test/gitService.test.ts`:

- consegue listar branches locais, com a marcação da branch atual correta
- troca de branch em repositório clean tem sucesso
- trocar para a branch atual retorna sucesso no-op
- repositório dirty, mas com alterações sem conflito com a branch de destino, permite a troca
- a troca falha quando arquivos tracked seriam sobrescritos pela branch de destino
- a troca falha quando arquivos untracked seriam sobrescritos pela branch de destino
- retorna bloqueio estruturado quando o repositório está em conflito
- retorna bloqueio estruturado quando o repositório tem estado em andamento como merge/rebase
- criar branch e trocar tem sucesso
- nome de branch inválido na criação
- criação de branch que já existe falha
- chamadas em subdiretório de monorepo continuam agindo corretamente sobre o `repoRoot`

## Pontos de extensão futuros

Se o produto continuar se expandindo, este design permite evolução natural:

- suportar lista de branches remotas e "criar branch local a partir de uma branch remota"
- suportar renomeação / exclusão de branch
- suportar fluxo opcional de stash antes da troca
- suportar metadados de branch mais detalhados, como ahead/behind e resumo do último commit

Nenhuma dessas capacidades deve afetar os limites centrais deste design:

- operações de branch continuam pertencendo ao domínio de serviço Git
- o julgamento de bloqueio continua, na medida do possível, baseado no resultado dos comandos nativos do Git
- a UI é responsável pela orientação, e o service por fornecer resultados de capacidade reais e estáveis

## Complemento de implementação na UI (2026-04-15)

Com base na capacidade subjacente deste documento, o lado da UI acrescentou as seguintes convenções de interação:

- a entrada da funcionalidade fica abaixo da caixa de entrada de chat, usando um disparador independente em forma de branch pill, sem misturar na mesma linha com a seleção de modelo / modo
- o disparador exibe por padrão a branch atual; em caso de `detached HEAD`, exibe o texto de estado detached
- após expandir, usa uma lista de branches locais com busca:
  - branch atual destacada
  - quando a branch atual tem alterações não commitadas, exibe "Alterações não commitadas: N arquivos"
  - no rodapé, fornece a entrada "Criar e fazer checkout de uma nova branch..."
- ao clicar em uma branch existente, chama `switchBranch` diretamente
- ao clicar na entrada de criação, abre um formulário leve e, no envio, chama `createBranchAndSwitch`
- se a falha de troca for do tipo `tracked/untracked changes would be overwritten`
  - não exibe mais um toast direto
  - passa a exibir um cartão de bloqueio, listando os arquivos que seriam sobrescritos e as estatísticas de +/-
  - o usuário pode continuar para o pop-up "Commitar e trocar de branch"
- o pop-up "Commitar e trocar de branch" é simplificado na primeira versão:
  - por padrão, commita todas as alterações não commitadas do workspace atual
  - não oferece a opção "incluir alterações des staged" (desestagiadas)
  - não oferece opções de push / PR / draft
  - após o sucesso do commit, retenta `switchBranch` automaticamente
- após sucesso na troca / criação, a UI atualiza simultaneamente:
  - o texto da entrada de branch atual
  - o resumo de Git no header
  - os dados do painel lateral de Git
- em caso de falha na troca, prioriza mapear as mensagens legíveis para o usuário a partir das `issues` estruturadas, sem expor diretamente os erros brutos do Git

Dessa forma a fronteira de responsabilidade permanece clara:

- o service continua responsável apenas por retornar resultados reais do Git
- a UI é responsável pelo layout da entrada, pelo texto dos avisos e pela orquestração da cadeia de refresh