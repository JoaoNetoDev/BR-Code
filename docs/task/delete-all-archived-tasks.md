# Excluir todas as tarefas arquivadas em um clique

## Requisito e registro de confirmação

2026-09-07, confirmado após duas rodadas de grilling:

1. Excluir as tarefas arquivadas de todos os workspaces cobertos pela lista de arquivados da janela atual, incluindo os itens recolhidos a partir do 21º; não varrer projetos que já foram removidos da janela.
2. A barra de ferramentas do arquivados oferece um ícone neutro "mais" entre os filtros e o botão de fechar, mostrando no menu a quantidade de arquivados e a opção vermelha "Excluir todas as tarefas arquivadas..."; desabilitado quando a lista está vazia. Disponível tanto no Web do desktop quanto no celular, preservando a operação individual.
3. Após o clique, lê-se o conjunto completo de arquivados de cada workspace e então exibe-se uma única confirmação, mostrando a quantidade exata processável e os projetos inacessíveis. O corpo da confirmação apenas informa que as tarefas serão removidas da lista de tarefas e da lista de arquivados, sem mostrar detalhes de registros de sessão ou de retenção de arquivos; a exclusão individual de arquivados compartilha este texto, com chinese e inglês sincronizados. Cancelar não grava nenhum dado.
4. Mantém-se a semântica de exclusão atual: gravação persistente da marca deleted, remoção da lista e das referências de agrupamento; os registros de sessão do CLI, os arquivos do projeto e o worktree são preservados. Corrigir também o texto de confirmação da exclusão individual de arquivados.
5. Uma falha não bloqueia os demais itens; relatam-se as quantidades de sucesso, pulados e falhas, bem como os projetos não processados, mantendo as tarefas não excluídas para que o usuário tente novamente. Projetos offline não se conectam automaticamente, nem retomam as exclusões automaticamente após reconectar.
6. O conjunto alvo é o que existia quando a caixa de confirmação foi aberta; na execução, o estado archived é verificado novamente dentro da transação de escrita da persistência. Tarefas restauradas ou já excluídas são puladas, e novos arquivados criados depois não entram nesta operação.

## Interação e estados

```text
Visão de arquivados (escopo de workspace da janela)
  -> barra de ferramentas […] -> menu: quantidade de arquivados / excluir todas as tarefas arquivadas…
  -> escolher excluir todas -> fechar o menu -> consultar todos os arquivados (sem influência de recolhimento/ordenação da UI)
  -> caixa de confirmação: quantidade + projetos inacessíveis + descrição da remoção das listas
       | cancelar: encerrar
       v confirmar
  -> encaminhar ao source original por workspaceIdentity + remoteSessionId
  -> transação SQLite: ainda está archived e não deleted?
       | não: pular
       | sim: gravar deleted + limpar referências de agrupamento -> task_deleted
       | falha: manter, continuar com os demais alvos
  -> atualizar cache do Controller/lista do desktop; atualizar o snapshot da lista Web; exibir o resultado
```

A entrada em lote fica proibida de reenvio durante consulta, confirmação e exclusão; durante a exclusão, exibe-se o estado em processamento. O resultado é mantido no topo da lista de arquivados, e, após sucesso total, o estado vazio e a entrada desabilitada são mantidos. Quando todos os sources estão inacessíveis, exibe-se o motivo e não se abre uma confirmação de exclusão de zero itens.

### Limites de execução em lote e refresh

A exclusão em lote de arquivados usa o workspace como fronteira de requisição: `deleteArchivedTasks({ workspacePath, workspaceIdentity, taskIds })`
recebe apenas os IDs de alvo fixados na confirmação e retorna `deletedTaskIds`, `skippedTaskIds`, `failedTaskIds`, com cada alvo classificado em exatamente uma categoria.
IDs duplicados são deduplicados; um conjunto vazio não grava nem emite eventos. O contrato existente do `deleteArchivedTask` individual permanece inalterado.

```text
Antigo: a UI faz uma RPC por alvo para N alvos -> uma transação por alvo -> um evento por alvo + releitura pelo Host -> a UI reconsulta
Novo: a UI envia uma RPC por workspace -> o adapter do source original faz uma transação por item e consolida
                              -> um único task_deleted de workspace quando há itens com sucesso
                              -> Host / UI leem a lista mais recente em lote
```

