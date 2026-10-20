# A configuração de reconexão automática ainda descreve o filtro de 7 dias que foi cancelado

Status: ready-for-human

Baseline de negócio `d31e735905cf744e75a0a93548a80acabe871ae5`.
O log de execução `version-optional` do lote `r3-server-20261011105317614-4a6780` leu de fato a
descrição na página de configurações:
"启动时静默重连最近 7 天内在线过的设备" ("reconecta silenciosamente na inicialização os
devices que ficaram online nos últimos 7 dias").
Esse é um texto de configuração visível, não a string esperada em uma fixture de teste.

O [contrato atual de recuperação](../../remote/desktop-remote-session-renderer-reattach.md) é
explícito: todas as conexões salvas são ordenadas pelo tempo de último acesso online, cada uma é
tentada uma vez, sem filtro de 7 dias; a chave global de desligamento e a restrição de conseguir
credenciais silenciosamente permanecem.
Por isso a descrição da configuração leva o usuário a acreditar que devices com mais de 7 dias
não se conectam automaticamente.

A descrição deve ser alterada para o escopo e a regra de ordenação atuais, verificando também o
chinês e o inglês. A especificação principal do R3 e o case catalog ainda possuem entradas de
7 dias,
devendo ser sincronizados conforme o contrato de recuperação vigente acima, e não alterando a
lógica do produto de volta para o filtro antigo. Esta rodada apenas registra, sem modificar o
texto ou a lógica de negócio.

Este item é uma inconsistência de descrição independente; a falha real de `version-optional` é a
ausência do aviso de atualização na primeira leitura,
não podendo este registro substituir a triagem e a revalidação daquela falha.

Evidência adicional em máquina real: o arquivo `recov/recovery-guards.json` do lote
`r3-server-20261011125749338-152f05` registra Source.lastOnlineAt definido para cerca de 8 dias
atrás, e o cold start obteve um novo remoteSessionId, hostCount=1,
dialogShown=false, o que prova que a conexão não foi excluída pela regra de 7 dias. A recuperação
manual desse case falhou depois;
este registro cita apenas a fase de cold start já alcançada e não classifica o case inteiro
como PASS.
