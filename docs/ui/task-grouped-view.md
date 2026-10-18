# Task Grouped View

`Group` é a entrada visível ao usuário da área de tarefas da barra lateral, usada para exibir em uma mesma lista misturada os task groups entre workspaces definidos pelo usuário e as tasks não agrupadas. O estado interno, as interfaces e a persistência continuam usando a nomenclatura `grouped` / `Grouped`, evitando quebrar as estruturas de dados existentes.

A implementação atual suporta a entrada de visualização `Group`, `New Group`, exibição misturada de tasks/groups entre workspaces, mover para group / mover para fora do group pelo menu, persistência em SQLite, submissão otimista, rename de group, cor de group, menu de contexto no group header e ordenação por arraste task sobre task com escopo limitado.

Ao entrar em `Group` pela barra lateral, a seção global `Pinned` continua sendo reaproveitada acima do corpo grouped. O corpo Grouped só exibe tasks não fixadas e não arquivadas; uma task fixada só é migrada para a seção `Pinned` da mesma página, sem reaparecer dentro do group ou no nível superior. pin/unpin não modifica o group membership nem a ordenação do usuário da task, e após desfixar ela precisa voltar à posição original.

## Ordem das visualizações

A ordem do menu de visualizações de tarefas é fixa:

1. `Group`
2. `Workspace`
3. `Timeline`

`Workspace` mantém a visualização de tarefas agrupada por workspace atual; `Timeline` mantém a visualização de tasks apresentada por linha do tempo.

## Estrutura da lista

A estrutura do corpo da visualização `Grouped` é a seguinte:

```tsx
<task-group-list>
  <new-group-item />
  <new-task-item />

  <task-item />
  <task-item />
  <group-item>
    <group-title />
    <task-list>
      <task-item />
      <task-item />
    </task-list>
  </group-item>
  <task-item />
  <group-item>
    <group-title />
    <task-list>
      <task-item />
      <task-item />
    </task-list>
  </group-item>
  <task-item />
</task-group-list>
```

- `new-group-item` e o `new-task-item` global ficam fixos no topo da lista misturada e não participam da persistência da ordenação do usuário.
- O group real criado ao clicar em `new-group-item` precisa ser escrito imediatamente na ordenação do usuário do nível superior e colocado no topo da lista misturada.
- `task-item` de nível superior representa uma task que não entrou em nenhum group.
- `group-item` representa um group definido pelo usuário.
- `task-item` dentro de um group não aparece mais no nível superior.
- Tasks arquivadas ou excluídas são totalmente invisíveis na visualização `Grouped`, inclusive dentro de groups.
- Tasks fixadas não entram no corpo `Grouped`, mas ficam visíveis na seção global `Pinned` no topo da mesma página `Group`; isso não é exclusão, arquivamento nem remoção de group membership.
- Groups vazios continuam sendo exibidos, evitando que um contêiner criado pelo usuário desapareça porque seus membros estão temporariamente invisíveis.
- A atribuição de group e a ordem misturada de `Grouped` são independentes do modo global de ordenação de tasks; alternar a ordenação de `Workspaces`/`Timeline` por tempo de criação ou atualização não deve mudar a visualização `Grouped`.
- Na primeira montagem da visualização Grouped, enquanto a primeira requisição de estrutura/membership não termina e a hidratação do primeiro snapshot do sessions-index não conclui, a área de conteúdo do corpo permanece vazia, sem renderizar "carregando tasks", o grouped draft mantido no store, contêineres de group, estado vazio ou lista vazia; a seção Pinned já existente no topo da página não é afetada. O draft e a lista autoritativa só são exibidos de uma vez quando as duas fontes de dados estão prontas; atualizações posteriores em background preservam o conteúdo existente, evitando esvaziar a lista ou interromper o olhar com textos de carregamento.

## Pertencimento do rascunho de New Task

No modo `Grouped`, a entrada global `New task` precisa deduzir a posição do rascunho a partir da task ativa atual:

