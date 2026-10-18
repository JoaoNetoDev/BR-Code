# Plano de implementação do Subagent Blocking Interaction Delegate

> **Para workers agênticos:** SUB-SKILL OBRIGATÓRIO: use `superpowers:executing-plans` para implementar este plano tarefa por tarefa. O defeito atual ocorre justamente no caminho de blocking interaction do subagent; antes da correção, não dependa de execução orientada por subagent para implementar este plano. Os passos usam sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Goal:** implementar a semântica de subagent blocking interaction delegate: quando o child runtime produz interações bloqueantes comuns como pedido de permissão, AskUserQuestion e approval de ExitPlanMode, o canal de interação visível ao parent fica responsável por exibir e receber a resposta, e o payload preserva a atribuição child/subagent, evitando que caminhos dentro do subagent que esperam entrada do usuário — como Bash/AskUserQuestion/ExitPlanMode — fiquem sem diálogo e travados.

**Architecture:** adicionar um subagent interaction broker delegate na camada core do ZCode, que reescreve para o parent session id o sessionId externo dos pedidos de interação bloqueantes emitidos pelo child via `PermissionBrokerPort`, anexando metadados `origin.kind="subagent"`. O bootstrap continua desramando por toolName para `interaction/requestPermission` ou `interaction/requestUserInput`, e service/task/UI continuam roteando pending permission e elicitation pelo parent task/session; a resposta do usuário volta pelo request promise de protocolo já existente para o child tool executor. Os pedidos de permissão comuns e o elicitation channel que o ZCode já separou usam uniformemente essa cadeia de proxy, com `origin` indicando de qual subagent veio o pedido.

**Tech Stack:** TypeScript, schema Zod, ZCode Protocol, core AgentRuntime, projeção de task dos services, surface de permission/elicitation na UI React, Vitest, E2E manual-review com WDIO, pnpm.

## Restrições globais

- escrever/atualizar a documentação primeiro e só depois implementar o código; este arquivo é o plano de implementação desta mudança e, se a semântica de produto mudar durante a implementação real, ele precisa ser atualizado ou complementado com uma nova spec;
- desta vez faço apenas o blocking interaction delegate, e não teammate/swarm/worktree isolation/TaskOutput/TaskStop/protocolo completo de controle do SDK.
- a identidade de roteamento usa a session/task do parent; a identidade do child fica apenas nos metadados `origin`, e a UI não pode assinar diretamente a child session.
- eventos internos, model-io e event store do child runtime continuam usando o child session id; não se pode trocar o child session pelo parent session só para fazer o diálogo aparecer na UI.
- `toolCallId` mantém por padrão o child tool call id; o parent `Agent` tool call id vai em `origin.parentToolCallId`, evitando quebrar o preenchimento do child tool result.
- a permission policy continua sendo julgada pelo próprio child runtime; o delegate apenas faz proxy do roteamento de ask/user-input e não substitui o julgamento de permissão do child pelo do parent.
- os limites desktop continuous e web remote replayable não mudam: permission pending e elicitation pending são projetados no snapshot/event do parent task, e o mobile `/remote` continua restaurando o estado do parent task por replayable.
- ao modificar `packages/shared/src/zcode-protocol/index.ts` é obrigatório usar schema estrito e manter a compatibilidade com as chamadas antigas.
- antes de modificar `packages/ui`, ler o `DESIGN.md` da raiz; logs de UI devem usar `packages/ui/src/logger.ts` e nunca `console.log` direto.
- os logs de service/runtime seguem as regras de log do projeto: request/resolution de permissão são eventos de ciclo de vida de baixa frequência e podem usar `info`; delta de stream/tool item a item só pode usar `debug`.
- os comentários que explicam a causa de bugs no código de correção são escritos em chinês, explicando por que a blocking interaction do child precisa ser delegada à parent session.
- no final é obrigatório executar `pnpm typecheck`, `pnpm lint` e `git diff --check` antes do commit.

---

## Snapshot de fatos atuais

- Ticket do incidente: `ZCT-2073779059361222656`, com relato do usuário de que o subagent trava ao executar Bash no modo "confirmar antes de alterar".
- Fenômeno: o child model já gerou o tool call de Bash, o fluxo de permissão entrou em ask, mas a contagem de pending permission do parent task era 0 e a UI não mostrava diálogo; depois que o usuário parou, o tool `Agent` do parent encerrou com falha por cancelamento.
- O core atual já tem um modelo de design semelhante: `createSubagentProviderRuntimeHeadersPort()` em `apps/zcode-cli/packages/core/src/runtime/methods/subagent.ts` troca o `sessionId` externo dos provider runtime headers pelo parent session id e mantém o razão interno do child runtime.
- Chave de pending atual do service: `packages/services/src/zcode-agent/zcodeAgentService.ts` usa `workspace + sessionId + requestId` para registrar, separadamente, pending permission e pending user input; portanto, desde que o blocking request já saia pelo protocolo com o parent session id, o caminho de resposta existente continua funcionando.
- Projeção de task atual: `packages/services/src/zcode-agent/zcodeTaskServiceAdapter.ts` converte o permission request em um stream event `ZCodePermissionRequest` e mantém `raw` como o request original.
- AskUserQuestion e o approval de ExitPlanMode não são o popup de permissão comum: `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/interaction-broker.ts` faz special case deles para `interaction/requestUserInput`, e o service depois projeta como `elicitation_request`. Eles também travam na child session do subagent e precisam passar pelo mesmo proxy para o parent task junto com as permissões comuns.
- Os provider runtime headers (onde a verificação de segurança da versão oficial passa) também são blocking interaction, mas `createSubagentProviderRuntimeHeadersPort()` já faz o wrapper de parent session. Este plano apenas a inclui na regressão de verificação, sem reprojetar esse caminho.

---

## Comportamento-alvo

1. Quando o parent task inicia `Agent` e ferramentas como Bash/Edit/Write/WebFetch no child runtime precisam de permissão, a UI exibe o popup de permissão no parent task.
2. Quando `AskUserQuestion` ou `ExitPlanMode` no child runtime precisam de entrada do usuário/confirmação de plano, a UI exibe o diálogo de elicitation no parent task, em vez de esperar silenciosamente dentro da child session.
3. O approve/deny/modify do popup de permissão resolve a promise de permissão original do child; o accept/decline/cancel do diálogo de elicitation resolve a promise de user-input original do child.
4. A restauração por snapshot/replay de pending permission e pending elicitation passa a valer por parent task, e o web remote reconnect ainda enxerga os pedidos bloqueantes de subagent não tratados.
5. Os subrequests de provider runtime headers (incluindo a verificação de segurança da versão oficial) continuam exibidos pelo wrapper roteado para parent já existente e não regridem por causa desta rodada.
6. O event store, o model-io e os caminhos de artefato da child session não são poluídos com a parent session.
7. Quando vários subagents ou vários child blocking requests ficam pending ao mesmo tempo, cada um é tratado independentemente por `requestId`, sem sobrescrita mútua.
8. Quando o parent dá stop/cancel, o pending permission/elicitation do child consegue ser abortado e não fica mais em await infinito.

