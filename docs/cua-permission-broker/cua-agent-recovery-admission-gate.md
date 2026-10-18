# Especificação do Gate de Admissão de Início de Agent durante a Recuperação do CUA Helper (solução histórica, obsoleta)

> O esquema `beginRecovery -> recycleUntilStable -> disposeWorkspace` registrado neste documento foi substituído
> pelos P0/P2 de `2026-09-02-helper-lifecycle-agent-runtime-isolation-spec.md`. A montagem padrão atual não injeta mais
> o Helper recovery gate no Agent process manager, e Helper ready/recovery não pode bloquear, reciclar ou reiniciar o Agent.
> O fluxo descrito aqui serve apenas para análise de incidente e não deve ser usado como base para novas implementações.

## Contexto e Definição do Problema

Na 3.9.1 apareceu no Windows o problema "não é possível conversar após a atualização / nenhuma sessão histórica abre". Os tickets
`ZCT-2092090611952320` e `ZCT-2092131182991814656` têm em comum: durante o cold start ou a recuperação do Helper,
o Agent já havia sido levantado mas recebeu `BROKER_UNAVAILABLE`, e em seguida o Helper ready desencadeou a reciclagem; a UI, o warmup e a reciclagem de recuperação solicitaram um novo Agent ao mesmo tempo, fazendo com que o client antigo, já disposed, ainda tivesse promessas de start em andamento gravando de volta no pool de processos. O resultado é spawn/`workspace-dispose` repetidos no mesmo workspace em pouco tempo, com o conversation protocol client em estado disposed, deixando a área central de conteúdo e o campo de entrada inutilizáveis.

Não é um problema de protocolo exclusivo do Windows. O Windows não tem o rendezvous POSIX `.pending`, o que torna a janela de início de Helper e Agent mais facilmente exposta; o macOS ainda pode disparar a mesma corrida quando o Helper fica ready pela primeira vez, a rotação de credenciais e o dispose de workspace ocorrem simultaneamente. Portanto a barreira de admissão fica na camada compartilhada Host/Agent, e não na implementação de Helper transport de alguma plataforma.

## Objetivos e Não Objetivos

Objetivos:

- Depois que a recuperação do Helper ou a rotação de credenciais começa, proibir o spawn de novos child processes do Agent; requisições de início que já estão resolvendo command/env devem checar a admissão novamente antes do `spawn()` real.
- Inícios concorrentes do mesmo workspace continuam fundidos em uma única promessa; o dispose de workspace não pode perder da tabela de rastreamento as promessas de início ainda incompletas.
- Depois que a reciclagem de recuperação termina e a generation atual é submetida, a admissão abre uma única vez e os Agents subsequentes partem com as novas credenciais do Helper.
- Manter fail-closed: quando a recuperação falha, Agents com estado antigo de broker não passam; a requisição retorna um erro re-tentável, e o retry limitado já existente na UI serve como rede de segurança.
- O desktop usa a cadeia realtime `continuous`, e o web remote usa a cadeia de recuperação `replayable`; esta especificação não altera o limite de entrega de mensagens de nenhum dos dois.

Não objetivos:

- Não adicionar novos loops de retry infinitos na UI nem deslocar estado de task/session para o relay ou o Main.
- Não mascarar a corrida ampliando o grace period de cold start do Helper; o Helper ready continua sendo desencadeado pela reciclagem feita pelos watchdog/reconcile já existentes.

## Estado e Ordem de Eventos

Cada CUA Helper compartilhado dentro do Host corresponde a um admission gate. O gate protege apenas o spawn do child process do Agent, e não bloqueia o próprio início/parada do Helper.

```text
                  beginRecovery(epoch)
       +----------------------------------------+
       |                                        v
   +--------+   close gate   +-----------------------+
   | OPEN   | --------------> | RECOVERING(epoch)   |
   +--------+                 +-----------------------+
       ^       commitRecovery / failRecovery |  ^
       |                                      |  |
       +--------------------------------------+  |
       waitForSpawnAdmission()                 |
       - OPEN: resolve                         |
       - RECOVERING: queue                      |
       - stale generation/dispose: reject      |
```

A ordem correta entre recuperação e início é:

```text
Helper unavailable/credentials rotated
        |
        v
gate.beginRecovery()  --->  disposeWorkspace() increments generation
        |                                      |
        |                                      +--> in-flight start cannot spawn
        |                                           and remains tracked until finally cleanup
        v
registry.recycleUntilStable(dispose, guardedCommit)
        |
        +--> all registered workspaces disposed
        +--> revision stable
        +--> guardedCommit() attempts to publish the current generation
        |
gate.commitRecovery() ---> queued starts re-check generation/env, then spawn once
```

## Contrato de Implementação

### 1. Admission gate do Host