- Quando a task ativa atual está dentro de um group, clicar na `New task` global deve criar o grouped draft no mesmo group e expandir automaticamente esse group, garantindo que o rascunho fique visível.
- Quando a task ativa atual é uma task de nível superior não agrupada, clicar na `New task` global deve criar um grouped draft de nível superior.
- Quando não há task ativa, quando a task ativa não está na visualização grouped atual ou quando a visualização grouped ainda não concluiu a montagem, usa-se como fallback o grouped draft de nível superior.
- Se já estiver em estado de grouped draft, clicar novamente na `New task` global reaproveita o placement do rascunho atual, evitando mover para o nível superior um group draft em edição por acidente.
- O `New task` dentro de um group header/menu sempre cria explicitamente no group correspondente, independentemente da task ativa atual.
- O placement do grouped draft só pode ser vinculado explicitamente ao novo task id depois que a draft session for realmente criada ou que a pré-aquecimento de session for promovido com sucesso. O comando de criação precisa capturar a identidade estável do rascunho e o placement antes da primeira espera assíncrona; quando o ACK ou o reenvio do comando pending completar, apenas esse snapshot é submetido, e o rascunho só é limpo quando a identidade atual do rascunho ainda corresponder. Um create pending de null-session também precisa persistir o workspace scope de origem e filtrar a entrada de restauração por `workspaceIdentity?.trim() || workspacePath`, proibindo exibição ou consumo em outros workspaces. Seleção comum de task, navegação por fork e restauração de session existente cuidam apenas da navegação e não devem ser inferidas como promoção de rascunho, evitando alterar por engano o group e a ordenação de tasks existentes.
- Na primeira promoção de um rascunho raiz, o Host precisa submeter a task row e o `sort_order` de nível superior na mesma transaction do SQLite, e a publicação da atualização de sessions-index/task list só é permitida após o commit da transaction. Mesmo que o Renderer receba primeiro o quadro de conteúdo do sessions-index e depois a estrutura grouped, ele precisa continuar usando a posição otimista no topo da raiz, proibindo temporariamente colocar no fim da lista a nova task cujo `sort_order` autoritativo ainda não foi obtido e depois movê-la para cima.

## Expandir e recolher

A visualização `Grouped` reaproveita os botões de ferramenta `Expand all` / `Collapse all` ao lado do título da área de tarefas da barra lateral.

- Os botões em lote são exibidos quando a visualização grouped atual tem pelo menos um group.
- Expandir/recolher é uma preferência de exibição do usuário atual, do dispositivo/navegador atual, persistida no lado da UI em `localStorage`, com a key `zcode-grouped-task-collapsed-groups`.
- O valor persistido guarda apenas os group ids recolhidos na forma `{ [groupId]: true }`; groups ausentes são considerados expandidos. Assim um group novo nasce expandido e evita-se copiar a ordem completa de groups para as preferências da UI.
- Se nenhum group estiver recolhido, o botão mostra `Collapse all` e, ao clicar, grava todos os group ids da view atual no conjunto de recolhidos sincronizando o localStorage.
- Se algum group estiver recolhido, o botão mostra `Expand all` e, ao clicar, limpa o conjunto de recolhidos sincronizando o localStorage.
- Após a remoção de um group ou a atualização da view, é preciso limpar os ids recolhidos obsoletos conforme a lista atual de group ids e gravar o resultado limpo de volta no localStorage, evitando que groups novos sejam atingidos por engano por estado antigo.
- Ao clicar em `New task` dentro de um group, o group continua sendo expandido automaticamente, garantindo que o novo rascunho fique visível.
- O rótulo do item de rascunho de task usa `text-ui-sm`, permanece visível e na mesma posição no hover; o ponto de status e o botão de fechar compartilham um slot de ação de largura fixa e alternam no lugar no hover, e clicar em fechar limpa apenas o grouped draft atual, sem arquivar nem excluir a task real.

## Semântica de Group

Group é um contêiner global de organização de tarefas definido pelo usuário:

- Suporta nomeação.
- Suporta definição de cor, com referência à cor de tag do Finder do macOS.
- Pode conter tasks de workspaces diferentes.
- Uma task pode pertencer a no máximo um group.
- Excluir um group apenas remove a associação dos membros, sem excluir nem arquivar as tasks contidas nele.

## Menu do Group Header

O group header serve para expandir/recolher. Ao clicar com o botão direito no header, aparece o menu de contexto, com a estrutura a seguir:

```txt
New task
---
Rename
Change Color >
  Gray
  Red
  Orange
  Yellow
  Green
  Blue
  Purple
---
Ungroup
```

- `New task` reaproveita a entrada existente de criação de task da barra lateral, sem alterar a relação de membros do group atual.
- `Change Color` usa um submenu de segundo nível, e os itens de cor mostram apenas texto e um pequeno ponto colorido.
- `Rename` entra na edição inline de título com a mesma semântica de bot channel.
- `Ungroup` move todas as tasks do group de volta para o nível superior raiz e exclui o group; aqui não há confirmação secundária, porque as tasks em si não serão excluídas nem arquivadas.
- A ordem de persistência de `Ungroup` é salvar primeiro a nova ordenação da view raiz/grouped e só depois excluir o group. Assim, o cascade de membership disparado pela exclusão do group não faz as tasks do group original perderem a ordem visível ao usuário.