O lote mantém o conjunto confirmado e não guarda um segundo conjunto de fatos sobre as tarefas nem uma fila de entrada. Cada item continua reutilizando a verificação de arquivamento dentro da transação do Repo, o tombstone e a limpeza de agrupamentos; itens com falha são revertidos de forma independente e os itens seguintes continuam. O overlay só é atualizado após o sucesso da persistência, e, ao final do lote, é publicado um evento `task_deleted` de nível de workspace sem taskId/taskMeta individuais, fazendo com que todos os observadores reliam a pertença deleted.
Apenas o source correspondente ao attachment original é processado; quando o remoteSessionId não corresponde ou o source está offline, a gravação é proibida, sem reconexão automática nem retomada das exclusões.

O Host reutiliza a atualização por eventos existente, o refresh final após mutação e o single-flight. A entrega de eventos e a resposta da RPC podem chegar em qualquer ordem; é permitida uma convergência com um número constante de leituras, mas o número de refreshes por source não pode crescer com a quantidade de alvos deste lote. A UI remove apenas os alvos com sucesso presentes na resposta, mantendo o tratamento original para itens pulados e com falha; a falha de uma RPC de workspace não bloqueia os demais workspaces.
Este contrato apenas estende o App service / Controller, sem alterar o wire App-Agent, o continuous do desktop nem o replayable do mobile.

Aceitação: ao excluir 1/8/72 itens do mesmo source, a RPC em lote ocorre uma vez cada, o evento de workspace com itens bem-sucedidos ocorre uma vez cada, e o número de leituras por partição no Host permanece constante; cobrindo sucesso misto/pulado/falha, falha total, lote vazio, IDs duplicados, mesmo caminho com identidades diferentes, source remoto offline e remoteSessionId antigo, mantendo a verificação de preservação dos registros de sessão do CLI e do rollback transacional de agrupamentos.

### Decisão de design da entrada em 2026-09-07: adoção da opção B «menu Mais»

O usuário escolheu a opção B. O protótipo de design e o registro da escolha estão no branch `prototype/archived-task-actions` (`eeb9244647`, documento `docs/task/archived-task-actions-prototype.md`); o branch oficial mantém apenas o design escolhido.

Esta rodada é uma mudança de apresentação: o `WorkspaceSidebar` fornece um slot de DOM na barra de ferramentas, e o componente de arquivados do desktop e o índice de arquivados do Web fazem o portal do menu para esse slot por meio de um controle em lote compartilhado; o conjunto de tarefas, a resolução dos serviços, a confirmação e o estado de exclusão continuam pertencendo aos componentes originais. Mensagens de sucesso/falha são exibidas na lista e não ocupam uma linha extra quando não há resultado. Fechar o menu não destrói o estado assíncrono da exclusão. O continuous do desktop / replayable do celular, o roteamento por workspaceIdentity / remoteSessionId e a lógica de persistência não têm alterações.

```text
Barra de ferramentas do WorkspaceSidebar: [filtros] [slot de ações de arquivados] [fechar]
                                   ^ portal (apenas posição de renderização)
Lista de arquivados do desktop / índice de tarefas Web
  -> controle compartilhado (quantidade, busy, confirmação, resultado) -> serviços scoped existentes
  -> estado de resultado no topo da lista
```

accepted: posicionamento do menu na barra de ferramentas, abrir o menu sem consultar/não excluir, confirmação completa após selecionar no menu, cancelar e reabrir, desabilitado no estado vazio, entrada compartilhada no Web, e validação representativa de tela estreita e temas claro/escuro. pruned: revalidação de todas as combinações de estados de Repo/Controller, pois desta rodada apenas move a entrada e os guards centrais / o roteamento permanecem inalterados. O caso TSL39 original foi atualizado para expandir o menu antes de escolher a exclusão, mantendo o estado pending.

## Impact Brief

### Feature Summary

