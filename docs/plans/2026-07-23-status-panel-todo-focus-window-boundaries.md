# Status Panel Todo Focus Window Boundaries

## Feature Summary

| Campo                  | Valor                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| Mudança                | restaurar a janela simplificada de Todo do Status Panel definida no design original, em vez de fixar as 4 primeiras e expandir tudo |
| Superfícies visíveis ao usuário | o bloco "进程" (Processos) do `ConversationStatusPanel` do V4                            |
| Documentos existentes  | `docs/ui/chat-summary-panel.md`, catálogo de cases SP / matriz de cobertura                             |
| Donos de código existentes | `ConversationStatusPanel.tsx` com estado de exibição local do renderer; `conversationStatusPanelModel.ts` preserva o snapshot completo |
| Fora de escopo         | CLI TodoWrite, session projection, persistência, protocolo de entrega desktop continuous / mobile replayable |

## Log de esclarecimentos

| Rodada | Pergunta                                          | Resposta do usuário            | Fronteira fixada                                                    | Precisa acompanhamento |
| ------ | ------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------- | ---------------------- |
| 1      | restaurar "mostrar 4 itens"?                     | confirma a restauração         | primeiro verificou que o V4 truncava rigidamente em 4 itens         | não                    |
| 2      | simplificar para as 4 primeiras + mostrar mais equivale ao design antigo? | o usuário apontou que a diferença em relação ao design original é grande | a implementação simplificada é classificada como bug-candidate | não |
| 3      | seguir a interação do design original?           | "confirmo, usar goal para concluir" | adota `>6` com foco em 3 itens, recolhimento independente acima/abaixo e reset na atualização do snapshot | não |

## Decisões de fronteira

| Fronteira             | Decisão                                             | Inclui                                          | Exclui / poda                                  | Origem                 |
| --------------------- | --------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------- | ---------------------- |
| Limiar de simplificação | só simplifica quando o total de Todos é `> 6`     | exibição completa de 0-6 itens                  | janela fixa de 4 itens                         | `6f32518d4c` + usuário |
| Ponto de foco        | prioriza `inProgress`, senão o primeiro não concluído, senão o final | o item em foco e o contexto subsequente vizinho | reordenação completed-first                     | `5728558169` + usuário |
| Janela padrão        | 3 itens consecutivos mantendo a ordem original; perto do fim, preenche para trás | no mínimo 3 itens (quando o total permite)   | "atual + dois seguintes" eterno deixando o final curto | `da2360cfa0`           |
| Grupos de recolhimento     | dois grupos independentes, antes e depois da janela, expandir/recolher | animação na posição original, texto de contagem | um único "mostrar mais" global                  | `55f4f6c999` + usuário |
| Atualização de snapshot | após mudança de id / content / status, os dois grupos voltam a recolhidos | reset local do renderer          | escrita em session, store ou protocol           | usuário + comportamento legado |
| Multi-dispositivo     | desktop e Web no celular reutilizam o mesmo algoritmo do renderer | o shell responsivo continua com as fronteiras existentes | cruzamento de negócio replayable/continuous | invariante do renderer  |

## Escopo de domínio

| Domínio                       | Inclui?               | Por que pode mudar o comportamento             | Fontes principais                 |
| ----------------------------- | --------------------- | ---------------------------------------------- | --------------------------------- |
| UI de conversa/session        | sim                   | o snapshot de Todo dirige a janela visível    | declaração de protocolo, catálogo SP |
| UI shell / responsivo         | sim                   | textos longos, linhas recolhidas e altura de rolagem do bloco | `DESIGN.md`, spec de chat summary |
| Persistência / protocolo      | não                   | nada de estado autoritativo novo nesta rodada  | invariante local do renderer      |
| Recuperação replay no celular  | apenas representativo  | o mesmo snapshot reconstrói a mesma janela padrão | fronteira SP08                   |

## Mapa de conceitos e donos de estado

```text
CLI TodoWrite snapshot
        |
        v
ConversationStatusPanelModel.displayItems  (ordem original completa, entrada autoritativa da UI)
        |
        v
Todo focus partition                   (puramente derivado)
  completed-prefix | focus-window | waiting-suffix
        |                 |
        +---- estado open local do renderer ----+
                         |
                         v
              viewport de rolagem do StatusSection
```