## Menu do Task Item

Todos os task items da visualização `Grouped` exibem menu de contexto, incluindo tasks da raiz e tasks dentro de group. A estrutura é a seguinte:

```txt
Move to group >
  Remove from group
  ---
  <dot color> <group title>
  <dot color> <group title>
---
Rename task
Archive task
Mark as unread
---
Open in Finder / File Explorer / File Manager
Copy path
Copy task path
Copy log path
Copy session id
Go to config
---
Feedback
```

- `Move to group` é um submenu de segundo nível que lista todos os groups da visualização grouped atual, mostrando o ponto de cor do group antes do nome.
- O group atual fica desabilitado dentro do submenu, evitando movimentação duplicada.
- O `Remove from group` da task raiz fica desabilitado; em uma task dentro de group, o clique a move de volta para a raiz.
- `Remove from group` coloca a task depois do group original, preservando o contexto espacial após a ação do usuário.
- `Rename task`, `Archive task`, `Mark as unread`, a cópia de caminhos, o salto para configuração e a entrada de feedback seguem a semântica de nível de task da visualização de workspace.

## Arraste de task para mover e ordenar

A visualização Grouped suporta mover por arraste direto entre task items, com interação referenciando a lista ordenável virtualizada do dnd-kit:

- A ordenação por arraste é orientada pelo resultado `over` do dnd-kit: `collisionDetection` apenas escolhe o droppable `over` atual, `onDragOver` atualiza a preview view conforme o tipo do droppable, e não se percorre mais todas as tasks por `dragMove` nem se usa a linha central do ponteiro para decidir a posição de inserção; `dragMove` apenas registra a direção atual de arraste obtida pela variação de delta entre dois quadros adjacentes e, quando a direção inverte mas o alvo `over` não muda, reutiliza o último alvo `over` para atualizar a preview.
- A rolagem automática do arraste usa `autoScroll.threshold = { x: 0.1, y: 0.1 }` do dnd-kit, isto é, a rolagem só é disparada quando o retângulo de arraste entra na faixa de 10% nas bordas superior, inferior, esquerda e direita do contêiner de ancestral rolável, evitando que a área de disparo padrão de 20% fique sensível demais em contêineres de listas curtas.
- Só é permitido acertar task, group header, group footer, group recolhido, empty drop zone e alvo de ordenação de group; tasks de rascunho, as linhas fixas `New group` / `New task` ou áreas em branco não participam da ordenação.
- Quando o arraste acerta uma task da raiz, o pai de destino é a raiz.
- Quando o arraste acerta uma task de group, o pai de destino é esse group.
- A posição de inserção task sobre task é determinada pela direção atual, atualizada continuamente ao longo do arraste: mover para baixo insere depois da task alvo, mover para cima insere antes da task alvo; dentro de uma mesma task `over` não se alterna mais pela linha central via `dragMove`.
- Quando o group está recolhido, o item de group recolhido funciona como droppable independente; task sobre group recolhido tem a camada de destino na raiz, antes ou depois do group conforme a direção do `dragOver`.
- Quando o group está expandido, a semântica estrutural é `<group><header /><content /><footer /></group>`: o header funciona como droppable independente, e task sobre header é decidida pela direção do `dragOver` — mover para cima significa mover para fora, para a raiz, e inserir antes do group; mover para baixo significa mover para dentro do group e inserir antes da primeira task; dentro do content a ordenação continua task sobre task; o footer é um droppable independente no fluxo normal de layout, sem usar padding absoluto inferior, e task sobre footer é decidida pela direção do `dragOver` — mover para cima insere no fim da group list, mover para baixo move para fora, para a raiz, e insere depois do group.
- Quando o group está expandido e vazio, o empty drop zone funciona como droppable independente, e task sobre empty drop zone é movida para a primeira posição do group pelo `dragOver`.
- A empty group drop zone é montada/desmontada em sincronia com o estado de group vazio, sem fade por opacity, evitando que a transição oculta ainda influencie o julgamento de acerto do arraste.
- O group header é a alça de arraste do group; ao iniciar o arraste de um group, ele é temporariamente recolhido e o estado de recolhimento anterior ao arraste é restaurado ao final ou no cancelamento.
- A camada flutuante de arraste de group precisa reaproveitar o título de exibição do header normal; os grupos de cron do sistema exibem o nome localizado tanto no header comum quanto no sticky header e na camada flutuante de arraste, sem expor o valor placeholder persistido `cron`.
- O arraste de group só move o bloco inteiro do group na camada raiz: group sobre task da raiz e group sobre group têm antes/depois determinados pela direção do arraste ao entrar no destino via `dragOver`; group sobre task/conteúdo de group não gera aninhamento.
- Movimentação dentro do mesmo pai aparece como reorder; movimentação entre pais diferentes aparece como sair primeiro do pai original e depois inserir no pai de destino.
- Os tipos de movimentação suportados são limitados a:
  - root task over root task
  - root task over group task
  - group A task over group B task
  - group task over root task
  - task over a área do group item
  - task over empty group drop zone
  - group over root task
  - group over group