- `beginRecovery()` retorna um epoch incremental; um begin repetido não abre nem reseta um período de recuperação já existente.
- `waitForSpawnAdmission()` é um hook opcional do Agent process manager, chamado antes de `spawn()`.
- `commitRecovery(epoch)` só tem efeito para o epoch atual e libera os esperadores.
- `failRecovery(epoch, error)` libera os esperadores com falha; a próxima requisição ainda precisa passar pela verificação fail-closed de `resolveSpawnEnv`.
- O gate não mantém dados de workspace/session/task e não participa da lógica de snapshot/queue do desktop continuous nem do web replayable.

### 2. Pending start e cerca de geração

- `startingByWorkspaceKey` é uma via única por workspace; o dispose só pode incrementar a generation em +1 e manter a promessa em andamento até a limpeza no finally.
- A promessa de início, depois de resolver command/env e antes do `spawn()` real, verifica nesta ordem: o manager não está disposed, a generation do workspace não mudou e o admission gate já está aberto.
- Qualquer verificação falha não pode criar child process nem gravar promessa/client antigo em `processesByWorkspaceKey`.
- Novas requisições após o dispose continuam reutilizando a promessa antiga até que ela termine, evitando um segundo corredor de spawn; depois que a promessa antiga sai, a próxima requisição é que estabelece uma nova promessa de início, e o finally só pode limpar a entrada do map por identidade da promessa.

### 3. Fechamento da recuperação

- `recycleUntilStable` continua usando a revision do workspace registry como condição de estabilidade; o consumer faz o commit guardado abrindo o gate e submetendo o Helper marker ao mesmo tempo.
- Depois que o gate é fechado, um novo `getClient` espera antes de resolver command/env e portanto não gera novas revisions no registry; apenas requisições antigas que já entraram no resolve podem contribuir com um pass extra, submetendo em seguida sobre uma revision estável.
- A semântica de admissão duplicada do registry continua mantida pelo producer; esta correção não altera o named pipe do Windows nem a versão do pacote do producer, evitando acoplar a correção de recuperação do consumer ao lançamento do producer de CUA.
- O `commitRecovery` do producer é hoje um callback `void`, e o Healthy⇒clear do spawn-env pode limpar o marker antes da próxima leitura do producer. Portanto o gate não pode esperar "o producer necessariamente chamará de novo" como condição de abertura, senão haveria um deadlock permanentemente active; hoje o gate ainda é fechado no lado do consumer pelos caminhos de commit/fail.
- Um commit de generation obsoleta pode fazer o gate abrir uma curta janela antes do fechamento final do producer. Essa janela não entrega socket/token antigos, mas pode gerar Agents extras com `BROKER_UNAVAILABLE`; é um item de observação de P2 e esta correção não introduz um novo contrato entre repositórios.
- Se a recuperação lançar erro, o gate fica fail-closed, registra um warning/error uma vez e a recuperação fica a cargo da próxima requisição e do retry limitado já existente na UI; não se pode iniciar retry infinito em segundo plano dentro do Host.

### 4. Cross-platform e cadeia de mensagens

- Windows: o named pipe não tem rendezvous `.pending`, então é obrigatório depender do admission gate do Host para impedir que o Agent faça spawn antes do Helper ready.
- macOS: o rendezvous POSIX é mantido, para reduzir a corrida de cold start; o gate funciona como barreira de recuperação compartilhada, cobrindo as janelas de restart do Helper/rotação de credenciais.
- O `desktop-continuous` não concatena as mensagens de recuperação do web replayable; o `web-remote-replayable` continua recuperando por snapshot/gap.

## Aceitação e Observação

Cobrir pelo menos os seguintes cenários de regressão:

1. Com o gate fechado, chamadas concorrentes a `getClient` só podem manter um pending start, e apenas um Agent é spawneado depois do commit do Helper.
2. Executar `disposeWorkspace` enquanto o resolve de command/env está pendente; após a recuperação, o start antigo não faz spawn; em seguida novas requisições conseguem fazer spawn com sucesso.
3. Quando o commit da recuperação falha, os esperadores recebem o erro e nenhum Agent com credenciais antigas é spawneado.
4. Windows e macOS usam o mesmo comportamento do gate; as diferenças de plataforma ficam apenas na camada de Helper transport/rendezvous.
5. Os testes de session realtime já existentes de desktop continuous e web remote replayable continuam passando.

Os logs de produção devem conseguir correlacionar, por workspaceKey/epoch, os seguintes eventos de ciclo de vida de ocorrência única: `recovery_begin`, `spawn_admission_wait`,
`recovery_commit`/`recovery_fail`, `spawn_blocked_by_generation`; o log de commit também registra se a admissão foi de fato liberada.
Não se deve determinar generation obsoleta apenas pela contagem de spawns entre dois logs de admissão; é preciso combinar evidence de generation ou de marker.
O stream/chunk item a item continua em debug, para evitar inflação do volume de logs.