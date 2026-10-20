# Linha de inserção ao arrastar projetos

## Comportamento

- Ao arrastar um projeto da barra lateral sobre outro projeto ordenável, exibe-se uma linha azul de 2px na borda do alvo, com um círculo vazado de 8px na extremidade; usa o token de tema `icon-blue` e se estica à esquerda e à direita conforme a largura da barra lateral.
- A ordenação para cima é exibida antes do projeto alvo e a ordenação para baixo, depois do projeto alvo; a posição acompanha a animação de movimento do slot de ordenação original, projetos expandidos são exibidos pelo limite do nó inteiro do projeto e não podem cair dentro de linhas de tarefa.
- Só exibe ordenação de projetos válidos dentro da mesma seção fixada no topo (pode atravessar Host); a posição original, projetos não ordenáveis e o arraste nativo de tarefas não exibem nada. O ponteiro e o teclado compartilham a mesma dica, e soltar ou pressionar Escape cancela e limpa imediatamente.
- A linha de inserção não ocupa layout, não intercepta o ponteiro e é oculta para tecnologias assistivas; preserva o colapso de projetos, o menu, a entrada de arquivos e a animação de ordenação original.

## Propriedade e limites

A exibição é derivada diretamente do active / over / index existentes do `useSortable`, sem adicionar estado React, temporizadores ou campos persistidos. Hoje a preferência da barra lateral no lado de controle é o único owner da ordem de exibição; o envio reutiliza preferences.reorder, salvo por (hostId, projectId), o local e o remoto offline podem ser misturados e não grava position remota.

```text
Ponteiro / teclado → dnd-kit active + over → linha azul na borda do alvo
                                    → soltar → preferences.reorder → lado de controle → readTree
                                    → Escape → limpar estado transitório
```

Desktop e celular compartilham o ProjectNode; não altera os limites de shared-host, workspaceIdentity, desktop continuous ou mobile replayable, e não envolve protocolo nem migration. A aceitação é feita com os dois temas e o layout de tela estreita, e não se deve tratar a simulação de desktop de 390px como equivalente à verificação real de controle remoto por celular.

## Aceitação

Estende o E2E pending do VP31: nenhuma linha de inserção antes do arraste; o arraste com ponteiro para baixo e o arraste por teclado para cima exibem respectivamente o único alvo correto e a direção correta; verifica a espessura da linha, a cor do tema, o círculo vazado e os limites de layout; limpeza após cancelar e enviar, e a ordem é preservada após recarregar. As capturas cobrem os temas claro e escuro e o layout de 390px.

## Registro de verificação (2026-09-15)

- Electron `desktop-e2e-20260915035627450-p99736-fbdae0bb806b2ae3`: 6/6 aprovados; as capturas da linha de inserção em Zai Light e Zai Dark a 1200px / 390px foram verificadas. Em tela estreita, primeiro aguarda-se a conclusão da política automática de recolhimento existente e depois a barra lateral é reaberta pelo botão.
- No aplicativo de desenvolvimento real, confirmou-se via CDP que a linha de inserção é exibida durante o arraste e que o Escape limpa; nenhuma alteração de ordem de projetos foi enviada.
- `pnpm typecheck`, `pnpm lint`, `typecheck:e2e` do desktop, verificação de fixtures e checagem incremental de arquitetura do HEAD passaram. O lint mantém 48 warnings existentes; a checagem de arquitetura de toda a branch já tinha, no início do trabalho, `resolveConversationWorkspaceTarget.ts` como unmanaged-new-file, sem relação com esta alteração.
- Os casos permanecem pending; não foram executados shared-host real de celular, SSH/WSL nem GUI em Windows/Linux. desta vez apenas a exibição de UI foi modificada, sem alterar comunicação de host e persistência.

## Orçamento de renderização do arraste (2026-09-15)

Trace do usuário Trace-20260915T121805: na inicialização, 41 projetos foram renderizados consecutivamente por 4 rodadas, com 656 renderizações de ControlHintTooltip; a tarefa mais longa na thread principal foi de 1410ms, o layout cerca de 6ms e o restante principalmente React e registros de depuração DEV. A causa é que a atualização de context do useSortable entra diretamente no conteúdo completo do projeto.