- Após o fim do arraste, `applyGroupedTaskViewOrder` submete de uma só vez a ordem final da raiz e o group membership; ao cancelar o arraste ou falhar ao salvar, há rollback para a view anterior ao arraste.
- Tasks na lista virtualizada usam como draggable/droppable id uma key estável de workspace identity + task id, evitando desalinhamento por índice quando a janela de rolagem remonta.
- A preview de arraste é a active task row da posição prevista atualmente dentro da lista, não uma camada flutuante sob o mouse; o estilo de linha da preview de raiz e da preview de group é uniformizado como placeholder invisível, sem borda nem fundo, mantendo apenas as diferenças estruturais naturais do contêiner, como indentação e a linha lateral do group.
- A overlay de arraste é a camada puramente visual que segue o mouse, montada via portal em `document.body`, e não renderizada dentro do contêiner rolável das grouped tasks, evitando sofrer influência da barra de rolagem e do contexto de recorte; a overlay usa `bg-background`, tem largura seguindo a largura real da preview row atual dentro da lista com uma transição curta quando a largura muda, não tem tooltip, menu de contexto nem estado de hover, e ao soltar usa uma curta animação de drop para fechar na posição final.
- Quando uma grouped task é arrastada até as quatro bordas do Workbench pane da área de conversa, reaproveitam-se os pontos de divisão de tela do Project task e as regras de session identity; uma divisão de tela bem-sucedida não pode submeter a preview de ordenação grouped, e o nível e a ordem originais da task na visualização grouped permanecem inalterados. Arrastar o group header continua responsável apenas pela ordenação interna do grouped, sem permitir criar divisões de tela.
- Durante a movimentação por arraste, as task rows visíveis já montadas recebem animação de cedência FLIP; quando uma task entra/sai de um group, a variação de altura do contêiner do group e a variação de posição dos nós de nível superior seguintes também participam da animação no mesmo ritmo; nós fora da janela da lista virtualizada não são montados e não participam da animação, e a preferência de sistema de reduced motion é respeitada.
- O arraste só altera a ordem de organização do usuário da visualização Grouped, sem mudar a semântica de recuperação de mensagens da session do ZCode, do realtime stream de tasks, do desktop continuous ou do web remote replayable.

## Fork e novo task fixado no topo

Tasks criadas no nível superior e as novas tasks que aparecem após um fork precisam ser gravadas na ordenação de nível superior de `task_group_view_node_orders` e inseridas no topo da lista Grouped com um novo `sort_order` mínimo. O `New task` dentro de um group, depois de promovido a partir do rascunho, precisa ser gravado no membership desse group e inserido na primeira posição dentro do grupo com um novo `sort_order` de membro mínimo. O posicionamento otimista da UI é apenas retorno imediato; a fonte de verdade após a atualização continua sendo o SQLite.

