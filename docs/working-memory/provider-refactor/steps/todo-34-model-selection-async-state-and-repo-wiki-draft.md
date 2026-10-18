# Todo 34：Estado assíncrono da seleção de modelo e consolidação do rascunho do Repo Wiki

> Verificação de atribuição atualizada (2026-09-09): a carga remanescente de subtestes/falhas/promoção manual deste documento foi transferida uniformemente para [Todo102](todo-102-verification-debt-closeout.md), encerrando o agendamento de verificação independente neste documento; as evidências históricas são preservadas, e a transferência não significa que os testes passaram.

> As lacunas de teste E2E gráfico do Desktop posteriores são consolidadas uniformemente pelo Todo 78; este Todo não mantém mais agendamento próprio.

> Status: implementado; a automação central foi reverificada, o WDIO Desktop do Repo Wiki ainda aguarda execução real em um ambiente macOS com o commit atual
>
> Data: 2026-08-28
>
> Origem: falha real do Repo Wiki no pacote oficial e revisão de limites do Model Selection Renderer
>
> Tarefas relacionadas: [`Todo 13`](./todo-13-target-host-model-selection-authority.md)、
> [`Todo 23`](./todo-23-provider-refactor-decision-gap-closure.md)、
> [`Todo 32`](./todo-32-team-plan-settings-effective-provider-boundary.md)

## 1. Evidência de execução e falha direta

Após abrir o Repo Wiki no pacote oficial do MacBook Pro, o Section Error Boundary exibiu:

```text
模型选择缺少 Provider:
```

Os logs do pacote oficial no mesmo período provam que o Host de destino não está sem modelos:

- `model-selection.getView` concluiu normalmente;
- o Registry já havia publicado `account:bigmodel-team-coding-plan / GLM-5.3-Flash`;
- o Provider Runtime já havia reportado o modelo correspondente como pronto.

A sequência real é:

```text
Repo Wiki 首次渲染
        |
        v
useModelSelectionView 初始返回 null
        |
        v
null 被投影成空 groups，默认模型再变成 ""
        |
        v
resolveRepoWikiThoughtLevelOption 解析 ""
        |
        v
parseModelPickerValue 抛错
        |
        v
Error Boundary 卸载 Repo Wiki
        |
        `-- getView 随后成功，也无法更新已经卸载的页面
```

Clicar repetidamente em Section Retry ainda pode repetir a mesma sequência de primeira renderização. Portanto, não se trata de Registry, Account Team Plan ou configuração oficial sem modelos,
e sim do Renderer alimentando um limite estrito de parsing que só aceita uma Selection completa com um pré-estado assíncrono normal.

## 2. Problema de design de maior escopo

### 2.1 `null` apaga o ciclo de vida assíncrono

Atualmente `useModelSelectionServiceView()` / `useModelSelectionView()` retornam
`ModelSelectionView | null`, onde `null` expressa simultaneamente:

- primeira leitura em andamento;
- o Remote Workspace de destino ainda não está conectado;
- o Service está ausente ou a leitura está desabilitada;
- `getView()` já falhou, mas apenas registrou log.

Esses estados têm semânticas distintas de UI, retry e submissão e não podem continuar compartilhando um único valor nulo. Ao alternar o Host de destino, o estado retornado também precisa estar vinculado ao Service/
workspace target corrente, evitando que a View do Host antigo seja consumida brevemente pelo novo destino antes da limpeza do Effect; o generation guard atual apenas impede que Promises atrasados sobrescrevam,
e não faz o tipo de retorno provar o owner da View corrente.

Além disso, atualmente `useModelSelectionView(null)` não expressa «faltando destino», mas resolve pelo destino local e faz fallback para Base/Current Host. Portanto,
o ponto de entrada de Workspace não pode continuar usando um conjunto de escalares nullable que implica «o destino existe ou não»; o chamador deve primeiro formar um Workspace Target explícito e, sem destino, entrar
diretamente em unavailable, sem chamar Workspace Service Resolution.

### 2.2 `null -> [] -> ""` fabricando sucessivamente falsos fatos de negócio

`buildRegistryModelSelectGroups()` hoje aceita uma View nullable e projeta o estado não carregado como array vazio. O Repo Wiki então projeta candidatos vazios em um
`modelValue` vazio. Assim, os dois fatos abaixo ficam indistinguíveis:

```text
ModelSelectionView 尚未取得
!=
ModelSelectionView 已取得且 providers 确实为空
```

O estado de carregamento também escapa assim da verificação do TypeScript e, por fim, entra no parser estrito durante a renderização.

### 2.3 O Repo Wiki Store salva a codificação do controle, não a Selection de domínio

O rascunho de geração do Repo Wiki hoje salva:

```ts
modelValue: string;
modelTouched: boolean;
thoughtLevel?: string;
thoughtLevelTouched: boolean;
```

A string `provider/model` é apenas a codificação do controle `ModelConfigSelect` e não deve se tornar o fato de modelo do Repo Wiki Draft. Por isso, o código faz parse repetidamente na exibição,
na projeção de reasoning e na Submission, e permite que `""` entre no estado do produto. O Provider Refactor existente já definiu que todas as tarefas de modelo independentes referenciam
`ModelSelection`; o Repo Wiki deve salvar diretamente uma Selection explícita e esparsa, formatando strings apenas na fronteira do controle Select.

### 2.4 O Renderer reimplementa o Fallback de Host

A mesma `ModelSelectionView` do Host de destino já contém atomicamente os candidatos e o `preferredSelection`:

```text
Configured Default 仍可选择
        |
        +-- 是 --> preferredSelection = Configured Default
        `-- 否 --> 第一个可见且拥有模型的 Registry 候选
```

