# Bootstrap de workspace de tarefas agrupadas

> Documento histórico: a refatoração de projetos virtuais de 2026-09 substituiu o modelo de execução descrito aqui. O comportamento atual segue o[design de projetos virtuais](superpowers/specs/2026-09-09-virtual-project-design.md). A antiga tabela Group foi mantida apenas como evidência de migração/degradação; a API de execução, as visualizações e o bootstrap de workspace foram removidos; a CLI possui a verdade da sessão, e o Host possui o projeto e os estados de organização. O texto abaixo serve apenas como registro de design histórico.

A visualização de tarefas agrupadas inicializa as tarefas visíveis existentes por workspace.

## Comportamento

- Na primeira consulta da visualização agrupada que executa o bootstrap de workspace, as tarefas visíveis nos escopos atuais são movidas para grupos de workspace gerados.
- Tarefas concluídas com mais de sete dias nos escopos atuais são arquivadas antes de o bootstrap de workspace ler as tarefas visíveis.
- O título do grupo gerado usa a folha do caminho do workspace, como `z-code`.
- O id do grupo gerado é determinístico a partir de `workspaceIdentity || workspacePath`, de modo que a identidade remota do workspace permanece isolada da exibição do caminho local.
- A cor do grupo gerado é distribuída de forma determinística na paleta não cinza, a partir da mesma chave de workspace.
- O grupo gerado recebe a ordenação agrupada de nível superior.
- As tarefas dentro do grupo gerado recebem a ordenação de membros do grupo por atividade recente.
- Grupos de workspace gerados só são exibidos quando o respectivo workspace faz parte do escopo atual da visualização agrupada.
- Escopos de workspace com `workspacePurpose=conversation` participam das consultas de tarefas agrupadas, mas são excluídos do bootstrap de grupos de workspace. Suas tarefas começam como tarefas não agrupadas de nível superior e podem ser movidas para grupos comuns do usuário.

## Limites

- O bootstrap ignora a associação de grupo existente e reconstrói a associação atual de tarefas visíveis por workspace.
- O arquivamento automático durante o bootstrap é independente das configurações e usa uma janela fixa de retenção de sete dias.
- O bootstrap de workspace grava um marcador global após a inicialização, de modo que apagar ou desagrupar grupos gerados não faz com que sejam recriados na próxima atualização.
- Novos workspaces que surgirem depois deste bootstrap único não recebem grupos de workspace gerados automaticamente.
- O diretório de backing da conversa gerenciada nunca pode criar um grupo gerado nomeado a partir da folha `default` de seu caminho interno.
- No modo agrupado, clicar em New task da barra lateral global cria uma linha de rascunho apenas de UI no nível superior.
- No modo agrupado, clicar em uma entrada New task de nível de grupo cria a linha de rascunho apenas de UI no topo daquele grupo.
- Cliques repetidos na mesma entrada New task reutilizam a linha de rascunho atual. Clicar em uma entrada New task diferente reposiciona essa mesma linha de rascunho para o posicionamento solicitado mais recente.
- A linha de rascunho agrupada não é persistida, não pode ser renomeada, não pode ser arrastada e desaparece quando o usuário a abandona.
- Quando o primeiro prompt cria uma tarefa real, a tarefa real herda o posicionamento da linha de rascunho antes de a ordenação agrupada ser persistida.