- O `createSession` e o `forkSession` do desktop continuous gravam o task index e a ordenação grouped de nível superior através de `ZCodeTaskIndexSyncer.syncSnapshotAndBroadcast(..., { moveGroupedTaskToTop: true })`.
- O web remote replayable/shared-host grava a ordenação grouped de nível superior pelo task adapter ao criar tasks.
- Tasks que já existem dentro de um group, e novas tasks promovidas a partir de um rascunho de group, não devem ser removidas do group por causa de uma sincronização de snapshot comum; a fixação no topo da raiz só é usada para entradas como criação na raiz ou fork, em que uma "nova task entra na lista pela primeira vez".
- A inicialização da ordem de nível superior de uma nova task precisa ser idempotente: o estado visível, o primeiro título e o snapshot completo da mesma session podem voltar à origem em paralelo, e um novo `sort_order` mínimo só pode ser atribuído quando for a primeira vez que se descobre que a task ainda não tem group membership nem ordenação de nível superior. Sincronizações repetidas seguintes só atualizam o meta da task e não podem fixar no topo de novo, senão uma task antiga mais lenta voltando à origem ultrapassaria a nova task criada depois dela.
- Depois que a primeira gravação da ordem de nível superior tiver sucesso, é preciso emitir o evento semântico `task_created` para invalidar o cache de estrutura Grouped em execução e re-puxá-lo; o quadro visível do sessions-index pode chegar antes da gravação da ordem no SQLite e não se pode depender apenas da mudança da lista de sessões para atualizar, senão o processo atualacrescenta tasks fora de ordem para o fim e só recupera a ordem correta depois de reiniciar.
- O placement após a promoção de um group draft não pode depender de `optimisticTaskListByTaskId` para valer. O primeiro envio do V4 só garante que a active session e a task autoritativa do sessions-index estão visíveis; assim que o marcador de promoção e a task autoritativa tiverem aparecido juntos, é preciso gravar o group membership e a primeira posição dentro do grupo conforme o marcador.
- Quando um grouped draft é promovido a um task id real na fronteira create/send accepted, o placement promovido e o metadata mínimo renderizável de `optimisticTaskListByTaskId` precisam ser gravados na mesma transaction do renderer store. Não se pode limpar primeiro a linha do rascunho e esperar o sessions-index, sob pena de abrir um vão de linha de task entre o ACK e a projeção da lista autoritativa. Esse metadata é apenas um overlay curto de UI e não falsifica conversation projection; seu `updatedAt` precisa usar um valor sentinela menor que qualquer tempo de session autoritativo, e o relógio local do renderer não pode participar da ordenação nem da disputa de autoridade de campos. Desktop continuous e web remote replayable fecham a conta com o metadata autoritativo do sessions-index posterior. A conciliação precisa usar merge no nível de campo do meta da task: título vazio, mode/provider/status padrão do overlay mínimo não podem sobrescrever os campos autoritativos enviados depois pelo sessions-index.

As cores não são armazenadas como valores CSS, mas como um enum semântico, mapeado pela UI para cores legíveis conforme o tema:

```ts
type TaskGroupColor = "gray" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
```

## Modelo de dados

Recomenda-se adicionar um repo/service de task group na camada de serviço, evitando que a UI acesse o repo diretamente.

```ts
interface TaskGroup {
  id: string;
  title: string;
  color: TaskGroupColor;
  createdAt: number;
  updatedAt: number;
}

interface TaskGroupMember {
  groupId: string;
  taskId: string;
  workspacePath: string;
  workspaceIdentity?: string;
  sortOrder?: number;
  addedAt: number;
}
```

Tasks não agrupadas também precisam de ordenação do usuário no nível superior, então é preciso registrar separadamente a ordem dos nós de nível superior na visualização `Grouped`:

```ts
interface TaskGroupViewNodeOrder {
  nodeType: "task" | "group";
  nodeKey: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}
```

O `nodeKey` do tipo task precisa conter a informação de identidade do workspace e não pode usar apenas `taskId`. Em tudo que envolva isolamento de identidade ou correspondência entre workspaces, usa-se uniformemente:

```ts
const workspaceKey = workspaceIdentity?.trim() || workspacePath;
```

A semântica de execução de caminho continua usando `workspacePath`.

## Persistência em SQLite

Os dados relacionados a group são persistidos no banco de índice de tasks existente:

```txt
~/.zcode/v2/tasks-index.sqlite
```

Não crie outra fonte de verdade em JSON para group nem coloque o estado de group em UI store, relay ou main process. O SQLite continua sendo lido e escrito de forma unificada pelo repo da camada de services, e a UI acessa apenas por service/hook.

Recomenda-se adicionar três tabelas:

```sql
CREATE TABLE IF NOT EXISTS task_groups (
  group_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'gray',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS task_group_members (
  group_id TEXT NOT NULL,
  workspace_key TEXT NOT NULL,
  workspace_path TEXT NOT NULL,
  workspace_identity TEXT,
  task_id TEXT NOT NULL,
  sort_order INTEGER,
  added_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_key, task_id),
  FOREIGN KEY (group_id) REFERENCES task_groups(group_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS task_group_view_node_orders (
  node_type TEXT NOT NULL,
  node_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (node_type, node_key)
);
```

Índices:

```sql
CREATE INDEX IF NOT EXISTS idx_task_group_members_group_order
ON task_group_members (group_id, sort_order, added_at);

CREATE INDEX IF NOT EXISTS idx_task_group_view_node_orders_order
ON task_group_view_node_orders (sort_order, created_at);
```

Explicação das restrições:

- A chave primária de `task_group_members` é `(workspace_key, task_id)`, o que garante mecanicamente que uma task pode pertencer a no máximo um group.
- Após a exclusão de `group_id`, o `ON DELETE CASCADE` remove automaticamente as associações dos membros.
- `task_group_view_node_orders` guarda a ordem misturada de nível superior; o group em si não guarda mais um `sortOrder` adicional, evitando dividir a fonte de verdade da ordenação.
- Quando `node_type = 'group'`, `node_key = group_id`.
- Quando `node_type = 'task'`, `node_key` precisa ser composto por `workspace_key` e `task_id`, usando uma codificação segura que não seja truncada por strings do SQLite/JS, como `JSON.stringify([workspaceKey, taskId])`.
- `workspace_key` precisa ser gerado por `workspaceIdentity?.trim() || workspacePath`.

