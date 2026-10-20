# Abertura do histórico do projeto antigo: correção da interação de teste

Status: done

## Progresso da reverificação do patch 08

No lote `r3-server-20261011143037600-31012b`, `history-single` e `history-merge`, usando o
ponteiro real da linha visível dentro do projeto, abriram e continuaram a conversa de
1 / 2 taskId originais, respectivamente. A canonical identity do snapshot de navegação,
o active pane e o taskId original estavam consistentes; a rota múltipla também passou pelo
completed ledger e pelas asserções de backup. Portanto, a dúvida inicial deixa de ser
listada como defeito de negócio confirmado. Nenhum código de negócio foi modificado.
Após a correção do ponto de entrada de teste do fallback para a versão antiga, os patches 09 e o
lote `r3-server-20261011150809016-2aeaba` passaram integralmente: single 275,9 segundos,
merge 310,0 segundos. A cobertura inclui a continuação da conversa do histórico original e o
fallback real para o programa antigo; a rota múltipla também conferiu que os dados lidos de fato
das duas linhas antigas continuam preservados após a mesclagem. O caso history overall já
conta como PASS.

## Dúvida inicial

Na baseline de negócio atual `d31e735905cf744e75a0a93548a80acabe871ae5`, o fixture da
versão antiga é `7a6e2eb3f1946aba9155155178e86cd947cee655`. Patch de teste 07, lote
`r3-server-20261011125749338-152f05`: `history-single` falhou em 258,3 segundos,
`history-merge` falhou em 281,5 segundos.

Depois que o programa antigo real gera a tarefa, houve upgrade para a versão atual e, em
seguida, o projectId original migrado foi adicionado pela lista de projetos. O project_id da
tarefa no banco remoto, o projeto e a root original foram conferidos; não foi criado um novo
projeto "(2)" no mesmo diretório para substituir o antigo. A linha da tarefa aparece, mas, ao
clicar na tarefa original, nenhum session pane correspondente apareceu em 30 segundos. Na rota
simples, a gravação parou em "conectando / dispositivo não conectado"; na rota múltipla, o
rascunho continuava vazio. Nos logs, o novo Main da rota simples recebeu um
workspace-context-bound ready às 21:42:00, mas faltou o registro da nova assinatura da tarefa
original. Não é possível tratar a conectividade do Source como prova de que o workspace
antigo e a tarefa foram restaurados com sucesso.

```text
Programa antigo gera histórico naturalmente → programa atual conecta e migra → adiciona o projeto original
  → linha da tarefa antiga visível → clique → pane da tarefa original não aparece
```

O primeiro resultado não é suficiente para localizar se a falha está na reatribuição de
identidade, na publicação do attachment ou na navegação de tarefas, nem para provar perda de
dados. Naquele momento, a continuação das tarefas antigas seguintes e o fallback para o
programa antigo ainda não tinham sido alcançados. O teste foi complementado com a operação de
ponteiro real da linha visível dentro do projeto, registrando a identity do projeto, o estado
da conexão, o cache de navegação e o pane visível antes e depois do clique; a implementação
de negócio permanece inalterada.

As evidências estão no diretório dos casos `history-single` / `history-merge` do lote acima,
contendo `upgrade-history.json`, a gravação da falha e os logs do Desktop. A falha de negócio
de [Renderer recarrega a navegação de tarefas](14-renderer-reload-task-navigation.md) continua
sendo acompanhada de forma independente.
