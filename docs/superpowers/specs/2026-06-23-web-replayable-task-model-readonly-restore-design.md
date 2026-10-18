# Design de Restauração Somente Leitura do Modelo da Task no Web Replayable

## Contexto

Quando o controle remoto Web mobile abre uma task histórica, ele passa pela restauração por snapshot `web-remote-replayable`. Atualmente,
`getTaskSnapshot`, na ausência de um parâmetro explícito de modelo, preenche o modelo histórico a partir do task index e depois chama
`session/resume`. Se o provider/model exato do modelo histórico não estiver mais disponível no registry atual,
a camada de serviço lança `ZCODE_RUNTIME_MODEL_UNAVAILABLE`.

O desktop `desktop-continuous` já faz o degradação desse erro em um helper de UI: exibe o histórico restaurado
e exige que o usuário escolha um modelo atualmente disponível antes de continuar a conversa. O mobile não tem degradação equivalente, e o snapshot da primeira tela falha diretamente;
o catch externo ainda escreve o erro como uma runtime string, o que acaba sendo exibido como um banner de erro de chat comum.

## Objetivo

Otimizar apenas o caminho de restauração da abertura de task no mobile `web-remote-replayable`: quando o modelo histórico não estiver disponível, as mensagens históricas ainda devem ser exibidas,
e a restauração real do runtime deve ser adiada até que o usuário ou a barra de ferramentas escolha um modelo disponível. O comportamento do desktop
`desktop-continuous` permanece inalterado.

## Design

- Adicionar aos parâmetros do snapshot de task uma estratégia de restauração exclusiva do mobile:
  `resumeModelPolicy: "task-index" | "ui-resolved-only"`.
- A estratégia padrão é `"task-index"`, preservando o comportamento atual.
- Somente quando `clientMode === "web-remote-replayable"` e a estratégia é
  `"ui-resolved-only"`, `zcodeTaskServiceAdapter.getTaskSnapshot` deixa de preencher o modelo histórico a partir do task index.
- Em `useTaskRestore`, no branch replayable do mobile, se a resolução de modelo antes da restauração indicar que o modelo histórico não está disponível
  e não houver fallback de modelo visível, o snapshot da primeira tela usa `"ui-resolved-only"`.
- Em `useTaskRestore`, no branch replayable do mobile, se o snapshot de providers ainda não foi hidratado, também se usa primeiro
  `"ui-resolved-only"`. Nesse momento a UI ainda não consegue julgar de forma confiável se o modelo histórico está disponível, e não se deve passar o hint do modelo antigo
  prematuramente ao runtime; a barra de ferramentas reavalia após a hidratação da lista de modelos e muda automaticamente para o primeiro modelo visível disponível.
- Quando o snapshot de providers não está hidratado, a task meta da UI também pode ainda não estar no store; mesmo sem resolver localmente
  o hint do modelo histórico, é preciso proibir primeiro que o host preencha o modelo antigo a partir do task index.
- O snapshot de providers também pode já ter sido hidratado por outro workspace, mas a task meta atual ainda não entrou na
  UI store. Enquanto a origem da task meta antes da restauração no replayable do mobile for `missing`, o snapshot da primeira tela
  também usa `"ui-resolved-only"`, evitando que o host preencha o modelo antigo a partir do task index antes da avaliação de fallback da UI.
- O mesmo branch de restauração somente leitura pula o subsequente `resumeTask`, evitando que ele preencha novamente o mesmo modelo indisponível a partir do task index.
  A UI usa a snapshot meta para concluir a exibição histórica e mantém o estado `ZCODE_RUNTIME_MODEL_UNAVAILABLE` com escopo de task.
- Depois que o mobile `web-remote-replayable` abre uma task, as sincronizações posteriores de snapshot somente leitura, disparadas por stream event / session event / gap recovery,
  também usam `"ui-resolved-only"`. Essas sincronizações servem apenas para calibrar mensagens da UI, fila e estado de runtime,
  e não podem voltar a preencher o modelo histórico a partir do task index depois que o usuário já mudou para um modelo disponível.
- Depois que a barra de ferramentas muda automaticamente para o primeiro modelo visível ou que o usuário seleciona um modelo manualmente, os envios seguintes continuam pelo caminho existente de
  restauração de model da task config.

## Limites

- Não modificar a validação rígida de session histórica em `zcodeAgentService.resolveRuntimeModelConfig`.
- Não deixar que uma session histórica mude silenciosamente para o primeiro modelo do registry.
- Não alterar as semânticas de snapshot, resume, queue ou stream do desktop `desktop-continuous`.
- Não rebaixar para relay ou desktop main o estado de negócio de task/model.

## Verificação

- Testes unitários de UI cobrem que os parâmetros do snapshot de restauração somente leitura do mobile incluem `resumeModelPolicy: "ui-resolved-only"`.
- Testes unitários de UI cobrem que, no mobile, quando o snapshot de providers não está hidratado, a restauração somente leitura é usada mesmo sem hint local de modelo histórico, e que o desktop não usa essa estratégia.
- Testes unitários de UI cobrem que, no mobile, quando o snapshot de providers já está hidratado mas a task meta ainda não entrou na UI, a restauração somente leitura continua sendo usada, e que o desktop não usa essa estratégia.
- Testes unitários de UI cobrem que as sincronizações posteriores de snapshot no replayable do mobile carregam
  `resumeModelPolicy: "ui-resolved-only"`, e que o desktop não altera o caminho de leitura de session.
- Testes unitários de serviço cobrem que, sob essa estratégia, `web-remote-replayable` não preenche o modelo histórico a partir do task index.
- Testes unitários de regressão cobrem que o `web-remote-replayable` padrão ainda preenche o modelo do task index.
- Executar `pnpm typecheck` e `pnpm lint`.