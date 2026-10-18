# Design de Reattach do Renderer de Sessão Remota no Desktop

> **Estado atual**: o reattach do renderer continua vale para a logical remote session que permanece viva dentro da mesma BrowserWindow.
> Uma sessão SSH pode compartilhar o Remote Host correspondente a `sshHostsByPoolKey`; sessões WSL compartilham o Host em pool por
> `window + normalized(distro,user)`; Docker/Server usam um Host dedicado.
> O reattach substitui apenas a attachment/renderer port daquela logical session, sem destruir o Host compartilhado nem alterar os limites de replay.

## Resumo da Funcionalidade

| Campo                  | Valor                                                                                                                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alteração              | Após o reload do renderer / a atualização do React ErrorBoundary no desktop, o main precisa reanexar ao novo renderer service store o Remote Host que continua vivo e hospeda aquele workspace scope.                                                   |
| Superfícies visíveis ao usuário | Tabs de remote workspace SSH / WSL / Docker já abertas, listas de tarefas remotas, workspace RPC de primeiro envio e árvore de arquivos.                                                                        |
| Documentação existente | `docs/remote-workspace-session-unified-settings.md`, `docs/architecture/zcode-code-architecture-overview.md`, `docs/architecture/message-flow.md`, `docs/web-remote-control/web-remote-control-architecture.md`. |
| Responsáveis pelo código existente | `packages/desktop/src/main/desktopRemoteSessions.ts`, `packages/desktop/src/main/desktopWindowLifecycle.ts`, `packages/desktop/src/renderer/src/main.tsx`, `packages/ui/src/store/remoteWorkspaceSessionStore.ts`. |
| Fora de escopo          | Sem reconexão automática de SSH; sem alterar a semântica de recuperação `web-remote-replayable` do `/remote` no celular; sem reconectar automaticamente ao iniciar tabs de histórico desconectadas.                                   |

## Registro de Esclarecimentos

| Rodada | Pergunta                                                                                              | Resposta do usuário | Limite definido                                                                              | Necessário acompanhamento |
| ------ | ----------------------------------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------- | ------------------------- |
| 1      | Vale a pena corrigar a perda de vínculo da remote session causada por reload do renderer / crash / atualização do ErrorBoundary? | Vale, continue.     | Priorizar a correção do desvinculo em que o desktop renderer perde estado, mas o remote host do main continua vivo. | no |

## Decisões de Limite

| Limite         | Decisão                                                                                     | Inclui                                                                                    | Exclui / poda                                                                        | Fonte   |
| -------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------- |
| Alvo do reattach | Somente reanexar remote workspace sessions que ainda estão tracked no main e com `connected=true`. | A mesma BrowserWindow após reload do renderer e `window.location.reload()` do ErrorBoundary. | Conexões pending, sessions já descartadas, hosts cujo exit session já ocorreu.            | code    |
| Semântica do caminho principal | Preservar o caminho principal desktop `desktop-continuous`.                                   | Reentregar `RemoteServicePort`, para que o renderer registre novamente os remote services.  | Não usar snapshot/gap de replay do mobile para recuperação.                              | docs    |
| Recuperação na inicialização | Ainda recuperar apenas remote tabs desconectados, sem conectar em background.                  | O remote history do settings permanece com reconexão manual.                                | Não tratar o cold start do app como recuperação de sessão viva.                         | docs    |
| Ponte de remote control     | Reutilizar o padrão existente `AttachServicePort`, sem alterar o ciclo de vida de attachment de shared host no celular. | O main entrega uma nova porta ao desktop renderer. | relay/main não possui estado de task/session.                                              | docs/code |
| Timing de entrega           | Permitir que a remote service port chegue antes da base ServicePort.                           | A remote port que chega cedo é armazenada temporariamente e só é liberada após o registro das base services. | Não descartar remote port porque as base services ainda não estão prontas. | code    |

## Escopo de Domínio

| Domínio                                   | Inclui? | Por que pode alterar comportamento                                                      | Fontes primárias                                              |
| ----------------------------------------- | ------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Limite de arquitetura/processo             | sim     | renderer, desktop main e remote host reestabelecem as três camadas de transporte RPC.    | `docs/architecture/zcode-code-architecture-overview.md`      |
| Identidade do workspace / remote runtime   | sim     | O reattach deve preservar o isolamento de `remoteSessionId`, `target` e `workspaceIdentity/workspacePath`. | `docs/remote-workspace-session-unified-settings.md`          |
| Remote/replayable em tempo real no mobile  | limitado | Precisa confirmar que não afeta o attachment de remote control replayable no celular.      | `docs/web-remote-control/web-remote-control-architecture.md` |
| Comportamento de conversa/sessão           | não     | Não modifica conteúdo de session, queue, snapshot ou regras de replay.                    | `docs/testing/conversation-session-e2e-coverage-matrix.md`   |

## Mapa de Conceitos

| Conceito                          | Por que importa                                                                        | Fonte                                               |
| --------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `RemoteServicePort`               | Único ponto de entrada em runtime para o renderer registrar remote services.              | `packages/desktop/src/renderer/src/main.tsx`         |
| `remoteWorkspaceSessionsById`     | Índice autoritativo de logical session, referência de Host e attachment no lado do main. | `packages/desktop/src/main/desktopRemoteSessions.ts` |
| `sshHostsByPoolKey`               | Índice autoritativo de vivacidade e readiness dos SSH Hosts na mesma janela.              | `packages/desktop/src/main/desktopRemoteSessions.ts` |
| `AttachServicePort`               | Permite anexar uma nova porta RPC quando o remote host já tem `activeServices`.           | `packages/desktop/src/host/index.ts`                 |
| Remote tab desconectado           | O remote tab restaurado pelo settings não tem `remoteSessionId` vivo e depende de reconexão manual. | `docs/remote-workspace-session-unified-settings.md`  |