| Campo                   | Conteúdo                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| Capability / mode       | exclusão em lote de tarefas arquivadas / planning                                       |
| Change layer            | presentation, validation, commit-effect, persistence                                     |
| Primary seeds           | WorkspaceArchivedTasksFlatSection, WebRemoteControlTaskIndex, createControllerRoutedTaskService, TaskIndexRepo |
| Out of scope            | limpeza física de sessões, arquivos do workspace, lifecycle do CLI, reconexão automática, varredura global de projetos em disco |

### UI Surface Matrix

| Cenário/entrada                | Implementação compartilhada                                                  | Estado exibido / origem padrão                                        | Validação e submissão                                                                  | Ponto de autoridade                          | Modo e isolamento                                                                                     |
| ------------------------------ | --------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Lista plana de arquivados do desktop | menu "mais" na barra de ferramentas, caixa de confirmação, resolver de serviços por workspace | useGlobalTaskList; 20 itens recolhidos por padrão              | listArchivedTasks completo; deleteArchivedTasks                                       | tasks-index do Host correspondente          | todas as tabs da janela atual; local/remote roteados pela identidade completa |
| Índice de arquivados no Web do celular | o mesmo controle em lote e interface de serviço              | snapshot de workspace-list do desktop; sem influência dos filtros de exibição | processa apenas os workspaces operáveis pelo attachment atual             | shared-host / tasks-index remoto correspondente | não é possível enviar tarefas locais para os baseServices remotos              |

### Shared And Divergent Behavior

A leitura do conjunto, a confirmação, a execução em lote por workspace e o relatório de resultados são compartilhados; a pertença do Controller no desktop e o snapshot de workspace-list do Web são atualizados separadamente. Não há herança de rascunho nem alteração de valores padrão de estado de execução. A entrada de exclusão individual mantém o comportamento existente, apenas com o texto corrigido.

### Feature Relationships / State Owners And Commit Sinks

| Nível            | Relação                                              | Motivo/evidência                                                                    |
| ---------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| must-inspect     | entrada de arquivados -> scoped task service -> Controller -> Repo | escritas entre sources devem preservar o roteamento por host e a verificação de arquivamento dentro da transação |
| must-inspect     | deleted -> task_deleted -> pertença da lista          | a sessão do CLI é preservada e não pode ser reexibida por resumos posteriores     |
| should-inspect   | exclusão -> referências de agrupamento e estado da tarefa selecionada | igual à exclusão individual, com limpeza após sucesso da transação    |
| invariant-only   | continuous do desktop / replayable do celular         | esta funcionalidade não altera stream, recuperação de snapshot, fila, owner/lease e não baixa estado para main/relay |
| evidence-only    | TSL20, fixture de autoridade de linha do task-index    | fornece evidência de regressão de preservação de sessão e de lista completa        |

### Must-Preserve Invariants

- A chave de identidade é `workspaceIdentity?.trim() || workspacePath`; os parâmetros reais de execução continuam passando workspacePath. O remoteSessionId seleciona um source existente e não pode recorrer a outro source com o mesmo caminho.
- A verificação de que a tarefa continua arquivada, a exclusão e a limpeza de agrupamentos ocorrem na mesma transação de escrita SQLite; a falha não define o overlay deleted em memória, nem publica evento de sucesso.
- Reutiliza-se apenas o attachment existente, sem criar Agent/Host/conexão remota. A UI é atualizada pelo resultado salvo por tarefa; itens com falha não podem ser removidos otimisticamente.
- Temas claro/escuro, português/inglês/chinês, confirmação e cancelamento por teclado e acessibilidade em tela estreita seguem as normas de componentes do DESIGN.md.
- `deleteArchivedTask` / `deleteArchivedTasks` pertencem apenas à interface de exclusão condicional do App service / Controller; não se adiciona comando ao wire App-Agent, não se lê nem reescreve o runtime snapshot do CLI e não se altera o clientMode injetado por attachment confiável.

### Codegraph Evidence / Graph Drift / Graph Delta

 nesta sessão não há codegraph disponível; a leitura por arquivos/símbolos e pelos chamadores diretos foi usada como alternativa, com escopo de duas camadas. Foram conferidos os dois pontos de entrada do Sidebar, o Service adapter, o Repo, o roteamento do Controller e os testes. O grafo existente não tem semântica de exclusão em lote de arquivados; foram adicionadas a capability confirmada pelo usuário, as duas entradas e as arestas de persistência. A validação dos novos nós, arestas e seeds de arquivo passou; as referências ausentes preexistentes `capability.mcp-oauth-authorization` e `persistence.desktop-user-data-root` não foram ampliadas nesta rodada.

