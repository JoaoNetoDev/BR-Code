# A reconexão automática é executada três vezes, mas a página do projeto não exibe o progresso das tentativas

Status: ready-for-human

Baseline de negócio `d31e735905cf744e75a0a93548a80acabe871ae5`, patch de teste 07.
O `retry-budget` do lote `r3-server-20261011125749338-152f05` falhou em 122.7 segundos.
O gate TCP real interrompeu a conexão e recusou as conexões seguintes; o `retry-budget.json`
registrou 3 recusas, e o MutationObserver do DOM não observou nenhum `1/3`, `2/3`, `3/3` durante
toda a janela de retry.
Ao final, o projeto já estava em offline e exibia a entrada de erro de conexão.

```text
Queda real → as três reconexões TCP foram recusadas → offline + entrada de erro
  └─ observação da página: o contador de progresso permaneceu sempre vazio
```

A [aceitação de exibição da conexão](../remote-connection-ux/12-sidebar-header-and-menus.md) exige
exibir um progresso como “自动恢复 2/3”. Atualmente `ProjectConnectionStatus` recebe apenas
connecting/error/logs, e durante a conexão exibe somente o spinner;
`RemoteConversationBanner`, embora obtenha a presentation, não renderiza a contagem de recovery
contida nela.
Desta vez confirmamos apenas que as páginas de projeto/sessão não têm progresso; não afirmamos que a
página de configurações também não tenha, e muito menos reportamos isso como "o retry não foi
executado em segundo plano".

Nesta rodada a implementação de negócio foi preservada. O teste moveu esta asserção de exibição,
não pré-requisito, para o final do cenário, mantendo a exigência de falha e continuando a validar a
recuperação silenciosa após a liberação da rede e a tomada de controle manual. O lote
`r3-server-20261011143037600-31012b` do patch 08 concluiu essas duas etapas: a recuperação
silenciosa e a tomada manual de controle receberam sessions diferentes, e a contagem de Hosts foi
mantida; ainda assim a execução falhou ao final por causa de displayedAttempts=[] (276.8 segundos).
Portanto, o defeito remanescente é a visibilidade do progresso; o caminho de recuperação em
segundo plano já tem evidência independente de aprovação.

Evidências: o `retry-budget.json` do lote `retry-budget` acima, o run log e o vídeo de falha.

Progresso de 2026-10-15: a linha do projeto recebeu, no topo dos detalhes de identidade remota, uma
área de progresso de conexão que lê `recoveryAttempt/Limit` do registro de estado e exibe
“自动恢复 n/3”. O `retry-budget` passou a abrir os detalhes durante a conexão e a mantê-los até o
estado final; o `hovercard-retry-20261015-r3` observou `displayedAttempts=[1,2,3]` e passou com PASS.
A própria linha do projeto, conforme o design já confirmado, exibe apenas “连接中”, sem contador
permanente; a faixa da sessão ainda não renderiza a contagem de recovery, e se ela deve ser incluída
permanece pendente de confirmação humana.
