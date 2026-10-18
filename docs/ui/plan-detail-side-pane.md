# Cartão de plano e detalhes no painel lateral

## Objetivo

O plano de `ExitPlanMode` pode ser concluído de uma só vez ou crescer por streaming através do input da ferramenta. A timeline principal exibe um cartão de plano compacto com o resumo; ao clicar no cartão ou no botão de expandir no canto superior direito, o plano completo é aberto no Side Pane. A timeline principal não expande mais no lugar e o botão "expandir plano" na parte inferior foi removido.

Os detalhes do plano são apenas uma visão somente leitura da projeção da mesma sessão pai; não criam session, Agent runtime, owner, lease nem command queue. O Electron desktop e a Web desktop leem a projeção `desktop-continuous` existente; a Web mobile continua lendo apenas os resultados de recuperação de snapshot/gap `web-remote-replayable` existentes, sem nova cadeia de controle remoto.

## Semântica de produto confirmada

- O canto superior esquerdo exibe sempre "Plano", sem o nome original da ferramenta ou "pacote".
- O canto superior direito exibe apenas copiar; não exibe expandir, curtir ou não curtir.
- Na parte inferior da pré-visualização do corpo, `bottom-6` exibe em flutuação o botão em cápsula com estilo de botão principal padrão, `h-10 pl-6 !pr-4.5`,
  "Ver plano completo →", substituindo o botão de expansão do header.
- Clicar na área não interativa do cartão ou no botão "Ver plano completo" na parte inferior tem o mesmo comportamento: abrir os detalhes no Side Pane.
- Cada `(workspaceKey, parentSessionId, toolCallId)` corresponde a uma tab estável; o mesmo plano é reutilizado, planos diferentes podem coexistir.
- O título da tab é uniformemente o "Plano" localizado.
- O Side Pane exibe o plano completo; a timeline principal exibe apenas a pré-visualização recortada; não há estado de expansão no lugar.
- O cartão de plano permanece estritamente na posição da tool row correspondente ao `ExitPlanMode`, sem ser elevado ao fim do turno do assistant. Quando fica antes do corpo final, é recolhido junto com o mesmo histórico de "trabalhado"; após expandir, deve manter a ordem total do `rowId` da CLI.
- O `ExitPlanMode` em streaming é exibido a partir do primeiro campo `plan` parseável; o cartão não exibe contagem de linhas nem animação de contagem de streaming, e os detalhes são atualizados junto com a mesma projection.
- Depois que o estado terminal é alcançado, o último corpo não vazio é mantido; quando o campo snapshot está ausente, ainda se usa o ponto de entrada existente de carregamento dos campos completos.
- O "copiar" da barra de ações ao fim do turno do assistant é agregado por turno: primeiro copia todos os segmentos de corpo do assistant e depois anexa o Markdown completo de todos os `ExitPlanMode` do mesmo turno; não lê o DOM recortado do cartão nem inclui resultados de outras ferramentas. O botão de copiar do próprio cartão continua copiando apenas aquele plano.
- O resumo do canto superior direito ganha uma seção "Plano" independente, que lista apenas os `ExitPlanMode` do ramo de conversation atual e válido que já atingiram o estado terminal `success`, `error` ou `cancelled` e possuem corpo; estados de streaming, em execução e aguardando aprovação não entram no diretório.
- O diretório de planos é ordenado por `rowId`, do mais novo para o mais antigo. Clicar em um item do diretório tem o mesmo efeito de clicar no cartão da timeline e reutiliza a mesma tab do Side Pane `(workspaceKey, parentSessionId, toolCallId)`.
- No mobile continua-se usando o drawer existente do Side Pane; a entrada principal não desaparece em tela estreita.
- O `V4ChatPane` dedicado ao controle remoto mobile deve receber `onOpenPlanDetail`, assim como o `V4WorkspaceChatArea` desktop; ao clicar no cartão ou em "Ver plano completo", apenas o estado do Side Pane no renderer é atualizado, sem enviar task command e sem alterar a cadeia de recuperação `web-remote-replayable`.

## Estado e sequenciamento

```text
provider tool_input_start / delta / end
                  |
                  v
 shared partial JSON preview（识别 plan 字段）
                  |
                  v
 parent conversation projection
          |                    |
          |                    +--> Side Pane plan-detail tab
          |                         key = workspaceKey
          |                               + parentSessionId
          |                               + toolCallId
          v
 main timeline plan card
   - 原 tool row 位置
   - 计划
   - 复制 / 展开
   - 裁切预览

ExitPlanMode terminal / row.removed / snapshot
                  |
                  v
 renderer plan-directory revision
                  |
                  v
 v4/conversation/plans（CLI 全量有效投影）
                  |
                  v
 status panel「计划」目录（最新优先）

卡片点击 / 展开点击
   ---> 激活或创建稳定 tab
   ---> 展开 Side Pane
   ---> tab 继续订阅 parent projection

轮尾 assistant 复制
   ---> assistant text segments（原顺序）
   ---> ExitPlanMode markdown（同轮原顺序）
   ---> 以空行拼接后写入剪贴板

切换父任务
   ---> 按 parentSessionId 隐藏 / 恢复对应计划 tab
   ---> 不新建 runtime，不改 owner / queue / deliveryKind
```

## Propriedade do estado