A implementação da camada de serviço deve reaproveitar `getTasksIndexDatabasePath()` para abrir o mesmo arquivo SQLite e seguir as práticas de inicialização do índice de tasks existente:

- `PRAGMA journal_mode = WAL`
- `PRAGMA synchronous = NORMAL`
- `CREATE TABLE IF NOT EXISTS` para inicialização idempotente do schema
- Ao precisar adicionar campos, usar `PRAGMA table_info` + `ALTER TABLE ADD COLUMN`

As mudanças de ordenação e de membership geradas por movimentação pelo menu, promoção de rascunho e desagrupamento precisam ser submetidas de uma só vez em uma transaction do SQLite. O evento de invalidação da task list/grouped view só é transmitido após o commit bem-sucedido.

## Resultado da consulta

A camada de serviço deve retornar um view model já normalizado, e a UI fica responsável apenas pela renderização e pelo estado de interação:

```ts
type GroupedTaskViewNode =
  | { type: "task"; task: ZCodeTaskListItem; sortOrder?: number }
  | {
      type: "group";
      group: TaskGroup;
      tasks: ZCodeTaskListItem[];
      sortOrder?: number;
    };

interface GroupedTaskView {
  nodes: GroupedTaskViewNode[];
}
```

Regras de consulta da camada de serviço:

- Filtrar tasks arquivadas/excluídas.
- Remover do nível superior as tasks já agrupadas.
- Dentro de um group, manter apenas as tasks visíveis.
- Um group pode atravessar workspaces.
- Groups vazios são preservados.
- Se, na consulta, os tasks/groups visíveis atuais de nível superior estiverem sem `TaskGroupViewNodeOrder.sortOrder`, a camada de serviço preenche imediatamente a ordenação do usuário em ordem decrescente de tempo de criação.
- Se, na consulta, as tasks dentro dos groups visíveis atuais estiverem sem `TaskGroupMember.sortOrder`, a camada de serviço preenche imediatamente a ordenação do usuário em ordem decrescente de tempo de inclusão.
- A interface de consulta não recebe `sortBy`; a visualização `Grouped` usa apenas a ordenação do usuário do próprio group, sem seguir o modo global de ordenação de tasks.

### Fonte de verdade de visibilidade e convergência de exclusão

A projeção cliente do Grouped é a união de três dados com responsabilidades diferentes, em que `sessions-index` só fornece o conteúdo de exibição da task e não pode provar sozinho que a task continua visível:

```txt
sessions-index summary (título/status etc.) ───────┐
active task entity keys (allowlist de visibilidade) ────┼─> projeção cliente do Grouped
group structure (atribuição e ordenação do usuário) ──────────────┘
```

- A active task entity key precisa vir do resultado active de `listTasks()` do task index e ser uniformemente combinada por
  `workspaceKey = workspaceIdentity?.trim() || workspacePath` com `taskId`; resumos históricos que existem apenas em
  `sessions-index`, mas que já foram marcados como deleted pelo task index, não podem entrar na projeção Grouped.
- Antes de a nova task aparecer como linha autoritativa no task index, ela continua sendo exibida temporariamente pelo overlay promoted/optimistic existente; a active allowlist não pode engolir uma task nova já accepted nem promover metadata otimista a fonte de verdade persistida.
- Quando uma task passa de active para deleted, é preciso gravar `tasks.deleted = 1` na mesma transaction do SQLite e apagar os correspondentes `task_group_members` e os `task_group_view_node_orders` de nível superior do tipo task. A transmissão da mudança da lista só é permitida após o commit da transaction.
- Na inicialização do task index, é preciso limpar de forma idempotente as referências obsoletas de membership e de ordenação de nível superior deixadas por tasks deleted históricas, corrigindo os dados sujos já produzidos por versões antigas.
- O group membership e a ordenação do usuário de tasks archived/pinned são preservados para permitir voltar à posição original após a restauração; a limpeza física acima vale apenas para tasks deleted.
- O `applyGroupedTaskViewOrder` do lado do serviço continua rejeitando tasks inexistentes, arquivadas, excluídas ou fixadas, como proteção final de consistência, e a validação não pode ser substituída por ignorância silenciosa.
- É proibido tratar a lista `kind: "active"` de sessions-index / Controller como evidência de que a linha ainda deve permanecer no grouped. Essa diretriz é `!archived`, **inclui tasks fixadas**, enquanto a diretriz do grouped é "não fixada e não arquivada"; usá-la para compensar a "desaparição da linha" ressuscitaria a task fixada e a deixaria presa no agrupamento. Para distinguir "a associação realmente mudou" de "a tabela esquerda está temporariamente atrasada", só se pode depender da versão de membership e da versão de estrutura, nunca da atividade.