## Não objetivos

- não criar um wire protocol de controle de permissão por stdio separado; continuar usando as requisições de protocolo existentes `interaction/requestPermission` / `interaction/requestUserInput`.
- não criar tab de UI de child session, linha de child task ou assinatura direta da UI pela child session.
- não mudar a semântica de produto de `AskUserQuestion` e `ExitPlanMode`; esta rodada só muda o roteamento para parent e a atribuição de origem quando ocorrem dentro de um subagent.
- não mudar o ruleset de permissões, o formato de persistência de aprovação de projeto ou o algoritmo de decisão de permissão.
- não introduzir outbox de permissão durável; continua-se usando o request promise de protocolo e o mapa de pending do service.
- não corrigir problemas adjacentes de subagent como background idle wake, SendMessage e subagent output footer.

---

## Phase 0: pré-verificação e confirmação de limites

**Files:**
- Read: `docs/superpowers/plans/2026-07-06-subagent-permission-delegation.md`
- Read: documento de auditoria de diferenças histórico (removido)
- Read: `docs/cli-background-subagent-wake-plan.md`
- Read: `apps/zcode-cli/packages/core/src/runtime/methods/subagent.ts`
- Read: `apps/zcode-cli/packages/core/src/tool/executor/permission-flow.ts`
- Read: `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/interaction-broker.ts`
- Read: `packages/services/src/zcode-agent/zcodeAgentService.ts`
- Read: `packages/services/src/zcode-agent/zcodeTaskServiceAdapter.ts`
- Read: `packages/shared/src/zcode-protocol/index.ts`

**Checklist:**

- [ ] Confirmar que a worktree está limpa ou que só existem mudanças do usuário sem relação com esta tarefa: `git status --short`.
- [ ] Reler `createSubagentProviderRuntimeHeadersPort()`, usando-a como referência de comentários e roteamento do blocking interaction delegate.
- [ ] Confirmar que, em `resolveToolPermission()`, a permissão comum de tool passa por `deps.permissionBroker.requestPermission(...)`.
- [ ] Confirmar que `createProtocolInteractionBroker()` desrama `AskUserQuestion` para `requestUserInput()`, `ExitPlanMode` para `requestExitPlanModeApproval()` e ferramentas comuns para `requestPermission()`.
- [ ] Confirmar que `requestPermission()`, `requestUserInput()` e `requestExitPlanModeApproval()` hoje não repassam `origin`.
- [ ] Confirmar que a key de `pendingPermissions` do `zcodeAgentService` usa o `sessionId` dos request params.
- [ ] Confirmar que a key de `pendingUserInputs` do `zcodeAgentService` também usa o `sessionId` dos request params.
- [ ] Confirmar que o `sessionId` passado por `respondPermission()` e `respondElicitation()` de `zcodeTaskServiceAdapter` ao agent service é o parent `taskId`.
- [ ] Não fazer nenhuma alteração de código até o plano de failing test da Phase 1 estar escrito com clareza.

**Critérios de aceitação:**

- [ ] É possível explicar a causa raiz em uma frase: o blocking request do child sai pelo protocolo com o child session id, enquanto o pending permission/elicitation em desktop/service/UI só é roteado por parent task/session, de modo que o usuário não vê e não consegue responder.
- [ ] É possível explicar o design em uma frase: o razão interno do child continua usando a child session, enquanto o pedido de interação bloqueante externo é roteado pela parent session e carrega a origem child.

---

## Phase 1: extensão de protocolo e tipos

**Goal:** adicionar um campo opcional `origin` nos tipos de contracts/shared protocol/task stream, expressando a origem subagent; quando o campo não é enviado, o comportamento de todos os requests antigos de permission/user-input permanece completamente inalterado.

**Files:**
- Modify: `apps/zcode-cli/packages/contracts/src/interfaces/permission.port.ts`
- Modify: `packages/shared/src/zcode-protocol/index.ts`
- Modify: `packages/shared/src/zcode-task-types.ts`
- Test: testes existentes de schema/type; se necessário, adicionar um teste de schema do shared

**Interfaces:**

- Produces: `InteractionRequestOrigin`
- Produces: `ZCodeInteractionRequestOrigin`
- Produces: `origin?: ...` nos params de permission request do protocolo, nos params de user-input request do protocolo, no payload do evento permission requested, no snapshot de pending permission e nos requests de permission/elicitation do task stream

### Checklist

- [ ] Adicionar o tipo de origin em `apps/zcode-cli/packages/contracts/src/interfaces/permission.port.ts`.

Forma de código sugerida:

```ts
export interface SubagentInteractionRequestOrigin {
  kind: "subagent";
  parentSessionId: SessionId;
  childSessionId: SessionId;
  agentId?: string;
  agentType?: string;
  description?: string;
  parentToolCallId?: ToolCallId | string;
  parentTurnId?: TurnId;
  childTurnId?: TurnId;
}

export type InteractionRequestOrigin = SubagentInteractionRequestOrigin;
```

- [ ] Adicionar o campo opcional a `PermissionBrokerRequest`.

```ts
export interface PermissionBrokerRequest {
  requestId: string;
  sessionId: SessionId;
  turnId?: TurnId;
  traceId: TraceId;
  toolCallId: ToolCallId;
  toolName: string;
  input: unknown;
  mode: CollaborationMode;
  ruleId: string;
  reason: string;
  riskLevel: RiskLevel;
  sideEffectScope?: ModelToolSideEffectScope;
  requestedAt: Date;
  origin?: InteractionRequestOrigin;
}
```

- [ ] Adicionar `zcodeInteractionRequestOriginSchema` em `packages/shared/src/zcode-protocol/index.ts`.

Schema sugerido:

```ts
export const zcodeInteractionRequestOriginSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("subagent"),
      parentSessionId: nonEmptyString,
      childSessionId: nonEmptyString,
      agentId: nonEmptyString.optional(),
      agentType: nonEmptyString.optional(),
      description: z.string().optional(),
      parentToolCallId: nonEmptyString.optional(),
      parentTurnId: nonEmptyString.optional(),
      childTurnId: nonEmptyString.optional(),
    })
    .strict(),
]);
export type ZCodeInteractionRequestOrigin = z.infer<
  typeof zcodeInteractionRequestOriginSchema
>;
```

- [ ] Adicionar `origin: zcodeInteractionRequestOriginSchema.optional()` aos seguintes schemas:
  - `zcodePendingPermissionSchema`
  - `zcodePermissionRequestedEventPayloadSchema`
  - `zcodePermissionRequestParamsSchema`
  - `zcodeUserInputRequestParamsSchema`

- [ ] Importar `ZCodeInteractionRequestOrigin` de `zcode-protocol/index.js` em `packages/shared/src/zcode-task-types.ts` e adicionar a `ZCodePermissionRequest` e `ZCodeElicitationRequest`:

```ts
origin?: ZCodeInteractionRequestOrigin;
```