### Unresolved Questions

Nenhuma; o usuário concordou com todos os limites acima.

## Planejamento de casos e handover

O domínio principal é UI, persistência e isolamento de workspace. As dimensões são quantidade de tarefas 0/1/mais de 20, confirmação/cancelamento, mudança de estado de arquivamento, sucesso/falha/offline, além de desktop/Web.

| Case           | Setup -> Action                                                                        | Assertions                                                                                             | Evidência / status                              |
| -------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| TSL39          | 25 tarefas arquivadas + tarefas comuns; clicar em lote, cancelar e confirmar de novo    | a quantidade da confirmação inclui itens recolhidos; cancelar não grava; todos os arquivados ficam deleted, os comuns são preservados, a UI fica vazia e desabilitada | SQLite real + E2E do desktop pending            |
| TSL39-guard    | mesmo caminho com identidades diferentes; restaurar/acrescentar arquivados após a confirmação; exclusão repetida | exclui apenas o conjunto confirmado e ainda arquivado; restaurar/já excluídos são pulados; isolamento de identidades | testes focados de Repo/adapter                  |
| TSL39-partial  | um source inacessível, uma task com falha de escrita                                   | os itens não processados são explicitados; os demais continuam; itens com falha são preservados e não há transmissão de sucesso | orquestração em lote + testes focados do Repo    |
| TSL39-web      | entrada de arquivados no Web, escopo gravável do attachment misturado com escopo somente leitura | o mesmo comportamento de confirmação/exclusão completa; itens bem-sucedidos são removidos do snapshot e sources não autorizados não são chamados | UI Web / testes focados do controle compartilhado |

accepted: os casos acima. pruned: todas as combinações de provider/Goal/queue/ferramentas/tema com o estado de exclusão (a exclusão só altera a pertença); tema/locale usam validação representativa de UI e a fronteira de stream mantém a regressão existente. undefined: nada. bug-candidate: a antiga caixa de confirmação afirmava erroneamente que os dados de sessão eram limpos; isso é corrigido agora.

O Catalog e o coverage matrix registram o TSL39; o novo E2E permanece em manual-review/pending e não é promovido automaticamente. Usa-se o isolamento de dados do fixture existente de cold-start do tasks-index, sem necessidade de requisição de modelo; o replay de provider usa apenas o common fixture; sem fluxos de modelo temporais nem mudanças de Docker admission.

## Registro de verificação

### Correção de refresh em lote de 2026-09-17

- A linha de base da causa raiz é `d1e524b2df`: a UI chamava a exclusão condicional individual por alvo, fazendo com que cada submissão fosse transmitida separadamente e forçasse a releitura das partições do Host.
  A correção passou o lote até o serviço original de workspace, deixando o adapter manter a transação por item, consolidar os resultados e notificar apenas uma vez.
- Regressão de 1, 8 e 72 itens na mesma orquestração de UI / fronteira do Controller: as requisições de exclusão foram sempre uma, e as leituras internas de partição do Host convergiram de 3, 24 e 216 para 3, 3 e 3. O source desse teste usa um fixture observável; o Repo / adapter reais validam separadamente sucesso misto/pulado/falha, IDs duplicados, lotes concorrentes, isolamento de identidade e a ausência de transmissão quando não há itens bem-sucedidos.
- 181 testes relacionados passaram em lotes, incluindo o menu Web, o refresh por evento em lote no nível do workspace com tombstone, a recusa de escrita pelo Controller para offline/remoteSessionId antigo, e a não alteração do resultado já submetido quando o refresh falha; `pnpm typecheck`, `pnpm lint` (52 avisos preexistentes, 0 erros) e `pnpm architecture:check --changed` passaram.
- O E2E pending do desktop `desktop-e2e-20260917044517738-p61874-adfc3f6d1db019f0` passou, com 25 exclusões, cancelamento, estado vazio, tarefas comuns e preservação da sessão do CLI verificados. Comparando com a execução da linha de base do mesmo caso `desktop-e2e-20260917040534711-p42824-ae8a264ab2d3c00d`, considerando a janela de execução de 100 ms antes da primeira RPC de exclusão até 500 ms após a última, as RPCs de exclusão foram de 25→1, as cinco consultas de pertença de 25→1 e as consultas do Controller de 26→2.
  Nesta rodada o serviço consolidou requested=25, deleted=25, skipped=0 e failed=0; esses números não equivalem a uma referência de tempo entre ambientes.
