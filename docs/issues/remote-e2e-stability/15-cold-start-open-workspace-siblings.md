# Cold start não repõe o outro workspace remoto que já estava aberto

Status: done

Baseline de negócio `d31e735905cf744e75a0a93548a80acabe871ae5`, patch de teste 07.
O caso `mixed` do lote `r3-server-20261011125749338-152f05` falhou após 407.4 segundos.

## Evidências reais

`mixed-entries.json` registra, antes do reinício, que os dois workspaces A/B do mesmo Source
estavam online, com identity distinta, e o active era A; as entries persistidas também
incluem explicitamente A/B. Não se trata de apenas dois projetos com membership, sem nunca
ter aberto B. No início do cold start havia somente o item de navegação de A; ao longo dos
240 segundos seguintes nunca se observou a recuperação simultânea de A/B.

O processo Main antigo confirmou, antes do reinício, que A/B estavam ambos
workspace-context-bound e ready. Após a saída, o novo Main registrou em 21:00:23 apenas
um connect ready, com sessionId igual ao de A, que já havia entrado online durante a
espera; não há registro de um novo ready/bound para B. Não se pode atribuir esse
comportamento apenas a uma falha de cache de navegação e afirmar que os dois attachments
foram recuperados.

O caso `boundary` do mesmo lote tem B como último item ativado; no cold start só foi
observada a conexão desse item, e a espera por A falhou após 180 segundos. Esse caso também
registrou que as credenciais de Profile passaram de existentes para ausentes, conforme
describe o [problema 11](11-ssh-credential-missing-after-restart.md). Ainda não foi
confirmado se existe uma causa raiz comum entre os dois.

O caso `rdux14` do mesmo lote falhou após 251.2 segundos: apenas o lastOpenedAt de B foi
definido para 8 dias atrás, mas o cold start falhou primeiro enquanto aguardava A, que
nunca recebeu expiração, e o active continuava apontando para B. O novo Main teve apenas
um connect ready; o log também contém um credential.delete. Esse resultado não pode ser
classificado como "o filtro de 8 dias ainda existe", pois a asserção de recuperação
independente de B ainda não foi alcançada. O caso `coldreconnect` do mesmo lote também
parou na espera pela recuperação de A após o cold start (291.1 segundos), mantendo
integralmente as asserções originais de recuperação automática.

```text
Antes do reinício: A online + B online, open set persistido = {A, B}, active = A
Cold restart: Main/Host antigo sai → novo Main/Host → A ready
Em seguida: B não é reposto (observação por 240 segundos); o active original continua sendo A
```

## Contrato e escopo

O [contrato atual de recuperação do Renderer](../../remote/desktop-remote-session-renderer-reattach.md)
exige que, depois que o Source fica online, sejam recuperados todos os projetos abertos,
desconectados e de identity estável daquela janela, sem omitir siblings por causa da idade
do workspace ou do estado da última conexão, mantendo o foco original. O resultado atual
desta execução não satisfaz toda a recuperação.

É preciso conferir a passagem entre o open set de inicialização, o Source ficar online e a
recuperação dos workspace attachments. Este registro não infere que dados históricos
tenham sido apagados nem trata o Source já conectado como se cada workspace tivesse sido
recuperado. Nesta rodada a implementação de negócio foi mantida; os testes apenas
completaram o diagnóstico com a linha do tempo real da falha, sem adicionar cliques
manuais no lugar da recuperação automática.

Diretório de evidências: `packages/desktop/.e2e-artifacts/r3-server-20261011125749338-152f05-mixed/`;
o run log do mesmo lote mantém os registros de ready e bound dos processos antigo e novo.

## Reverificação após a correção de credenciais de 2026-10-12

O lote `r3-server-20261012003650390-d1994e` usou `bc61ed5cc9` com a correção de limpeza
de credenciais do problema 11 e reconstruiu os artefatos de negócio; a lógica de
recuperação deste item não foi alterada. `mixed` continua falhando após 404.6 segundos: na
observação do cold start só A está online e B não é reposto; `boundary` continua falhando
após 326.6 segundos: active B, e a convergência de identity/session de A estoura o tempo
limite. A sonda de execução somente leitura confirma que ambos os casos têm
passwordRefs=1 e presentRefs=1, e as evidências de encerramento de boundary também
mantêm 1/1. Portanto, a remoção indevida de credenciais já não explica sozinha essas
falhas de recuperação; a correção do problema 11 não é extendida para declarar este item
como resolvido. `coldreconnect` do mesmo lote continua em FAIL (242.3 segundos); o
resultado completo do lote está no problema 11.

`project-order` está em FAIL (234.4 segundos) e `rdux14` em FAIL (220.0 segundos), ambos
parados na espera pela recuperação de A com o active ainda sendo B; durante a execução,
as referências de senha e as existentes permanecem 1/1. Este último não entrou na asserção
independente de B com 8 dias atrás, portanto não se julga o filtro por idade com base
nisso. `recov` passou, o que prova que não é possível classificar todos os caminhos de
recuperação como falha.