- O invólucro de ordenação do ProjectNode recebe exclusivamente a assinatura do useSortable, a ref do nó, o deslocamento e a linha de inserção; título/menu de ações/conteúdo de tarefas viram limites de memo independentes e não assinam o context de arraste. Apenas a ref do activator, os listeners e os attributes estáveis são passados ao título; a mudança de estado de ativação no máximo re-renderiza o conteúdo do projeto atualmente ativo, e o conteúdo dos projetos alvo e das testemunhas continua sendo reaproveitado.
- Mantém-se a comparação rasa normal das props: mudanças em projeto, tarefa, disponibilidade, colapso e callbacks devem atualizar prontamente; não se usa comparador que ignore funções, não se guarda uma segunda cópia dos dados de projeto e não se mascara o travamento com atraso ou desligamento dos registros de depuração.
- Os data de ordenação mudam apenas com hostId/pinned. Mantém-se a determinação da mesma seção fixada no topo, permitindo atravessar Host, ARIA de teclado, arraste nativo de tarefas e o deslocamento do bloco inteiro de projetos expandidos.

```text
Ponteiro/Teclado → DndContext → invólucro do ProjectNode (transform / linha de inserção)
Projeção do projeto / callbacks de ação ──────────→ conteúdo memo do projeto (título / menu / tarefas)
Soltar → preferences.reorder → preferência da barra lateral no lado de controle; Escape → limpar estado transitório
```

Aceitação: teste unitário simulando ativação, movimento, troca de alvo e cancelamento de 41 nós, sem re-renderização repetida das dicas/conteúdo de tarefas nas nós de testemunho, com ARIA e callbacks mais recentes do item ativo funcionando; o VP31 complementa em HOME isolado ao menos 41 arrastes reais com ponteiro, linha azul, cancelamento e amostragem de intervalo de quadros/longtask. Na build de release, a amostragem de arraste deve ter intervalo máximo de quadro menor que 100ms; os valores de desempenho variam com o ambiente, mantendo-se as métricas originais e comparando-se com gravação do aplicativo de desenvolvimento nas mesmas condições. A persistência da ordenação por teclado existente, os dois temas, 390px e a regressão do menu continuam sendo executados. A UI compartilhada vale para desktop/Web; não se altera o replayable do celular, Host/CLI, protocolo ou migration.

### Verificação da correção de desempenho

- Mesmo aplicativo de desenvolvimento, 41 itens, o mesmo gesto de ativação por ponteiro→ponto de soltura para cima→Escape, usando amostragem com PerformanceObserver + rAF (sem comparação direta com o Trace original do usuário, que trazia CPU profiler): antes da modificação o maior intervalo de quadro foi de 366.6ms, o longtask mais longo de 387ms e 1152 ControlHintTooltip; depois da modificação, os dois foram 67.6/34.1ms, 77/59ms, ambos 8 vezes. A ordem dos projetos antes e depois ficou igual, a linha azul apareceu e o cancelamento limpou.
- Run final do Electron em build de release `desktop-e2e-20260915044016567-p17170-a27487f8d3a22534`: 7/7 aprovados; a fixture de desempenho teve efetivamente 42 itens (incluindo projetos de inicialização), o maior intervalo de quadro foi de 17.6ms, sem longtask, e as métricas originais estão no `project-drag-performance.json` desse run. As capturas da linha de inserção em 1200px escuro e 390px claro foram verificadas.
- O novo teste unitário começou vermelho: uma única ativação disparou 164 tooltips; após a correção, ativação/cancelamento disparam no máximo 4 vezes cada, deslocamento/troca de alvo 0 vezes, e o título do projeto e o callback de ação mais recente continuam atualizando. 4 arquivos de teste relacionados, 16/16 aprovados.
- Sincronizada a asserção de ARIA do título do teste unitário antigo do Server: mantém-se o `aria-disabled={!canOpen}` do anterior fix de disponibilidade do diretório principal, com false quando o título é expansível; a ordenação desabilitada continua controlada por useSortable.disabled, e esta não altera essa semântica de produto.
- typecheck da root, typecheck:e2e do desktop, lint (48 warnings existentes, 0 errors), verificação de fixtures, formatação e checagem incremental de arquitetura do HEAD passaram. Em toda a branch continua presente o `resolveConversationWorkspaceTarget.ts` unmanaged-new-file anterior ao início do trabalho, sem aumento de violações.
- Os casos ainda estão pending; não foram executados shared-host real de celular, SSH/WSL nem GUI em Windows/Linux. Apenas os limites de renderização da UI compartilhada foram ajustados, sem mudar semântica de dados/comunicação.
