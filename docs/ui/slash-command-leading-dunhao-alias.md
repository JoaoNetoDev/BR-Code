# Alias de vírgula ideográfica como primeiro caractere de slash command

## Contexto

Com um método de entrada em Mandarin ativo, quando o usuário quer digitar `/` como primeiro caractere no campo de entrada do chat para invocar um slash command, pode acabar digitando a vírgula ideográfica `、`. Se `、` for incluído diretamente na correspondência de slash command, a fronteira de parsing de comandos é ampliada e a entrada normal de pontuação em chinês acaba sendo afetada.

## Objetivos

- Tratar apenas o `、` digitado manualmente pelo usuário como primeiro caractere no campo de entrada do chat.
- Quando `、` for tornar-se o primeiro caractere do texto inteiro do campo de entrada, substituí-lo imediatamente por `/` em ASCII.
- Após a substituição, continuar reutilizando o painel de slash command `/` existente, o filtro, a inserção de mention e a lógica de parsing de envio.
- Não substituir globalmente as vírgulas ideográficas do corpo do texto e não tratar colagem ou conteúdo pré-preenchido pelo programa.

## Limites

- Apenas entradas reais com `inputType === "insertText"` e `data === "、"` no `beforeinput` do navegador são tratadas.
- Não há substituição quando o cursor não está no início do texto inteiro do editor; por exemplo, `你好、` permanece como está.
- Conteúdo programático, como colar `、goal`, restauração de rascunho histórico ou preenchimento externo, não é substituído.
- A correspondência e a execução de slash commands continuam reconhecendo apenas o `/` padrão; esta funcionalidade faz uma única correção antes de a entrada entrar no editor.

## Compatibilidade

- A lógica fica na camada de entrada Lexical de `packages/ui`; o desktop, a Web local e o controle remoto do celular reutilizam o mesmo componente de entrada.
- Não modifica `@zcode/protocol` nem afeta agent, session, fluxo de mensagens continuous/replayable ou a task command queue do controle remoto.

## Aceitação

- Com o campo de entrada vazio, ao digitar `、` manualmente, o conteúdo passa a ser `/` e o painel de slash command é invocado naturalmente.
- Com o cursor no início de um conteúdo existente, ao digitar `、` manualmente, o primeiro caractere é corrigido para `/`.
- Com o cursor fora do início do texto inteiro, ao digitar `、` manualmente, nada é substituído.
- Colar ou escrever programaticamente `、goal` não é substituído.
- O comportamento original de slash command com `/` permanece inalterado.