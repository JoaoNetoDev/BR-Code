# Ordem das Seções de Finalidade na Barra Lateral

## Revisão de Interação Atual (2026-09-15)

Esta seção substitui a convenção histórica de «alça dedicada» descrita abaixo. O ProjectSidebar atual compartilha
PurposeSections e WorkspacePurposeSection:

- «项目» e «任务» são arrastados diretamente pelo texto do título ou pela área em branco do título, removendo o
  botão de seis pontos à direita. O clique continua apenas recolhendo a seção atual; o botão de novo à direita é
  independente e não ativa arrasto nem recolhimento.
- Reutiliza-se o PointerSensor da ordenação de projetos (ativação após mover 6px) e o KeyboardSensor; com o título
  focado, Space inicia, as setas movem, Space confirma e Escape cancela. Tocar no título permite arrastar, e a área de
  conteúdo continua rolando.
- A partir do mesmo active / over / index do useSortable deriva-se uma única linha de inserção alvo: para cima, antes
  do alvo; para baixo, depois do alvo, e o bloco expandido inteiro se move junto. A linha usa o icon-blue de 2px e o
  círculo vazado de 8px da ordenação de projetos; não ocupa layout nem intercepta o ponteiro, e é limpa ao soltar ou
  cancelar.
- O deslocamento da seção é restrito ao eixo vertical; a lista da barra lateral proíbe explicitamente a rolagem
  horizontal e mantém a vertical. Arrastar para fora da borda direita da barra lateral também não pode alargar o
  contêiner de rolagem nem gerar barra de rolagem horizontal.
- A única ordem confirmada continua sendo a sectionOrder local ao renderer; sem troca válida não se grava preferência.
  Os valores de recolhimento e o conteúdo de tarefas/projetos não mudam com a ordenação, e não se adiciona persistência
  nem timer.

```text
Título Pointer / Touch / Keyboard → dnd-kit active / over (eixo vertical) → linha azul na borda do alvo
                                                           ├─ confirmar → preferência sectionOrder original
                                                           └─ cancelar → limpar o estado transiente
Clique no título → preferência de recolhimento original; ação à direita → callback de criação original
```

A UI compartilhada é usada tanto pelo desktop quanto pela Web; a restrição é apenas a exibição da barra lateral e não
altera Host/CLI, workspaceIdentity, desktop continuous nem mobile replayable. A validação de 390px no desktop
representa o layout de tela estreita e não equivale a uma validação de shared-host em celular real.

Aceitação: o CWP02 tem as asserções de disparo pelo título atualizadas; foi acrescentada uma regressão de interação
pending cobrindo ordenação para cima e para baixo, expandir/recolher, isolamento entre clique/criação, cancelamento e
confirmação por teclado, persistência após recarga, e a linha azul em temas claro e escuro e em tela estreita sem
overflow horizontal. Sem requisições ao modelo.

### Verificação Desta Rodada

- Aplicação de desenvolvimento via CDP: antes da correção, arrastar para a direita esticava a barra lateral de 409px
  para 1060px; depois da correção, o mesmo gesto tem deslocamento horizontal 0 e a largura do conteúdo é igual à
  largura visível (264px), a linha azul aparece e o Escape a limpa.
- Run pending do Electron `desktop-e2e-20260915121039329-p28373-70b1989f9323c47a`: 4/4 passaram, com as capturas de
  1200px escuro e 390px claro verificadas; cobre ordenação por ponteiro/teclado no título, cancelamento/confirmação,
  recarga, recolhimento e isolamento de operações, temas claro/escuro e ausência de overflow horizontal.
- Run formal existente do CWP02 `desktop-e2e-20260915121257994-p30885-947e07257bcefaa2`: 1/1 passou. As duas fixture
  checks passaram, e o caso novo permanece pending.
- 18 testes unitários relacionados, root typecheck, desktop typecheck:e2e, lint (47 warnings existentes / 0 erros),
  formatação e a verificação de arquitetura incremental do HEAD passaram. A verificação de arquitetura de branch
  completo ainda tem o `resolveConversationWorkspaceTarget.ts` unmanaged-new-file que já existia antes do trabalho.