## Responsáveis por Estado

| Estado / fato                                 | Autoridade                  | Espelhos / caches   | Evidência                                     |
| --------------------------------------------- | --------------------------- | ------------------- | ---------------------------------------------- |
| Se o processo de remote host SSH está vivo    | desktop main                | nenhum             | `sshHostsByPoolKey`                            |
| Se os remote services do renderer estão disponíveis | renderer Zustand store | `remoteSessionId` da tab | `registerRemoteWorkspaceSession`               |
| Identidade do remote workspace                | remote entry da tab/settings | session context do main | `workspaceIdentity?.trim() \|\| workspacePath` |
| Coleção de services RPC do remote host        | `activeServices` do processo host | portas anexadas | log de `AttachServicePort`                     |

## Dimensões

| Dimensão        | Valores / classes de equivalência | Fonte | Inclui? | Razão                                                                |
| ---------------- | --------------------------------- | ----- | ------- | --------------------------------------------------------------------- |
| session state    | pending / connected / disposed-exited | code  | sim     | Apenas sessions connected devem ser reanexadas.                      |
| evento do renderer | initial create / same-window reload | code | sim     | Ambos passam pela entrega de porta após `dom-ready`.                 |
| tipo de remote   | SSH / WSL / Docker                 | shared target | não | O reattach só depende do session host, não do backend específico. |
| modo do cliente  | desktop-continuous / web-remote-replayable | docs | sim | Esta correção só atua no desktop renderer.                   |

## Combinações Candidatas

| ID do candidato | Estado                     | Evento                      | Alvo/superfície  | Guard/efeito esperado                                                                 | Status inicial | Observações            |
| ---------------- | -------------------------- | --------------------------- | ----------------- | ------------------------------------------------------------------------------------- | -------------- | ---------------------- |
| DRS-RR-01        | connected remote session   | renderer reload/dom-ready  | desktop renderer  | O main reenvia `RemoteServicePort` e o renderer pode re-registrar o mesmo `sessionId`.  | aceito         | Implementação atual.    |
| DRS-RR-02        | pending remote session     | renderer reload/dom-ready  | desktop renderer  | Sem reattach, para não expor ao renderer um host não inicializado.                     | aceito         | Coberto por teste unitário. |
| DRS-RR-05        | connected remote session   | remote port antes da base port | desktop renderer | O renderer armazena a remote port e registra os remote services após a base ServicePort estar pronta. | aceito | Implementação atual.    |
| DRS-RR-03        | disconnected history tab  | recuperação em cold start  | tab de UI         | Mantém o placeholder desconectado, sem criar runtime SSH automaticamente.              | podado         | Coberto pelo design de recuperação existente. |
| DRS-RR-04        | mobile bridge attachment   | mobile reconnect           | web remote        | Mantém a lógica existente de shared-host attachment, sem nova recuperação replayable.  | podado         | Fora do escopo desta alteração. |

## Casos Aceitos

| ID do caso | Setup                                                                                 | Ação                                                             | Asserções                                                                                                                     | Camadas de evidência             | Status E2E |
| ---------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ---------- |
| DRS-RR-01  | Remote workspace session connected pertencente a `webContents.id=99`.                 | O renderer da mesma janela fica ready novamente e o main chama o reattach da remote session. | O attachment antigo é detachado com precisão e o child recebe `AttachServicePort` com o novo `attachmentId`; o renderer recebe `RemoteServicePort` com o mesmo `sessionId`. | unit: mensagem/porta do main manager | coberto |
| DRS-RR-02  | Remote workspace session pending que ainda não recebeu `Connected`.                   | O renderer fica ready novamente.                                 | Nenhuma porta é entregue.                                                                                                     | unit: no-op do main manager      | planejado |
| DRS-RR-05  | O renderer recebe a `RemoteServicePort` remota antes de as base services estarem registradas. | Em seguida recebe a `ServicePort` local.                    | A remote port não é descartada; as remote ports pendentes são liberadas após as base services ficarem prontas.                 | unit: guard no source do renderer | planejado |

## Decisões de Poda

| ID da decisão | Combinações podadas                          | Guard/invariante                                    | Razão de produto                                                  | Cobertura representativa        |
| ------------- | -------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------- |
| PD-01         | Reconexão automática do remote history no cold start | A recuperação do settings só gera tab desconectado | O usuário não pode ser puxado de volta ao remoto silenciosamente por background. | Testes de persistência existentes |
| PD-02         | Recuperação via snapshot replayable no mobile  | relay/main não possui estado de task/session/stream | O remote control do celular só pode anexar um host existente, sem criar runtime independente. | Testes de web remote existentes |

## Notas de Handoff para E2E

- Fixture de provider: não necessário.
- Fixture de sistema de arquivos: não necessário.
- Estratégia de timing: o teste unitário simula diretamente `Connected` e o renderer ready.
- Preset Docker: não necessário.
- Riscos de revisão: é preciso confirmar que reload na mesma janela não duplica o registro de sessions pending; e que o reattach de sessions connected não altera o ciclo de vida do remote host.