O Configured Default deve pertencer à View corrente, o Provider não pode estar hidden, o Modelo deve existir e as options explícitas devem ser válidas. O Fallback existe apenas
como resultado da inicialização desta entrada e não é gravado de volta no Configured Default persistido.

O Repo Wiki ainda hoje escolhe `modelGroups[0].items[0]` por conta própria quando não há valor correspondente, formando um segundo conjunto de Fallback Policy. O Renderer não deve duplicar
o algoritmo do Host; em especial, quando a escolha explícita do usuário se torna inválida, não se pode trocar silenciosamente para outro Provider/Model.

### 2.5 A admissão de Generate não depende do estado do modelo

Atualmente `generateDisabled` só considera o projeto, as configurações compartilhadas e o estado de execução da tarefa, sem cobrir Model Selection loading, remote waiting,
falha de leitura, ready-empty ou invalidação da escolha explícita. Só depois do clique o handler sai silenciosamente, o que não constitui uma admissão completa de interação.

### 2.6 Riscos equivalentes em chamadores vizinhos

| Chamador               | Comportamento atual ou risco                                                          |
| ---------------------- | ------------------------------------------------------------------------------------ |
| Repo Wiki              | valor inicial vazio entra no parser estrito e a página quebra diretamente            |
| Subagent Settings      | falha de leitura e unavailable podem se passar permanentemente por loading          |
| Automation Settings    | durante o carregamento degrada para menu vazio; sem target explícito faz fallback para Base/Current Host |
| Composer               | durante o carregamento os candidatos ficam vazios; não quebra, mas não expressa a causa real |
| Entrada de login Root  | usa `view !== null` extra para aguardar a hidratação; em falha de leitura não consegue concluir a verificação de startup |
| Provider Settings      | tanto os dois Hooks de Snapshot/Service mantêm a primeira falha de leitura permanentemente como loading |

No código vizinho também existem antigas fronteiras que reenviam strings de modelo persistidas ao parser estrito. Elas precisam ser confirmadas item a item durante a migração dos chamadores, mas a falha desta vez não deve ser generalizada
para «todos os dados nullable precisam virar máquina de estados»: exibição somente-leitura pode tolerar metadados de modelo adicionais ausentes; o que realmente exige estado de ciclo de vida explícito é o owner da leitura de candidatos,
a admissão de interação e a fronteira de Submission.

## 3. Princípios já decididos

1. Registry, `IModelSelectionService` e o `parseModelPickerValue()` estrito não são a causa raiz desta falha; não se pode afrouxar o parser para aceitar string vazia,
   nem construir Placeholder Provider/Model para o estado de carregamento.
2. O RPC `getView()` pode continuar retornando a View completa de forma assíncrona; carregamento, indisponibilidade, erro e retry pertencem ao Service Adapter do Renderer.
3. `ModelSelectionView.providers` vazio expressa apenas «lido e sem candidatos», nunca mais loading.
4. Candidatos de Model Selection, `preferredSelection` e revision devem vir da mesma View do Host de destino; Remote desconectado não pode fazer fallback para
   Local/Base Host.