- [ ] Verificar todos os lugares que constroem `ZCodePermissionRequest`; o caminho antigo não precisa ser obrigado a informar origin.
- [ ] Verificar todos os lugares que constroem `ZCodeElicitationRequest`; o caminho antigo não precisa ser obrigado a informar origin.
- [ ] Executar o subconjunto rápido de verificação de tipos.

Commands:

```bash
pnpm exec tsc -b packages/shared
pnpm --dir apps/zcode-cli exec tsc -b packages/contracts
```

Expected:

```text
无 TypeScript error
```

**Pontos de risco:**

- `z.discriminatedUnion` funciona mesmo com um único membro; se a versão atual do zod ou o lint não aceitar, mudar para `z.object(...).strict()` e nomear como um único schema de subagent origin.
- Não tornar `origin` obrigatório, senão todos os requests comuns de permission/user-input quebram.

---

## Phase 2: Core subagent blocking interaction delegate

**Goal:** o child runtime continua usando a child session para eventos e execução de ferramentas, mas os pedidos comuns de permission, de AskUserQuestion e de approval de ExitPlanMode emitidos via `PermissionBrokerPort` disparam um blocking request roteado para parent contra o permission broker do parent, carregando a origem child.

**Files:**
- Create: `apps/zcode-cli/packages/core/src/runtime/helpers/subagent-interaction-broker.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/subagent.ts`
- Test: `apps/zcode-cli/packages/core/tests/subagent-interaction-broker.test.ts`
- Optional Test: `apps/zcode-cli/packages/core/tests/subagent-explore.test.ts`

**Interfaces:**

- Consumes: `PermissionBrokerPort`, `PermissionBrokerRequest`, `PermissionBrokerRequestOptions`
- Produces: `createSubagentInteractionBroker(parentBroker, context): PermissionBrokerPort`

### Checklist

- [ ] Adicionar primeiro o unit test falhando: `apps/zcode-cli/packages/core/tests/subagent-interaction-broker.test.ts`.

O teste deve cobrir:

```ts
it("routes child permission requests through the parent session with subagent origin", async () => {
  const parentSessionId = createSessionId("parent");
  const childSessionId = createSessionId("subagent_agent_test");
  const seen: PermissionBrokerRequest[] = [];
  const parentBroker: PermissionBrokerPort = {
    async requestPermission(request) {
      seen.push(request);
      return { decision: "allow", reason: "approved" };
    },
  };

  const broker = createSubagentInteractionBroker(parentBroker, {
    agentId: "agent_test",
    agentType: "general-purpose",
    childSessionId,
    description: "Run command",
    parentSessionId,
    parentToolCallId: "call_parent_agent",
    parentTurnId: createTurnId("parent"),
  });

  const result = await broker.requestPermission({
    input: { command: "date" },
    mode: "build",
    reason: "Bash requires approval",
    requestId: "perm_child",
    requestedAt: new Date("2026-07-06T00:00:00.000Z"),
    riskLevel: "medium",
    ruleId: "mode.build.sideEffect",
    sessionId: childSessionId,
    toolCallId: createToolCallId("child_bash"),
    toolName: "Bash",
    traceId: createTraceId("trace"),
    turnId: createTurnId("child"),
  });

  expect(result).toMatchObject({ decision: "allow" });
  expect(seen).toHaveLength(1);
  expect(seen[0]).toMatchObject({
    requestId: "perm_child",
    sessionId: parentSessionId,
    toolCallId: "child_bash",
    toolName: "Bash",
    origin: {
      kind: "subagent",
      parentSessionId,
      childSessionId,
      agentId: "agent_test",
      agentType: "general-purpose",
      parentToolCallId: "call_parent_agent",
    },
  });
});
```

Ajustar helpers como `createTraceId` conforme os test utils atuais na implementação; não introduzir mudanças em dependências de produção só por causa dos testes.

- [ ] Adicionar um segundo failing test: o request de `AskUserQuestion` também precisa ser reescrito para a parent session, preservando `toolName: "AskUserQuestion"` e o child `toolCallId`.
- [ ] Adicionar um terceiro failing test: o request de `ExitPlanMode` também precisa ser reescrito para a parent session, e `origin.childTurnId` precisa vir do `turnId` do request do child.
- [ ] Implementar `createSubagentInteractionBroker()`.

Forma de código sugerida:

```ts
import type {
  PermissionBrokerPort,
  PermissionBrokerRequest,
  PermissionBrokerRequestOptions,
  PermissionBrokerResult,
  SessionId,
  ToolCallId,
  TurnId,
} from "../deps.js";

interface SubagentInteractionBrokerContext {
  agentId: string;
  agentType: string;
  childSessionId: SessionId;
  description?: string;
  parentSessionId: SessionId;
  parentToolCallId?: ToolCallId | string;
  parentTurnId?: TurnId;
}

export function createSubagentInteractionBroker(
  parentBroker: PermissionBrokerPort | undefined,
  context: SubagentInteractionBrokerContext,
): PermissionBrokerPort | undefined {
  if (!parentBroker) return undefined;

  return {
    requestPermission(
      request: PermissionBrokerRequest,
      options?: PermissionBrokerRequestOptions,
    ): Promise<PermissionBrokerResult> {
      // 修复原因：subagent 的事件和 model-io 使用 child session，但桌面/远控阻塞交互只订阅
      // parent task。对外 permission / AskUserQuestion / ExitPlanMode 请求必须代理到 parent
      // session，否则用户看不到弹窗，child 会一直 await。
      return parentBroker.requestPermission(
        {
          ...request,
          sessionId: context.parentSessionId,
          origin: {
            kind: "subagent",
            parentSessionId: context.parentSessionId,
            childSessionId: context.childSessionId,
            agentId: context.agentId,
            agentType: context.agentType,
            description: context.description,
            parentToolCallId: context.parentToolCallId,
            parentTurnId: context.parentTurnId,
            childTurnId: request.turnId,
          },
        },
        options,
      );
    },
  };
}
```

- [ ] Importar `createSubagentInteractionBroker` em `subagent.ts`.
- [ ] Trocar o permission broker nos deps do `AgentRuntime` do child de:

```ts
permissionBroker:
  childMode === "yolo" ? createDenyPermissionBroker() : this.permissionBroker,
```

para:

```ts
permissionBroker:
  childMode === "yolo"
    ? createDenyPermissionBroker()
    : createSubagentInteractionBroker(this.permissionBroker, {
        agentId: request.agentId,
        agentType: request.agentType,
        childSessionId: request.sessionId,
        description: request.description,
        parentSessionId: this.sessionId,
        parentToolCallId: traceStringAttribute(request.traceContext, "parentToolCallId"),
        parentTurnId: request.traceContext.turnId,
      }),
```

- [ ] Confirmar que o `permissionService` do Explore continua sendo configuração somente leitura e que general-purpose/custom continuam herdando o permission service do parent.
- [ ] Confirmar que `childMode === "yolo"` continua usando `createDenyPermissionBroker()`, sem diálogo.
- [ ] Confirmar que esse wrapper vale uniformemente para todas as chamadas de `PermissionBrokerPort.requestPermission()`; o bootstrap depois decide pelo `toolName` se entra em popup de permissão ou diálogo de elicitation.
- [ ] Rodar o core test focado.

