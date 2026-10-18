# Status Panel Todo Hover Preview Boundaries

## Resumo da funcionalidade

| Campo | Valor |
| --- | --- |
| Mudança | Trocar a expansão por clique dos grupos ocultos de Todo dentro do painel por uma pré-visualização em HoverCard à esquerda |
| Superfícies visíveis ao usuário | As entradas "n concluídos / n pendentes" do V4 Status Panel |
| Referência existente | Prévia de hover do Todo de iteração do Goal: de `028be830cd` a `ff372381e1` |
| Dono do estado | Estado de abertura do HoverCard local do renderer; o snapshot do Todo continua sendo fornecido autoritativamente pelo plan model |
| Fora de escopo | Ordenação de Todo, janela de foco de três itens, protocolo, persistência em session/store |

## Registro de esclarecimentos

| Rodada | Pergunta | Resposta do usuário | Limite fixado |
| --- | --- | --- | --- |
| 1 | Se o clique deveria continuar expandindo dentro do painel | Não, exibir à esquerda após o hover | O detalhamento não entra mais no fluxo documental do Status Panel |
| 2 | Referência visual e de interação | O cartão de hover do item de Goal anterior | Reutilizar o atraso, a direção, o espaçamento, o tamanho e o contrato de rolagem do HoverCard |
| 3 | Forma de conclusão | Concluir usando o goal | Especificação, implementação, testes, evidência de runtime e commit entram todos na aceitação |

## Decisões de limite

| Limite | Decisão | Inclui | Exclui |
| --- | --- | --- | --- |
| Ponteiro no desktop | Abre no hover/focus e fecha ao sair do gatilho e do cartão | Poder atravessar da entrada até o cartão | Inserir o detalhamento dentro do painel |
| Entrada sem hover | Clicar na entrada abre o mesmo HoverCard | Web no celular, tela sensível ao toque, focus por teclado | Criar uma UI mobile dedicada |
| Posicionamento | `left + start + 4px`, delegando ao collision do Radix quando faltar espaço | A mesma posição do cartão de Goal | Coordenadas de tela fixas |
| Conteúdo | Exibe na ordem original os buckets de posição antes/depois da janela, no máximo duas linhas por item; usa "concluído/pendente" apenas quando o status do bucket é puro e "antes/depois" quando é misturado | Rolagem dentro do cartão | Truncamento pelo model, reordenação ou falsificar status com base nos buckets de posição |
| snapshot | Fecha o cartão antigo e recalcula os agrupamentos quando id / content / status mudam | Reconstrução da key do renderer | Estado de abertura persistido |

## Fluxo de estado e eventos

```text
plan snapshot
    |
    +--> getStatusPanelTodoFocusWindow()
            |
            +--> focusItems ----------> Status Panel fixa três itens
            |
            +--> completed/waiting ---> HoverCard trigger
                                            |
                           hover/focus/click
                                            v
                            cartão de pré-visualização à esquerda
                              (rolagem independente)

snapshot signature changes
    --> PlanStatusItems remount
    --> HoverCard open state reset
```

## Casos aceitos

| Case ID | Setup | Ação | Asserções | Evidência |
| --- | --- | --- | --- | --- |
| THP01 | Há itens ocultos apenas antes da janela | hover / focus na entrada superior | O grupo completo de concluídos aparece à esquerda, e a altura do painel e a janela de três itens permanecem inalteradas | component + CDP |
| THP02 | Há itens ocultos apenas depois da janela | hover / focus na entrada inferior | O grupo completo de pendentes aparece à esquerda, com conteúdo rolável | component + CDP |
| THP03 | Há itens ocultos antes e depois, e qualquer um dos buckets de posição tem status misturado | Fazer hover nas duas entradas, uma após a outra | No máximo uma prévia correspondente por vez, sem encadear os grupos; buckets misturados usam texto de posição neutro | component + CDP |
| THP04 | Entrada sem hover | Clicar na entrada e fora | O clique abre a mesma prévia, sem expandir dentro do painel; fecha ao perder o foco | component + mobile follow-up |
| THP05 | Prévia já aberta | O snapshot de Todo é atualizado | A prévia antiga fecha, e a entrada e o conteúdo são recalculados conforme o novo snapshot | component key + CDP |

## Podas

- `desktop-continuous` e `web-remote-replayable` compartilham apenas a projeção do renderer, sem estender as combinações de estado do protocolo.
- Theme / locale são garantidos pelo HoverCard, pelas cores semânticas e pelos textos i18n existentes, sem fazer todas as permutações.
- Workspace identity, provider e estado do runtime não afetam a prévia puramente derivada no renderer.