5. `preferredSelection` participa apenas da resolução da Effective Selection de novos Drafts de produto sem intenção explícita; ele não é gravado no
   `modelSelection` explícito do Draft, nem é a Selection da Session atual, o Active Model, o modelo usado recentemente ou um modelo recomendado obrigatório.
6. O Renderer não duplica Configured Default, ordenação do Registry ou Fallback Policy.
7. O Draft de produto salva `ModelSelection`; a string codificada do Select só existe na fronteira do controle; a Submission fixa diretamente a `ModelSelection` completa.
8. Quando a Selection explícita do usuário se torna inválida, preserva-se a intenção original, exibe-se como indisponível e proíbe-se a submissão; nunca trocar silenciosamente pelo primeiro item do menu. Somente sem intenção explícita é que se herda
   `preferredSelection`.
9. O Error Boundary só absorve erros de renderização inesperados; loading, unavailable, ready-empty e falha de leitura devem se tornar estados comuns da página.
10. Sessions/Active Models já criados continuam congelados; este Todo altera apenas a leitura de candidatos, a inicialização do Draft e a admissão antes da submissão, não o modelo em execução.
11. Falha na primeira leitura entra em error; falha de refresh em segundo plano após já ter obtido uma Ready View mantém a última View bem-sucedida e registra warning. Os eventos de Service atuais
    publicam apenas Views bem-sucedidas; nesta rodada não se expande o protocolo RPC/Event para exibir erros de refresh em segundo plano.

## 4. Cadeia de estado alvo

### 4.1 Estado de Service no Renderer

O Hook do ciclo de vida da seleção de modelo retorna uma união discriminada, em vez de uma View nullable. A nomenclatura concreta pode ser unificada na implementação, mas a semântica é fixa:

```ts
type ModelSelectionState =
  | { status: "loading" }
  | { status: "ready"; view: ModelSelectionView }
  | {
      status: "unavailable";
      reason: "remote-waiting" | "missing-target";
    }
  | { status: "error"; error: Error };

interface ModelSelectionRead {
  state: ModelSelectionState;
  reload(): void;
}
```

```text
明确 Host Service ----------------> Service State Hook

明确 Workspace Target
        |
        +-- 不存在 ----------------> unavailable/missing-target
        |
        `-- 存在
              |
              v
     Workspace Service Resolution
              |
              +-- remote-waiting --> unavailable/remote-waiting
              `-- Host Service ----> Service State Hook
                                           |
                                           v
                                  loading/error/ready(view)
```

A implementação mantém duas entradas explícitas: componentes já dentro do `ServiceProvider` de destino leem o Host Service diretamente; produtos que precisam ler entre Workspaces passam primeiro um
Workspace Target explícito e só então fazem a Workspace Service Resolution. O Hook trata internamente assinatura antes da primeira leitura, leitura inicial, target key, revision monotônica, descarte de
resultados atrasados, primeiro erro e reload; esse tipo de ciclo de vida do Renderer não entra em Provider Config, Registry nem Protocol DTO.

Após Service/Target mudar, se o Hook detecting no mesmo render que a owner key do estado interno não corresponde, ele deve projetar loading imediatamente, em vez de esperar o
`useEffect` para limpar a View antiga. Falha de refresh em segundo plano continua mantendo a Last Known Good Ready View.

### 4.2 Projeção apenas-Ready

`buildRegistryModelSelectGroups()` passa a aceitar somente `ModelSelectionView`. Os chamadores de menu de candidatos, admissão e Submission devem fazer branch sobre
`ModelSelectionState.status` antes; não é permitido que o helper de projeção de candidatos colapse sozinho estados não-ready em `[]`. Componentes de folha somente-leitura, se apenas
faltarem Label/Metadata opcionais, podem receber a View Ready opcional já extraída pelas camadas superiores, sem precisar propagar a máquina de estados completa.

### 4.3 Repo Wiki Draft

A parte de modelo das configurações de geração do Repo Wiki passa a ser um objeto de domínio:

```ts
modelSelection?: ModelSelection;
```

