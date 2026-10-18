# Travamento ao selecionar diretório em workspace remoto: RPC permanentemente pending envenena o cache de sincronização in-flight do provider

> Forensics do incidente + design da correção. Ramo correspondente `fix/ssh-hang-2`.
> Versão do incidente: 3.8.1 (commit `99f955e2`); material de forensics: pacote de logs do usuário `zcode-logs-full-20260821-100852-ssh-hang` (2026-08-21, fuso local UTC+8).
> O Provider Refactor removeu por completo a funcionalidade de sincronização do Registry envolvida no caso, portanto este documento descreve apenas o incidente da 3.8.1 e o invariante genérico de dispose de RPC,
> e não se aplica mais à arquitetura atual de Provider. Símbolos históricos e logs são mantidos como estão para forensics.

## 0. Conclusão da análise de correção (visão rápida)

**Conclusão: confirmed —— a causa raiz foi confirmada e a solução de correção está pronta.**

- **Natureza do problema**: o invariante violado é «toda chamada RPC em escopo remoto ou recebe uma resposta ou faz settle com erro quando seu veículo de transporte é encerrado». O `ChannelClient`, quando o transporte morre, nem faz fail nem close das requisições pendentes (o `dispose()` em `packages/rpc/src/channelClient.ts:233-242` não rejeita as pendentes), e o cache in-flight de nível de módulo (`packages/ui/src/lib/remoteWorkspaceProviderSync.ts:245-248`) amplifica um único pending permanente em um travamento silencioso de todas as aberturas seguintes daquela workspaceKey. Isso conflita diretamente com o contrato já declarado no documento de arquitetura r1 (`docs/architecture/r1-single-window-host-refactor.md` L109 «resultados assíncronos da generation antiga não podem sobrescrever a nova conexão», L232 «troca de generation é fail-closed») — trata-se de uma implementação que não honrou um contrato de design já existente, e não de uma nova decisão de produto.
- **Evidências**: às 09:57:44, `updateProviderRegistry` já havia chegado ao remoto e, 0,3 segundo depois, a conexão foi fechada sem registro de conclusão no host (comparado às 11 ocorrências normais `OK/FAIL (~2s)` do mesmo dia); às 10:01, o fluxo vítima ficou sem nenhuma atividade após a leitura do snapshot, enquanto RPCs de arquivo na mesma conexão concluíam em segundos (o que exclui falha de transporte); `unregisterRemoteWorkspaceSession` só limpa keys já bound, enquanto o sync ocorre antes do bind (a residência envenenada tem explicação em nível de caminho de código); 6 asserções de sinal vermelho passaram duas vezes. Detalhes em §2.
- **Escopo de impacto**: 3.8.1 integral, SSH/WSL/Docker de forma geral; uma conexão que morre na janela de sincronização do provider envenena aquela workspaceKey, travando o assistente por completo, a reconexão pela barra lateral e a entrada via histórico, e só reiniciar o app resolve. Argumento de isolamento: a bridge session do celular `web-remote-replayable` não injeta disposer (a mudança no store é no-op para ela); a reconexão em `remote.ts` passa por `replaceSocket` e não dispara dispose (a semântica de replay permanece inalterada); não há toque em `@zcode/protocol` nem no formato de persistência.
- **Correção recomendada** (mudança mínima completa, os dois pontos são indispensáveis, detalhes em §4):
  1. **A1** `ChannelClient.dispose(reason?)` rejeita todas as Promise de requisição pendentes (os 5 pontos de chamada de dispose em produção foram auditados um a um, e todos são caminhos de encerramento de conexão);
  2. **A2** no lado renderer, adiciona-se a saída de encerramento de transporte: novo helper em `messageport.ts` retornando `{services, dispose}`, `RemoteWorkspaceSession` ganha um `dispose` opcional, o store o chama no unregister/substituição de generation, e no desktop a injeção ocorre no registro reutilizando o código de erro `ZCODE_REMOTE_WORKSPACE_DISCONNECTED`.
  - Já rejeitados: adicionar timeout (mascara o sintoma, conflita com enlaces lentos, viola o princípio de «não acumular fallbacks»); apenas limpar o mapa in-flight (o fluxo da vez ainda fica travado); corrigir apenas o lado host (a corrida em que o caminho de resposta e o attachment caem ao mesmo tempo deixaria pendências no renderer de fora).