Commands:

```bash
pnpm --filter @zcode/core exec vitest run tests/subagent-interaction-broker.test.ts
pnpm --dir apps/zcode-cli exec vitest run packages/core/tests/subagent-tool-events.test.ts
```

Expected:

```text
PASS packages/core/tests/subagent-interaction-broker.test.ts
PASS packages/core/tests/subagent-tool-events.test.ts
```

**Pontos de risco:**

- Não trocar `request.toolCallId` pelo tool call id do parent `Agent`.
- Não mudar a construção de `sessionId` do child runtime para o parent session id.
- Se `request.agentId` não for obrigatório no tipo, rastrear até o ciclo de vida de `SubagentRuntimeRequest`/runner e garantir que o context do delegate receba o agent id do ciclo de vida.

---

## Phase 3: repasse de origin pelo broker de protocolo

**Goal:** o `origin` gerado pelo delegate do core atravessa o protocol broker do bootstrap até o service; a permissão comum segue por `interaction/requestPermission`, AskUserQuestion/ExitPlanMode seguem por `interaction/requestUserInput`, e os três caminhos preservam a session roteada para parent e a origem child.

**Files:**
- Modify: `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/interaction-broker.ts`
- Test: testes de protocolo do bootstrap existentes; se necessário, adicionar `apps/zcode-cli/packages/bootstrap/tests/interaction-broker.test.ts`

### Checklist

- [ ] Adicionar `origin: request.origin` aos params de `context.requestClient(...)` em `requestPermission()`.

Trecho de código alvo:

```ts
const response = await context.requestClient(
  zcodeProtocolMethods.interactionRequestPermission,
  {
    input: request.input,
    origin: request.origin,
    reason: request.reason,
    requestId: request.requestId,
    riskLevel: request.riskLevel,
    sessionId: request.sessionId,
    options: buildProtocolPermissionOptions(request),
    toolCallId: request.toolCallId,
    toolName: request.toolName,
    turnId: request.turnId,
  },
  zcodePermissionResponseSchema,
  withInteractionRequestRecovery(options),
);
```

- [ ] Adicionar `origin: request.origin` aos params de `interactionRequestUserInput` em `requestUserInput()`.

Trecho de código alvo:

```ts
const response = await context.requestClient(
  zcodeProtocolMethods.interactionRequestUserInput,
  {
    input: request.input,
    origin: request.origin,
    prompt: request.reason,
    questions: parsed.data.questions.map(mapAskUserQuestion),
    requestId: request.requestId,
    schema: { toolName: request.toolName },
    sessionId: request.sessionId,
    toolCallId: request.toolCallId,
    toolName: request.toolName,
    turnId: request.turnId,
  },
  zcodeUserInputResponseSchema,
  withInteractionRequestRecovery(options),
);
```

- [ ] Adicionar `origin: request.origin` aos params de `interactionRequestUserInput` em `requestExitPlanModeApproval()`.

Trecho de código alvo:

```ts
const response = await context.requestClient(
  zcodeProtocolMethods.interactionRequestUserInput,
  {
    input: request.input,
    origin: request.origin,
    prompt: request.reason,
    questions: [createExitPlanModeApprovalQuestion()],
    requestId: request.requestId,
    schema: { interaction: "plan_approval", toolName: request.toolName },
    sessionId: request.sessionId,
    toolCallId: request.toolCallId,
    toolName: request.toolName,
    turnId: request.turnId,
  },
  zcodeUserInputResponseSchema,
  withInteractionRequestRecovery(options),
);
```

- [ ] Se o TypeScript indicar que `PermissionBrokerRequest` não tem origin, voltar à Phase 1 e corrigir o export de contracts.
- [ ] Estender o teste de bridge de AskUserQuestion em `apps/zcode-cli/packages/bootstrap/tests/zcode-protocol.test.ts`: construir um broker request com `origin.kind="subagent"` e afirmar que `interaction/requestUserInput.params.origin` de saída é preservado.
- [ ] Estender o teste de bridge/reannounce do ExitPlanMode: afirmar que tanto o primeiro request quanto o request de reannounce preservam o mesmo `origin`.
- [ ] Rodar os testes relacionados do bootstrap.

Commands:

```bash
pnpm --dir apps/zcode-cli exec vitest run packages/bootstrap/tests/subagents.test.ts
```

Expected:

```text
PASS packages/bootstrap/tests/subagents.test.ts
```

**Pontos de risco:**

- Se `origin: undefined` aparece ou não depois da serialização em JSON-RPC é irrelevante; um schema opcional aceita a ausência ou o descarte do undefined.
- Não reconstruir o origin dentro do bootstrap, evitando inconsistência de agentId/parentToolCallId com o core.
- O request de reannounce precisa reaproveitar o mesmo `origin` de negócio, senão após o reconnect a UI consegue restaurar o diálogo mas perde a atribuição de subagent.

---

## Phase 4: pending do service e projeção de task

**Goal:** o service continua registrando pending permission e pending user input por parent session/task, e ao mesmo tempo projeta `origin` para o task stream e o snapshot, para suportar UI e recuperação remota.

**Files:**
- Modify: `packages/services/src/zcode-agent/zcodeAgentService.ts`
- Modify: `packages/services/src/zcode-agent/zcodeTaskServiceAdapter.ts`
- Test: `packages/services/test/zcodeAgentService.test.ts`
- Test: testes relacionados ao adapter; se não houver cobertura existente, adicionar um teste focado

**Interfaces:**

- Consumes: `ZCodePermissionRequestParams.origin`
- Consumes: `ZCodeUserInputRequestParams.origin`
- Produces: `ZCodePermissionRequest.origin`
- Produces: `ZCodeElicitationRequest.origin`
- Produces: `ZCodeSessionStateSnapshot.projection.pendingPermissions[].origin`
- Produces: no snapshot de runtime da task, `pendingElicitations[].origin`

### Checklist

- [ ] Confirmar, no ramo `interaction/requestPermission` do `zcodeAgentService`, que os parsed params já trazem `origin`.
- [ ] Confirmar, no ramo `interaction/requestUserInput` do `zcodeAgentService`, que os parsed params já trazem `origin`.
- [ ] A pending key continua usando o `sessionId` dos parsed params, ou seja, o session id roteado para parent.
- [ ] Ao emitir o evento, manter:

```ts
emitSessionEvent(workspace, parsed.data.sessionId, {
  type: "permission.request",
  request: parsed.data,
});
```

Não mudar para `origin.childSessionId`.

- [ ] O evento de user input também continua na parent session:

```ts
emitSessionEvent(workspace, parsed.data.sessionId, {
  type: "userInput.request",
  request: parsed.data,
});
```

Não mudar para `origin.childSessionId`.