| Estado / fato                    | Autoridade                        | Espelhos / caches                     | Evidência                        |
| -------------------------------- | --------------------------------- | ------------------------------------- | -------------------------------- |
| Conteúdo, ordem e status dos Todo | snapshot `PlanState.items` do V4 | model do status panel                 | teste unitário do model          |
| Limites das três partes da janela | helper puro de partição           | nenhum                                | teste unitário focado            |
| Interruptor de recolher acima/abaixo | estado React local de `PlanStatusItems` | nenhum                     | interação de componente / DOM de runtime |
| delivery profile                 | attachment do host                | o renderer recebe a mesma projection  | SP08 existente; podado da matriz de negócio |

## Combinações candidatas e poda

| ID do candidato | Estado                                               | Evento                          | Efeito esperado                                   | Status   |
| --------------- | ---------------------------------------------------- | -------------------------------- | ------------------------------------------------- | -------- |
| TFW01           | 0-6 Todos                                           | render                          | todos exibidos na ordem original do snapshot, sem interruptor de grupo | aceito |
| TFW02           | >6, com inProgress, no meio                         | render                          | janela de 3 consecutivos em foco, recolhida antes e depois | aceito |
| TFW03           | >6, inProgress no final                             | render                          | preenchimento para trás, exibindo ainda 3 consecutivos | aceito |
| TFW04           | >6, sem inProgress, com pending                     | render                          | foco no primeiro item não concluído                | aceito |
| TFW05           | >6, todos completed                                 | render                          | foco nos 3 últimos, com prefixo expansível         | aceito |
| TFW06           | estado compact                                      | expandir grupo de cima / de baixo | os dois grupos mudam de forma independente, sem afetar o outro nem a ordem original | aceito |
| TFW07           | qualquer grupo já expandido                         | atualização de id/content/status do Todo | os dois grupos são resetados para recolhido e a janela é recalculada | aceito |
| TFW08           | desktop / mobile, local / remote, provider / model  | mesmo snapshot                   | mesmo resultado no renderer, sem permutação de negócio | podado |

Motivo da poda: a janela de foco de Todo só consome `PlanState.items`, não envia command e não lê
workspace, provider, delivery profile nem fonte de persistência. Desktop continuous e replayable no
celular afetam apenas como o snapshot chega, e não mudam o resultado derivado do mesmo snapshot; a
cobertura representativa fica com helper puro + componente do renderer, e o overlay móvel continua
responsável do专项 SP08.

## Casos aceitos

| Case ID | Preparação                                          | Ação                       | Asserções                                                        | Camadas de evidência   | Status do E2E |
| ------- | --------------------------------------------------- | -------------------------- | ---------------------------------------------------------------- | ---------------------- | ------------- |
| SP14    | 6 ou menos Todos com estados mistos                 | expandir processos         | todos visíveis na ordem original, sem linha de contagem de recolhimento | UI + model              | planejado     |
| SP15    | mais de 7 itens com o item atual no início / meio / fim | expandir processos         | janela de 3 consecutivos posicionada corretamente, com preenchimento para trás no fim | UI + partição pura      | planejado     |
| SP16    | itens antes e depois da janela de foco               | clicar de forma independente nas linhas de recolher acima/abaixo | o grupo correspondente expande/recolhe, o estado do outro não muda e a ordem não muda | UI + model              | planejado     |
| SP17    | qualquer grupo recolhido já expandido                | atualização de id/content/status do Todo | os dois grupos voltam a recolhidos e a janela é recalculada pelo novo snapshot | UI + assinatura do snapshot | planejado |

## Notas de passagem para o E2E

- Provider fixture: um E2E formal posterior pode produzir 7 Todos via replay de TodoWrite e atualizar o
  estado no meio.
- Fixture de sistema de arquivos: não é necessário.
- Estratégia de timing: interação puramente de renderer não depende de SSE lento; o case de atualização
  de snapshot usa duas projeções determinísticas.
- Riscos de review: é obrigatório medir que as linhas de recolher continuam visíveis sob texto longo de
  duas linhas e que o overlay do celular não transborda horizontalmente.
- Na fase atual de implementação o foco são testes focados de component/model e inspeção de runtime via
  CDP do desktop, e casos planejados não são reportados como covered por E2E formal.