# Conexão SSH salva fica sem credenciais após o cold restart

Status: done

## Evidências atuais

- Baseline de negócio `d31e735905cf744e75a0a93548a80acabe871ae5`, build de teste; lote
  `r3-server-20261011104332183-3a0c00`, `boundary`, falhou após 90,1 segundos.
- Entrando pelo "Nova conexão" da página de configurações no assistente real de SSH, com a senha
  do container desta rodada, a primeira instalação foi concluída e os projetos A/B foram criados.
  A descrição de execução contínua aparece na primeira vez e não se repete no segundo projeto
  depois de fechada, `remoteBoundaryOnboardingVersion=2`.
- Usando o helper existente de reinício seguro, o processo antigo sai por completo e o
  `userData` é reutilizado. Após o reinício, o projeto original pode ser restaurado a partir do
  snapshot, mas, ao escolher um diretório pela entrada de dispositivos, aparece
  “没有可用的 SSH 密码或私钥凭据，请返回配置后补充”
  (“Não há credenciais de senha SSH ou chave privada disponíveis; volte à configuração para
  complementá-las”).
- No HOME preservado ainda há um Source e um Connection Profile, e o Profile ainda referencia a
  credencial de senha, mas o `credentials.json` está vazio. O estado de configurações, projetos e
  onboarding foi preservado; não foi o HOME inteiro que foi resetado.
- O log de execução registra um `credential.delete` antes da primeira operação de diretório após
  o reinício. A reverificação posterior e as sondas somente-leitura confirmaram o caminho em que
  a reprojeção do histórico do workspace exclui indevidamente as credenciais do Profile,
  descrito na seção seguinte.

## Evidências da causa raiz

O registro do mesmo case no lote `r3-server-20261011105317614-4a6780` mostra: antes do reinício,
passwordRefs=1, presentRefs=1; após a falha ainda há passwordRefs=1, mas presentRefs=0.
Portanto, não se trata de uma falha em não salvar inicialmente: a perda ocorre durante a
restauração do reinício.

O histórico remoto preservado nas configurações usa a route identity (`remote:ssh:...`), mas seu
target referencia `connection-profile:*:password`. Ao ser restaurado para a identity canônica
`remote:server:*`:

```text
O route history antigo referencia o segredo do Profile
  → buildRemoteWorkspaceSessionMutation reprojeta para a server identity
  → o novo snapshot remove corretamente a credential ref que o Renderer não possui
  → a limpeza de diferenças adiciona a ref antiga do Profile a credentialKeysToDelete
  → o Renderer chama credential.delete e o Profile oficial fica com referência pendente
```

Uma sondagem somente-leitura com entradas sintéticas sobre o `buildRemoteWorkspaceSessionMutation`
real atual: a entry antiga é `remote:ssh:127.0.0.1:2222:dev:/work`, a ref de senha é
`connection-profile:fixture-profile:password` e a nova identity é a server identity do mesmo
target. Retorna `deletesProfileOwnedCredential=true`, `saveCount=0`, `entryCount=1`. A sondagem
não chamou a API de persistência nem modificou o arquivo de credenciais.

Atualmente, `preservesRollbackCredential` protege apenas a key antiga `remote-workspace:remote:*`; a
key cujo owner é o Profile não fica protegida. O serviço de credenciais em si usa read-modify-write
sob lock de arquivo e não há evidência de cache antigo em processo sobrescrevendo o arquivo. A
correção deve restaurar a propriedade única da Source Directory sobre as credenciais do Profile,
em vez de reescrever a senha no case.

## Expectativa e impacto

Uma conexão SSH oficialmente salva deve conseguir reutilizar as credenciais após um cold restart
normal. Atualmente é preciso digitar a senha novamente, o que bloqueia a seleção de diretório
pós-reinício e também impede continuar a verificação da segunda metade da descrição de boundary
("após o reinício não se repete").

Diretório de evidências: `packages/desktop/.e2e-artifacts/r3-server-20261011104332183-3a0c00-boundary/`,
com `boundary-ack.json`, `test-results.ndjson`, a gravação de tela e os logs do desktop; o HOME da
falha é preservado pelo runner. Os testes passaram a incluir um diagnóstico somente-leitura da
existência das credential refs antes e depois do reinício, sem registrar o texto da senha ou da key.

Nesta rodada não se altera o código de negócio, e a falha não é mascarada por reescrita de
credenciais, retry automático ou remoção da asserção de restauração.

Com o mesmo baseline de negócio e o patch de teste 07, o `project-order` também ficou bloqueado
pela restauração da conexão após o cold start. A sondagem somente-leitura em execução confirmou
que as duas linhas de projeto estão offline, que nas configurações permanece 1
SSH passwordCredentialKey, mas que essa key não existe nas credenciais reais (passwordRefs=1,
presentRefs=0). Não se trata de falha no passo de arrastar; a asserção de ordenação após
desconectar/conectar ainda não foi alcançada. A evidência vem do lote
`r3-server-20261011125749338-152f05` e esse caso não deve ser considerado um sucesso de regressão
de ordenação.

Na fase de cold start do `recov` do mesmo lote, o Source antigo já foi restaurado com sucesso;
em seguida o log do Main registra primeiro `credential.delete OK` e, cerca de 4 segundos depois, a
conexão manual do projeto falha com `Connection Profile requires interactive credentials`.
Portanto, a falha da segunda metade desse caso tem evidência direta de credencial e não é
classificada como "não restaura após mais de 7 dias".

## 2026-10-12 Correção da causa raiz e regressão

