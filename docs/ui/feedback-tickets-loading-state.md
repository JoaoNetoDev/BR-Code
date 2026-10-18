# Estado de carregamento da lista "Meus feedbacks"

## Contexto

Ao clicar em "Meus feedbacks" na janela de feedback, a aplicação muda para a página de lista de tickets e chama imediatamente o serviço de feedback para carregar os tickets do usuário atual. Durante a primeira carga da lista, se a área de conteúdo estiver vazia, a interface original permanecia em branco, e o usuário não conseguia distinguir se a requisição estava em andamento ou se não havia registros.

## Comportamento

- Depois de entrar em "Meus feedbacks", enquanto a primeira requisição da lista ainda não tiver retornado e não houver tickets em cache, um estado de carregamento é exibido no centro da área de conteúdo.
- O estado de carregamento usa o texto de internacionalização `common.loading` já existente e um ícone giratório, exibidos centralizados na área de conteúdo da lista, sem afetar o título da janela, o botão de voltar, o botão de fechar nem os botões de ação do rodapé.
- Se a lista já tiver conteúdo e o usuário atualizar, continua-se usando a indicação de carregamento existente no rodapé da lista, evitando sobrepor os tickets já carregados.
- Após a conclusão da requisição, o estado vazio, a lista ou a mensagem de erro são exibidos conforme a lógica existente.

## Não objetivos

- Não modifica o envio de feedback, o upload de capturas de tela/logs, a indicação de upload em segundo plano nem o comportamento de detalhe do ticket.
- Nenhuma nova interface de feedback ou estratégia de cache é adicionada.