# Design do Soft Gate de Confiança de Hook de Workspace

> Status: implementado. A simplificação da confiança persistente de 2026-08-13 é definida por
> [`workspace-hook-trust-persistent-only.md`](./workspace-hook-trust-persistent-only.md);
> as descrições antigas deste documento sobre `allow_once`, `keep_blocked`, painel de revisão independente e reexecução no SessionStart foram substituídas por essa especificação.

## 1. Primeiros princípios

Partindo dos axiomas básicos de segurança e produto, e não da implementação existente:

1. **Código não confiável nunca é executado.** Negar por padrão é o piso, e nenhum design de interação pode afrouxá-lo.
2. **A conversa não pode ser sequestrada por decisões de segurança.** Um usuário bloqueado clicará em "confiar em tudo" para destravar a conversa — consentimento coercionado não é consentimento (antipadrão de consent fatigue). A decisão de confiança precisa ser tomada em um cenário fora de banda e sem pressão.
3. **Se a política mudou o comportamento, isso precisa ser visível.** Quando um hook é pulado, o usuário precisa ver no próprio chat "por que não surtiu efeito" e "onde resolver".
4. **A confiança é um comportamento assíncrono, age sobre o futuro e não destrava retroativamente o passado.** Não existe semântica de "o turno para e espera o resultado da revisão para continuar".
5. **A complexidade do ponto de execução fica na camada de admissão.** Não espalhar a máquina de estados de segurança pelas camadas remotas como RPC de protocolo, filas e navegação de UI.

Dos axiomas 2+4 decorre: **o turno nunca para esperando a revisão**; do axioma 1 decorre: **hook pending é pulado direto neste turno (blocked)**; do axioma 3 decorre: **aviso permanente na sessão + um clique para ir à revisão**; do axioma 5 decorre: **remover todo o mecanismo de protocolo do parked-turn**.

## 2. Comparação de comportamento

```
Antigo (hard gate):
  user prompt ──ACK──> o turno para em activate() ──abre Settings/Hooks à força──> usuário forçado a decidir
                        │                                                    │
                        └──── watchdog de 10min / turnStartTimeout（expirar não grava Trust） ────┘
                        (o turno só continua após a revisão; o usuário é abandonado na página de settings)

Novo (soft gate):
  user prompt ──ACK──> o turno executa imediatamente, pending hooks são sempre pulados (HookRunBlocked)
                        │
                        └─> evento: WorkspaceHookAdmissionUpdated { pendingCount>0 }
                              └─> snapshot.workspaceHookAdmission
                                    └─> barra de aviso permanente no rodapé do chat [N Hooks pendentes de revisão] [Revisar] [Ignorar]
                                          └─(clique do usuário)─> requestWorkspaceHookReview
                                                └─> controller abre review flow (supervisionado pelo supervisor)
                                                      └─> a linha não confiável em Settings/Hooks mostra [Confiar]
                                                            └─> trust persistente exato é gravado, revision sofre bump
                                                                  └─> afeta apenas eventos de Hook que ocorram naturalmente no futuro
```

Sequência (cadeia de ativação da confiança, envolve sincronização de estado, desenhar conforme a especificação):

```
Renderer                     V4 Server(bootstrap)                Core Runtime
   │                              │                                   │
   │ prompt #1                    │                                   │
   ├─────────────────────────────>│ startPromptTurn                   │
   │                              ├──────────────────────────────────>│ activate(): pending → skip
   │                              │        WorkspaceHookAdmission     │  registra skippedSessionStart
   │<── snapshot{pendingCount:2} ─┤<──────── Updated(2) ──────────────┤ + securityRevision R1
   │ [barra de aviso aparece]      │                                   │ o turno executa normalmente (sem hooks)
   │                              │                                   │
   │ clique em [Revisar]           │                                   │
   ├─ requestWorkspaceHookReview >│ openReviewFlow + supervise        │
   │<── ReviewRequested ──────────┤                                   │
   │ clique em [Confiar] na linha  │                                   │
   ├─ respondWorkspaceHookReview >│ grant exato → gravação → revision R2  │
   │<── ReviewSettled ────────────┤                                   │
   │<── snapshot{pendingCount:0} ─┤<──── AdmissionUpdated(0) ─────────┤
   │ [barra de aviso some]         │                                   │
   │ prompt #2                    │                                   │
   ├─────────────────────────────>│ startPromptTurn                   │
   │                              ├──────────────────────────────────>│ não reexecuta o SessionStart antigo
   │                              │                                   │ apenas eventos naturais posteriores usam a nova Trust
```

## 3. Decisões de design

### D1. Camada de admissão: pending implica pular, sem abrir flow e sem esperar (core)

`workspace-hook-runtime-admission.ts`:

- Remover `reviewPendingSnapshot()` e sua chamada em `activate()`, o estado `reviewActivation` e o uso de espera do port `review`.
- A semântica de runtime declarada para pending é **exatamente igual** à do caminho headless existente: o runner emite `HookRunBlocked` (`errorCode: workspace_hooks_pending_trust`) item a item, e o turno executa normalmente. Desktop e headless convergem semanticamente, sem mais bifurcação.
- Depois de calcular o snapshot de pending, `activate()` reporta `{ pendingCount, bundleDigest, workspaceIdentity }` pelo novo port (ver D2).
- `waitForWorkspaceHookAdmission` é mantido (o bootstrap do trust-store ainda precisa dele), apenas removendo os pontos de chamada da espera por review.
- O caminho fail-closed (`bootstrapFailed` / `invalidatedReason`) mantém a semântica.

### D2. Portador de estado em nível de sessão: campo adicional no snapshot (shared + bootstrap)

- `conversationSnapshotSchema` ganha um campo aditivo (**precisa de `default: null`**, respeitando as regras de congelamento de snapshot.ts):

  ```ts
  workspaceHookAdmission: {
    pendingCount: number;      // número de declarações com configuredEnabled && admissionClass === "pending"
    bundleDigest: string;      // chave de idempotência do dismiss da barra de aviso
    workspaceIdentity?: string;
  } | null
  ```

- Novo evento de sessão `WorkspaceHookAdmissionUpdated` (da mesma família que `WorkspaceHookReviewRequested/Settled/Superseded`); a camada de projeção escreve/limpa o campo do snapshot com base nele (`pendingCount === 0` → define null).
- Gatilhos:
  1. após `activate()` (startup / resume) concluir a avaliação;
  2. após o trust persistente exato, quando o controller reavalia e publica;
  3. da mesma forma após um toggle reconstruir o bundle ou um revoke.
- **Não** usar `pendingInteractions` para carregar a admissão (é uma semântica de bloqueio load-bearing: esconder o composer, suprimir o spinner, notificar, barra lateral); `hooksService.loadHooks` serve apenas à vista estática de Trust persistente em Settings. O snapshot passa pelo protocolo V4, então desktop / web-remote são naturalmente a mesma fonte, atendendo à restrição multiplataforma.

### D3. Abrir o review flow sob demanda: novo comando `requestWorkspaceHookReview` (shared + bootstrap)

- O shape do comando clona a variante de alvo non-flow de `revokeWorkspaceHookTrust` (`sessionId + workspaceIdentity + bundleDigest`, sem interactionId).
- Handler → o `openReviewFlowForNewPendingItems(getCurrentSnapshot())` já existente no controller; reutilizado quando há flow ativo (`openOrReuseFlow` é idempotente).
- **Precisa passar por `superviseFlow`** — caso contrário reproduz o bug de UAT "após o revoke o painel fica permanentemente inoperante" (ver a nota de cabeçalho de `workspace-hook-review-supervisor.ts`).
- O deadline do flow apenas expira a request imutável e envia `ReviewSettled(timed_out)`; não cria Trust,
  não grava decisão negativa nem limpa o pending de admissão. O usuário pode pedir uma nova generation a partir da barra de aviso.

### D4. UI: barra de aviso permanente + confiança em linha nos Hooks (packages/ui)

- Novo componente `WorkspaceHookPendingBanner`, colocado no `conversationBottomDock` do `SessionPane` (mesmo nível de `ConversationQuotaBanner`, acima do composer), com estilo/estrutura inspirados em `PendingCommandRecoveryBanner` (`role="status"`, border/bg-surface, ação principal + ignorar).
- Condição de exibição: `snapshot.workspaceHookAdmission?.pendingCount > 0` e não ignorada.
- Texto (zh/en dos dois lados, i18n key `chat.workspaceHookPending.*`, verificação de key ausente análoga às asserções de paridade de `workspaceHookTrustState.test.ts`):
  - corpo: "N 个工作区 Hook 待审核,本会话暂未启用" / "N workspace hooks pending review; disabled for this session"
  - botão principal: "去审核" / "Review"; botão secundário: "忽略" / "Dismiss"
- [Revisar] = `setPendingSettingsSectionIntent("hooks")` + `openSettingsTab()` + envio de `requestWorkspaceHookReview` via `findWorkspaceHookCommandBinding` (esse canal foi criado justamente para preservar o caminho de comando quando não há pending-review; hoje sem caller).
- [Ignorar] = dismiss local no renderer, com key `sessionId + bundleDigest`; a barra reaparece após mudança no bundle (conteúdo do hook alterado). Nada é gravado.
- Remover o salto forçado de `V4InteractionDialogs.tsx` (`presentedWorkspaceHookReviewInteractions` Set + `setPendingSettingsSectionIntent/openSettingsTab`); manter o connect/upsert/clear do store (caminho de dados do painel) e a guarda de "não degradar para diálogo genérico".
- `chatLoadingVisibility.ts`: `workspaceHookReview` não é mais um chat-loading blocker (a asserção do teste correspondente é invertida).
- O Derivado de `blockingInteractionId` no `SessionPane` precisa excluir `workspaceHookReview`, senão ao abrir o painel de revisão o composer e a barra de aviso ficam com `display:none`.
- Remover `WorkspaceHookReviewPanel` e os três grupos de badges configured/trust/effective na linha de Hooks.
- Um Hook de workspace não confiável mostra apenas um botão outline `信任` à esquerda do interruptor de configuração mais à direita; após o sucesso do clique o snapshot de Trust persistente é atualizado e o botão desaparece. Linhas já confiáveis não mostram status extra nem entrada de revogação.
- Respeitar `DESIGN.md` (cores/arredondamento/tema/internacionalização) e a restrição multiplataforma (a fonte de dados da barra é o snapshot V4, o web-remote tem o mesmo efeito).