- **Por que é o de menor risco**: corrigir na fronteira de propriedade do invariante (o cliente RPC) faz com que os caminhos de catch já existentes de sync/assistente/reconexão assumam como antes (eles já foram desenhados para rejection); `call()` já rejeita após o dispose, e A1 apenas torna o in-flight consistente com isso, sem bifurcar a semântica da API; a injeção opcional de dispose mantém web/mobile com zero mudanças; sem protocolo, sem persistência, sem mudança de UI; um único commit permite rollback integral.
- **Verificação e riscos residuais**: o teste de regressão reproduz o cenário de envenenamento das 09:57→10:01 (deve falhar antes da correção); testes unitários de vizinhança + portões + candidatos a E2E em §5; riscos residuais (visibilização de rejection no teardown, saída antecipada do servidor não fechada) em §6.

## 1. Sintoma

O usuário se conecta a um projeto SSH (`demo@203.0.113.10:22`) pelo assistente de conexão remota. Na etapa 4, «选择目录», a conexão tem sucesso e a lista de diretórios aparece normalmente, mas, ao clicar em 「选择目录」, o botão fica permanentemente em 「加载中...」 (`selecting=true`) por mais de 7 minutos, até o usuário abrir um feedback. Fechar o diálogo e tentar de novo trava igualmente; só reiniciar o app recupera.

## 2. Conclusões de forensics (confirmadas)

### 2.1 Cadeia de eventos

```
09:57:20  instância antiga sai, nova instância(pid 92739) inicia
09:57:34  reconexão automática demo  requestId=733d0a9a → remoteSessionId=dde16ff8
09:57:43.914  bind do contexto do workspace (/home/demo)
09:57:43.937  getProviderRegistrySnapshot OK
09:57:44.03   updateProviderRegistry emitido ──► remoto já recebeu e começou a processar
                （[remote pid 561744] "为只读会话控制面启动 ZCode agent"、
                 "开始请求 workspace/updateProviderRegistry"、agent started）
09:57:44.499  ✗ conexão fechada (caminho stream.onClose = processo zcode-server remoto encerrou,
              sem detalhe de backend-disconnect)──► resposta nunca alcançável
              ├─ ChannelClient não rejeita requisições pendentes → Promise de updateProviderRegistry permanentemente pending
              ├─ syncTask permanentemente pending, retido no remoteWorkspaceAppGlobalSyncInFlight de nível de módulo
              │  (key = remote:ssh:203.0.113.10:22:demo:/home/demo)
              └─ unregisterRemoteWorkspaceSession só limpa por "keys já bound";
                 a session morreu antes do mapeamento do bind store → limpa 0 → 【residência envenenada】
10:00:00  o usuário remove a entrada (escrita de setting + credential.delete)
10:00:58  o usuário reconecta pelo assistente  requestId=28bf1fee → remoteSessionId=afb4e4d9
10:01:22.875  handshake bem-sucedido(3.8.1) → etapa 4; 10:01:23.6 lista de diretórios carrega normalmente
10:01:25.95≈  o usuário clica em 「选择目录」(/home/demo)
10:01:25.972  file.resolvePath OK (22.1ms)   ← nova conexão totalmente saudável
10:01:25.973  bind OK (attachment 04fe4b07 substituído por 36c16718)
10:01:25.994  getProviderRegistrySnapshot OK (0.6ms)
              ──► await da Promise envenenada de 09:57 → 【travamento permanente】
              （updateProviderRegistry nunca foi emitido: zero logs de recebimento no remoto;
               o commit nunca executou: a escrita lastWorkspaceSession das 10:04:25 não contém demo;
               a tab nunca foi criada; nenhum erro reportado）
10:08:10  o usuário abre o feedback → 10:08:43 o ticket é criado → 10:08:52 os logs são exportados
```

### 2.2 Base da conclusão (fatos)

- Controle de conclusão normal: entre 09:04–09:35 do mesmo dia houve 11 registros de conclusão do host `zcode-session.updateProviderRegistry OK/FAIL (~2s)`; tanto 09:57 quanto 10:01 não têm registro de conclusão.
- Dentro da janela de travamento (10:01:26 → 10:08:52): zero conclusões de RPC `zcode-session/zcode-task`, zero logs `[remote]`, zero persistência de demo — as 6 asserções de sinal vermelho passaram integralmente nas duas execuções.
- Durante o travamento, `file.readdir` (147ms) e `file.resolvePath` (22ms) na mesma conexão concluíram em segundos → falha da camada de transporte fica excluída.
- No lado renderer, «registra os novos services no store antes do ACK» (`packages/desktop/src/renderer/src/main.tsx` `registerRemoteWorkspaceServicePort`, mesma ordem na v3.8.1) → «envio para a porta morta de uma generation já substituída» fica excluído.