- Celular real shared-host, hardware com toque e GUI Windows/Linux não foram executados; desta rodada altera apenas a
  interação e o layout da barra lateral compartilhada, sem mexer em comunicação nem em dados de tarefa.

## Resumo da Funcionalidade

| Campo                 | Valor                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Alteração              | A subseção “项目 / 任务” em `Project + By project` passa a aceitar arrastar-e-soltar para reordenar, com a ordem do usuário persistida; a ordem é compartilhada entre dispositivos, mas cada dispositivo tem seu próprio estado de expansão |
| Superfícies visíveis  | Barra lateral do Desktop e do workspace Web compartilhado; o rótulo compartilhado de task-purpose passa a exibir “任务 / Tasks”     |
| Docs existentes       | `docs/ui/sidebar-task-view-switcher.md`、`docs/superpowers/specs/2026-07-10-non-project-conversation-workspace-design.md`         |
| Dono do estado        | `zcode-sidebar-purpose-section-preferences` local ao Renderer                                                              |
| Fora de escopo        | Layout por arrastar no `/remote` do celular, sincronização em tempo real entre janelas, estado de Host/Agent/protocol, outros textos de “对话” |

A semântica interna `workspacePurpose=conversation` permanece inalterada; as subseções/ rótulos de workspace compartilhados de task-purpose e os textos de estado vazio e de entrada de criação da barra lateral da desktop passam de
“对话 / Conversations” para “任务 / Tasks”. O `/remote` do celular pode reutilizar o novo rótulo, mas não ganha entrada de arrastar.

## Registro de Esclarecimentos

| Rodada | Questão                                                                         | Resposta do usuário | Limite fixado                                                                                      |
| ------ | ------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------- |
| 1      | A ordenação é persistida, entrada de arrasto, forma de entrada, escopo multi-plataforma, escopo de sincronização, seções vazias/recolhidas podem ser arrastadas | Pela opção recomendada | Persistência local ao renderer; alça dedicada; mouse/toque/teclado; Desktop/Web compartilhado; sem sincronização em tempo real entre janelas; a seção inteira sempre pode ser arrastada |
| 2      | Ajustar também os textos das seções                                            | “对话” → “任务”     | Ajustar apenas os textos relacionados a essa seção da barra lateral, sem mudar a semântica de produto/protocolo de conversation |

## Limite de Estado e Sincronização

```text
pointer / touch / keyboard drag handle
  -> reorder [projects, conversations]
  -> update current renderer immediately
  -> apply the same order inside every visible device group
  -> persist sectionOrder to localStorage
  -> restore on the next renderer mount

  -X-> Host / Agent / task snapshot / protocol
  -X-> mobile web-remote-replayable
  -X-> live broadcast to another open window
```

O estado expandido acompanha o par “dispositivo × seção”, não muda com a reordenação nem com o clique em outro
dispositivo; a preferência de topo legada só continua em uso quando não há nível de dispositivo exibido:

```text
local           -> projects / conversations
server:<id>     -> projects / conversations
pending:<route> -> projects / conversations

Clique em server:A / projects
  -> atualiza apenas server:A / projects
  -X-> local / projects
  -X-> server:B / projects
```

## Escopo de Domínio e Dimensões

| Dimensão             | Valores                                    | Decisão                                                                                   |
| -------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Entrada              | ponteiro do mouse / ponteiro de toque / teclado | aceita, sempre passando pela alça de arrasto dedicada                                  |
| Conteúdo da seção   | não vazia / vazia                          | aceita, ambas podem ser arrastadas                                                         |
| Expansão da seção    | expandida / recolhida                      | aceita, persistida por dispositivo; move-se por inteiro preservando o estado expandido original de cada dispositivo |
| Preferência inicial  | ausente / legada / válida / corrompida     | aceita; ausente, legada e corrompida usam o padrão `projects -> conversations`            |
| Superfície           | Desktop / Web compartilhado / `/remote` do celular | as duas primeiras aceitam arrasto; a ordem é compartilhada entre dispositivos; mobile só aceita o texto compartilhado, arrasto removido, layout independente mantido |
| Janela               | atual / outro renderer aberto / remontagem  | a atual atualiza imediatamente; sincronização em tempo real com outra janela removida; restauração na remontagem aceita |
| Entrega em runtime    | desktop-continuous / web-remote-replayable | ignorada; a ordenação não entra na cadeia runtime/realtime                                |
| Tema / locale        | Zai Light / Zai Dark; zh-CN / en-US         | aceita; usando os tokens semânticos existentes e textos bilíngues                        |