- [ ] Se o service tiver lógica de construção de pending permission na projeção de snapshot, garantir que o origin seja preservado a partir do payload do evento ou do pending request.
- [ ] Guardar o `request` em `PendingPermissionRequest` ou numa estrutura separada de pending user-input, para que `pendingUserInputs` possa ser restaurado como `pendingElicitations` no snapshot da task.
- [ ] Adicionar em `permissionRequestToStreamEvent()` de `zcodeTaskServiceAdapter.ts`:

```ts
origin: request.origin,
```

- [ ] Adicionar em `pendingPermissionToStreamEvent()`:

```ts
origin: permission.origin,
```

- [ ] Adicionar em `userInputRequestToElicitationStreamEvent()`:

```ts
origin: request.origin,
```

- [ ] Adicionar em `pendingAskUserQuestionToElicitationEvent()` e `pendingExitPlanModeToElicitationEvent()`:

```ts
origin: permission.origin,
```

- [ ] Se for adotado um map local no task adapter para registrar user inputs pending ao vivo, nomeação sugerida:

```ts
const pendingElicitationsByTaskKey = new Map<string, Map<string, ZCodeElicitationRequest>>();
```

E fazer upsert ao receber `userInput.request`, removendo em `userInput.response`, no término da task e no fechamento da session.

- [ ] Ao gerar o runtime snapshot em `snapshotToTask()`, fundir a elicitation mapeada a partir das pending permissions da agent projection com `pendingElicitationsByTaskKey`, deduplicando por `requestId`; o user input roteado para parent do map ao vivo deve ter prioridade, porque preserva o origin e o schema do request real de protocolo.
- [ ] `raw` continua preservando o request/pending permission completo, facilitando preview da UI e diagnóstico em logs.
- [ ] O caminho `respondPermission()` mantém `sessionId: params.taskId`, sem novo ramo de resposta para child session.
- [ ] O caminho `respondElicitation()` mantém `sessionId: params.taskId`, sem novo ramo de resposta para child session.
- [ ] Novo service test: um fake agent envia `interaction/requestPermission`, com params.sessionId sendo o parent e origin.childSessionId sendo o child; afirmar que o sessionId do service event/session event é o parent e que request.origin é preservado.
- [ ] Novo service test: um fake agent envia `interaction/requestUserInput`, com params.sessionId sendo o parent e origin.childSessionId sendo o child; afirmar que o sessionId de `userInput.request` é o parent e que request.origin é preservado; `respondUserInput(parentSessionId, requestId)` consegue responder ao request de protocolo original.
- [ ] Novo adapter test, ou extensão de um existente: o `taskId` do permission stream event é o parent task e `origin.kind === "subagent"`.
- [ ] Novo adapter test, ou extensão de um existente: o `taskId` do elicitation stream event é o parent task e `origin.kind === "subagent"`; na restauração por snapshot, `runtime.pendingElicitations` também preserva o origin.

Trecho de request falso sugerido:

```js
send({
  id: "permission-request-1",
  method: "interaction/requestPermission",
  params: {
    sessionId: "sess-parent",
    requestId: "perm-child-bash",
    toolCallId: "call_child_bash",
    toolName: "Bash",
    reason: "Bash requires approval",
    riskLevel: "medium",
    input: { command: "date" },
    options: [
      {
        optionId: "approve",
        label: "Approve",
        response: { decision: "allow" },
      },
      {
        optionId: "deny",
        label: "Deny",
        response: { decision: "deny", reason: "Rejected" },
      },
    ],
    origin: {
      kind: "subagent",
      parentSessionId: "sess-parent",
      childSessionId: "sess_subagent_agent_test",
      agentId: "agent_test",
      agentType: "general-purpose",
      parentToolCallId: "call_parent_agent",
    },
  },
});
```

- [ ] Rodar o service test focado.

Commands:

```bash
pnpm vitest run packages/services/test/zcodeAgentService.test.ts
```

Expected:

```text
PASS packages/services/test/zcodeAgentService.test.ts
```

**Pontos de risco:**

- Não adicionar fallback para child na key de `pendingPermissions`, senão no approve pode não ser encontrado o original protocol request id.
- Não adicionar fallback para child na key de `pendingUserInputs`, senão ao responder AskUserQuestion/ExitPlanMode pode não ser encontrado o original protocol request id.
- Não emitir child session event no service com base em `origin.childSessionId`; a UI não assina child session e isso voltaria ao bug original.
- A lógica de reannounce continua registrada pelo mesmo `requestId + parent sessionId` de negócio e não pode duplicar o diálogo por causa de mudança no origin.
- O runtime event `permission.requested` de AskUserQuestion/ExitPlanMode continua sendo produzido dentro da child session; a restauração do snapshot do parent não pode depender apenas da projection da parent session, e o caminho ao vivo `pendingUserInputs` / `userInput.request` também precisa entrar no snapshot de runtime da task.

---

## Phase 5: compatibilidade mínima de UI e exibição opcional da origem

**Goal:** os diálogos de permission e de elicitation existentes conseguem lidar com requests que trazem `origin`; a UI não precisa assinar a child session. É opcional exibir a origem do subagent, mas a primeira fase prioriza não quebrar a experiência atual de diálogo/pergunta-resposta.

**Files:**
- Read before UI edit: `DESIGN.md`
- Modify if needed: `packages/ui/src/...`
- Test: `packages/ui/test/permissionRequest.test.ts`
- Test: `packages/ui/test/permissionDialog.test.ts`
- Test: testes de UI de elicitation; se não houver cobertura existente, adicionar um teste focado

### Checklist

- [ ] Ler primeiro o `DESIGN.md` da raiz.
- [ ] Procurar os pontos de consumo de request de permission/elicitation na UI.

Commands:

```bash
rg -n "permission_request|PermissionRequest|permissionRequest|pendingPermissions|respondPermission|elicitation_request|Elicitation|elicitationRequest|pendingElicitations|respondElicitation" packages/ui/src packages/ui/test
```

- [ ] Confirmar que a UI não quebra com um `raw.origin` desconhecido.
- [ ] Confirmar que a UI não quebra com `ZCodeElicitationRequest.origin`.
- [ ] Se `ZCodePermissionRequest` ou `ZCodeElicitationRequest` forem desestruturados de forma exaustiva, incluir o campo opcional `origin`.
- [ ] Exibição opcional: nos textos auxiliares do diálogo, mostrar apenas uma origem curta, por exemplo `来自 subagent: general-purpose`. Não mostrar child session id nem agent internal id, a não ser que a UI de debug já tenha uma entrada equivalente.
- [ ] Se for adicionar copy de UI, confirmar i18n em chinês e inglês; não codificar texto visível em uma única língua.
- [ ] Se for adicionar logs, usar `packages/ui/src/logger.ts`.
- [ ] Completar UI test: um `ZCodePermissionRequest` com `origin.kind="subagent"` abre o diálogo e, ao clicar approve, chama o parent `taskId/requestId`.
- [ ] Completar UI test: um `ZCodeElicitationRequest` com `origin.kind="subagent"` abre o diálogo de elicitation e, ao clicar accept/submit, chama o parent `taskId/requestId`.
- [ ] Rodar os UI tests focados.

Commands:

```bash
pnpm vitest run packages/ui/test/permissionRequest.test.ts packages/ui/test/permissionDialog.test.ts
```

Expected:

```text
PASS packages/ui/test/permissionRequest.test.ts
PASS packages/ui/test/permissionDialog.test.ts
```

**Pontos de risco:**

- A UI não deve chamar `respondPermission()` com `origin.childSessionId`.
- A UI não deve chamar `respondElicitation()` com `origin.childSessionId`.
- A UI não deve transformar permission/elicitation de subagent em uma nova task row.
- Se os testes passarem sem nenhuma mudança de UI, esta fase pode ficar apenas com tipos/testes, sem forçar alteração visual.

---

## Phase 6: catalog/matrix de E2E de conversation e casos de aceitação manual

**Goal:** por regra do projeto, bugs de interação relacionados a conversation recebem primeiro catalog/matrix e depois o caso de E2E pending específico.

**Files:**
- Modify: `docs/conversation-session-case-catalog.md`
- Modify: `docs/testing/conversation-session-e2e-coverage-matrix.md`
- Create: `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-subagent-blocking-interaction-delegate.test.ts`

### Checklist

- [ ] Adicionar accepted cases em `docs/conversation-session-case-catalog.md`, preferindo IDs na região vizinha de subagent/permission; se o catalog atual não tiver uma seção de subagent, criar a seção `L. Subagent blocking interaction delegate`.

Casos sugeridos:

| ID | Estado prévio | Evento do usuário/sistema | Regra atingida | Resultado esperado | Review |
| --- | --- | --- | --- | --- | --- |
| L01 | `build/变更前确认`, parent task chama `Agent`, child precisa executar Bash | child inicia um Bash permission request | subagentPermissionDelegatesToParent | o parent task exibe a confirmação de permissão; após approve o Bash do child executa e preenche o resultado do Agent; após deny o child recebe permission denied; stop limpa o pending | accepted |
| L02 | parent task chama `Agent`, child chama `AskUserQuestion` | child inicia um user input request | subagentAskUserQuestionDelegatesToParent | o parent task exibe o diálogo de elicitation; após accept a resposta preenche o tool input do child e o child continua; após cancel/decline o child recebe a rejeição; stop limpa o pending | accepted |
| L03 | parent task chama `Agent`, child chama `ExitPlanMode` em plan mode | child inicia um plan approval request | subagentExitPlanModeDelegatesToParent | o parent task exibe a elicitation de aprovação de plano; após approve o child sai do modo de plano; após feedback/rejeição o retorno é `plan_approval_feedback` para o child; stop limpa o pending | accepted |
| L04 | model request do child dispara provider runtime headers (incluindo verificação de segurança da versão oficial) | child inicia um provider runtime headers request | subagentProviderHeadersAlreadyDelegateToParent | continua reaproveitando o wrapper existente de provider runtime headers roteado para parent; não aparece assinatura de UI independente da child session; a resposta só afeta este model request do child e não troca o model do parent por engano | accepted |

- [ ] Adicionar `SBI` à tabela de abreviações de teste em `docs/testing/conversation-session-e2e-coverage-matrix.md`.

Linha sugerida:

```md
| `SBI` | `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-subagent-blocking-interaction-delegate.test.ts` |
```

- [ ] Marcar os novos cases como `missing` ou `partial` nas tabelas de estatística/cobertura do matrix, até que o arquivo de E2E exista.
- [ ] Adicionar um case WDIO manual-review pending cobrindo os quatro ramos:
  - approve: o diálogo de permissão do parent aparece, clicar em approve, o Bash do child tem saída e o Agent do parent não trava.
  - deny: clicar em deny, o tool do child retorna permission denied e o Agent do parent encerra normalmente.
  - ask-user-question: o diálogo de elicitation do parent aparece e, após enviar a resposta, o child AskUserQuestion tool result contém a resposta do usuário.
  - exit-plan-mode: a elicitation de aprovação de plano do parent aparece e, após approve/feedback, o child recebe o allow correto ou `plan_approval_feedback`.
  - provider runtime headers: revisar que o provider runtime headers request do child continua passando pela parent session e não é quebrado por esta rodada.
  - stop: dar stop no parent task com permission/elicitation pending, limpar o diálogo e o child deixar de ficar pending.
  - replayable snapshot: se o helper existente suportar remote/reconnect, afirmar que pending permission e pending elicitation são restaurados no snapshot por parent task; se ainda não houver suporte, marcar como manual pendente na spec.
- [ ] Deixar este E2E em `manual-review/pending` e não colocá-lo direto no gate padrão, até que replay/fixture estejam estáveis.
- [ ] Rodar o coverage audit ou, no mínimo, os scripts de checagem de documentação relacionados; se o repositório não tiver script separado, o `pnpm lint` já cobre a formatação de markdown.

**Pontos de risco:**

- Não misturar este case com background subagent wake ou provider registry cold-start.
- Não mudar o permission mode padrão do produto para fabricar o case; o fixture de teste deve ser explicitamente colocado em modo build/ask.

---

## Phase 7: regressão de integração e verificação do ticket do incidente

**Goal:** provar com testes focado e com a forma real do incidente que o travamento desapareceu.

**Files/Artifacts:**
- Artefatos existentes do ticket em `/tmp/ZCT-2073779059361222656/`
- Testes de core/service/UI das fases anteriores
- Script opcional de reprodução do runtime local ou execução manual do desktop

### Checklist

- [ ] Executar todos os testes focados novos/modificados.

Commands:

```bash
pnpm --filter @zcode/core exec vitest run tests/subagent-interaction-broker.test.ts
pnpm vitest run packages/services/test/zcodeAgentService.test.ts
pnpm vitest run packages/ui/test/permissionRequest.test.ts packages/ui/test/permissionDialog.test.ts
```

Expected:

```text
全部 PASS
```

- [ ] Executar os gates completos do repositório.

Commands:

```bash
pnpm typecheck
pnpm lint
git diff --check
```

Expected:

```text
pnpm typecheck 无 error
pnpm lint 无 error
git diff --check 无 whitespace error
```

- [ ] Verificar manualmente ou por E2E o caminho central do incidente:
  - criar uma task e definir "confirmar antes de alterar" ou um ask mode equivalente.
  - pedir ao parent `Agent` que o subagent execute um Bash, por exemplo `python3 -c "from datetime import datetime; print(datetime.now())"`.
  - observar o diálogo de permissão aparecer no parent task.
  - após approve, o Bash executa e o Agent devolve o resultado.
  - após deny, o Agent devolve a rejeição de permissão, sem ficar pending infinito.
- [ ] Verificar manualmente ou por E2E o caminho do AskUserQuestion:
  - pedir ao parent `Agent` que o subagent chame primeiro `AskUserQuestion` para esclarecer uma pergunta de duas opções.
  - observar o diálogo de elicitation aparecer no parent task.
  - após accept, o child tool result contém a resposta do usuário e o Agent continua a execução.
  - após cancel/decline, o child não fica pending infinito.