| Estado | Fonte autoritativa | Ciclo de vida |
| --- | --- | --- |
| Corpo do plano e estado de streaming | `ToolCallRow` da projection da conversation pai | Acompanha a session pai |
| Diretório de planos | Query dos `ExitPlanMode` em estado terminal da projection válida atual da CLI | Acompanha o ramo pai; atualizado após poda por edit/retry |
| Tab de detalhes do plano e item ativo | Memória do Side Pane do workspace no renderer | Janela atual; não persistido em disco |
| Identidade estável da tab | `workspaceIdentity?.trim() \|\| workspacePath` + session pai + tool call | Janela atual |
| Último corpo de plano não vazio | Fallback de exibição local do componente de detalhes do plano | Período de montagem da tab |

## Interação e acessibilidade

- O cartão usa tokens semânticos: `bg-card`, `border-card-border`, `text-foreground*`, e usa
  `rounded-xl` para o raio de cantos do módulo, compatível com todos os temas.
- Não há linha divisória entre o header do cartão e o corpo; a hierarquia é mantida por espaçamento compacto.
- O header do cartão usa o ícone `NotepadText`, e o ícone e o título "Plano" usam uniformemente
  `text-foreground-subtle`, combinados por um contêiner `flex items-center gap-2`.
- A altura do header do cartão é `h-10`, com o conteúdo alinhado ao topo por `items-start pt-4 px-4`.
- O cartão inteiro pode receber foco por teclado; Enter / Space abre os detalhes.
- O tratamento de teclado do cartão ignora Enter / Space vindos de elementos interativos internos, evitando que o botão inferior e o cartão inteiro abram a mesma tab duas vezes.
- Copiar, Ver plano completo, links e botões dentro do corpo bloqueiam a propagação e não abrem a tab novamente; o botão textual inferior usa diretamente o texto visível como nome acessível e não reaproveita o `aria-label` do cartão inteiro.
- Botões de ícone usam dimensões compactas `icon-xs` / `icon-sm` e fornecem `aria-label` localizado.
- O sucesso da cópia altera apenas o nome acessível e o ícone do botão, sem introduzir toast permanente.
- O nó de corpo da pré-visualização da timeline principal carrega simultaneamente `max-h-64`, recorte de overflow e máscara inferior; os primeiros
  `30%` ficam totalmente visíveis e os `70%` seguintes desvanecem gradualmente, garantindo que o gradiente seja calculado pela altura visível. Plano vazio não exibe cartão de plano,
  e o Side Pane continua exibindo o corpo completo.

## Cases e podas

| Case | Cenário                                           | Expectativa                                                                                                                        | Decisão     |
| ---- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------- |
| S06  | Plano `ExitPlanMode` completo                       | O cartão exibe "Plano" e copiar de forma compacta, sem contagem de linhas; o cartão e o botão em cápsula "Ver plano completo" abrem a mesma tab de detalhes; sem botões de feedback                            | accepted |
| S07  | Parâmetro `plan` crescendo por streaming                            | O cartão aparece já no primeiro fragmento parseável, sem animação de contagem de streaming; os detalhes já abertos crescem junto e ficam consistentes no estado terminal                                                | accepted |
| S08  | Vários planos históricos na mesma tarefa pai                       | Cada `toolCallId` tem tab independente; cliques repetidos no mesmo plano reutilizam; trocar de tarefa oculta/restaura sem misturar workspaces                                           | accepted |
| S09  | Electron, Web desktop, Web mobile, temas claro/escuro e zh/en | Cartão e semântica do Side Pane compartilhados; o mobile reutiliza a projection replayable existente e o drawer, sem iniciar runtime                                               | accepted |
| S10  | Resposta comum do assistant e `ExitPlanMode` já persistidos após reinício   | `assistant_response` canônico ainda é recuperado pela semântica de visibilidade de UI/transcript; a tool row do plano mantém o `plan` completo e é exibida como histórico interrupted somente leitura | accepted |
| S11  | Corpo do assistant e `ExitPlanMode` no mesmo turno     | O conteúdo copiado ao fim do turno é todo o corpo do assistant seguido do Markdown completo do plano; não afetado pelo recorte do cartão e sem mistura de resultados de outras ferramentas                              | accepted |
| S12  | Ainda há saída de assistant, tool ou reasoning após o plano     | O cartão de plano permanece na row original do `ExitPlanMode`; a ordem de expansão de "trabalhado" equivale à ordem total de rows da CLI, sem ser fixado ao fim do turno atual                                  | accepted |
| S13  | Vários planos encerrados no ramo válido atual                   | "Plano" no canto superior direito lista todos os planos, do mais recente para o mais antigo; o título vem do H1 do Markdown/primeira linha não vazia; o clique abre o Side Pane correspondente                                  | accepted |
| S14  | Plano em streaming/em aprovação e depois terminal; ou poda por edit/retry | Estados não terminais não entram no resumo; aparece após o terminal; é removido do diretório após `row.removed`; query tardia não restaura planos antigos                                             | accepted |
| S15  | Recuperação a frio, desktop continuous, mobile remote replayable | Reutiliza a mesma query de projection total da CLI e o attachment do shared host; retorna o mesmo conjunto válido, sem novo runtime, owner, queue ou ramo de replay       | accepted |

Poda: não se faz produto cartesiano entre `model × permission mode × goal × fork × queue` e os detalhes do plano, porque os detalhes e o diretório são somente leitura sobre a projection existente e não enviam session command. `success/error/cancelled` compartilham a mesma implementação de filtro terminal, bastando a enumeração nos testes de componente; a correção da recuperação por snapshot/gap remoto continua coberta pelos cases replayable existentes, e S15 apenas prova que o roteamento da query e a identidade de workspace não se cruzam.