## Revisão de causa raiz em 2026-10-12: retirada da qualificação de negócio "cold start perde sibling"

A versão aplicável continua sendo `bc61ed5cc9` com a correção do problema 11. Os logs de
settings em tempo de execução das cinco falhas contêm simultaneamente: a projeção A/B do
antigo `lastWorkspaceSession` e o diretório ativo único da nova versão `lastActiveWorkspace`.
O diretório ativo de `mixed` é A; o dos demais é B; a recuperação real do cold start
coincide com a seleção ativa.
`readPersistedWorkspaceSessionEntries`, quando o novo campo existe, retorna apenas o
diretório ativo — exigência explícita da spec F5 de projeto virtual, que não pode ser
revertida para ler a lista antiga só para satisfazer o caso de teste antigo. Documentos
remotos anteriores trataram o contrato antigo de open-set como se fosse o contrato novo, o
que levou a uma classificação do problema e a expectativas de teste incorretas; esta
seção retira a qualificação "é obrigatório repôr todos os siblings no cold start"
enunciada acima.

A sonda do módulo real chama as funções de leitura e de recuperação com a mesma
seleção ativa e a projeção antiga A+B: as duas seleções ativas, A e B, geram somente um
tab correspondente, sem deferredRestore; junto com as importações da versão antiga
adjacente, 30 itens passam. A falha real original era evidência de ponta a ponta; esta
sonda valida o limite determinístico do primeiro candidato reduzido, sem se passar por uma
reprodução completa adicional do App.

`project-order` precisa de correção isolada: a falha antiga realmente estava na linha
102 (após o connectHost manual, a espera pelo tab de A não ativado), enquanto a recuperação
de B no cold start da linha 88 já havia sido concluída. O run log confirma ao mesmo tempo
que o connectHost teve sucesso; conforme G3/F5, conectar o dispositivo apenas atualiza as
entradas de projeto já salvas e não cria um tab no Renderer para diretórios não ativados.
O caso de ordenação deve afirmar que o projeto está online e que a ordem foi preservada.

```text
Nova seleção ativa A + projeção antiga A/B → reader retorna A → attachment de A pronto (conforme F5)
O teste antigo continua esperando B aparecer automaticamente → timeout → classificado incorretamente como falha de negócio
Aceitação corrigida: A recuperado automaticamente + entradas de projeto A/B preservadas → usuário abre B → attachment/tarefa de B disponível
```

A correção recomendada ajusta apenas as cinco E2E e a documentação de aceitação
correspondente, complementando com um teste unitário do novo diretório ativo remoto; a
lógica de recuperação de negócio não é alterada. RDUX-14 define diretamente o
lastOpenedAt do B autoritativo ativo como 20 dias atrás, em vez de alterar apenas o campo
antigo, que não participa da recuperação da nova versão.
Status de implementação: testes e documentação corrigidos, sem modificação da lógica de
recuperação de negócio. Status de verificação: as verificações necessárias previstas
passaram.

### Reverificação final direcionada

O lote `r3-server-20261012012923737-60d156` reutiliza o artefato de negócio com a correção
já verificada do problema 11; a lista completa do código-fonte tem SHA-256
`b7ef08e140b79ff69cda860e617b4f910fc6971e4b56f1780cf6d31bc82811c7`.
Este lote sincroniza apenas os insumos de execução de E2E/WDIO; os novos testes unitários
e a documentação da máquina local não afetam este build de negócio.

| Caso          | Resultado       | Aceitação válida mantida                                               |
| ------------- | --------------- | ---------------------------------------------------------------------- |
| boundary      | PASS, 141.6 s   | active B recuperado automaticamente, leitura do diretório após o reinício bem-sucedida, referências/presença de senha em 1/1, ou seja, sem duplicação |
| mixed         | PASS, 156.3 s   | recuperação automática de A, entradas de projeto preservadas, B aberto sob demanda, session independente, continuação da tarefa original |
| coldreconnect | PASS, 186.8 s   | B recupera automaticamente a sessão original, A é aberto sob demanda, ambos dão continuidade à conversa, fechamento do reconexão automático e restauração manual |
| project-order | PASS, 142.8 s   | ordem e status online dos projetos após arrastar, cold restart e desconectar/conectar |
| rdux14        | PASS, 132.4 s   | o B autoritativo ativo definido para 20 dias atrás ainda é recuperado automaticamente, A é aberto sob demanda, com um único Host compartilhado |

Os Vitest afetados somaram 408 arquivos / 4531 itens passando e 34 scripts Node passando;
tipos, lint (207 avisos já existentes), arquitetura, 5 fixtures, formatação e verificação
de links passaram. Este item não é um afrouxamento do comportamento do produto nem uma
remoção de ramos de falha para deixar o teste verde. Os casos de diagnóstico do problema
25 continuam em FAIL, com as evidências brutas do Worker para a falha esperada, e não são
contados nas cinco aceitações de correção acima.