- [ ] Verificar manualmente ou por E2E o caminho do ExitPlanMode:
  - fazer o child entrar em plan mode e chamar `ExitPlanMode`.
  - observar a elicitation de aprovação de plano aparecer no parent task.
  - após approve, o child sai do plan mode; após um texto de feedback, o child recebe `plan_approval_feedback`.
- [ ] Regressão do caminho de provider runtime headers (incluindo verificação de segurança da versão oficial): quando o model request do child dispara refresh de headers, o popup/sincronização continua na parent session e não troca por engano o modelo atual da parent session.
- [ ] Verificar que os logs mostram o request/resolved de permission/user-input da parent session e que o origin contém o child session/agent id.
- [ ] Verificar que o model-io do child continua sendo escrito em `model-io-sess_subagent_agent_*.jsonl`, sem escrever no artefato da parent session.
- [ ] Verificar que `pendingPermissions` / `pendingElicitations` do snapshot da parent task têm comprimento 1 quando o diálogo correspondente aparece e zeram após a resposta.
- [ ] Se não for possível validar por completo o mobile `/remote`, listar explicitamente na descrição do commit as verificações pendentes: snapshot/reconnect de pending permission e pending elicitation no web remote replayable.

---

## Phase 8: organização final e commit

**Goal:** manter o diff pequeno e claro, com mensagem de commit conforme Conventional Commits/MR.

**Checklist:**

- [ ] `git status --short` confirma que só entram arquivos relacionados a esta tarefa.
- [ ] `git diff --stat` confirma que o escopo das mudanças corresponde a este plano.
- [ ] Conferir se os novos comentários em chinês explicam apenas a causa do bug, sem repetir o significado do código.
- [ ] Conferir que o child session id não foi usado como alvo de resposta da UI.
- [ ] Conferir que não foi adicionado import direto entre camadas nem dependência circular.
- [ ] Conferir que `origin` não foi tornado obrigatório.
- [ ] Executar os gates finais:

```bash
pnpm typecheck
pnpm lint
git diff --check
```

- [ ] Commitar.

Mensagem de commit sugerida:

```bash
git add docs/superpowers/plans/2026-07-06-subagent-permission-delegation.md \
  apps/zcode-cli/packages/contracts/src/interfaces/permission.port.ts \
  apps/zcode-cli/packages/core/src/runtime/helpers/subagent-interaction-broker.ts \
  apps/zcode-cli/packages/core/src/runtime/methods/subagent.ts \
  apps/zcode-cli/packages/core/tests/subagent-interaction-broker.test.ts \
  apps/zcode-cli/packages/bootstrap/src/zcode-protocol/interaction-broker.ts \
  packages/shared/src/zcode-protocol/index.ts \
  packages/shared/src/zcode-task-types.ts \
  packages/services/src/zcode-agent/zcodeAgentService.ts \
  packages/services/src/zcode-agent/zcodeTaskServiceAdapter.ts \
  packages/services/test/zcodeAgentService.test.ts \
  docs/conversation-session-case-catalog.md \
  docs/testing/conversation-session-e2e-coverage-matrix.md \
  packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-subagent-blocking-interaction-delegate.test.ts

git commit -m "fix: delegate subagent blocking interactions to parent task"
```

Se a phase de UI não precisar de mudanças, não incluir arquivos de UI no `git add`.

---

## Rollback Plan

- Se o schema da Phase 1 provocar ondas de tipo em larga escala: manter o `origin` apenas em contracts e reverter primeiro a projeção shared/task stream, confirmando que o core delegate compila antes de avançar de novo.
- Se o core delegate da Phase 2 causar anomalia na permission policy do child ou no roteamento de elicitation: reverter a injeção de `permissionBroker` para a lógica original e manter o failing test como problema pendente de correção.
- Se a resposta do service não encontrar o pending: verificar se o `sessionId` roteado para parent já foi reescrito no bootstrap antes de sair pelo protocolo; não adicionar fallback para child no service.
- Se a UI não exibir nada mas o service já tiver pending: para permissão comum, verificar se o task stream event está sendo emitido por `permissionRequestToStreamEvent(parentTaskId, request)`; para elicitation, verificar `userInputRequestToElicitationStreamEvent(parentTaskId, request)` e o `pendingElicitations` de runtime.
- Se a recuperação do mobile remote estiver anormal: primeiro confirmar que o caminho principal do desktop continuous não regride e depois revisar separadamente o caminho de recuperação de snapshot de `clientMode` / `deliveryKind`.

---

## Self-Review Checklist

- [ ] Cada phase tem arquivos de modificação e comandos de verificação explícitos.
- [ ] O plano não exige que a UI assine a child session.
- [ ] O plano não substitui o child tool call id pelo parent tool call id.
- [ ] O plano deixa explícito que a permission policy do child não muda e que apenas o roteamento de ask/user-input é delegado.
- [ ] O plano cobre permissão comum, AskUserQuestion, ExitPlanMode e provider runtime headers (incluindo verificação de segurança da versão oficial).
- [ ] O plano cobre as seis categorias de aceitação approve, deny, accept, decline, stop e snapshot/replayable.
- [ ] O plano cobre a exigência do projeto sobre catalog/matrix de documentação.
- [ ] O plano não mistura teammate/swarm/worktree isolation no escopo desta rodada.
- [ ] Os gates finais do plano incluem `pnpm typecheck`, `pnpm lint` e `git diff --check`.

---

## Revisão de regressão da projeção autoritativa V4

### Evidência de runtime e causa raiz

Os logs locais de 2026-07-24 reproduziram o T01:

- na main session `sess_fe2e609e-...`, um `AskUserQuestion` comum entrou em `decision=ask` em
  `2026-07-24T05:23:21.849Z` e depois registrou um `permission resolved` normal em
  `2026-07-24T05:23:25.171Z`.
- a child session `sess_subagent_agent_a12c56f2-...`, iniciada pela mesma main session, entrou em `decision=ask` para
  `AskUserQuestion` em `2026-07-24T05:24:03.041Z`, mas sem o
  `permission resolved` correspondente; o usuário esperou até parar.
- o `permission_requested` do child só foi escrito na cadeia de eventos por child session; o parent só recebeu
  `user_input_auto_resolution_updated` e não recebeu um `permission_requested` capaz de criar
  `ProductProjection.pendingInteractions`.

A correção original garantia que o RPC reverso do `PermissionBrokerPort` usasse a parent session e carregasse
`origin.kind=subagent`. Depois que o V4 passou a ser a fonte autoritativa da UI de conversa, o popup deixou de poder depender apenas do RPC reverso/pending map local da task;
`ProductProjection` precisa ver primeiro `PermissionRequested` no topic da conversa do parent. Hoje `mirrorSubagentToolEvent()` só espelha o ciclo de vida comum de tool e perde
`PermissionRequested`, `PermissionResolved` e `PermissionDenied`, de modo que a promise do broker já está esperando, mas a main task não tem nenhuma interação pending que possa ser renderizada e submetida.

### Cadeia autoritativa revisada

