# Exibição do Diálogo de Pergunta do AskUserQuestion no Mobile

## Contexto

O cabeçalho do painel AskUserQuestion / elicitation chegou a truncar o texto da pergunta em uma única linha para se
manter compacto, com um title no hover como fallback. Isso funcionava de forma aceitável no desktop, mas o controle
remoto Web mobile não tem hover, e o usuário percebe diretamente que "a pergunta não aparece por completo".

No mobile há ainda o problema de altura insuficiente de viewport: perguntas longas e muitas opções ocupam metade da
tela, e quando o usuário precisa consultar temporariamente o contexto, não pode simplesmente fechar o diálogo
bloqueante por meio de enviar ou ignorar.

## Solução

- a área de pergunta do painel adota a ordem `<tag> <question>`: tag primeiro, question logo em seguida.
- no desktop a question não é truncada em uma linha e deve quebrar naturalmente mostrando o texto completo.
- no mobile a question longa é limitada por padrão a 4 linhas, com os botões "expandir pergunta / recolher
  pergunta"; após expandir, o enunciado pode ser lido por completo.
- o diálogo no mobile oferece, de forma geral, os botões "recolher diálogo de pergunta / expandir diálogo de
  pergunta". Após
  recolher, resta apenas uma linha de resumo compacta, o número da pergunta e o botão de expandir, ocultando a área de
  opções e as ações do rodapé, para facilitar a consulta do contexto.
- a recolha completa afeta apenas o estado de UI do cliente atual; não responde, não cancela e não modifica a requisição
  AskUserQuestion; ao expandir novamente, o usuário continua usando as opções e o rascunho originais.
- o texto da question usa `leading-6`, garantindo espaçamento de linha suficiente após a quebra; o texto das opções de
  resposta mantém altura compacta.
- o corpo da pergunta continua com o `title` nativo, como apoio para copiar/hover no desktop, mas não pode ser o único
  caminho de leitura completa.
- um header longo ainda pode ser exibido de forma compacta no topo com um Badge, evitando espremer os controles de
  paginação.
- o texto das opções segue a ordem natural de leitura: título primeiro, descrição logo em seguida. A área de texto não
  usa layout flex, evitando que título e descrição fiquem espalhados em posições fora da ordem de leitura.
- essa capacidade não altera o protocolo, o conteúdo da resposta, o fluxo da tarefa nem a semântica de remote
  replayable/desktop continuous do AskUserQuestion.

## Aceitação

- perguntas longas podem ser lidas por completo no desktop sem hover; no mobile, por meio de "expandir pergunta".
- tag e question são exibidos em ordem, e question não usa `truncate`.
- question usa `leading-6`, e o ajuste de entrelinha da question não afeta o título nem a descrição das opções.
- os controles de paginação não são espremidos por perguntas longas.
- o título e a descrição das opções são exibidos no mesmo fluxo de texto, com a descrição quebrando naturalmente após o
  título.
- é possível recolher todo o diálogo de pergunta no mobile e expandi-lo novamente pelo resumo recolhido, sem afetar o
  fluxo da tarefa nem o rascunho da resposta.
- a saída do SSR contém o corpo visível da pergunta completa e o atributo `title`, evitando regressões futuras.
