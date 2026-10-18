# Escopo de Workspace Local de Tasks Pinned

## Contexto

A lista de tasks pinned seguia antes integralmente a consulta de `workspaceTabs` da janela atual. Esse encadeamento funciona bem no caminho de inicialização “restaurar primeiro os workspace tabs e depois renderizar o sidebar”, mas, se futuramente houver suporte a restauração persistente para a visão de alguma task — por exemplo entrar direto na visão pinned/timeline —, as UI tabs podem ainda não ter sido criadas, e a consulta pinned ficaria sem workspace scope.

Ao mesmo tempo, um workspace remoto não pode ser misturado ao scope da consulta pinned quando não há `remoteSessionId`. Caso contrário, a resolução posterior do serviço pode cair em services locais, fazendo com que tasks remotas e locais do mesmo caminho sejam lidas em conjunto.

## Estratégia atual

- `workspaceTabs` continua sendo o estado de UI dos workspaces abertos na janela atual.
- A consulta pinned usa `useLocalWorkspaceScopes` para obter o scope de consulta.
- O pinned consulta somente as workspace tabs locais já abertas na janela atual.
- Sem nenhuma workspace tab local, não há leitura de fallback de `lastWorkspaceSession`: o scope de consulta fica vazio.
- Workspaces remotos não participam desse fallback scope; a consulta pinned remota precisa aguardar a establishment da sessão remota e passar pelo encadeamento de serviço remoto correspondente.

## Limites

Essa alteração muda apenas a origem do scope local da consulta de tasks pinned e não muda se os workspace tabs reais são restaurados ou não na inicialização do app. Se no futuro for adicionada uma restauração de visão pinned remota, o scope de consulta remota precisará ser conectado separadamente depois que a sessão remota estiver pronta, e não por meio de fallback para o scope local.