### D5. SessionStart não sofre catch-up (core)

- Quando o primeiro SessionStart real chegar, as declarações não confiáveis são puladas e o evento termina ali.
- Prompts posteriores não podem disfarçar o SessionStart já encerrado como catch-up para executá-lo de novo.
- Um Trust estabelecido na task atual só afeta eventos naturais posteriores; o SessionStart passa a valer no mínimo na próxima nova task/sessão.
- Remover o digest de skip, o revision-at-skip e o estado de filtro de catch-up, evitando que a ação de confiança dispare a execução retroativa de código histórico.

### D6. Lista de remoções na camada de protocolo (bootstrap)

Com o parked turn desaparecido, os mecanismos a seguir são aposentados por completo (área de alta incidência de bugs recentes de deadlock/timeout de supervisão):

| Local                | O que remover                                                                                                                                                                                                                                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prompt-turn.ts`    | todo o observer de review (`workspaceHookReviewProgress`, deferred/waiters, `observeWorkspaceHookReview` etc.), o branch de early-ACK (`requestAuthority: "workspace_hook_review"`), `monitorTurnStartedAfterWorkspaceHookReview`, o atraso `admittableHookTimeoutMs`, `WORKSPACE_HOOK_REVIEW_SETTLE_GRACE_MS`, os tipos relacionados e a cláusula de dupla autoridade na nota de cabeçalho |
| `prompt-turn.ts`    | `observeAcknowledgedPromptInputFailure`(review-only, limpar junto os 3 call sites)                                                                                                                                                                                                                                         |
| `handlers/queue.ts` | o branch de review de `finalizeReviewedQueuePromotion` (remover após confirmar que não há outro caller)                                                                                                                                                                                                                                                 |

Manter: review flow/controller/supervisor (gera sob demanda um snapshot imutável de operações), os eventos `WorkspaceHookReviewRequested/Settled/Superseded` e a projeção. Remover o painel independente e os branches once/user-block; o timeout do flow apenas expira o snapshot.

### D7. Compatibilidade

- Campo aditivo do snapshot + default → a análise por clients antigos não é afetada.
- `requestWorkspaceHookReview` é enviado apenas pela nova UI; server e UI do desktop são empacotados na mesma versão, sem necessidade de nova negociação de capability; a capability `workspaceHookReview` permanece como está.
- O comportamento da CLI headless não muda (já era skip + diagnóstico); o desktop converge com essa semântica.
- web-remote: a fonte de dados da barra de aviso é o snapshot V4, carregado naturalmente pelo caminho replayable; não se toca na semântica de stream/queue/blocking request.

## 4. Plano de testes (escrever os testes primeiro)

- **core**: semântica de skip da admissão (pending → sem espera, port reportando pendingCount); SessionStart sem catch-up mesmo após mudança de Trust — testes de regressão.
- **shared**: resolução do default do campo do snapshot; schema de `requestWorkspaceHookReview`.
- **bootstrap**: handler de comando (reuso idempotente do flow, sempre supervisionado); recálculo de `WorkspaceHookAdmissionUpdated` após settle/toggle/revoke; escrita/limpeza do campo no snapshot pela projeção; prompt-turn sem park (reescrever os cinco casos a partir de `v4-native-commands.test.ts:968` e os três casos de `v4-native-queue.test.ts` como "TurnStarted direto + AdmissionUpdated").
- **ui**: exibição/ocultação da barra / chave de idempotência do dismiss / ação de revisar; a linha de Hook só mostra "Confiar" quando não confiável e com generation correspondente, desaparecendo após a atualização bem-sucedida; painel antigo / badges de estado não são renderizados; paridade i18n zh/en.
- Manual: `docs/testing/workspace-hook-trust-manual-acceptance.md` §1 reescrito como aceitação do soft gate.

## 5. Fora de escopo explícito (nesta entrega)

- Enviar pendingCount já na criação da sessão (antes do primeiro prompt) — a primeira avaliação ainda ocorre em activate(); a barra de aviso aparece no máximo após a primeira mensagem, coerente com o momento de bloqueio do comportamento antigo.
- Seleção em lote, selecionar tudo e entrada de revogação dentro da página de settings.
- Confirmação diferenciada entre "hook acabado de editar localmente" e "hook trazido pelo repositório".