### 2.3 Superfície de recorrência

No dia 08-21 houve 27 binds: 4 `updateProviderRegistry FAIL` (~2s de conclusão, erro visível ao usuário, não é este defeito); 1 envenenamento confirmado + travamento (este evento); e dois binds das 09:32:00 / 09:37:04 de outra instância antiga sem registro de conclusão (provavelmente do mesmo tipo, nível de inferência). O servidor ficou se desconectando repetidamente ao longo do dia (8 rebinds de /home/demo entre 00:34–00:55), o que caracteriza um ambiente gatilho de alto risco.

### 2.4 Desconhecidos (não fecháveis pelo lado do cliente)

O motivo pelo qual o zcode-server remoto encerra cerca de 1 segundo após iniciar (histórico do mesmo tipo: "远程连接已断开 exitCode=0"). São necessários os logs de `~/.zcode/server` da máquina remota ou logs do sistema para caracterizar; isso é o gatilho, não a causa raiz.

## 3. Camadas da causa raiz

| Camada                  | Qualificação                                                                                                                                        | Local                                                                                                                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gatilho                 | O zcode-server remoto encerra logo após iniciar (ambiente/servidor, não tratado por esta correção)                                                     | 203.0.113.10                                                                                                                                                                                                  |
| **Causa raiz (defeito de design)** | Requisições RPC pendentes nunca fazem settle quando o transporte é encerrado: `dispose()` não rejeita as pendentes, a falha de `send` é engolida em silêncio e não há timeout em toda a cadeia | `packages/rpc/src/channelClient.ts:233-242`                                                                                                                                                                    |
| Amplificador            | O cache in-flight de nível de módulo amplifica «um pending permanente» em «todas as aberturas seguintes daquela workspaceKey travadas» (através de conexões e das entradas de assistente/reconexão) | `packages/ui/src/lib/remoteWorkspaceProviderSync.ts:68-76,245-248`                                                                                                                                             |
| Zona cega de limpeza    | `unregisterRemoteWorkspaceSession` só limpa workspaceKeys já bound; o sync ocorre antes do bind (tanto no fluxo de escolha de diretório quanto no de reconexão), e uma session que morre durante o sync não tem key para limpar | `packages/ui/src/store/remoteWorkspaceSessionStore.ts:133-148`; ordem do fluxo em `packages/ui/src/root/useRemoteWorkspaceHistory.ts:582-597`、`packages/ui/src/root/reconnectRemoteWorkspaceHistoryEntry.ts:161-182` |
| Veículo do sintoma      | `selecting` nunca é resetado → o botão fica permanentemente em 「加载中...」; o fluxo de reconexão se comporta do mesmo modo (spinner preso para sempre, o finally não executa) | `packages/ui/src/SSHDialog.tsx:372-416`、`packages/ui/src/RemoteConnectionDialogContent.tsx:486-497`                                                                                                           |

### O invariante violado

`docs/architecture/r1-single-window-host-refactor.md` já declara:

- L109: «cancelamento de conexão, late completion e dispose repetido devem ser idempotentes; **resultados assíncronos da generation antiga não podem sobrescrever a nova conexão**»
- L232: «a troca de generation do Host continua **fail-closed**»

A implementação atual nem faz fail nem close das requisições pendentes sobre um transporte morto — **suspensão**. A correção é trocar «suspensão» por «fail-closed» na própria fronteira de propriedade do cliente RPC:

> **Invariante: toda chamada RPC em escopo remoto ou recebe a resposta do par, ou faz settle com erro quando seu veículo de transporte (MessagePort do attachment / stream SSH) é encerrado.**

## 4. Design da correção (mudança mínima completa)

Os dois pontos de mudança restauram o mesmo invariante, e ambos são indispensáveis (corrigir só o lado host deixaria de fora as pendências no renderer por causa da corrida em que o caminho de resposta e o attachment caem juntos; limpar apenas o mapa in-flight não libera o travamento do próprio fluxo da vez).

### 4.1 A1 — `ChannelClient.dispose()` rejeita todas as Promise de requisição pendentes

`packages/rpc/src/channelClient.ts`:

- Novo `pendingRejections: Map<number, (err: Error) => void>`, registrado na entrada de `requestPromise` (**não** dentro de `doRequest` — isso cobre as requisições enfileiradas quando o dispose ocorre antes do Initialize), removido junto com `handlers.delete(id)` quando a requisição faz settle.
- `dispose(reason?: Error)`: rejeita uma a uma (por padrão `new Error("ChannelClient disposed")`, com `name="ConnectionClosed"`). A assinatura permanece compatível com `IDisposable`.
- O handler de escuta de eventos (o emitter registrado por `requestEvent`) está fora do escopo da rejeição — o map `handlers` mistura os dois tipos, e é preciso um map separado para diferenciá-los.
- `call()` já retorna reject após o dispose (`channelClient.ts:42-44`); esta mudança apenas torna a semântica in-flight consistente com isso.

**Auditoria dos pontos de chamada de dispose** (todos são caminhos de encerramento de conexão, com semântica de rejeição correta):

| Ponto de chamada                                                    | Cenário                                                                                                      |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `packages/server/src/remote/connect.ts:247`（`beginDisposal`）        | encerramento da conexão host↔remoto (às 09:57:44 deste incidente foi exatamente este caminho) → resolve de quebra a suspensão dos handlers proxy no lado host |
| `packages/rpc/src/ipc.ts:138-139`                                     | IPCServer detecta desconexão do client                                                                       |
| `packages/rpc/src/ipc.ts:259-260`、`305-306`                          | destruição completa de IPCServer / IPCClient                                                                   |
| `packages/rpc/src/remote.ts:325`                                      | destruição final do client reconectado (atenção: uma reconexão no meio do caminho usa `replaceSocket` e reaproveita o mesmo ChannelClient, sem disparar dispose; a semântica de replay permanece inalterada) |

### 4.2 A2 — no lado renderer, encerrar o transporte antigo na substituição/desregistro da remote session

Situação atual: o `ChannelClient` e o `MessagePortProtocol` criados por `connectViaMessagePort` (`packages/client/src/messageport.ts:20-29`) não são mantidos por ninguém e não têm saída de liberação; depois que o attachment é substituído ou a session é fechada, o client antigo fica suspenso para sempre (`MessagePortProtocol.disconnect()` já existe, mas ninguém o chama, `packages/rpc/src/protocol.ts:391-396`).

- `packages/client/src/messageport.ts`: nova exportação `createMessagePortServiceConnection(port): { services: IServiceAccessor; dispose(reason?: Error): void }`, com dispose = `client.dispose(reason)` + `protocol.disconnect()`. Mantém `connectViaMessagePort` para os base services do ciclo de vida da janela (sem liberação, não é o alvo).
- `packages/ui/src/store/remoteWorkspaceSessionStore.ts`: `RemoteWorkspaceSession` ganha um `dispose?: (reason?: Error) => void` opcional; `unregisterSession` e `registerSession` (substituição com o mesmo sessionId e objeto diferente — ou seja, troca de generation) chamam o dispose da **entrada removida**. Injeção de dependência: o store não toca na implementação de transporte.
- `packages/desktop/src/renderer/src/main.tsx` `registerRemoteWorkspaceServicePort`: passa a usar o novo helper e injeta o disposer no registro; o reason da rejeição carrega o código de erro já padronizado `ZCODE_REMOTE_WORKSPACE_DISCONNECTED` (`packages/ui/src/lib/remoteWorkspaceServiceError.ts:1-2`; o caminho de repasse de `code` em `channelClient.ts:84-97` já existe), mantendo o mesmo código do erro reportado pelo «proxy de desconexão» nas chamadas seguintes.

### 4.3 Sequência antes e depois da correção

```
Antes da correção (envenenamento de 09:57 → vítima de 10:01):
  sync#1: updateProviderRegistry ──► morte do SSH stream ──► Promise permanentemente pending
          in-flight[demoKey] retido para sempre (o finally não executa)
  sync#2(nova conexão): await in-flight[demoKey] ──► travamento permanente, sem erro na UI

Depois da correção:
  sync#1: updateProviderRegistry ──► morte do stream ──► evento de fechamento de session
          → unregisterSession → session.dispose() → ChannelClient rejeita
          → syncTask rejeita → o finally remove in-flight[demoKey]
          → catch do fluxo de reconexão: grava failed + toast (caminho existente); catch do assistente: mostra o erro + reseta o botão (caminho existente)
  sync#2(nova conexão): sem in-flight → envio normal → OK → abertura do workspace
```

### 4.4 O que não muda (fora de escopo)

