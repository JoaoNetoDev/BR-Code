# Goal Query somente leitura

## Contexto

`/goal` e `/target`, embora exibidos na área de chat na forma de query do usuário, não são prompts comuns:

- A entrada de envio os roteia para os comandos de controle de goal da sessão.
- set / replace grava o target da sessão atual e pode disparar a continuação do goal.
- pause / resume / clear / show são controles de estado do goal e não devem ser tratados como queries de linguagem natural passiveis de retry.

## Restrições de interação

As mensagens de usuário geradas por `/goal ...` ou `/target ...` em texto puro na área de chat permanecem somente leitura:

- Não exibem as ações de edição / retry da mensagem de usuário.
- Operações somente leitura como copiar, exibição de hora e expandir texto longo continuam disponíveis.
- O `/goal` / `/target` no início do corpo da query é sintaxe de comando de submissão; o balão de usuário somente leitura continua exibindo os rótulos `goal` / `target` com o ícone de Goal e a cor semântica de comando, mas não renderiza a `/` inicial, e o corpo do objetivo seguinte mantém o estilo de texto comum de usuário.
- Cópia, edição em linha e command intent continuam usando o `UserInputRow.text` original; não se pode perder o `/goal` / `/target` original apenas porque a camada de exibição omite a `/`.
- Menções a `/goal` no corpo comum de uma mensagem não são afetadas.
- `/goal ...` com anexos não é tratado como slash command de goal e mantém o comportamento de mensagem comum.
- `/goal ...` com anexos de contexto, como elementos de página web ou seleção da sessão, também é exibido como mensagem comum; não pode ser renderizado por engano como goal query só porque o bloco de contexto foi separado do corpo visível.

Omitir a `/` no token do comando altera apenas o corpo somente leitura do renderer, não o texto da mensagem, o conteúdo copiado, o alvo de edição nem a semântica de projeção do desktop continuous / web remote replayable; o desktop e a web mobile compartilham o mesmo componente de renderização de linha e usam cores semânticas já existentes para ficar compatíveis com os temas claro e escuro.

## Restrições de implementação

O julgamento da UI deve reutilizar a mesma semântica de visible slash command da entrada de envio, e não pode se basear apenas em conter a string `/goal`. Isso evita que textos de discussão comum, textos de internacionalização e mensagens com anexos de arquivo ou de contexto sejam classificados por engano como goal query. O parsing de exibição serve apenas para identificar um goal query já confirmado e para omitir a `/` inicial no rótulo do comando; o texto original autoritativo continua sendo `UserInputRow.text`, e não é permitido inferir nem reescrever o command intent a partir do resultado da renderização.