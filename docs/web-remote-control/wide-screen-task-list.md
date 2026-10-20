# Lista de tarefas do remote Web em tela larga

## Limite atual do diretório de projetos (2026-10-13)

Tela larga e tela estreita já compartilham o `ProjectSidebar`. A sidebar, a edição de projetos, a seleção de projeto no campo de entrada e o diretório de arquivamento devem usar o diretório de projetos que controla a janela do desktop: os projetos locais mais as entradas de projetos remotos retidas localmente. Entrar em uma task remota, criar um rascunho remoto ou recarregar a página não pode substituir esse conjunto pelo conjunto completo de projetos do próprio Source, nem exibir projetos remotos não adicionados.

O attachment remoto `web-remote-replayable` oferece, sobre o RPC original, a capacidade de diretório da janela como um conjunto opcional: `window-project`, `window-remote-projects` e `window-project-changes`. Os dois primeiros reutilizam o ProjectService/RemoteProjectService da janela; o terceiro oferece apenas a notificação de mudanças de projeto e a verificação de prontidão, sem expor escrita de broadcast genérica. O Host monta por attachment após confirmar o grupo completo de serviços; o conjunto de serviços compartilhado do Source não é modificado. `project`, `remote-projects` e `broadcast` originais continuam pertencendo ao workspace atual, e as chamadas de menção de arquivo/sessão, salvamento de workflow, automação e diretório de configuração mantêm a semântica original.

O bridge-ready declara as capacidades explicitamente, e o Web só cria e valida o grupo completo de proxies quando a declaração diz que há suporte. Clientes antigos sem a capacidade seguem o caminho original, e o comportamento antigo não é contado como corrigido; declarar suporte e ainda assim faltar serviços deve gerar erro, sem degradação silenciosa. A leitura do diretório, a modificação e a assinatura de mudanças precisam selecionar o mesmo grupo de serviços. A troca de bridge assina novamente os novos proxies, e resultados atrasados ou respostas pós-desmontagem não podem ser submetidos. O pin/archive de tasks continua passando pelo Controller da janela, e o conteúdo de arquivos continua roteado por workspace identity.

O bridge pendente na verificação de capacidades precisa participar da reexecução dos frames não confirmados após a recuperação do transporte, sem poder ser bloqueado pelo estado degradado de um bridge active antigo. A reexecução mantém a deduplicação por número de sequência e o prazo de espera original; os serviços só são publicados depois que a verificação de capacidades tem sucesso.

```text
Mesmo shared-host attachment
  ├─ window-project / window-remote-projects / window-project-changes → owner do diretório da janela
  └─ project / remote-projects / broadcast → owner do Source atual
```

Nenhum attachment, Agent runtime, cache persistente ou migração de banco de dados novo; a atribuição de conta, o remontagem de Root, a semântica continuous/replayable e a semântica da fila de tasks não mudam.

Regressão MRO02: preparar projeto local, pin, projeto remoto já adicionado e projeto remoto não adicionado; a coleção visível permanece inalterada ao abrir local/remotamente e ao recarregar; sincronização de mudanças de projeto da janela, leitura/escrita no mesmo owner e isolamento das consultas de menção dentro do Source. Cobre tela larga e 390px, pt/en, temas claro e escuro; erros de RPC de capacidade, liberação da assinatura e respostas atrasadas são verificados por testes direcionados, e a conexão remota real é evidenciada separadamente.

## Diretório e estado em tempo real

A árvore de projetos continua sendo determinada pelo app db do Host quanto ao conjunto de linhas, atribuição e pin/arquivamento. O Controller apenas fornece a atividade em tempo real das linhas existentes, sem alterar o conjunto de linhas ao entrar em um contexto remoto. A visão de projetos, o que foi atualizado recentemente, o menu de projetos do campo de entrada e o gerenciamento de arquivamento compartilham o ProjectDirectoryProvider; a seleção de serviços não cria uma segunda árvore, estado não lido ou preferência de ordenação.

O desktop comum continua lendo o diretório base local; a bridge Web local mantém os serviços originais. O file IO, o corpo da task, as menções e a configuração no scope remoto mantêm o isolamento de identidade do Source. A home/chat do celular e o layout de tela larga apenas determinam a apresentação, não o owner do diretório.

## Limites de verificação

- Testes de contrato e de RPC verificam o grupo de capacidades, o owner de leitura/escrita, o filtro de eventos, a compatibilidade com a versão antiga, a falha de prontidão e a liberação da assinatura.
- Testes de UI verificam a seleção de serviços do mesmo grupo, a troca de bridge e as respostas atrasadas, a visibilidade na primeira exibição e as chamadas adjacentes ao Source.
- O caso Web controlado MRO02 usa o serviço de projetos real e SQLite isolado, cobrindo tela larga e estreita, pt/en e temas claro e escuro.
- Os casos Electron e de contêiner SSH independente rodam pelo Window Host, Source, bridge e relay reais; usam apenas projetos/rascunhos, sem chamar o modelo. O resultado do bridging controlado não substitui a evidência dessa cadeia principal.
- Casos pending não são promovidos automaticamente nem entram na admissão formal/Docker.

Verificação de 2026-10-13: os oito grupos Web controlados do MRO02 passaram; o ida e volta em tela larga e estreita com Electron real + Source SSH Linux independente + relay loopback passou (`r3-server-wrc-directory-20261013-p2d`). A consulta de projects no workspace do Source ainda retorna apenas o conjunto completo de projetos dele, e o diretório da janela mostra somente as entradas retidas localmente; conta e onboarding continuam pertencendo ao Source. O celular real, Windows/WSL não são cobertos por esse resultado.