O ponto de partida da correção `bc61ed5cc95264464937121788277bd40714566b` tem o mesmo limite
de negócio da versão do incidente acima. O coletor de limpeza de `remoteWorkspaceHistory`
tratava antes a "key referenciada pelo snapshot" como "key pertencente ao histórico"; desta vez
passa a coletar apenas as credenciais próprias `remote-workspace:`. A senha do Profile e a senha
da chave privada continuam sendo gerenciadas pela Source Directory, e a reprojeção bem-sucedida
com remoção da referência, o corte por capacidade e a remoção explícita do histórico não podem
apagá-las. Não houve adição de retry, reescrita de senha, cópia de credenciais nem alteração do
timing de restauração da conexão; a proteção de fallback legacy e a limpeza das credenciais
próprias do histórico foram preservadas.

Primeiro foi adicionada a regressão do módulo real: rekey bem-sucedido, corte por capacidade e
remoção explícita falhavam antes da correção, devolvendo todos a intenção de deletar a senha e a
senha da chave privada do Profile; o controle de recuperação de falha continuou passando. Depois
da correção, esse arquivo teve 28 casos passando e, junto com os 41 da Source Directory, 69 casos
passando. O E2E de boundary existente recebeu asserções rígidas sobre a existência das credential
refs antes e depois do reinício, e continua exigindo que a leitura real do diretório após o
reinício funcione, sem registrar o texto da key ou da senha.

A correção impede novas remoções indevidasas; credenciais já apagadas por versões antigas não
podem ser recuperadas do nada e ainda precisam ser salvas novamente pela entrada de autenticação
existente. O rollback envolve apenas o helper de limpeza do histórico e, se revertido, volta a
expor o risco de remoção indevida.

### Resultado da verificação e bloqueios restantes

Estado da implementação: implementada; estado da verificação: parcialmente verificada, a regressão
relevante de cold start continua falhando, sem commit automático.

- Checagem de tipos, lint (207 avisos preexistentes, 0 error), arquitetura (0 violation), formatação
  das alterações e checagem de diff passaram; a checagem do fixture canônico de boundary passou.
- A seleção de testes afetados alcança 397 arquivos Vitest e 4 arquivos de teste Node. A rodada em
  lote do Vitest teve 4465 casos passando e 1 caso de verificação de inventário acima de 30
  segundos; a reexecução direcionada do mesmo arquivo no mesmo código teve 11 casos passando
  (1,47 segundo), sem alterar timeout nem expectativa. Os scripts Node tiveram 34 casos passando; a
  Source Directory teve outros 41 passando. A primeira rodada em lote não deve ser registrada como
  totalmente verde.
- Lote remoto `r3-server-20261012003650390-d1994e`: 6 casos executados, **1 PASS / 5 FAIL**.
  Os artefatos de negócio foram reconstruídos, com entrada igual ao commit inicial mais o patch
  não commitado desta rodada; SHA-256 da lista completa de fontes:
  `86911f42edffb5a382f780bb6b469367606753e8cfcda3ec34fb920b7cf97724`.

| Caso         | Resultado       | Evidência desta rodada                                                                  |
| ------------ | --------------- | ---------------------------------------------------------------------------------------- |
| recov        | PASS, 176,5 s   | A restauração a frio do registro de conexão de 8 dias atrás e a conexão manual subsequente foram concluídas, sem bloqueio por falta de credenciais |
| boundary     | FAIL, 326,6 s   | Antes do reinício e no encerramento, referência de senha/existência real = 1/1; a espera pela restauração do workspace A falhou e as asserções posteriores da página de diretório não foram alcançadas |
| mixed        | FAIL, 404,6 s   | A sondagem em execução mostra a senha ainda em 1/1; o cold start restaurou apenas A e não completou B |
| coldreconnect | FAIL, 242,3 s   | A espera pela convergência de identity/session de A após o cold start falhou, e o active continuou sendo B |
| project-order | FAIL, 234,4 s   | A sondagem em execução mostra a senha ainda em 1/1; a restauração do projeto original falhou e a asserção de ordenação subsequente não foi alcançada |
| rdux14       | FAIL, 220,0 s   | A sondagem em execução mostra a senha ainda em 1/1; a restauração de A, que não tinha expiração definida, falhou primeiro, e não é possível afirmar com isso que existe um filtro de 7 dias |

As falhas restantes dão continuidade ao
[problema de restauração do workspace 15](15-cold-start-open-workspace-siblings.md) e não podem ser
mascaradas com reescrita contínua de senha nem com novos retries. Nesta rodada não se altera essa
cadeia de restauração e não se afirma que as 29 falhas históricas foram todas resolvidas.
As evidências locais estão em `packages/desktop/.e2e-artifacts/issue11-20261012/`: `summary.json`,
`case-evidence.json` e a saída das sondagens isoladas do problema 25. A fila foi encerrada, e o
container de testes e o lock da fila foram liberados.

## 2026-10-12 Verificação final concluída

A revisão da causa raiz do problema 15 encontrou conflito entre a asserção antiga de cold start e
o novo F5; após a correção da aceitação, o lote `r3-server-20261012012923737-60d156` teve
boundary/mixed/coldreconnect/project-order/rdux14 todos PASS; a lógica de negócio de restauração
não recebeu alterações adicionais. Em boundary, antes do reinício, depois do reinício e no
encerramento a referência de senha foi 1 e a existência real foi 1, e a leitura real do diretório
após o reinício funcionou; recov já havia passado no mesmo build de correção de negócio. A nova
regressão de credenciais e os testes da Source Directory passaram, os testes afetados e as
checagens de código necessárias passaram, e a implementação e a verificação deste item estão
concluídas. O 1 PASS / 5 FAIL da seção anterior é um resultado histórico anterior à correção da
aceitação obsoleta e não representa mais um bloqueio restante deste item.