## Candidatos e Decisões de Remoção

| Candidato | Configuração / ação                          | Resultado esperado                                                     | Status                                                                     |
| --------- | -------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| SPO01     | Ver a barra lateral com a preferência padrão | Projetos acima de tarefas, ambas as seções expandidas por padrão      | aceito                                                                     |
| SPO02     | Arrastar da alça da seção de tarefas para acima de projetos | A seção inteira de tarefas troca de lugar, mantendo estado expandido e conteúdo, e a ordem vai para a preferência local | aceito                                       |
| SPO03     | Atualizar ou reiniciar o renderer             | Restaura tarefas acima de projetos                                    | aceito                                                                     |
| SPO04     | Arrastar com seção recolhida ou vazia        | Ainda pode trocar de lugar; não limpa cache, ordem de workspace/task nem estado expandido | aceito                        |
| SPO05     | Ordenar com o teclado focando a alça         | Mesmo resultado da ordenação por ponteiro, com `aria-label` legível na alça | aceito                                                        |
| SPO06     | Observar a ordem em outra janela já aberta  | Não se exige mudança em tempo real; essa janela lê o valor persistido na próxima montagem | removido, a preferência local ao renderer não ganha broadcast |
| SPO07     | Ver ou arrastar no `/remote` do celular       | O rótulo de task-purpose exibe “任务”, mas sem entrada de arrasto e sem alterar a restauração replayable | cópia aceita; arrasto removido, layout móvel independente |
| SPO08     | Alterar outros textos de “对话” do produto   | Manter os textos atuais                                               | ignorado, desta vez só a seção de finalidade da barra lateral é ajustada |
| SPO09     | Arrastar a ordem de projetos/tarefas em qualquer dispositivo | Todos os dispositivos usam a mesma ordem, sem nova preferência de ordenação por dispositivo | aceito, mantém um único owner local ao renderer |
| SPO10     | Recolher projetos ou tarefas em qualquer dispositivo | Apenas a seção correspondente desse dispositivo é recolhida; o estado expandido dos demais não muda e é persistido por conta própria | aceito, o estado expandido é isolado pela chave de grupo do Source |

## Casos Aceitos e Evidências

| Caso              | Configuração                                        | Ação                                                      | Asserções                                                                                                        | Evidência                                              | E2E                                                                                         |
| ----------------- | --------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| CWP02 / SPO01-05  | perfil novo, apenas workspace de backing de conversation | Ver, recolher, arrastar “任务” para cima de “项目” e recarregar | Semântica das seções bilíngue correta; ação fora do gatilho de recolhimento; alça dedicada acessível; ordem e estado expandido persistidos de forma independente; workspace sem projetos não mostra linha | Ordem no DOM + `aria-expanded` + localStorage + DOM após remontagem | Atualizar o `conversation-session-conversation-workspace.test.ts` existente; sem requisições ao provider |

## Handoff E2E

- Reutilizar o CWP02 formal, sem criar caso duplicado.
- É uma interação puramente local ao renderer e não gera requisições ao provider; o fixture local do caso fica vazio e declara `noProviderRequests`, sem novo replay de resposta de provider.
- O E2E de ponteiro prova a reordenação real e a restauração após recarga; os contratos de sensor de teclado/toque são cobertos por teste de componente focado/source.
- Não entra no novo processo de admissão via Docker; continua sob a atual atribuição de suite do CWP02.