- A auditoria de cobertura ainda aponta 10 erros de documentação preexistentes, item a item idênticos à linha de base original isolada; nada foi ampliado nesta correção.
  O shared-host real do celular, a desconexão entre máquinas e Windows/Linux ainda não foram retestados em hardware real, e o E2E continua pending.

### Verificação inicial de 2026-09-07

- 143 testes unitários relacionados passaram: gravação completa/cancelamento sem escrita, falha parcial, verificação de arquivamento, exclusão repetida, rollback transacional, isolamento entre identidades com o mesmo caminho, roteamento do Controller, entrada Web e estado vazio.
- O E2E pending do desktop passou: 25 tarefas arquivadas excluídas por completo, cancelamento sem gravação, tarefas comuns e sessão do CLI preservadas, estado vazio de sucesso e entrada desabilitada. ID da execução: `desktop-e2e-20260907102609958-p94926-cacb5afb92b7b9fc`.
- O desktop e o CLI atuais foram reconstruídos. A primeira inicialização falhou por causa do cache temporário do ChromeDriver sem binário, e a execução foi feita após restaurar o cache. O teste cancelou o diálogo e esperou a desmontagem da animação de saída, evitando clicar no botão de confirmação antigo; a execução final reaproveitou a mesma build atual do desktop.
- `pnpm typecheck`, `typecheck:e2e` do desktop, `pnpm lint` e a auditoria de cobertura de conversas passaram; o lint tem 43 avisos preexistentes e nenhum erro novo.
- Foram vistas as capturas de tela da caixa de confirmação em chinês no tema escuro e do estado vazio após a exclusão. O controle remoto shared-host real do celular, a queda real de SSH/WSL/Docker, a UI real em Windows/Linux e no tema claro ainda não foram revalidados; o código relacionado foi implementado seguindo componentes compartilhados, isolamento de identidade e os limites de entrega existentes — testes focados não equivalem a essa cobertura em hardware real.

### Verificação de implementação da opção B

- 18 testes de UI/orquestração passaram: portal na barra de ferramentas, abrir o menu sem consultar/excluir, desabilitado durante a confirmação, cancelar e tentar de novo, resultado dentro da lista, e remoção do snapshot de tarefas pelo índice Web após a exclusão, mantendo a entrada desabilitada.
- O desktop e o CLI atuais foram reconstruídos. O E2E pending do desktop passou, ID da execução: `desktop-e2e-20260907110058327-p25062-fe50e38b20b124f9`; revalidação do menu por teclado: `desktop-e2e-20260907-111050-819`. A confirmação completa dos 25 itens, o cancelamento, a exclusão real, a preservação de tarefas comuns e da sessão do CLI e o estado vazio passaram.
- A revisão das capturas de tela revelou que a rolagem automática de elementos do ChromeDriver desloca horizontalmente em 65 px o contêiner interno com `overflow-hidden` do painel lateral. O registro geométrico em execução mostra body/viewport com 1200 px e a sidebar com 264 px; após esperar a entrada ser habilitada, todos os offsets de rolagem horizontal eram 0 ao abrir o menu pelo teclado, e a captura ficou completa. O E2E adotou esse caminho por teclado e removeu a saída de diagnóstico temporária.
- `pnpm typecheck`, `typecheck:e2e` do desktop, `pnpm lint` (43 avisos preexistentes, 0 erros), a auditoria de cobertura de conversas e a verificação do YAML do grafo e das seeds de exportação atualizadas passaram.
- As capturas de hardware real desta rodada são do desktop em chinês no tema escuro; a validação 390×844 em inglês no tema escuro do protótipo B permanece no branch do protótipo. O controle remoto shared-host real do celular, Windows/Linux e o tema claro em hardware real ainda não foram revalidados, e os testes de componentes não foram tratados como essas coberturas.