# Saudação por Horário no Estado Vazio do Chat

O título do estado vazio do rascunho de nova conversa deixa de exibir o nome do workspace ou do
projeto e passa a mostrar uma saudação conforme a hora local do usuário. Esse texto reduz o
mal-entendido de que "o sistema já criou uma tarefa" e evita vincular a semântica da entrada a um
projeto específico.

## Comportamento

- Usa a hora local atual do navegador/renderer no dispositivo do usuário para escolher o texto,
  sem usar o fuso do servidor, do workspace ou do host remoto.
- Divisão dos períodos:
  - `05:00-08:59`: manhã
  - `09:00-11:59`: parte da manhã
  - `12:00-13:59`: meio-dia
  - `14:00-17:59`: tarde
  - `18:00-22:59`: noite
  - `23:00-04:59`: madrugada
- O texto deve passar pelo i18n locale de `packages/ui`, sem strings visíveis ao usuário hardcoded no
  componente.
- O texto do título não insere o nome do workspace/projeto, evitando confusão com o workspace
  atual, a workspace identity remota ou o contexto de controle remoto mobile.
- O texto de meio-dia usa a semântica de "faça uma pausa", evitando continuar enfatizando o
  avanço da tarefa.
- O texto de tarde usa a semântica leve de "o resto fica com o assistente", sem usar expressões de
  internet como "摸鱼", que podem reduzir a profesionalidade do contexto de trabalho.
- O texto de madrugada lembra de forma breve o usuário de cuidar de si, sem presumir que ele já
  esteja com sono.

## Texto em Chinês Simplificado

| Período | Texto                                  |
| ------- | -------------------------------------- |
| Manhã   | Bom dia, começou um novo dia           |
| Mañana  | Bom dia, em que posso ajudar?           |
| Meio-dia| Almoço, quer dar uma pausa antes?      |
| Tarde   | Boa tarde, o resto fica comigo         |
| Noite   | Boa noite, foi um dia trabalhoso        |
| Madrugada| Já é tarde, não se esqueça de se cuidar |

## Texto em Inglês

O inglês preserva a mesma intenção por período, usando expressão natural e local, sem traduzir
literalmente os marcadores de Mandarin.

| Período       | Texto                                          |
| ------------- | ---------------------------------------------- |
| Early morning | Morning, ready when you are                   |
| Morning       | Morning, how can I help?                      |
| Noon          | Noon break?                                   |
| Afternoon     | Good afternoon! Leave the rest to me.         |
| Evening       | Evening, nice work today                      |
| Late night    | It's late—remember to take care of yourself.  |

## Visual

- O título usa a fonte sem serifa padrão da UI, sem `font-serif`.
- O desktop mantém a hierarquia de título maior original; o rascunho do controle remoto mobile
  mantém uma hierarquia de título compacta.
- O texto precisa ser compatível com a diferença de comprimento entre chinês e inglês, sem
  depender de concatenação com o nome do projeto nem de largura fixa.
- O Logo do estado vazio continua usando o gráfico de linha inline no tema claro; o tema escuro usa
  `packages/ui/src/assets/Z.svg`, renderizado de forma mutuamente exclusiva via classe de tema,
  evitando que os dois gráficos ocupem espaço ao mesmo tempo ou sejam reconhecidos por leitores de
  tela. O gráfico de linha claro mantém a máscara com fade inferior e `opacity-70`; o recurso
  escuro já traz gradiente e transparência e não deve receber novamente máscara ou opacidade
  comum.