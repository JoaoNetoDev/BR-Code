# Design de Workspace de Conversa Não-Projeto

## Objetivo

Novos usuários não precisam mais escolher um projeto primeiro, e `~/ZCodeProject` não é mais criado automaticamente. O app passa a usar internamente um workspace de backing de conversa estável:

```text
workspacePath = <dataBaseDir>/.zcode/workspace/default
workspacePurpose = conversation
selectedProject = null
```

O `dataBaseDir` padrão é o home do usuário, portanto o caminho padrão é `~/.zcode/workspace/default`. Esse diretório fornece o cwd real de que o Agent, a sessão, o terminal e as ferramentas de arquivo precisam, mas não é exibido ao usuário como projeto. Todas as conversas fora de projeto compartilham esse diretório; nesta fase não é implementado um diretório por conversa nem o recycle de Agent, o registro de diretórios e o GC correspondentes.

## Estado e Limites

É adicionado `WorkspacePurpose = "project" | "conversation"`. Dados antigos sem esse campo são tratados como `project`. O purpose expressa apenas classificação de produto e não muda a workspace identity:

```text
workspaceKey = workspaceIdentity?.trim() || workspacePath
```

O conversation workspace local não sintetiza `workspaceIdentity` e não modifica o ZCode Protocol do App/Agent. O purpose precisa existir na workspace session, tab, task meta, task-index e na descrição de remote workspace do Web que pertencem ao app, para que recuperação, consulta e exibição usem os mesmos fatos.

No start local do desktop, primeiro garante-se de forma idempotente o conversation backing directory, compartilhado pelas conversas fora de projeto e pelo fallback de cwd de spawn do Agent para qualquer workspace de histórico inválido; quando há um projeto real, apenas o diretório é criado, sem ativá-lo como workspace atual. Em seguida há dois caminhos:

```text
ensure conversation backing directory
  -> há workspace session recuperável
  -> restaurar o descriptor original e o active index

ensure conversation backing directory
  -> não há workspace session recuperável
  -> Main pré-aquece esse caminho
  -> Renderer ativa um tab interno com purpose=conversation
  -> o composer pode disparar imediatamente
```

O Main é a autoridade do primeiro bootstrap; o Renderer só consome o descriptor completo, ou faz o ensure idempotente quando o usuário muda explicitamente para o modo fora de projeto. Não é permitido que Main e Renderer aloquem diretórios padrão diferentes.

## Arquitetura de Informação da Barra Lateral

O primeiro nível continua sendo `分组 / 项目`, sem adicionar um primeiro nível "任务". A visão `项目 + 按项目` contém duas sections de segundo nível ordenáveis:

```text
已置顶                         仅有数据或加载中时显示
项目             [drag]    [chevron] [+]
  Workspace A
  Workspace B
任务             [drag]    [chevron] [MessageCirclePlus]
  非项目任务
```

- Na primeira vez, com preferências antigas ou dados corrompidos, a apresentação padrão é "项目 → 任务"; o usuário pode trocar a ordem arrastando pelo handle dedicado na linha do título, e a ordem é persistida nas preferências locais do renderer. Os dois títulos sempre aparecem e expandem/colapsam de forma independente; listas vazias mostram respectivamente "尚未打开项目" e "还没有任务".
- O handle de arraste é independente do trigger de colapso e das actions à direita; a ordenação funciona com mouse, toque e teclado. Uma section vazia ou colapsada ainda pode ser movida inteira, e seu estado expandido e seu conteúdo acompanham a section, sem limpar a ordenação ou o cache de workspaces/tasks.
- A linha do título fora do título e das actions à direita é o trigger de colapso; expandido mostra uma seta para baixo, colapsado mostra uma seta para a direita. A seta e as actions aparecem por padrão apenas no hover, mantendo um fallback visível em `focus-within` de teclado, menu aberto e dispositivos sem hover; a action é sibling do trigger e não dispara o colapso.
- O ícone à direita de "任务" chama o mesmo fluxo `startDraft`, mas o target é fixo no conversation backing workspace e não pode herdar o projeto ativo atual.
- As tasks em "任务" usam rows comuns de linha única, sem exibir o nome de diretório `default` do backing workspace interno e sem exibir o ponto cinza de idle comum, que não tem significado de negócio; estados não lidos, de erro e em execução continuam reutilizando o leading indicator compartilhado.
- O menu `+` à direita de "项目" contém apenas "打开文件夹" e "远程连接", reutilizando as ações existentes do Root; itens indisponíveis são ocultados por capability.
- O estado expandido das duas sections e o `sectionOrder` são persistidos na preferência local do renderer `zcode-sidebar-purpose-section-preferences`, usando valores padrão na primeira vez, em dados corrompidos ou quando o storage está indisponível; as actions à direita não alteram o estado expandido. Preferências locais não entram no Host/Agent e não exigem sincronização em tempo real com outras janelas já abertas.
- O `Expand all` / `Collapse all` do topo, na visão por projeto, controla simultaneamente a section "项目" e todas as rows de workspace, sem afetar "任务"; colapsar a section não limpa o estado expandido das rows de workspace, o cache de tasks nem a ordem de DnD.
- O "新建任务" global do topo e o atalho de teclado continuam usando o workspace ativo atual.
- A lista de conversas contém apenas tasks `purpose=conversation` não fixadas e não arquivadas; a quantidade padrão de collapse e o "显示更多" seguem o padrão da lista de workspace único.
- Uma conversation task fixada aparece apenas em "已置顶"; ao desfixar, ela volta para "任务". Uma conversation task arquivada aparece apenas na visão de arquivados.
- As preferências existentes `按项目 / 时间线` e `Created / Updated` são mantidas; a linha do tempo continua agregando todos os purposes.

