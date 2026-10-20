# Conflito de histórico de um único workspace bloqueia toda a página de seleção de projetos remotos

Status: ready-for-human

Baseline de negócio `d31e735905cf744e75a0a93548a80acabe871ae5`, patch de teste 07.
O `history-conflict` do lote `r3-server-20261011125749338-152f05`: o programa antigo gerou
naturalmente o histórico de duas rotas, o teste apenas injetou no diretório A a contradição de
identidade de tarefa canonical/source e depois voltou para a conexão do programa atual.
O caso original falhou ao final de 880.0 segundos, e o motivo da saída foi o
“SSH 部署/连接没有完成” do helper.
O `history-conflict-sources` do mesmo lote (contradição de identidade entre dois source) também
saiu por timeout de espera em 865.2 segundos; seu vídeo de falha independente mostrou igualmente
o `SourceServerWorkspaceIdentityConflictError` de A, a lista de projetos vazia e o botão de novo
projeto desabilitado.
As duas injeções bloquearam na fase de seleção de projeto do primeiro diretório normal B, sem
ainda entrar nas ações posteriores de tratamento de conflito.

O teste pediu primeiro para abrir o diretório B sem conflito. A sonda WebDriver somente leitura,
em execução real, confirmou após 21:46: o assistente de conexão SSH já havia sido fechado e a
página “添加远程项目” exibia
`SourceServerWorkspaceIdentityConflictError: Source Server workspace task identity conflict`,
com o erro apontando para A; o botão “新项目” estava desabilitado e não havia projeto
selecionável. Portanto, o caso ainda não chegou à página de tratamento de conflito de A, nem às
asserções de retry ou de abandono da mesclagem, e também não provou que B ainda pode ser usado de
forma independente.

```text
Injeção de conflito apenas no histórico de A → conexão do Source bem-sucedida → leitura da árvore completa de projetos
  → o conflito em A faz a requisição da árvore de projetos falhar → lista de projetos vazia, novo projeto desabilitado
  → não é possível abrir antes o diretório normal B
```

O [contrato de migração R3](../../architecture/r3-source-server-remote-architecture.md) exige que a
falha bloqueie a abertura na granularidade de workspace, sem bloquear a conexão; o modelo de
projeto atual ainda precisa oferecer um caminho de entrada para os projetos sem conflito.
Após a falha geral do `service.readTree` do `RemoteProjectPicker`, a interface apenas exibe o
error e desabilita a criação de novo projeto; é preciso conferir o limite entre a leitura da
árvore de projetos remota e a migração lazy do histórico, e a usabilidade não pode ser restaurada
ignorando o conflito ou apagando o histórico antigo.

Nesta rodada a implementação de negócio não foi modificada. O helper de teste reporta
imediatamente a causa original quando um erro explícito aparece na página de projeto, evitando
esperar 10 minutos à toa por confundir uma desativação permanente com um estado ainda em
carregamento. O lote `r3-server-20261011143037600-31012b` do patch 08 validou essa otimização: o
mesmo cenário `history-conflict` terminou em 328.2 segundos e reportou explicitamente a contradição
de identidade acima, enquanto o lote original levou 880.0 segundos. Ambos mantiveram a geração
natural de histórico e o fixture de conflito; a falha de negócio continua registrada como FAIL; a
diferença de tempo total entre lotes distintos não equivale a uma comparação de performance da
etapa fixa de instalação. No mesmo patch, o `history-conflict-sources` levou 304.8 segundos,
contra 865.2 segundos do lote original, e também reportou imediatamente o mesmo conflito na
página de projeto.

Evidências: o run log do `history-conflict` do lote acima, o `upgrade-history.json` e o vídeo de
falha; a sonda somente leitura retornou picker=true, disabled=true e o texto de página acima.
