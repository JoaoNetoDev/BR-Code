# Ordem das Seções de Finalidade na Barra Lateral

## Resumo da Funcionalidade

| Campo                 | Valor                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Alteração              | A subseção “项目 / 任务” em `Project + By project` passa a aceitar arrastar-e-soltar para reordenar, com a ordem do usuário persistida |
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
  -> persist sectionOrder to localStorage
  -> restore on the next renderer mount

  -X-> Host / Agent / task snapshot / protocol
  -X-> mobile web-remote-replayable
  -X-> live broadcast to another open window
```

O estado expandido acompanha a própria seção e não muda com a reordenação:

```text
projects      -> projectsExpanded
conversations -> conversationsExpanded
```

## Escopo de Domínio e Dimensões

| Dimensão             | Valores                                    | Decisão                                                                                   |
| -------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Entrada              | ponteiro do mouse / ponteiro de toque / teclado | aceita, sempre passando pela alça de arrasto dedicada                                  |
| Conteúdo da seção   | não vazia / vazia                          | aceita, ambas podem ser arrastadas                                                         |
| Expansão da seção    | expandida / recolhida                      | aceita, move-se por inteiro preservando o estado expandido original                       |
| Preferência inicial  | ausente / legada / válida / corrompida     | aceita; ausente, legada e corrompida usam o padrão `projects -> conversations`            |
| Superfície           | Desktop / Web compartilhado / `/remote` do celular | as duas primeiras aceitam arrasto; mobile só aceita o texto compartilhado, arrasto removido, layout independente mantido |
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

## Casos Aceitos e Evidências

| Caso              | Configuração                                        | Ação                                                      | Asserções                                                                                                        | Evidência                                              | E2E                                                                                         |
| ----------------- | --------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| CWP02 / SPO01-05  | perfil novo, apenas workspace de backing de conversation | Ver, recolher, arrastar “任务” para cima de “项目” e recarregar | Semântica das seções bilíngue correta; ação fora do gatilho de recolhimento; alça dedicada acessível; ordem e estado expandido persistidos de forma independente; workspace sem projetos não mostra linha | Ordem no DOM + `aria-expanded` + localStorage + DOM após remontagem | Atualizar o `conversation-session-conversation-workspace.test.ts` existente; sem requisições ao provider |

## Handoff E2E

- Reutilizar o CWP02 formal, sem criar caso duplicado.
- É uma interação puramente local ao renderer e não gera requisições ao provider; o fixture local do caso fica vazio e declara `noProviderRequests`, sem novo replay de resposta de provider.
- O E2E de ponteiro prova a reordenação real e a restauração após recarga; os contratos de sensor de teclado/toque são cobertos por teste de componente focado/source.
- Não entra no novo processo de admissão via Docker; continua sob a atual atribuição de suite do CWP02.