É obrigatório separar os dois escopos, proibindo filtrar as fontes de tasks cedo demais só para esconder o workspace interno:

```text
allTaskWorkspaceTargets = project + conversation
  -> pinned / conversation / grouped / timeline / archived
  -> sessions-index / service resolver / task actions

projectWorkspaceTabs = purpose=project
  -> project section / workspace DnD / expand-collapse / empty state
```

`workspaceTabs.length === 0` não pode servir de condição de retorno antecipado para toda a área de tasks. Mesmo sem projetos reais, o conversation backing target ainda precisa participar da consulta de tasks, e a visão Group precisa ser montada.

## Semântica de Agrupamento

- Uma task comum fora de projeto é por padrão uma task não agrupada no topo do Group e pode entrar em qualquer group comum por arraste ou menu.
- O group membership, a ordenação, a renomeação, o arquivamento e o estado não lido de uma conversation task usam o mesmo task service das tasks de projeto.
- Fixadas/arquivadas continuam sendo excluídas da lista de Groups ativos pelas regras de membership existentes; ao desfixar, a task recupera seu group membership original.
- O bootstrap de workspace só gera grupos de projeto para o escopo `purpose=project`; é proibido gerar, para o backing path, um group automático chamado `default` ou com o texto antigo/novo de usuário "对话 / 任务".
- O sessions-index, a estrutura, o membership, o overlay otimista e a busca de service do Group devem usar `allTaskWorkspaceTargets`.

## Interação de Workspace no Composer

- A ordem do menu de workspace é "打开文件夹 → 远程连接 → 不在项目中工作".
- O trigger no estado de conversa exibe "选择项目" e não exibe botão de fechar; "不在项目中工作" aparece como checked, e repetir a seleção é no-op.
- O estado de draft de projeto exibe um botão de fechar independente no hover e em `focus-within`; ao clicar, muda-se para o conversation backing workspace, sem fechar a tab do projeto e sem abrir o menu.
- O botão de fechar só vale para drafts não enviados; uma task já criada não muda de workspace.
- A troca deve primeiro garantir que o workspace de destino está disponível e só então mudar o active target. Em caso de falha, mantém-se o workspace e o draft originais e exibe-se um erro re-tentável.
- A seleção de projeto usa `{ workspacePath, workspaceIdentity?, workspacePurpose }`; não é permitido casar remote workspace apenas por path.
- O purpose de conversa oculta o seletor de branch Git; a árvore de arquivos, o terminal e a cópia de path continuam usando o workspacePath real.

## Multiplataforma e Ciclo de Vida

- O Desktop continua usando `desktop-continuous`, e o conversation backing workspace reaproveita um runtime local.
- O `/remote` do celular continua usando `web-remote-replayable` e shared-host attachment, sem criar um novo runtime de Agent local/remoto.
- Quando o celular já tem uma conversation attachment, é possível criar uma nova conversa; sem attachment a ação fica indisponível, com aviso para criar primeiro no desktop.
- Relay e desktop main não ganham novo estado de negócio de task/session/queue/snapshot.
- Fechar tab, arquivar ou deletar task não deleta o backing workspace nem os arquivos do usuário dentro dele.
- O mkdir em multiwindow, cliques duplicados e a recuperação precisam ser idempotentes; quando o caminho está ocupado por um arquivo, falta permissão ou o disco está cheio, não se pode entrar em um estado de ativação parcial.
- A partição de task e o rótulo de workspace de conversa com purpose de conversa são exibidos uniformemente como "任务", sem vazar o nome interno da folha `default`; outros textos, como o processo de conversa e o badge de workspace kind do celular, não estão no escopo desta renomeação, exceto a semântica de path na UI.

## Accepted / Pruned

Accepted: falar direto no primeiro start, backing path compartilhado e estável, troca de draft entre projeto e fora de projeto, sections de segundo nível "任务/项目", comportamento de pinned/grouped/timeline/archive de tasks sem projeto e limites Desktop/Mobile shared-host.

Pruned: diretório por conversa, mudar tasks existentes de projeto, criar runtime próprio no celular, disfarçar conversation como workspace de projeto e substituir o purpose explícito por prefixo de path.