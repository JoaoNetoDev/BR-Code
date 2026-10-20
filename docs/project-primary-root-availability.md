# Estado do painel lateral quando o diretório principal do projeto fica indisponível

## Comportamento

Quando o diretório principal já configurado de um projeto é excluído, movido ou passa a ser um arquivo comum, o título do projeto mantém a dica esmaecida, mas ainda é possível expandir/recolher as tarefas existentes com mouse, teclado e toque e ver as mensagens do histórico; os botões embutidos «Nova tarefa» e «Ver arquivos» ficam no estado desabilitado, sem criar rascunhos nem abrir a árvore de arquivos. Somente os dois botões mostram a dica no hover: **O diretório principal deste projeto foi excluído ou movido**; o hover ou o foco na linha do projeto e no título não exibe a dica de diretório indisponível. As entradas «Nova tarefa» e todos os itens «Ver arquivos» do menu de contexto também ficam desabilitados. A entrada direta de root único e o menu de diretórios de múltiplos roots usam as mesmas regras; quando o diretório principal está indisponível, mesmo que os diretórios adicionais existam, não é possível abrir a árvore de arquivos a partir do projeto.

O projeto continua no painel lateral, o ponto de não lidas é preservado, as entradas de edição/exclusão/fixação continuam disponíveis e o usuário pode editar a pasta de origem. A falta de diretórios adicionais não desabilita o projeto; projetos com zero root ainda podem ser criados, e o Host atribui o diretório padrão conforme as regras existentes. O cwd, a atribuição, o corpo e a estratégia de restauração de inicialização das tarefas existentes não mudam por causa deste recurso.

## Estado e atribuição

```text
Primeira leitura da lista de projetos / alteração de projeto / foco da janela
  → o ProjectService do Host proprietário lê o snapshot do projeto
  → deduplica pelo diretório principal, stat assíncrono
  → VirtualProject.primaryRootStatus projeção somente leitura
  → o painel lateral aceita o resultado da requisição mais recente
      available / sem campo → entrada normal
      missing            → título esmaecido, mas expansível; proíbe nova tarefa/ver arquivos + dica de exclusão ou movimentação
      unavailable        → título esmaecido, mas expansível; proíbe nova tarefa/ver arquivos + dica de inacessibilidade

Expansão do título → owner da preferência de recolhimento original → leitura das linhas de tarefas e das mensagens do histórico (sem depender da existência do diretório principal)
Requisição de nova tarefa → mesmo Host prepareSession reexamina o diretório principal → só retorna cwd se estiver disponível
```

- `primaryRootStatus` é um `available | missing | unavailable` opcional, derivado em tempo real pelo Host ao qual o diretório pertence; não é gravado em SQLite/settings/cache de entradas remotas e não introduz migration. Quando o Server antigo não devolve esse campo, o comportamento antigo é preservado.
- `ENOENT`, `ENOTDIR` e caminho existente que não é diretório são tratados como missing; outras falhas de stat são tratadas como unavailable, sem reportar falsamente que o diretório foi excluído.
- Projetos com zero root e sem diretório principal não são marcados como missing; quando o diretório principal configurado fica indisponível, não se pode recriar o caminho original com mkdir, nem escolher outro diretório adicional, nem recorrer a uma tarefa global.
- Cada readTree/readProjects reexamina o estado; não há cache permanente nem polling. Depois que o diretório é restaurado ou o diretório principal é editado, a próxima atualização restaura a entrada. A UI atualiza no focus, usando o número de sequência da requisição para descartar respostas tardias.
- prepareSession reexamina antes de retornar o cwd, recusando a invalidação entre o refresh e o clique; a falha não altera os roots do projeto nem as tarefas existentes. Mudanças no sistema de arquivos após a checagem final ainda são reportadas pela própria entrada de execução.
- Diretórios remotos são verificados apenas pelo attachment de Host remoto já existente; não se faz stat de caminhos remotos na máquina local e não se criam conexão/Host/Agent. O shared-host do celular lê o mesmo estado, e os limites do fluxo de mensagens do desktop continuous e do mobile replayable permanecem os mesmos.
- No tema claro e escuro, o título mantém o mesmo grau de esmaecimento, mas sem `disabled`/`aria-disabled` de diretório indisponível; o próprio botão recebe o foco por teclado, evitando foco duplicado. Os botões de nova tarefa e ver arquivos mantêm a semântica de desabilitado. Host remoto offline continua respeitando a restrição original de não expansão.
- A existência do diretório principal restringe nova tarefa e ver arquivos; o estado de recolhimento continua sendo mantido pelo owner original das preferências do painel lateral, e invalidação e restauração não forçam o recolhimento. O clique no histórico reaproveita a cadeia original de seleção de tarefa/restauração somente leitura, não modifica o cwd e não recria diretórios para a navegação somente leitura.

## Aceitação

1. Após mover o diretório principal de um projeto de root único ou duplo: o título fica esmaecido, mas continua expansível/recolhível e abre as mensagens reais do histórico; as ações embutidas e de menu de contexto de nova tarefa e ver arquivos ficam desabilitadas, com a dica correta; mesmo com os diretórios adicionais presentes, não é possível abrir a árvore de arquivos nem criar tarefa, e a entrada de edição continua disponível.
2. Depois de devolver o diretório ao lugar, a atualização no focus restaura a entrada; apenas diretórios adicionais ausentes ou projetos vazios não acionam a desabilitação do diretório principal.
3. Testes unitários em um Host real validam missing/arquivo comum/restauração, a reexaminação de prepareSession e a ausência de efeitos colaterais; o roteamento remoto não sonda caminhos na máquina local.
4. E2E pendente `conversation-session-project-missing-primary-root.test.ts` cobre a remoção/restauração real do diretório, a atualização da janela, o hover, o menu de contexto, os temas claro e escuro e o layout estreito; o layout estreito não equivale à validação real de shared-host no celular.