- Não se adiciona timeout de RPC (mascara o sintoma e conflita com tempos legítimos de enlaces lentos, violando o princípio de «não acumular fallbacks»).
- Não se alteram `@zcode/protocol`, formato de persistência, temporização de troca de generation/attachment do host nem a UI do assistente.
- Não se toca na cadeia móvel `web-remote-replayable`: a bridge session registrada em `webRemoteControlWorkspaceSession.ts` não injeta dispose → a mudança no store é no-op para ela; sua proteção contra «dispose tardio com o mesmo sessionId» (comparação de identidade do objeto) é isomórfica à decisão de substituição do store, e as duas não se interferem.
- Saída antecipada do zcode-server no lado servidor: precisa de outro caso de tratamento com os logs remotos fornecidos pelo usuário; após a correção, esse cenário passa de «travamento silencioso eterno» para «falha visível + possível retentativa».

## 5. Plano de verificação (teste antes da implementação)

1. **Teste de regressão (reproduz este incidente)**: teste unitário de `remoteWorkspaceProviderSync` — o RPC do primeiro sync nunca resolve, dispara-se o desregistro da session (rejeição injetada pelo dispose) → afirma que o syncTask rejeita, que a entrada in-flight é removida e que o segundo sync para a mesma workspaceKey é despachado normalmente e tem sucesso. Antes da correção, esse teste precisa falhar (o segundo sync fica travado).
2. Teste unitário de `channelClient` em `packages/rpc`: o dispose rejeita as in-flight; quando o dispose ocorre antes do Initialize, as requisições enfileiradas também rejeitam; a escuta de eventos não é afetada indevidamente; requisições já settled não são afetadas; o reason é repassado.
3. Teste unitário de `remoteWorkspaceSessionStore`: o unregister chama o dispose; a substituição com o mesmo sessionId só descarta o objeto antigo; sessions sem dispose (forma web bridge) são no-op.
4. Fronteiras de assistente/reconexão: quando o sync rejeita, `handleSelectDirectory` mostra o erro e reseta `selecting`; `reconnectRemoteWorkspaceHistoryEntry` grava failed + limpa a key do spinner (em grande parte casos já existentes; acrescentar o cenário de envenenamento).
5. Portões: `pnpm typecheck`、`pnpm lint`、`pnpm test:unit:affected`.
6. Candidato a E2E (acrescentar em `docs/testing/ssh-remote-p0-e2e-plan.md`): a conexão SSH cai dentro da janela de sincronização do provider → reabrir o mesmo diretório remoto funciona, sem travamento residual.

### Registro de execução da verificação (2026-08-21)

Commit da correção `a30f1f453a` (fix(remote): settle pending RPCs on workspace disconnect), resultados da verificação:

- **Testes implementados**: §5.1–5.3 correspondem a `packages/ui/test/remoteWorkspaceProviderSync.test.ts` (regressão de envenenamento, race de 250ms)、`packages/rpc/test/channels.test.ts`（dispose rejeita in-flight / pre-Initialize / assinaturas de evento não feridas）、`packages/ui/test/useWorkspaceServices.test.ts`（encerramento no unregister, troca de generation só encerra a antiga）、`packages/client/test/rendererLogging.test.ts`（idempotência do disposer）; §5.4 corresponde a `packages/ui/test/sshDialogDirectorySelection.test.ts`（reset de selecting após reject + erro visível + retorno ao passo de settings quando a session é reciclada）。
- **Verificação vermelho-verde**: restaurando temporariamente o store pré-correção → 3 casos falham; restaurando o channelClient pré-correção → 2 casos falham e estouram o timeout de 60s (isto é, o comportamento do incidente); todos passam no estado corrigido.
- **Portões**: `pnpm typecheck` passou; `pnpm lint` com 0 error (nenhum aviso novo nos arquivos alterados); `pnpm test:unit:affected` com 3536/3540 passando, sendo a única falha um flaky de temporização do `vi.waitFor` em `repoWikiService.test.ts` (sem relação com esta mudança; passa ao reexecutar e também em execução isolada).
- **Candidato a E2E**: registrado como `SSH-P0-LIFE-03`（candidate, spec ainda não escrita）, em `docs/testing/ssh-remote-p0-e2e-plan.md`。

## 6. Riscos residuais

- O dispose-reject transforma caminhos antes «silenciosamente suspensos» (chamadas in-flight durante a destruição da janela/host) em rejections visíveis; no pior caso há algumas linhas de log a mais em nível warn durante o teardown; os pontos de chamada foram auditados um a um e são todos caminhos de encerramento.
- Pontos de chamada de dispose sem reason informam um erro genérico em vez de `ZCODE_REMOTE_WORKSPACE_DISCONNECTED` — isso não afeta a semântica de settle, apenas a consistência de texto.
- A causa raiz da saída antecipada do servidor não foi fechada (depende de artefatos remotos); a correção apenas garante fail-closed no cliente.