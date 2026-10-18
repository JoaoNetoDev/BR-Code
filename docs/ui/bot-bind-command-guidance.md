# Orientação do Comando de Binding do Bot

## Contexto

Depois que o usuário gera o código de binding nas configurações do Bot, a interface mostra apenas `/bind <code>` e o ícone de cópia. O aviso atual não deixa claro que "este comando precisa ser enviado ao bot", e o usuário facilmente imagina que, depois de copiar, o binding já está concluído.

## Objetivo

- O painel do comando de binding deve exibir, antes do comando, uma orientação explícita: copie o comando abaixo e envie-o para o chat privado do bot.
- O texto do botão de cópia usa "copiar comando de binding", reduzindo a ambiguidade de quando só se vê um ícone.
- O toast de cópia bem-sucedida continua indicando o próximo passo: abrir o chat privado do bot, colar e enviar o comando.
- A lógica de expiração do código de binding, de atualização e de contagem regressiva permanece inalterada.

## Regras de UI

- Usar o nível `DetailPanel` já existente, sem criar nova camada flutuante nem cartão aninhado.
- O corpo do comando continua usando `font-mono` e `bg-surface`, preservando o aspecto técnico do conteúdo copiável.
- O texto de orientação usa `text-ui-base leading-5 text-foreground-subtle`, adaptado à quebra de linha em chinês e inglês e à largura do celular.
- Os passos de operação são apenas uma dica auxiliar e não introduzem novos estados de negócio.

## Textos

- Título: `绑定命令`
- Orientação: `复制下面的绑定命令，并发送给机器人私聊。`
- Botão de cópia: `复制绑定命令`
- Cópia bem-sucedida: `绑定命令已复制，请打开机器人私聊，粘贴并发送。`