```text
child AgentRuntime
  |
  | child PermissionRequested(toolCallId=childTool)
  +-----------------------------> child event store / child projection
  |
  `-- parent live mirror
        sessionId = parentSession
        toolCallId = mirroredParentTool
        origin = { kind: subagent, childSessionId, parentSessionId, ... }
             |
             v
        parent ProductProjection.pendingInteractions
             |
             v
        V4InteractionDialogs (main task)
             |
             | resolveInteraction(requestId)
             v
        parent-routed interaction registry / broker promise
             |
             v
        child PermissionResolved
             |
             +-------------------> child event store / child projection
             `-- parent live mirror --> clear parent pending interaction
```

### Impact Brief

| Field | Value |
| --- | --- |
| Developer intent | restaurar, dentro do subagent, a exibição e resposta de permissão e `AskUserQuestion` na main task e a continuação do child |
| Capability | Subagents + conversation blocking interactions |
| Change layer | validation + recovery |
| Operating mode | planning |
| Primary seeds | `createSubagentInteractionBroker`, `mirrorSubagentToolEvent`, `ProductProjection.onPermissionRequested`, `V4InteractionDialogs` |
| Out of scope | não criar assinatura de child task/UI; não mudar o julgamento de permissão; não espalhar a semântica de recuperação replayable para o desktop continuous |

#### UI Surface Matrix

| Cenário do usuário | Entrada de UI | Implementação compartilhada | Owner da exibição | Validação/gating | Ação de commit | Autoridade | Limite de modo | Isolamento |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `AskUserQuestion` do child | diálogo de elicitation da main task | `V4InteractionDialogs` → `ElicitationDialog` | `ProductProjection.pendingInteractions` do parent | permission service do child decidiu `ask` | `resolveInteraction(requestId)` | projeção de conversa do parent + broker promise do child | desktop continuous; mobile só pelo snapshot/gap replayable já existente | event store/model-io do child continuam na child session |
| permissão comum do child | diálogo de permissão da main task | `V4InteractionDialogs` → `PermissionDialog` | `ProductProjection.pendingInteractions` do parent | ruleset de permissões do child | `resolveInteraction(requestId)` | idem | idem | idem |
| `ExitPlanMode` do child | diálogo de aprovação de plano da main task | compartilhado com a interaction de user-input | projection do parent | plan mode + tool policy do child | `resolveInteraction(requestId)` | idem | esta rodada só faz regressão da mesma cadeia de projeção, sem nova combinação de E2E | idem |

#### Shared And Divergent Behavior

| Concern | Shared | Deliberately different | Why |
| --- | --- | --- | --- |
| Identidade do request | o `requestId` permanece igual no child, no mirror do parent e no interaction registry | a projection do parent usa o id da tool row espelhado; o executor do child mantém o child tool call id | a UI consegue ancorar na tool row do parent enquanto a resposta ainda libera a promise original do child |
| Persistência | os interaction events brutos do child continuam sendo escritos na child session | o interaction event do parent passa apenas pelo live mirror, sem reescrever no event store do parent | evita poluir o transcript do parent e mantém a projeção live do V4 visível |
| Delivery | a projection do parent serve simultaneamente ao desktop e ao snapshot replayable | o desktop não concatena mensagens de recuperação do mobile | mantém os limites atuais de clientMode/deliveryKind |

#### Ranked Relationships

| Rank | From | Edge | To | Evidence |
| --- | --- | --- | --- | --- |
| must-inspect | event sink do child runtime | live mirror | `ProductProjection` do parent | `runtime/methods/subagent.ts`, `subagent/tool-event-mirror.ts` |
| must-inspect | `PermissionRequested` do parent | cria | `pendingInteractions` | `zcode-protocol-v4/product-projection.ts` |
| must-inspect | `pendingInteractions` | renderiza | `V4InteractionDialogs` | `packages/ui/src/v4/V4InteractionDialogs.tsx` |
| should-inspect | `PermissionResolved/Denied` do parent | liquidada | pending interaction/tool row | `ProductProjection.settlePermission()` |
| invariant-only | event bruto do child | persiste em | apenas a child session | runtime event store + detached child topic |
| conditional | projeção de conversa do parent | recupera via | web remote replayable | snapshot/gap de conversation topic já existente; esta rodada não muda main/relay/owner |

#### Must-Preserve Invariants

- O `requestId` não é reescrito; a resposta do broker do child ainda encerra na request promise original.
- O child tool call id não é escrito na tool row do parent; o mirror do parent usa um id de espelho estável e preserva a atribuição em
  `childToolCallId`/`origin`.
- O mirror do parent entra apenas no live sink e não é gravado de novo no event store do parent.
- O RPC reverso legado e o `resolveInteraction` do V4 continuam competindo e sendo idempotentes; não criar uma segunda rota de resposta.
- O desktop `desktop-continuous` e o celular `web-remote-replayable` continuam consumindo a mesma projection canônica do parent,
  mas com o ritmo de recuperação isolado.

#### Codegraph Evidence

O repositório atual não tem índice `.codegraph/`; por restrição da skill, o fallback é `rg` e a leitura estática arquivo a arquivo. A profundidade de expansão é 2:

```text
createDefaultSubagentPort
  -> child AgentRuntime.eventSink
  -> mirrorSubagentToolEvent
  -> bootstrap onSessionEvent
  -> conversation topic ProductProjection
  -> V4InteractionDialogs
```

#### Graph Drift And Confirmed Delta

O grafo atual de semântica funcional registra apenas o formulário de configuração de Subagent e a persistência em Markdown, e não registra a blocking interaction de runtime.
Desta vez a superfície parent de blocking interaction, o owner de runtime do child e o interaction broker foram devolvidos a `.agents/skills/feature-boundary-planner/references/zcode-feature-graph.yaml`.

### Poda de casos e handoff de implementação

| Candidate | Status | Reason |
| --- | --- | --- |
| T01 `AskUserQuestion` do child com projection no parent | bug-candidate → accepted | já há semântica de produto e log de falha real; precisa ser corrigido |
| T02 permissão Bash do child com projection no parent | accepted | compartilha o mesmo permission event mirror do T01; basta manter um teste unitário representativo |
| `ExitPlanMode` do child | accepted, somente representativo | compartilha o broker de `PermissionRequested`/user-input; não adicionar combinações de estado |
| child concorrente/em background | pruned | o event mirror funciona por identidade de agent/tool/request; concorrência e background não mudam a causa raiz desta vez |
| reconnect do mobile | ignorado para E2E de implementação | não modificar schema de replay/snapshot; manter os invariantes atuais da projection canônica do parent |
| workspace/remote identity | pruned por invariante | desta vez não mudar a workspace key, o remoteSessionId nem o attachment |

Nesta rodada não se cria um novo case de E2E de conversation: T01/T02 e `SD` já existem. Primeiro completa-se o teste de regressão do parent interaction event mirror no core e corrige-se a coverage matrix de `covered` incorreto para `partial`; o `SD` continua em
`manual-review/pending` e só pode voltar a `covered` depois de concluído separadamente o review/promoção manual.