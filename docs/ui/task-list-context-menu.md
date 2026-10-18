# Menu de contexto da lista de tasks

Os itens da lista de tasks recebem um novo menu de contexto, que concentra de forma unificada as ações rápidas no nível da task, evitando empilhar todas as ações nos botões de hover ou no Header more.

## Itens atuais do menu

- Pin task
- Rename task
- Archive task
- Mark as unread
- Open in Finder / File Explorer / File Manager
- Copy path
- Copy log path
- Go to config

## Explicação das interações

- `Pin task` é persistido nos metadados da task e mantém o item fixado mesmo após recarregar ou restaurar; o menu de um item fixado exibe `Unpin task`
- Tasks fixadas ficam sempre em um grupo `Pinned` separado, no topo da lista, sem se misturar às tasks comuns; continuam visíveis mesmo com a lista recolhida
- `Rename task` é concluído por meio de um diálogo, com suporte a `Enter` para enviar e fechar ao cancelar
- `Archive task` marca a task como archived e a oculta da lista padrão de tasks
- Ao passar o mouse sobre a linha da task, é exibida uma entrada de arquivamento embutida na linha; o primeiro clique entra em estado de confirmação secundária. O estado de confirmação é um estado explícito que aguarda a decisão do usuário; os botões de confirmação continuam visíveis mesmo depois que o mouse sai da linha da task; clicar em uma área vazia fora da linha da task ou pressionar `Esc` cancela o estado de confirmação.
- `Mark as unread` é persistido nos metadados da task; o ponto azul continua presente mesmo após reiniciar o app e só é removido automaticamente ao abrir a task
- A renomeação é persistida em `tasks-index.sqlite` e sincroniza os meta em memória da task em execução; a restauração e a escrita de snapshots devem respeitar [Task Title Authority](./task-title-authority.md), evitando que o raw session snapshot reverta um título manual para o título automático
- pin / unread / archive também sincronizam os meta em memória da task em execução, evitando que uma persistência posterior de session reescreva o estado antigo
- `Copy path` aponta para o caminho do arquivo de snapshot persistido da task
- `Copy log path` aponta para o caminho do log nativo correspondente à task; o ZCode Agent usa logs JSONL estruturados com rolagem por data
- `Go to config` reutiliza a preferência de editor já persistida; se não for possível abrir diretamente com o editor, há fallback para o gerenciador de arquivos