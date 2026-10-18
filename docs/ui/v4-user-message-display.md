# Exibição de mensagens do usuário na V4

A row `userInput` da conversa da V4 continua usando o `text` autoritativo e os attachments como fonte de dados; o bubble somente leitura é responsável por restaurar a semântica de exibição da antiga `UserMessage`. O estado de exibição é UI local do renderer, não é gravado no conversation snapshot e não altera a cadeia continuous do desktop nem a cadeia replayable do controle remoto no celular.

## Corpo e referências estruturadas

- O markdown de mention é restaurado no corpo somente leitura como rótulos de skill, session, file/directory, subagent e command; caminhos internos ou targets de session não são exibidos diretamente.
- O controle de query de goal já confirmado no envio é renderizado no corpo somente leitura com o `/goal` / `/target` inicial como rótulos `goal` / `target` com o ícone Goal, mas sem a `/`; o texto de mesmo nome que degradou para prompt comum permanece como está.
- Copiar e a edição inline usam sempre o `userInput.text` original; não é permitido copiar nem preencher de volta o texto de exibição já achatado.
- Attachments, web element context e o chip de seleção da conversa ficam fora da área de recolhimento do corpo e permanecem totalmente visíveis mesmo com o corpo recolhido.

## Recolhimento de corpo longo

- O corpo do usuário tem altura máxima visível padrão de `120px`; quando o conteúdo real não transborda, nenhuma máscara ou botão de controle é exibido.
- Quando `scrollHeight > 121px`, entra no estado expansível. No estado recolhido usa-se uma máscara com gradiente na parte inferior, e o botão de expandir é exibido centralizado na parte inferior do bubble.
- Após expandir, a altura do corpo transiciona para o `scrollHeight` completo medido e o botão passa a ser o de recolher; clicar novamente restaura `120px`.
- A transição de altura dura `300ms` e também respeita `prefers-reduced-motion`.
- Quando o texto do corpo muda, ele volta ao estado recolhido e é medido novamente, evitando que a reutilização de row pela timeline virtualizada herde o estado expandido da mensagem anterior.
- Usa-se `ResizeObserver` para cobrir mudanças de largura da janela, de fonte e de layout dos ícones de mention/file; as medições são agrupadas por `requestAnimationFrame`, e o observer e o RAF devem ser limpos no unmount.
- O desktop e o controle remoto Web no celular usam a mesma semântica de recolhimento. Em telas de toque o botão é clicável normalmente, sem depender de hover.