- `undefined`: não há override explícito de modelo do Repo Wiki;
- com valor: o Provider, Model e options que o usuário escolheu explicitamente para este Wiki;
- na primeira exibição de `preferredSelection` ou de uma Selection de Wiki já existente, forma-se apenas o resultado resolvido, sem gravar `modelSelection`; só se grava a Selection explícita depois que o usuário
  realmente modifica o modelo ou o reasoning;
- quando o modelo muda, limpa-se a reasoning option antiga incompatível com o novo modelo;
- quando o reasoning muda, atualiza-se diretamente `options.reasoningLevel` da Selection;
- `ModelConfigSelect` formata para string ao renderizar e o evento de seleção faz o parse uma única vez na fronteira antes de gravar a Selection;
- remove-se o estado paralelo que simulava herança, override explícito e Selection completa por meio de combinações de string vazia com `modelTouched`/`thoughtLevelTouched`.

### 4.4 Resolução final de modelo do Repo Wiki

Estabelece-se uma entrada de parsing puro que recebe a Ready View do Host de destino, o Repo Wiki Draft e o registro de Wiki já existente, e produz um resultado discriminado:

```text
Repo Wiki 显式 Selection
        |
        +-- 当前 View 中有效 --> ready(explicit)
        `-- 已失效 -----------> unavailable，不静默回退

没有显式 Selection
        |
        v
已有 Wiki Selection 当前仍有效
        |
        +-- 是 --> ready(existing)
        `-- 否 --> Host preferredSelection
                         |
                         +-- 存在 --> ready(preferred)
                         `-- 不存在 -> ready-empty / no-model
