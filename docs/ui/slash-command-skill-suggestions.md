# Sugestões de skills no slash command

## Contexto

Os usuários têm o hábito de digitar `/` no campo de entrada do chat para buscar as capacidades disponíveis. Hoje as skills só aparecem no painel acionado por `$`, o que faz com que, ao entrar no menu `/`, o usuário não veja as skills habilitadas e acredite que elas estejam indisponíveis.

## Semântica de produto

- O painel `/` continua sendo a porta de entrada de descoberta de capacidades, exibindo três tipos de resultado: slash commands, skills e subagents.
- Ao selecionar uma skill pelo painel `/`, o conteúdo inserido continua usando a semântica existente de mention `$skill`; não se cria um novo protocolo de comando `/skill`, nem se permite que o lado do agent confunda skill com custom slash command.
- A lista de skills reutiliza o estado de habilitação, o filtro por provider, o agrupamento de nomes iguais e as descrições localizadas do painel `$`, evitando exibição inconsistente entre as duas entradas.
- Com query vazia, a exibição segue a ordem de grupos commands, skills, subagents; com query, cada grupo reutiliza a busca difusa existente e a seleção padrão por teclado no escopo global continua escolhendo o melhor item pela pontuação unificada.

## Limites

- Esta alteração afeta apenas o painel de sugestões do composer de UI e a serialização de mentions; não modifica `@zcode/protocol`, session stream, task queue, snapshot nem as semânticas de replayable/continuous do controle remoto.
- O desktop e a Web remota leem as skills pelo shared skill store existente; o workspace remoto continua isolado pela lógica de binding de `workspaceIdentity` já existente.
- Se o skill store não carregar ou der erro, o painel `/` mostra o estado de carregamento/erro apenas no grupo de skills, sem bloquear commands e subagents.

## Aceitação

- Digitar `/` mostra o grupo de skills habilitadas.
- Digitar `/code` faz match de skills como `code-review`.
- Após selecionar a skill, o campo de entrada gera o markdown de mention de skill já existente e o caminho de envio equivale ao da seleção pelo painel `$`.
- O painel `/` continua exibindo `/goal`, `/compact`, `/init`, custom commands e subagents.