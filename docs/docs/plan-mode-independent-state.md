# Estado Independente do Plan no Modo Plan (Todo151)

Este spec tem prioridade sobre as descrições de implementação de mode=plan / prePlanMode em documentos antigos de Plan, e não altera o texto atual do prompt de modelo.

## Propriedade e Comportamento

O Composer salva `{mode: build|edit|yolo, planEnabled: boolean}` para o próximo envio. O menu Plan fica no topo,
com um separador abaixo dele listando as três permissões; o Plan é selecionado de forma independente e não altera a permissão. O marcador de Plan fica à direita das permissões, e o X altera somente o rascunho.
O item de menu do Plan mantém a descrição original "编辑前先出计划。" e sua tradução em inglês, adotando o layout de duas linhas igual ao dos itens de permissão.
Após a unificação com o staging, continua-se usando a tabela de atalhos efetivos para exibir as dicas de troca de permissão, sem restaurar o antigo ciclo misto Plan/permissão.
Envio, Guide e o fim de uma rodada não limpam o marcador; somente a aprovação sendo processada o desliga de forma direcionada. Rejeição/feedback não modificam o rascunho.
A ferramenta age com EnterPlanMode liga o marcador de forma direcionada, e a aprovação da ferramenta Exit desliga de forma direcionada. Decisão simplificada de 2026-09-15:
quando um novo resultado de ferramenta chega, o marcador é definido diretamente, mesmo que o usuário tenha mudado a seleção manualmente no intervalo; o mesmo resultado é processado apenas uma vez.
Não se mantém uma lista de ignorados de ferramentas nem uma versão de modificação do rascunho, não se adiciona evento de histórico visível e não se restaura a linha de EnterPlanMode já ocultada.

```text
批准旧计划 -> 用户重新选择 Plan -> 批准结果到达 -> 清除 Plan 标记
                                               -> 同一结果重放不再清除
```

```text
草稿 -> command 接纳并固定两个值 -> Runtime 消费 -> 统一状态转换 -> 保存并同步
               |                    ^
               +-> Queue 原值往返 --+
Enter/ExitPlanMode -----------------+

desktop continuous：直接应用实时同步
mobile replayable：原有 snapshot/gap 恢复 -> 同一 Runtime，不创建新 owner
```

O Plan tem prioridade sobre o yolo na liberação de ferramentas; o ExitPlanMode sempre exige aprovação. A aprovação desliga apenas o Plan e continua o Turn atual,
sem alterar a permissão e sem enviar uma nova mensagem de usuário. A rejeição interrompe o Turn atual, e o feedback continua o planejamento pelo caminho de mensagem de usuário já existente.
Goal e Plan são mutuamente exclusivos nos dois sentidos. O Guide com modelo de execução fixo mantém o modelo, mas ainda consome a permissão e o Plan explícitos.
Os lembretes de planejamento/saída existentes alteram apenas a base de disparo, não o texto do prompt, o MCS ou o mecanismo de congelamento do estilo de saída.

## Compatibilidade e Armazenamento

- novo tipo session_entry runtime/execution_state, com data guardando mode/planEnabled ao mesmo tempo; nenhuma tabela/coluna nova.
- A gravação ocorre apenas na criação normal/atualização de estado, sem varredura para preencher registros antigos. session.permission antigo e mensagens de histórico não mudam.
- Quando uma nova mensagem assistant é salva normalmente, planEnabled acompanha para permitir a restauração da fronteira histórica de permissão do stable fork já existente;
  a entry do fork é salva atomicamente junto com a child. Mensagens antigas não são preenchidas retroativamente e continuam sendo interpretadas conforme o mode original.
- O registro de uma nova sessão tem prioridade sobre o padrão do ambiente; quando falta registro em uma sessão antiga, o formato compatível é lido, e um plan antigo sem base de permissão confiável usa build.
- planEnabled explícito tem prioridade (inclusive false); uma requisição antiga apenas com mode=plan ativa o Plan, e uma requisição antiga apenas com mode não-Plan desativa segundo a semântica antiga; sem nenhum dos dois, o valor corrente é fixado na fronteira de admissão. Só se adivinha quando a fila não pode consumir.
- Mensagens antigas, resultados de ferramenta, índices de tarefas e configuração de tarefas automáticas mantêm a leitura dos enums antigos. O rascunho e o Recent são compatíveis de forma independente:
  um rascunho de Plan antigo da sessão original preserva a intenção, e outra tarefa nova não herda o Plan.
- A nova restauração a frio garante o estado salvo nesta rodada. O rollback garante legibilidade do conteúdo, sem prometer que o programa antigo restaure com precisão o novo estado de Plan.
- O Host declara suporte por meio da capacidade opcional independentPlanState do hello existente. Quando o Host antigo não suporta, apenas novas submissões com Plan=true são recusadas, evitando que a remoção do campo resulte em execução yolo; envio normal, leitura de histórico e a versão de wire existente não mudam.
- O Host também precisa confirmar o CLI real por meio de runtime/capabilities, e o resultado bem-sucedido é cacheado por client do CLI;
  quando um Host novo se conecta a um CLI antigo, Plan=true também é recusado, e a versão do Host não é tratada como capacidade remota.
- Falha na persistência de permissão e Plan não pode reportar que o estado foi sincronizado com sucesso; dados antigos sem campo não devem impedir a abertura do conteúdo histórico.

## Testes Obrigatórios

Projeção de eventos reais da Queue e ida e volta da elevação; edição no lugar/reordenação/fallback do Guide; yolo+Plan=false executa corretamente,
yolo+Plan=true continua restrito e exige aprovação; tipo, Schema, permissão, retorno e feedback das ferramentas Enter/Exit; restauração a frio,
compatibilidade de campos antigos, restauração de branches; tarefas novas começam desativadas por padrão; corrida entre aprovação e X manual; isolamento de replay entre desktop e mobile.