```

O «válido na View atual» aqui precisa reutilizar a semântica completa do `isSelectionInView()` existente, validando de forma unificada a membro Provider/Model, reasoning level e
max output tokens; não se deve escrever no Repo Wiki uma verificação fraca que só checa se Provider/Model existem.

O resultado Ready deve carregar simultaneamente a `ModelSelection` final, os groups do controle e a reasoning option correspondente. Exibição e Generate usam o mesmo resultado,
sem mais parsear ou refazer fallback separadamente.

### 4.5 Comportamento da página

| Estado do Model Selection | Comportamento do Repo Wiki                            |
| ------------------------ | ------------------------------------------------------ |
| loading                  | exibe o estado de carregamento de modelo; controle de modelo e Generate desabilitados |
| remote-waiting           | exibe a espera pela conexão do Workspace de destino; não acessa o Local Host |
| error                    | exibe falha de leitura e reload; não se disfarça de «sem modelos» |
| ready + providers vazio  | exibe que não há modelos disponíveis no momento; Generate desabilitado |
| ready + escolha explícita inválida | exibe a escolha inválida e a entrada de correção; Generate desabilitado |
| ready + Selection válida | exibe o reasoning normalmente e permite Generate        |

`generateDisabled` deve incluir o Model State final do Repo Wiki; o handler de evento mantém as asserções de invariante, mas não substitui a admissão de UI por um return silencioso.

### 4.6 Comportamento das entradas vizinhas

Quando a união discriminada é migrada para os demais chamadores, apenas se consolida o ciclo de vida de candidatos de modelo que cada entrada realmente usa, sem alterar a semântica própria de Draft e submissão delas:

| Entrada            | loading / unavailable                                                | error                                                          | ready                                                       |
| ------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------- |
| Portão de startup Root | continua aguardando a primeira Model Selection View                | encerra a espera silenciosa, exibe falha de leitura e reload; não pode ser interpretado como «não há Provider» | conclui a verificação de startup pela regra existente de disponibilidade de Provider |
| Composer          | mantém o Draft/Session Selection atual; o controle de modelo mostra carregando e não aceita nova escolha | mantém a Selection atual; o controle de modelo exibe falha de leitura e reload | exibe candidatos da View do Host de destino, sem alterar a atribuição de Session/Active Model |
| Automation        | missing-target/remote-waiting são exibidos no controle de modelo, sem fallback para Base Host | mantém o Draft do formulário; o controle de modelo exibe falha de leitura e reload | lê candidatos apenas do Workspace Host selecionado |
| Subagent Settings | mantém o Draft do formulário; controles relacionados a modelo exibem carregando | mantém o Draft do formulário; a área de modelo exibe falha de leitura e reload | continua usando a Local Environment View |
| Provider Settings | o painel exibe carregando e não trata `null` como lista vazia de Providers | o painel exibe falha de leitura e reload                     | exibe a Provider Settings View daquele Environment             |

O error do Root precisa encerrar a espera infinita atual controlada apenas pelo booleano `hydrated`, mas não pode forjar uma `ModelSelectionView` vazia para acionar o branch existente de «nenhum Provider disponível».
Provider Settings continua usando seu próprio estado de domínio, sem reutilizar o tipo `ModelSelectionState`.

## 5. Escopo de implementação

1. Dividir a leitura de Model Selection em duas entradas explícitas — Host Service explícito e Workspace Target explícito — e adicionar lifecycle state, owner key,
   primeiro erro e reload;
2. Migrar todos os chamadores: Root, Composer, Repo Wiki, Automation e Subagent, sem manter Hook de compatibilidade nullable;
3. Restringir a entrada da projeção de Registry Model Groups a apenas-Ready;
4. Migrar os campos de modelo do Repo Wiki Generation Draft para `ModelSelection`;
5. Usar um único resultado de resolução de modelo do Repo Wiki para o rótulo de modelo, reasoning, estado desabilitado e Submission;
6. Remover do Repo Wiki Renderer o fallback de primeiro item do menu, os fatos de modelo em string vazia e o parse duplicado;
7. Consolidar os estados de loading/error/reload de primeira leitura de `useProviderSettingsServiceView()` e do Provider Settings Snapshot de nível raiz; os dois podem
   reutilizar o mecanismo interno de assinatura, mas continuam expondo seu próprio estado de domínio, sem alterar a semântica de Provider Settings/Account Overlay;
8. Durante a migração dos chamadores, auditar os parsers de string de modelo restantes em Subagent, Composer e Session Catalog: strings podem permanecer na fronteira do controle, mas
   Draft/Record de produto não ganham novos fatos em string; compatibilidade histórica sem relação com este ciclo de vida não amplia o escopo da mudança;
9. Reescrever os capítulos de seleção de modelo e de origem das capacidades em `docs/repo-wiki.md`, removendo os elos obsoletos de deferred session/prewarm e segunda seleção de Service,
   unificando para a Generate Submission fixar explicitamente a `ModelSelection`;
10. Complementar o Design da seleção de modelo e o Feature Graph com os estados assíncronos de leitura do Renderer, remover as descrições divergentes de leitura direta do antigo Model Provider Service pelo Repo Wiki e manter
    inalteradas as prioridades e Owners existentes de `preferredSelection`, Configured Default, App Recent, Session Selection e Active Model.

Este Todo não modifica:

- a ordem do Provider Config Overlay;
- membros de modelo ou Access da Account Provider;
- integridade/admissão de execução do Registry;
- armazenamento físico e algoritmo de Fallback do Configured Default;
- requisição de modelo, Prompt, retry, timeout ou conteúdo gerado do Repo Wiki;
- Selection de sessão comum, fila, retomada e ciclo de vida do Active Model.

## 6. Plano de testes

Escreva primeiro os testes que falham, depois altere a implementação de produção.

### 6.1 Hook e estado assíncrono

1. a primeira assinatura é loading e, após `getView()` concluir, entra em ready;
2. falha de `getView()` entra em error; após reload bem-sucedido, entra em ready;
3. remote-waiting e missing-target são explicitamente unavailable e não chamam o Local Host;
4. a troca de Host no mesmo render não expõe a View do Host antigo;
5. Promise/evento atrasado do Host antigo não pode sobrescrever o novo Host;
6. a revision do mesmo Host só avança monotonicamente; quando o evento chega antes da conclusão da primeira leitura, mantém-se a View mais recente;
7. falha de refresh em segundo plano após ready mantém a Last Known Good View, e eventos bem-sucedidos posteriores ainda podem continuar atualizando;
8. ready-empty permanece distinguível de loading/error/unavailable.

### 6.2 Estado puro e componentes do Repo Wiki

1. quando o Model View atrasa, a primeira renderização não lança erro e, após o retorno, exibe `preferredSelection`;
2. uma Selection explícita válida do Repo Wiki tem prioridade sobre o Wiki existente e sobre o preferred do Host;
3. quando a Selection explícita se torna inválida, preserva-se a intenção original e desabilita-se Generate, sem fallback para o primeiro item;
4. sem Selection explícita, uma Selection de Wiki existente e válida tem prioridade; se inválida, faz fallback para o preferred do Host;
5. quando o Host não tem preferred nem candidatos, exibe no-model;
6. a reasoning option é resolvida apenas a partir da Ready View correspondente à Selection final; trocar de modelo limpa a option incompatível;
7. o Repo Wiki Store não guarda mais string de modelo vazia, e a Submission carrega diretamente a `ModelSelection` completa;
8. loading, unavailable, error, ready-empty e ready exibem o estado correto e a admissão correta dos botões;
9. o botão de retry no estado comum de error chama um reload real; o Section Error Boundary deixa de absorver esse tipo de estado esperado.
10. a primeira exibição de preferred/existing Selection não grava no Draft; enquanto o usuário não modificar, uma nova View do Host pode atualizar a Effective Selection;
11. quando o reasoning level ou max output tokens da Selection explícita/existente não é aceito pela View atual, ela é considerada inválida e não entra na Submission.

### 6.3 Regressão das entradas afetadas

1. o primeiro carregamento e a troca de Host no Composer não limpam nem misturam Draft/Session Selection já existentes;
2. quando não há target válido selecionado, a Automation não lê o Base Host; assim que o destino está pronto, exibe os candidatos correspondentes;
3. Subagent distingue loading, unavailable e error, sem ficar girando para sempre;
4. a entrada de login Root só avalia a disponibilidade de Provider em uma Ready View; a falha da primeira leitura encerra a espera de startup, exibe reload e não entra no branch de «nenhum Provider»;
5. desconexão/reconexão do Remote Workspace não vaza Provider Local;
6. tanto o Hook de Service alvo do Provider Settings quanto o Snapshot de nível raiz distinguem o primeiro loading/error/ready e permitem reload após falha;
7. o comportamento de tarefas/stream no Desktop continuous e no Web Remote replayable permanece inalterado.

Como envolve interação de UI, é obrigatório adicionar ou atualizar E2E Desktop: cobrir no mínimo a abertura do Repo Wiki após um ModelSelection View atrasado, Remote waiting e
ready-empty, sem se limitar a testes unitários com helper. Por fim, executar testes unitários direcionados, E2E relacionados, `pnpm typecheck`, `pnpm lint`, verificação de formatação dos arquivos alterados
e `git diff --check`.

## 7. Critérios de conclusão

- o owner da leitura de candidatos de modelo, a admissão de interação e a fronteira de Submission não expressam mais loading/error/unavailable como View nullable, candidatos vazios ou string
  vazia;
- helpers de projeção oficiais como `buildRegistryModelSelectGroups` não aceitam View nullable;
- o Repo Wiki Domain Store não guarda strings de codificação do controle de seleção de modelo nem sentinelas de string vazia;
- preferred/existing Selection do Host participam apenas da resolução da Effective Selection e, sem modificação do usuário, não entram no Draft explícito;
- o Repo Wiki não chama o parser estrito de Selection em estado não-Ready durante a renderização;
- o Renderer não implementa mais um segundo fallback de primeiro item do Registry;
- modelos ou options explícitos inválidos não são substituídos silenciosamente, e o Generate só aceita uma `ModelSelection` Ready validada pela Selection completa existente;
- o Host de destino, a revision e os estados de erro da Model Selection têm prova automatizada;
- uma falha na primeira leitura do Provider Settings não se disfarça mais permanentemente como loading;
- a documentação do Repo Wiki, o Design da seleção de modelo, o Feature Graph e o protocolo com `ModelSelection` obrigatória estão consistentes;
- todos os testes direcionados, o E2E de interação, o typecheck da raiz e o lint passam;
- após a conclusão, submeter um Conventional Commit.

## 8. Resultado da implementação e revisão de fase

### 8.1 Ciclo de vida do Renderer

- `useModelSelectionServiceView()` e a entrada de Workspace passaram a `loading / unavailable / error / ready` como união discriminada, com `reload()` explícito; trocar de Service no mesmo render não expõe a View antiga.
- A assinatura ocorre antes da primeira leitura, a revision é monotônica; resultados atrasados do Host antigo são descartados pela generation, falha de leitura após Ready mantém o Last Known Good e eventos posteriores ainda permitem recuperar atualizações.
- Quando falta target no Workspace ou há remote-waiting, o Model Selection Service não é lido e não há fallback para Base/Local Host.
- `buildRegistryModelSelectGroups()` aceita apenas a `ModelSelectionView` completa; branches não-Ready precisam ser tratados pelo chamador antes.

Revisão de fase: Hook, owner, revision, reload, Last Known Good, missing-target e remote-waiting têm testes unitários diretos; nenhum DTO de Protocol, cópia do Registry ou segundo conjunto de fatos de modelo foi adicionado.

### 8.2 Repo Wiki e entradas vizinhas

- O Repo Wiki Store só guarda `modelSelection?: ModelSelection` explícita e esparsa; strings de controle só são codificadas/parseadas na fronteira do Select.
- `resolveRepoWikiModelState()` unifica explicit > existing > Host preferred; quando a Selection explícita ou suas options ficam inválidas, preserva-se a intenção e o Generate é bloqueado, sem fallback para o primeiro item do menu.
- loading, remote waiting, target missing, error, ready-empty e invalid-explicit viram estados comuns da página; falhas de leitura oferecem reload e o Generate só aceita Selection Ready.
- Root, Composer, Automation e Subagent migraram para o ciclo de vida explícito; Draft/Session Selection existentes não são limpos por estados não-Ready.
- O snapshot raiz do Provider Settings e o Hook de Service alvo também distinguem loading/error/ready e suportam retry da primeira falha e retenção de snapshot Ready.

Revisão de fase: removidos os fatos de modelo em string vazia do Repo Wiki, o estado paralelo de touched, o fallback de primeiro item do menu, o parser de Submission duplicado e o helper de restauração de reasoning sem chamadas de produção. Desktop continuous, Web Remote replayable, Session Selection e o ciclo de vida do Active Model não foram modificados.

### 8.3 Documentação, Feature Graph e verificação

- `docs/repo-wiki.md` e o Design da seleção de modelo passaram a descrever a Ready View do Host de destino, o Draft Selection estruturado e a fixação exata no momento da submissão.
- O Feature Graph ganhou os nós Renderer Model Selection Read e Provider Settings Service e perdeu as arestas divergentes de conexão direta ao antigo Model Provider Service por Repo Wiki/Composer/Automation/Subagent.
- O E2E do Repo Wiki ganhou regressões contra o Error Boundary assíncrono Ready/Error e asserções de admissão de ready-empty; a ausência de fallback local em Remote waiting está fixada por automação de Hook sem dependência de SSH externo.

Aprovado:

- testes unitários direcionados de Provider/Model Selection, Repo Wiki, Root, Composer, Automation e Subagent;
- `pnpm typecheck` da raiz;
- `pnpm --filter @zcode/desktop typecheck:e2e`;
- `pnpm lint` da raiz (0 erros; warnings preexistentes no repositório estão fora do escopo deste Todo);
- parse do YAML do Feature Graph, existência de nós/seeds incrementais e `git diff --check`.

O `pnpm test:unit` completo concluiu com 12.683 aprovação e 25 ignoradas; uma condição de corrida preexistente no fechamento do socket CUA falhou esporadicamente sob concorrência total, com 22/22 aprovando na repetição isolada. A concorrência total também atingiu uma vez o limite de heap do worker do Vitest; todos os testes afetados por este Todo foram reexecutados de forma isolada e passaram.

O E2E Desktop foi efetivamente iniciado e concluiu o build de produção, mas a máquina de execução Linux atual não possui `xvfb-run`, e o Chrome saiu antes de criar a sessão; isso é um bloqueio de ambiente de exibição, não uma falha de asserção de caso. O relatório de falha detalhado está em `.e2e-artifacts` gerado nesta execução, e o caso permanece executável em CI/macOS com ambiente de exibição.

### 8.4 Revisão de status de 2026-09-01

- os 4 arquivos de teste direcionados de `useModelSelectionView`, target de Workspace, Repo Wiki Model State e fonte de fatos foram executados de fato, com 15 casos no total;
- `pnpm --filter @zcode/desktop typecheck:e2e` passou;
- a máquina de execução Linux atual ainda não tem `xvfb-run` instalado, e a impossibilidade de criar uma sessão de navegador não foi registrada como E2E aprovado;
- o MacBook Air tem a cópia de trabalho atual em outro commit; nenhuma verificação foi falsificada usando uma build antiga em lugar do HEAD atual. Depois é preciso sincronizar o commit atual e executar de fato
  `repo-wiki-generation-settings.test.ts` e `repo-wiki-generation-produces-wiki.test.ts`.