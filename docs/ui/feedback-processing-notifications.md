# Visualização do Andamento do Processamento de Feedback

## Objetivo

Depois que o usuário envia um feedback, ele pode ver em "Meus feedbacks" o status de processamento pelo backend, as respostas oficiais e a linha do tempo. A consulta de status do feedback acontece apenas quando o usuário entra ativamente em páginas relacionadas ao centro de feedback, evitando que o aplicativo continue buscando a lista de feedbacks em segundo plano.

## Estratégia do Cliente

- Na inicialização do aplicativo e enquanto o centro de feedback não está aberto, não há polling da lista de feedbacks em segundo plano.
- Quando o usuário abre a página "Meus feedbacks", `TicketsView` busca a lista de tickets do usuário atual.
- Quando o usuário seleciona um feedback, a página de detalhes busca os detalhes desse ticket, exibindo o status mais recente, as respostas, os anexos e a linha do tempo.
- Quando o usuário clica no botão de atualizar da lista, depois de enviar um feedback e navegar para os detalhes, ou após o sucesso do envio de informações complementares, a lista e os detalhes atuais são buscados novamente.
- O centro de feedback não exibe mais toast, notificações de desktop ou o badge de não lidas em "Meus feedbacks" por polling em segundo plano; basta o usuário entrar ativamente em "Meus feedbacks" para ver o status mais recente.

## Comportamento de Clique

A entrada de feedback serve apenas para abrir o centro de feedback. Quando o usuário quiser ver o andamento do processamento, ele entra na lista "Meus feedbacks" e seleciona o ticket correspondente.

## Contrato do Backend

O cliente atualmente depende do `updated_at` e do `status` retornados pela interface de listagem, e dos eventos, comentários e anexos retornados pela interface de detalhes. Basta o backend atualizar o `updated_at` do ticket após as ações abaixo para que o usuário veja o andamento mais recente ao abrir ou atualizar "Meus feedbacks" na próxima vez:

- O administrador muda o status.
- O administrador responde ao usuário.
- O despacho, a publicação ou outra ação de processamento escreve na linha do tempo do ticket.

Se no futuro o produto voltar a precisar de contato proativo, introduzir WebSocket, SSE ou push de mensagens; não restaurar o polling do cliente em intervalo fixo.