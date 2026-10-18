# Placeholder do Chat Composer

O placeholder da caixa de entrada de chat agora é dividido por estado da tarefa e largura do terminal:

- Estado ocioso, sem histórico de mensagens (desktop): `Ask ZCode anything, @ for files, folders, or whiteboards, / for commands or agents, $ for skills, # for related conversations`
- Estado ocioso, sem histórico de mensagens (Web remoto no celular): `Ask ZCode anything…`
- Estado ocioso, com histórico de mensagens: `Ask for follow-up changes`
- Enquanto a tarefa está em processamento: `Keep typing to queue follow-up changes`

Restrições de design:

- O texto de placeholder de nova task aparece somente quando a lista de mensagens está vazia.
- Uma task com histórico que já tenha mensagens e que não esteja em processamento exibe o texto de follow-up.
- `submitting`, `creating`, `restoring` e `streaming` são tratados uniformemente como estado em processamento, evitando que o placeholder volte a piscar no instante em que a task é iniciada.
- O estado em processamento não bloqueia a digitação, apenas muda o placeholder, deixando explícito ao usuário que ele pode continuar digitando e que a entrada irá para a fila.
- O texto de nova task no Web remoto do celular permanece enxuto; as dicas completas de capacidade `@` / `/` / `$` / `#` ficam por conta dos pontos de entrada de ação abaixo da caixa de entrada.
- O placeholder do Web remoto do celular exibe no máximo duas linhas, como proteção de layout para a extensão dos textos de internacionalização; ele não pode cobrir a barra de ferramentas abaixo.
- O desktop continua exibindo a dica completa de capacidades, sem sofrer a regra de simplificação do celular.
- Os textos são configurados por i18n, atualmente com `en-US` / `zh-CN`.