Regras de ordenação:

- Groups de nível superior: por `TaskGroupViewNodeOrder.sortOrder`.
- Tasks não agrupadas de nível superior: por `TaskGroupViewNodeOrder.sortOrder`.
- Tasks dentro de um group: por `TaskGroupMember.sortOrder`.
- `createdAt` é usado apenas para preencher inicialmente a ordenação do usuário de nível superior ausente e não participa da comparação de ordenação de nível superior posterior.
- `addedAt` é usado apenas para preencher inicialmente a ordenação do usuário dentro do grupo ausente e não participa da comparação de ordenação dentro do grupo posterior.
- Conteúdo novo precisa receber um `sortOrder` antes de qualquer coisa e não pode depender do tempo de criação como fallback.

## Interação

O item de group exibe:

- Ponto de cor no estilo de tag do Finder.
- Título do group.
- Contagem de tasks visíveis.
- Entrada de expandir/recolher.
- Menu de mais opções.

Menu de group:

- Rename
- Set Color
- Delete Group

Menu de task:

- Tasks não agrupadas suportam `Add to Group`.
- Tasks dentro de um group suportam `Remove from Group`.
- Todas as tasks suportam `Move to top`, com entradas na ação de hover e no menu de contexto; uma task raiz, após a execução, torna-se o primeiro item de nível superior da visualização grouped, e uma task dentro de um group, após a execução, move para o primeiro item do group atual.
- As operações existentes de task como pin, rename, archive e mark unread continuam sendo reaproveitadas.

## Movimentação e ordenação

Grouped tasks suportam movimentação por arraste e também permitem mover uma task para dentro de um group, para fora de um group ou para o topo pelo menu de contexto do task item. `Move to top` é uma ação explícita de fixação no topo dentro do nível atual; ela só modifica a ordenação da visualização grouped, sem alterar o workspace/session ao qual a task pertence.

## Estabilidade de renderização (proibido piscar o bloco inteiro)

O corpo Grouped só pode ser ocultado enquanto os **dados autoritativos da primeira tela não estão prontos**; uma vez que uma lista não vazia já foi desenhada, qualquer atualização, remontagem ou estado vazio transitório posterior precisa continuar renderizando a lista anterior — dado antigo é melhor que branco. Essa restrição é exclusiva do grouped, porque ele é a única visualização de tarefas que mantém a lista autoritativa em estado de instância de componente e tem um gate de primeira tela (timeline/pinned/archived renderizam a partir de um query cache de nível de módulo e, por isso, não produzem quadros em branco naturalmente).

- O gate de primeira tela é um latch único e único, proibido de seguir o `loading` transitório da lista do Controller. Cada nó de streaming de uma task em execução (envio de prompt, primeira exibição de tool, conclusão da saída) dispara uma rodada de reconsulta, e segui-lo desmontaria e remontaria a subárvore inteira.
- `loading` só expressa que "ainda não há nenhum nó autoritativo na primeira tela". Atualizações em background com lista existente não podem marcar o flag, senão o texto de estado vazio e o gate piscariam.
- A última visão autoritativa é cacheada no nível de módulo com uma assinatura de workspace scope, para continuar desenhando imediatamente após uma remontagem de ancestral / HMR. Esse cache não tem invalidação ativa: exclusões / arquivamentos / mudanças de agrupamento ocorridas durante o unload não o expiram, então após a remontagem linhas antigas ficam brevemente visíveis e clicáveis, e o limite superior da janela de leitura suja é um refresh de ida e volta. Esse é um compromisso explícito de "dado antigo é melhor que branco", não um defeito; para estreitar a janela só se pode adicionar TTL ou degradar para placeholder, e não se pode ampliar a janela para trocar por menos RPC.
- Memos relacionados à view e ao scope são sempre assinados por valor, não por identidade de array — caso contrário, a reconstrução de um array de mesmo valor pelo pai formaria um ciclo de autoalimentação "refresh troca a identidade → effect refaz o refresh → renderiza de novo". O comparador de ordenação assinado por scope precisa fazer tie-break em cascata até todos os campos participantes; comparando apenas o primeiro elemento, dois tabs com mesmo workspaceKey e purposes diferentes que trocam de posição no array de tabs produziriam uma nova assinatura e disparariam um refresh desnecessário.
- Os dois latches do gate de primeira tela (`initialized`, `hasPaintedOnce`) escrevem ref diretamente durante a renderização. Isso só se justifica porque são monotônicos (`false→true`, nunca retornam) e o novo valor é totalmente derivado das entradas desta própria renderização: renders descartados no modo concorrente também executam a atribuição e, para um latch monotônico, o pior caso é abrir a porta um quadro mais cedo. Qualquer estado que possa retroceder ou que dependa da ordem de commit é proibido de copiar esse padrão e precisa passar por effect.
- A estabilização de referências de listas e nós se apoia em um curto-circuito por equivalência de conteúdo, e sua invalidação é silenciosa (só se manifesta como regressão de piscar o bloco inteiro, sem log e sem métrica). Por isso a equivalência de objetos aninhados usa sempre comparação estrutural que ignora a ordem das chaves, e não `JSON.stringify` — o upstream constrói objetos com expansão condicional, e a ordem de inserção das chaves não é garantida entre quadros. Essa diretriz é travada pelo caso de regressão de ordem de chaves em `taskListItemStabilization.test.ts`.

Os critérios de julgamento e os requisitos de verificação estão em `docs/task-list-refresh-semantics.md` §4.2 / §5.1. A reverificação precisa reiniciar a aplicação por completo: o vite HMR preserva o estado antigo de componentes já montados, e a observação sob hot replace não vale como conclusão.

## Cabeçalho fixo dos groups

A visualização Grouped, ao rolar, referencia a prática de fixar diretórios no topo da árvore de arquivos e renderiza uma cópia fixa do group header atual em uma camada externa do contêiner de rolagem com máscara, em vez de depender apenas do CSS sticky do group header original.

- A cópia fixa só aparece quando o group header já saiu pelo topo do contêiner de rolagem e a área de conteúdo daquele group ainda cobre o topo.
- Groups recolhidos não exibem a cópia fixa; no estado recolhido não há contexto intra-group rolável, e continuar fixando induziria o usuário a achar que ainda está dentro daquele group.
- A cópia fixa precisa ser renderizada como sibling/slot externo da lista rolada com máscara, evitando ser recortada pela máscara de esmaecimento no topo da sidebar.
- A cópia fixa é ocultada ao arrastar task/group, evitando que o header fixo e o header da lista original se registrem simultaneamente como alvos de acerto do dnd.
- O header fixo reaproveita as entradas do group de cor, recolhimento, criação de task, mudança de cor e desagrupamento; a ordenação e o membership continuam sendo persistidos de forma unificada pela mutation da visualização grouped original.

Camadas de estado:

1. Server snapshot: o `GroupedTaskView` real devolvido pelo serviço.
2. Optimistic view: após movimentação pelo menu, desagrupamento ou promoção de rascunho, aplica-se primeiro a UI otimista e só então se chama o serviço para persistir.

Fluxo:

```ts
async function applyGroupedViewChange(nextView) {
  applyOptimisticView(nextView);

  try {
    await taskGroupService.applyGroupedTaskViewOrder(viewToOrderInput(nextView));
    await refreshGroupedView();
  } catch (error) {
    rollbackOptimisticView();
    toast(intl.formatMessage({ id: "taskGroup.updateFailed" }));
  }
}
```

O processo de mudança de view é proibido de fazer bump da versão da task list de workspaces sem relação e proibido de apagar por engano a ordenação de um workspace não expandido.

## Validação na camada de serviço

As mutations persistidas precisam ser validadas de forma unificada na camada de serviço:

- Se a task existe.
- Se a task está arquivada/excluída.
- Se o group existe.
- Se a task já pertence a outro group.
- Se a referência de task entre workspaces carrega `workspaceIdentity?`.
- Se a posição de ordenação é válida.
- Se, ao final, ainda vale que uma task pertence a no máximo um group.

## Limites multiplataforma

`Grouped` é uma view de organização de UI entre workspaces, mas a execução, o arquivamento e a exclusão de tasks continuam pertencendo ao fluxo do workspace/task original.

- Não afundar o estado de group para o relay ou o main process.
- Não alterar a semântica do fluxo de mensagens de conversa/task do `continuous` da área de trabalho nem do `replayable` do celular.
- A referência a membros de workspace remoto precisa atravessar passando o contexto disponível de `workspaceIdentity` e `remoteSessionId`, proibindo correspondência apenas por `workspacePath`.
- O `/remote` do celular continua reaproveitando o host existente pelo shared-host attachment, sem iniciar um runtime de ZCode Agent separado para a view de group.