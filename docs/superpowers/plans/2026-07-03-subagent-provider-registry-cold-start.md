# Plano de Implementação da Correção de Cold Start do Subagent Provider Registry

> **Para trabalhadores agênticos:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** Corrigir, no desktop local e no remote workspace, o problema em que o CLI child runtime não encontra o provider config quando o subagent profile está vinculado a um provider que nunca foi usado pela sessão principal.

**Arquitetura:** A semântica da correção é que "qualquer agent runtime que vá executar um subagent precisa ter o app provider registry completo antes do turno". A implementação é dividida em duas cadeias: no desktop local, o `zcodeAgentService` injeta dentro do service o registry completo do `providerRegistrySource` no workspace CLI atual; no remote workspace, mantém-se a cadeia dedicada existente `remoteWorkspaceProviderSync`, sem misturar o comportamento local à semântica replayable remoto. O subagent não é responsável pela injeção de provider e continua reutilizando o `modelAdapter` do runtime pai.

**Stack técnico:** TypeScript, `@zcode/protocol`, ZCode Services, React/testes de guard de sync da UI remote, Vitest, ZCode Desktop WDIO E2E.

## Restrições Globais

- Toda funcionalidade nova ou modificada precisa deixar `spec` ou plano em `docs`; este arquivo é o plano de execução deste bugfix.
- Ao corrigir bug, deixar comentários em chinês explicando a causa do problema e por que a correção funciona assim.
- Lógica relacionada a process / services precisa garantir ao mesmo tempo que o fluxo local do desktop e a cadeia de controle remoto do celular não são afetados.
- A cadeia de controle remoto precisa manter o limite entre desktop `continuous` e web remote `replayable`; esta correção não muda a semântica de restauração de stream/snapshot/queue.
- `workspaceIdentity` / `workspacePath` não podem ser misturados; a key de isolamento de identidade usa `workspaceKey = workspaceIdentity?.trim() || workspacePath`.
- Não modificar o schema da tool `Agent` e não colocar provider config em input de tool visível ao provider, no child prompt ou no tool result.
- Não colocar o sync do workspace provider registry no caminho quente de headers de runtime.
- Não refatorar a semântica remote existente de `packages/ui/src/lib/remoteWorkspaceProviderSync.ts`.
- Após a modificação, executar `pnpm --filter @zcode/desktop typecheck:e2e`, `pnpm typecheck`, `pnpm lint`.
- A regressão E2E usa o case falhando oficial: `packages/desktop/test/e2e/conversation-session/conversation-session-subagent-provider-registry-cold-start.test.ts`.

---

## Causa Raiz

O E2E `SR / I14` já commitado prova que na cadeia atual:

- o subagent profile já é carregado, e `custom:e2e-deepseek-alt:deepseek-v4-pro` também é resolvido como child model ref.
- `apps/zcode-cli/packages/core/src/runtime/methods/subagent.ts` reutiliza o `this.modelAdapter` do runtime pai ao criar o child runtime.
- no cold start local, o workspace catalog / model adapter da CLI tem apenas o primary provider da sessão principal; o alternate provider não recebeu o registry completo do app.
- ao resolver `e2e-deepseek-alt/deepseek-v4-pro`, o child runtime lança `Model provider is not configured: e2e-deepseek-alt`.

Um único `runtimeModel` só pode cobrir o modelo atual da sessão principal e não substitui o provider registry completo. O subagent profile pode referenciar um provider que a sessão principal nunca selecionou, por isso o registry completo precisa ser injetado na camada de workspace/modelAdapter.

## Decisão

Adota-se **watermark de apply no agent + synchronizer do service local + guard de sync remoto existente**:

1. **Fronteira de apply do Agent:** na fronteira de apply de `workspace/updateProviderRegistry` em `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/workspace-model-catalog.ts`, registrar `providerRegistryGeneratedAt`. Se o `generatedAt` do registry recebido for anterior ao registry já aplicado, devolver o catalog atual sem sobrescrever o provider map.
2. **Desktop local:** dentro de `packages/services/src/zcode-agent/zcodeAgentService.ts`, adicionar um synchronizer local de provider registry. Ele só trabalha quando `providerRegistrySource` existe; um host remoto anexado não tem essa source e portanto não entra no ramo local.
3. **Create/resume/read local:** em `createSession`, `resumeSession`, `readSession` e `readWorkspaceState`, antes de enviar a requisição de protocolo, garantir que o client CLI atual já aplicou o provider registry completo.
4. **Mudanças de provider local:** estender a assinatura existente de `providerRegistrySource.onDidChangeProviderRegistry`. Para os workspaces locais ativos em `activeClientsByWorkspaceKey`, enviar primeiro o `workspace/updateProviderRegistry` completo e depois atualizar o runtimeModel das sessions existentes.
5. **Remote workspace:** manter `syncAppGlobalStateToRemoteWorkspace` / `syncWorkspaceModelProvidersToAgent` como estão. O cenário de subagent remoto continua recebendo o registry completo pelo preflight remoto existente antes de prepare/create/resume/send; como o remote também passa pela mesma fronteira de apply do agent protocol, a proteção contra registry stale cobre o remote simultaneamente.

**Ajuste da revisão:** `ProviderRegistrySnapshot.revision` é uma impressão digital de conteúdo `sha256:*` e não tem ordem de magnitude. A proteção contra stale não deve ficar apenas antes do envio no service do desktop; como todas as entradas acabam em `workspace/updateProviderRegistry`, adota-se provisoriamente `generatedAt` como watermark best-effort na fronteira de apply do agent. O synchronizer local também usa um drain worker por workspace/client para enviar o registry pendente em série e ignora snapshots mais antigos que o `generatedAt` pendente/aplicado atual. Um snapshot com `generatedAt` antigo não pode sobrescrever um registry novo já aplicado; mesmo milissegundo, retrocesso do relógio do sistema e deriva de horário entre máquinas continuam sendo limitações best-effort, e a solução de longo prazo deve evoluir para CAS no protocolo / sequência monotônica na source.

## Não-Objetivos

- Não generalizar `packages/ui/src/lib/remoteWorkspaceProviderSync.ts` para um helper único local + remoto.
- Não sincronizar o registry incondicionalmente em `getClient()`.
- Não sincronizar o workspace registry no caminho quente de headers de runtime de `sendPrompt`.
- Não modificar a resolução de subagent profile da CLI nem a lógica de seleção de modelo do child runtime.
- Não adicionar admission de preset Docker nesta tarefa; depois da correção, rodar primeiro o replay local, e o admission de Docker fica para depois.

## Mapa de Arquivos

- Modify: `packages/services/src/zcode-agent/zcodeAgentService.ts`
  - Adicionar estado de sync do provider registry e helper dentro do service.
  - Sincronizar o registry completo antes do create/resume/read/readWorkspaceState local.
  - No evento de mudança do provider registry, enviar o registry completo por hot push aos clients locais ativos.
- Modify: `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/workspace-model-catalog.ts`
  - Na fronteira de apply de `workspace/updateProviderRegistry`, ignorar snapshot stale usando `providerRegistryGeneratedAt`.
- Modify: `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-types.ts`
  - Registrar no record do workspace model catalog a marca d'água `generatedAt` do snapshot de registry atual.
- Modify: `apps/zcode-cli/packages/bootstrap/tests/zcode-protocol.test.ts`
  - Adicionar teste unitário da fronteira de apply do agent: aplicar primeiro um registry com `generatedAt` novo e depois enviar um registry com `generatedAt` antigo; o snapshot antigo não pode sobrescrever o provider catalog atual.
- Modify: `packages/services/test/zcodeAgentService.providerRegistry.test.ts`
  - Adicionar testes unitários vermelho/verde de sincronização do registry completo antes do create de session local.
  - Adicionar teste unitário de hot push do registry para o workspace ativo depois de mudança de provider.
  - Adicionar teste unitário de ordem temporal na sincronização concorrente do provider registry: depois que o old in-flight termina, reenvia o registry com `generatedAt` novo; e ignora o evento com `generatedAt` antigo depois que o registry novo foi aplicado.
  - Adicionar teste unitário de fronteira de cache do retorno stale da `updateProviderRegistry` pública: quando o agent não aplicou a entrada desta chamada, o service não deve cachear essa entrada como provider registry do remote workspace.
  - Manter os testes existentes de que headers de runtime não disparam hot-sync de workspace.
- Read/Guard: `packages/ui/src/lib/remoteWorkspaceProviderSync.ts`
  - Não alterar a implementação; apenas provar pelos testes existentes que a cadeia remota dedicada não foi quebrada.
- Read/Guard: `packages/ui/test/remoteWorkspaceProviderSync.test.ts`
  - Rodar os testes existentes de sync remoto.
- Read/Guard: `packages/ui/test/zcodeSessionPromptControl.test.ts`
  - Rodar os testes existentes de ordem do preflight create/resume/send.
- Modify after E2E green: `docs/testing/conversation-session-e2e-coverage-matrix.md`
  - Somente após o E2E passar, mudar I14 de `failing` para `covered`.

---

## Fase 0: Evidência Vermelha de Baseline

**Arquivos:**
- Test: `packages/desktop/test/e2e/conversation-session/conversation-session-subagent-provider-registry-cold-start.test.ts`
- Fixture: `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-subagent-provider-registry-cold-start.json`

**Interfaces:**
- Consumes: E2E falhando commitado `SR / I14`.
- Produces: artifact de baseline comprovando que o bug atual ainda está vermelho antes da implementação.

- [ ] **Step 1: Validar o contrato do fixture**

Run:

```bash
pnpm --filter @zcode/desktop e2e:fixture:check -- --spec ./test/e2e/conversation-session/conversation-session-subagent-provider-registry-cold-start.test.ts
```

Expected:

```text
Fixture check passed.
```

O fixture de title pode avisar que o matcher dele não tem marcador de E2E. Esse aviso é aceitável porque a geração de title não é a asserção de produto deste case.

- [ ] **Step 2: Confirmar que o E2E atual está vermelho**

Run:

```bash
ZCODE_DESKTOP_AGENT_BUILD_MODE=pnpm \
E2E_PROVIDER_REPLAY_FIXTURE_PATH=packages/desktop/test/e2e/fixtures/upstream/common.json,packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-subagent-provider-registry-cold-start.json \
pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/conversation-session-subagent-provider-registry-cold-start.test.ts'
```

Expected before fix: FAIL with:

```text
没有捕获到 alternate provider 的 child subagent 请求
```

Os diagnósticos de falha devem listar candidatos de child marker usando `deepseek-v4-flash`, e não `deepseek-v4-pro`.

- [ ] **Step 3: Parar se o E2E passar inesperadamente**

Se o E2E já passar antes de qualquer mudança de código, inspecionar os commits recentes e atualizar este plano em vez de aplicar lógica de sync duplicada.

---

## Fase 1: Adicionar Testes de Sync do Provider Registry Local

**Arquivos:**
- Modify: `packages/services/test/zcodeAgentService.providerRegistry.test.ts`

**Interfaces:**
- Consumes: `createZCodeAgentService({ providerRegistrySource })`.
- Consumes: `zcodeProtocolMethods.workspaceUpdateProviderRegistry`.
- Produces: testes que exigem sync do registry completo antes do create de session local e depois de mudanças locais no provider registry.

- [ ] **Step 1: Adicionar o teste de preflight de session/create**

Adicionar este teste em `describe("createZCodeAgentService provider registry", ...)`:

```ts
it("syncs the full local provider registry before session/create", async () => {
  const calls: string[] = [];
  const request = vi.fn(async (method: string) => {
    calls.push(method);
    if (method === zcodeProtocolMethods.workspaceUpdateProviderRegistry) {
      return {
        workspace: {
          workspacePath: "/workspace/app",
          workspaceKey: "/workspace/app",
        },
        appliedProviderRevision: "sha256:provider-registry-full",
        status: "applied" as const,
        providerCount: 2,
      };
    }
    if (method === zcodeProtocolMethods.sessionCreate) {
      return createSessionSnapshot({
        model: { providerId: "e2e-primary", modelId: "deepseek-v4-flash" },
      });
    }
    throw new Error(`Unexpected method ${method}`);
  });
  vi.resetModules();
  vi.doMock("../src/zcode-agent/zcodeAgentProcessManager.js", () => ({
    ZCodeAgentProcessManager: class {
      async getClient() {
        return {
          request,
          transportKind: "stdio",
          onNotification: () => ({ dispose() {} }),
          onRequest: () => ({ dispose() {} }),
          onClose: () => ({ dispose() {} }),
        };
      }
      disposeAll() {}
    },
  }));
  const { createZCodeAgentService } = await import(
    "../src/zcode-agent/zcodeAgentService.js"
  );
  const service = createZCodeAgentService({
    providerRegistrySource: {
      async getProviderRegistrySnapshot() {
        return {
          generatedAt: 2,
          providers: [
            {
              providerId: "e2e-primary",
              kind: "anthropic",
              baseURL: "https://primary.example.com",
              models: [{ modelId: "deepseek-v4-flash" }],
            },
            {
              providerId: "e2e-alt",
              kind: "anthropic",
              baseURL: "https://alt.example.com",
              models: [{ modelId: "deepseek-v4-pro" }],
            },
          ],
          revision: "sha256:provider-registry-full",
        };
      },
    },
  });

  await service.createSession({
    workspacePath: "/workspace/app",
    model: { providerId: "e2e-primary", modelId: "deepseek-v4-flash" },
  });

  expect(calls).toEqual([
    zcodeProtocolMethods.workspaceUpdateProviderRegistry,
    zcodeProtocolMethods.sessionCreate,
  ]);
  expect(request).toHaveBeenNthCalledWith(
    1,
    zcodeProtocolMethods.workspaceUpdateProviderRegistry,
    expect.objectContaining({
      registry: expect.objectContaining({
        revision: "sha256:provider-registry-full",
        providers: expect.arrayContaining([
          expect.objectContaining({ providerId: "e2e-alt" }),
        ]),
      }),
      workspace: expect.objectContaining({
        workspacePath: "/workspace/app",
        workspaceKey: "/workspace/app",
      }),
      includeWorkspaceState: false,
    }),
    expect.any(Object),
  );
});
```

- [ ] **Step 2: Adicionar o teste de hot push de mudança do provider registry**

Adicionar uma pequena event source no arquivo de teste:

```ts
function createProviderRegistryChangeSource(initial: ZCodeProviderRegistrySnapshot) {
  let listener:
    | ((event: { reason: string; snapshot: ZCodeProviderRegistrySnapshot }) => void)
    | undefined;
  return {
    source: {
      async getProviderRegistrySnapshot() {
        return initial;
      },
      onDidChangeProviderRegistry(callback) {
        listener = callback;
        return { dispose() {} };
      },
    },
    emit(reason: string, snapshot: ZCodeProviderRegistrySnapshot) {
      listener?.({ reason, snapshot });
    },
  };
}
```

Depois adicionar este teste:

```ts
it("pushes changed local provider registry to active workspace clients", async () => {
  const request = vi.fn(async (method: string) => {
    if (method === zcodeProtocolMethods.workspaceUpdateProviderRegistry) {
      return {
        workspace: {
          workspacePath: "/workspace/app",
          workspaceKey: "/workspace/app",
        },
        appliedProviderRevision: "sha256:registry",
        status: "applied" as const,
        providerCount: 1,
      };
    }
    if (method === zcodeProtocolMethods.sessionCreate) {
      return createSessionSnapshot({
        model: { providerId: "e2e-primary", modelId: "deepseek-v4-flash" },
      });
    }
    if (method === zcodeProtocolMethods.sessionUpdateRuntimeModelConfig) {
      return {
        sessionId: "sess_1",
        modelRuntimeRevision: "model-runtime:updated",
        stateRevision: 2,
      };
    }
    throw new Error(`Unexpected method ${method}`);
  });
  vi.resetModules();
  vi.doMock("../src/zcode-agent/zcodeAgentProcessManager.js", () => ({
    ZCodeAgentProcessManager: class {
      async getClient() {
        return {
          request,
          transportKind: "stdio",
          onNotification: () => ({ dispose() {} }),
          onRequest: () => ({ dispose() {} }),
          onClose: () => ({ dispose() {} }),
        };
      }
      disposeAll() {}
    },
  }));
  const initial = {
    generatedAt: 1,
    providers: [
      {
        providerId: "e2e-primary",
        kind: "anthropic" as const,
        baseURL: "https://primary.example.com",
        models: [{ modelId: "deepseek-v4-flash" }],
      },
    ],
    revision: "sha256:registry-1",
  };
  const changed = {
    generatedAt: 2,
    providers: [
      ...initial.providers,
      {
        providerId: "e2e-alt",
        kind: "anthropic" as const,
        baseURL: "https://alt.example.com",
        models: [{ modelId: "deepseek-v4-pro" }],
      },
    ],
    revision: "sha256:registry-2",
  };
  const providerRegistrySource = createProviderRegistryChangeSource(initial);
  const { createZCodeAgentService } = await import(
    "../src/zcode-agent/zcodeAgentService.js"
  );
  const service = createZCodeAgentService({
    providerRegistrySource: providerRegistrySource.source,
  });

  await service.createSession({
    workspacePath: "/workspace/app",
    model: { providerId: "e2e-primary", modelId: "deepseek-v4-flash" },
  });
  providerRegistrySource.emit("provider_saved", changed);
  await vi.waitFor(() => {
    expect(request).toHaveBeenCalledWith(
      zcodeProtocolMethods.workspaceUpdateProviderRegistry,
      expect.objectContaining({
        registry: expect.objectContaining({
          revision: "sha256:registry-2",
          providers: expect.arrayContaining([
            expect.objectContaining({ providerId: "e2e-alt" }),
          ]),
        }),
      }),
      expect.any(Object),
    );
  });
});
```

Se o TypeScript reclamar do tipo da source inline, tipar o helper como:

```ts
import type { Event } from "@zcode/rpc";
```

e retornar o callback como um `Event<ModelProviderRegistryChangedEvent>` usando o shape de evento local já exportado por services. Não enfraquecer o tipo de produção.

- [ ] **Step 3: Verificar que os testes falham antes da implementação**

Run:

```bash
pnpm exec vitest run packages/services/test/zcodeAgentService.providerRegistry.test.ts
```

Expected before implementation: os novos testes falham porque `session/create` atualmente acontece antes de `workspace/updateProviderRegistry`, e a mudança de registry não faz hot push do workspace registry completo.

---

## Fase 2: Implementar Watermark de Apply do Agent e Synchronizer do Service Local

**Arquivos:**
- Modify: `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-types.ts`
- Modify: `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/workspace-model-catalog.ts`
- Modify: `packages/services/src/zcode-agent/zcodeAgentService.ts`

**Interfaces:**
- Consumes: `providerRegistrySource?: ZCodeProviderRegistrySource`.
- Consumes: `ZCodeProtocolClient.request(zcodeProtocolMethods.workspaceUpdateProviderRegistry, ...)`.
- Produces: guard de snapshot stale no lado do agent mais helpers privados que sincronizam o provider registry completo para clients CLI locais ativos sem tocar no código do helper remoto.

- [ ] **Step 1: Adicionar a marca d'água de generatedAt do registry no lado do agent**

Em `ZCodeProtocolWorkspaceModelCatalogRecord`, adicionar:

```ts
  providerRegistryGeneratedAt?: number;
```

Em `workspace/updateProviderRegistry`:

- Registrar em log `incomingGeneratedAt` e o `providerRegistryGeneratedAt` aplicado anteriormente.
- Antes de mutar `catalog.providers`, se `catalog.providerRevision` e `catalog.providerRegistryGeneratedAt` estiverem ambos presentes e `params.registry.generatedAt < catalog.providerRegistryGeneratedAt`, devolver o catalog atual como `status: "unchanged"` sem limpar nem reescrever providers/secrets.
- Se a revisão não mudou, atualizar `providerRegistryGeneratedAt` para `Math.max(current, params.registry.generatedAt)`.
- Após um apply de registry bem-sucedido, definir `catalog.providerRevision = params.registry.revision` e `catalog.providerRegistryGeneratedAt = params.registry.generatedAt`.
- Quando o `workspace/upsertModelProvider` ou `workspace/removeModelProvider` legado mutar o catalog fora de snapshots de registry, limpar tanto `providerRevision` quanto `providerRegistryGeneratedAt`.

Adicionar um comentário de bugfix em chinês no guard de stale explicando:

```ts
// Bugfix: workspace/updateProviderRegistry 可能从 session preflight、热同步、远端同步等入口并发到达。
// revision 是 sha256 指纹不能排序，所以在真正 apply 边界用 generatedAt 做 best-effort 水位线，
// 避免较旧快照晚到时把 CLI 内部 catalog 覆盖回旧 provider 集合。
```

- [ ] **Step 2: Adicionar o estado de sync do workspace**

Perto dos maps existentes em `createZCodeAgentService`, adicionar:

```ts
  const providerRegistrySyncByWorkspaceKey = new Map<
    string,
    {
      client: ZCodeProtocolClient;
      generatedAt?: number;
      inFlight?: Promise<void>;
      pending?: {
        includeWorkspaceState: boolean;
        reason: string;
        registry: ZCodeProviderRegistrySnapshot;
      };
      revision?: string;
    }
  >();
```

Este estado é separado de `providerRegistryByWorkspaceKey`. Este último continua sendo usado pelo fallback de remote anexado ao desktop; o novo map registra se um client de protocolo concreto já recebeu uma revisão de registry local e serializa a entrega local. Não usar este map do lado do service como fronteira de corretude para snapshot stale; essa fronteira vive no código de apply do agent.

- [ ] **Step 3: Limpar o estado de sync quando um client fecha**

Dentro de `wireClient(... onClose ...)`, onde o código já apaga `providerRegistryByWorkspaceKey`, apagar também o novo estado de sync:

```ts
            providerRegistrySyncByWorkspaceKey.delete(workspaceKey);
```

Adicionar um comentário em chinês imediatamente acima ou perto do novo delete:

```ts
            // Bugfix: provider registry 是 CLI 进程内存态；client 重建后即使 app revision 没变也必须重推。
```

- [ ] **Step 4: Adicionar o helper privado de sync**

Adicionar `syncProviderRegistrySnapshotToClient(...)` antes de `resolveRuntimeModelConfig`.

Comportamento obrigatório:

- Resolver `workspaceKey` com `resolveWorkspaceKey(params.workspace)`.
- Manter um estado de sync por workspace/client concreto.
- Snapshots recebidos mais antigos que o `generatedAt` pendente/aplicado atual são ignorados depois de aguardar qualquer worker in-flight corrente.
- Snapshots recebidos que não são mais antigos que o `generatedAt` pendente/aplicado atual viram `pending`; se já houver um worker rodando, os chamadores aguardam esse worker.
- O drain worker envia um `workspace/updateProviderRegistry` por vez, com a flag `includeWorkspaceState` mesclada.
- Quando o worker vê um snapshot pendente mais antigo que o `generatedAt` aplicado, ele registra em log e o pula em vez de enviar registry stale para a CLI.
- Só fazer cache de `params.registry` em `providerRegistryByWorkspaceKey` e em `providerRegistrySyncByWorkspaceKey.revision` quando `result.appliedProviderRevision === params.registry.revision`. Se o agent ignorou esta requisição por estar stale e devolveu uma revisão aplicada diferente, não cachear a entrada stale.

Este helper é uma otimização de entrega/cache e um preflight de session. Ele não é o guard final de corretude de snapshot stale.

- [ ] **Step 5: Adicionar o helper de garantia só-local**

Adicionar:

```ts
  async function ensureLocalProviderRegistrySynced(params: {
    client: ZCodeProtocolClient;
    includeWorkspaceState?: boolean;
    reason: string;
    workspace: ZCodeAgentWorkspaceTarget;
  }): Promise<void> {
    if (!providerRegistrySource) {
      return;
    }
    const registry = await providerRegistrySource.getProviderRegistrySnapshot();
    // Bugfix: 本地 desktop 的 CLI 不读取 app provider store；session create/resume/read 前
    // 必须先注入完整 registry，否则 subagent profile 引用未选中过的 provider 会 provider_not_found。
    await syncProviderRegistrySnapshotToClient({
      client: params.client,
      includeWorkspaceState: params.includeWorkspaceState,
      registry,
      reason: params.reason,
      workspace: params.workspace,
    });
  }
```

Este helper precisa retornar imediatamente quando `providerRegistrySource` estiver ausente ou quando o alvo for um remote workspace anexado ao desktop. Isso mantém o comportamento do remote anexado ao desktop no caminho de sync remoto existente.

- [ ] **Step 6: Proteger o cache da updateProviderRegistry pública**

Em `async updateProviderRegistry(params)`, manter a requisição de protocolo direta para que o método ainda devolva o resultado do protocolo ao chamador. Depois da resposta, só atualizar o cache local de registry enviado quando o agent realmente tiver aplicado a revisão desta entrada.

Implementação de baixo risco:

```ts
      const result = await client.request(
        zcodeProtocolMethods.workspaceUpdateProviderRegistry,
        {
          workspace: buildWorkspaceRef(params),
          registry: params.registry,
          ...(typeof params.includeWorkspaceState === "boolean"
            ? { includeWorkspaceState: params.includeWorkspaceState }
            : {}),
        },
        zcodeWorkspaceUpdateProviderRegistryResultSchema,
      );
      if (result.appliedProviderRevision === params.registry.revision) {
        providerRegistryByWorkspaceKey.set(resolveWorkspaceKey(params), params.registry);
        providerRegistrySyncByWorkspaceKey.set(resolveWorkspaceKey(params), {
          client,
          revision: params.registry.revision,
        });
      }
```

Não mudar o contrato externo deste método.

---

## Fase 3: Conectar o Sync Local ao Read/Create/Resume de Session

**Arquivos:**
- Modify: `packages/services/src/zcode-agent/zcodeAgentService.ts`

**Interfaces:**
- Consumes: `ensureLocalProviderRegistrySynced(...)`.
- Produces: a CLI local tem o provider registry completo antes da criação de session, do resume de session, da leitura de session e das leituras de workspace state.

- [ ] **Step 1: Sincronizar antes de session/create**

Em `createSession`, depois de:

```ts
      const client = await getClient(params);
```

adicionar:

```ts
      await ensureLocalProviderRegistrySynced({
        client,
        reason: "session_create",
        workspace: params,
      });
```

Manter isso antes de `resolveRuntimeModelConfig(...)`, para que tanto `session/create` quanto o fallback do runtime model vejam um workspace CLI cujo catalog já foi atualizado.

- [ ] **Step 2: Sincronizar antes de session/resume**

Em `resumeSession`, depois de `const client = await getClient(params);`, adicionar:

```ts
      await ensureLocalProviderRegistrySynced({
        client,
        reason: "session_resume",
        workspace: params,
      });
```

Manter `allowDefaultModelForSession: false` inalterado. O sync do registry não pode fazer sessões antigas caírem silenciosamente em um modelo atual diferente do workspace.

- [ ] **Step 3: Sincronizar antes de readSession e readWorkspaceState**

Em `readSession`, depois de `const client = await getClient(params);`, adicionar:

```ts
      await ensureLocalProviderRegistrySynced({
        client,
        reason: "session_read",
        workspace: params,
      });
```

Em `readWorkspaceState`, depois de `const client = await getClient(params);`, adicionar:

```ts
      await ensureLocalProviderRegistrySynced({
        client,
        includeWorkspaceState: false,
        reason: "workspace_read_state",
        workspace: params,
      });
```

Não adicionar isso a `respondProviderRuntimeHeaders`. Não adicionar um sync blanket a todo `sendPrompt`.

- [ ] **Step 4: Rodar os testes do service**

Run:

```bash
pnpm exec vitest run packages/services/test/zcodeAgentService.providerRegistry.test.ts
```

Expected: PASS.

---

## Fase 4: Hot Push de Mudanças do Provider Registry Local

**Arquivos:**
- Modify: `packages/services/src/zcode-agent/zcodeAgentService.ts`
- Test: `packages/services/test/zcodeAgentService.providerRegistry.test.ts`

**Interfaces:**
- Consumes: `providerRegistrySource.onDidChangeProviderRegistry`.
- Produces: clients de workspace local ativos recebem atualizações completas do registry quando a configuração de provider muda.

- [ ] **Step 1: Extrair o trabalho existente do evento de runtimeModel para uma função async**

Substituir o corpo inline atual do evento por uma chamada:

```ts
  let providerRegistrySubscription = providerRegistrySource?.onDidChangeProviderRegistry?.(
    (event) => {
      void handleProviderRegistryChanged(event).catch((error) => {
        console.warn(
          formatLogPrefix("zcode-agent", process.pid),
          "provider registry 热同步失败",
          { message: error instanceof Error ? error.message : String(error) },
        );
      });
    },
  );
```

- [ ] **Step 2: Implementar `handleProviderRegistryChanged`**

Adicionar esta função perto da assinatura:

```ts
  async function handleProviderRegistryChanged(event: ModelProviderRegistryChangedEvent) {
    if (providerRegistrySource) {
      await Promise.all(
        Array.from(activeClientsByWorkspaceKey.entries()).map(
          async ([workspaceKey, active]) => {
            await syncProviderRegistrySnapshotToClient({
              client: active.client,
              registry: event.snapshot,
              reason: event.reason,
              workspace: active.workspace,
            });
            logger.info(undefined, "provider registry 变更已推送到本地 active workspace", {
              providerCount: event.snapshot.providers.length,
              reason: event.reason,
              revision: event.snapshot.revision,
              workspaceKey,
              workspacePath: active.workspace.workspacePath,
            });
          },
        ),
      );
    }

    for (const [key, previousRuntimeModel] of runtimeModelConfigBySessionKey) {
      const target = runtimeModelSessionTargetByKey.get(key);
      if (!target) {
        continue;
      }
      const active = activeClientsByWorkspaceKey.get(resolveWorkspaceKey(target));
      if (!active) {
        continue;
      }
      const runtimeModel = createRuntimeModelConfig({
        model: previousRuntimeModel.model,
        providerRegistry: event.snapshot,
        thoughtLevel: previousRuntimeModel.thoughtLevel,
      });
      if (!runtimeModel || runtimeModel.revision === previousRuntimeModel.revision) {
        continue;
      }
      await updateRuntimeModelConfigOnClient({ ...target, runtimeModel }, active.client);
    }
  }
```

Se `ModelProviderRegistryChangedEvent` não estiver importado neste arquivo, importá-lo da fonte de tipos de model-provider já existente em vez de usar `any`.

- [ ] **Step 3: Manter o isolamento de falhas**

Se um workspace falhar na atualização, isso não deve impedir que os outros workspaces ativos recebam o registry novo. Se o `Promise.all` direto do Step 2 for frágil demais para as convenções existentes, usar:

```ts
      await Promise.allSettled(
        Array.from(activeClientsByWorkspaceKey.entries()).map(async ([workspaceKey, active]) => {
          try {
            await syncProviderRegistrySnapshotToClient({
              client: active.client,
              registry: event.snapshot,
              reason: event.reason,
              workspace: active.workspace,
            });
          } catch (error) {
            logger.warn(undefined, "provider registry 变更推送到 active workspace 失败", {
              message: error instanceof Error ? error.message : String(error),
              reason: event.reason,
              revision: event.snapshot.revision,
              workspaceKey,
              workspacePath: active.workspace.workspacePath,
            });
            throw error;
          }
        }),
      );
```

Escolher um estilo e manter os testes alinhados. Preferir `Promise.allSettled` se a expectativa de produto for "uma falha de sync em um workspace não afeta os outros workspaces".

- [ ] **Step 4: Rodar os testes focados novamente**

Run:

```bash
pnpm exec vitest run packages/services/test/zcodeAgentService.providerRegistry.test.ts
```

Expected: PASS.

---

## Fase 5: Guard do Remote Workspace

**Arquivos:**
- Read/Guard: `packages/ui/src/lib/remoteWorkspaceProviderSync.ts`
- Read/Guard: `packages/ui/test/remoteWorkspaceProviderSync.test.ts`
- Read/Guard: `packages/ui/test/zcodeSessionPromptControl.test.ts`
- Read/Guard: `packages/ui/src/lib/zcodeSessionPromptControl.ts`

**Interfaces:**
- Consumes: preflight existente de provider registry remoto.
- Produces: evidência de que usuários de subagent remoto continuam cobertos e que a semântica do helper remoto não foi alterada.

- [ ] **Step 1: Não modificar a implementação de sync remoto**

Manter inalterados estes exports e seu comportamento:

```ts
syncAppGlobalStateToRemoteWorkspace(...)
syncWorkspaceModelProvidersToAgent(...)
syncWorkspaceModelProvidersToRemote(...)
```

O remote workspace continua responsável por receber o app provider registry completo do desktop host antes de prepare/create/resume/send. Isso continua necessário porque o host remoto não tem o `providerRegistrySource` local.

- [ ] **Step 2: Rodar os testes de sync remoto**

Run:

```bash
pnpm exec vitest run packages/ui/test/remoteWorkspaceProviderSync.test.ts
```

Expected: PASS.

- [ ] **Step 3: Rodar os testes de ordem do preflight de prompt-control**

Run:

```bash
pnpm exec vitest run packages/ui/test/zcodeSessionPromptControl.test.ts
```

Expected: PASS, incluindo os testes que verificam que create/resume/send remoto/replayable chamam `syncAppGlobalStateBeforeRemoteSession` antes dos comandos do agent.

- [ ] **Step 4: Inspecionar os arquivos alterados**

Run:

```bash
git diff -- packages/ui/src/lib/remoteWorkspaceProviderSync.ts packages/ui/src/lib/zcodeSessionPromptControl.ts
```

Expected:

```text
no diff for packages/ui/src/lib/remoteWorkspaceProviderSync.ts
```

Se o helper remoto tiver mudado, parar e explicar por que a mudança é necessária antes de continuar.

---

## Fase 6: Aceitação E2E

**Arquivos:**
- Test: `packages/desktop/test/e2e/conversation-session/conversation-session-subagent-provider-registry-cold-start.test.ts`
- Fixture: `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-subagent-provider-registry-cold-start.json`
- Modify after green: `docs/testing/conversation-session-e2e-coverage-matrix.md`

**Interfaces:**
- Consumes: preflight de provider registry do service local.
- Produces: requisição de child subagent visível ao provider usando o modelo do alternate provider.

- [ ] **Step 1: Rodar novamente o check de fixture**

Run:

```bash
pnpm --filter @zcode/desktop e2e:fixture:check -- --spec ./test/e2e/conversation-session/conversation-session-subagent-provider-registry-cold-start.test.ts
```

Expected: PASS com o aviso conhecido do fixture de title.

- [ ] **Step 2: Rodar o replay case-local**

Run:

```bash
ZCODE_DESKTOP_AGENT_BUILD_MODE=pnpm \
E2E_PROVIDER_REPLAY_FIXTURE_PATH=packages/desktop/test/e2e/fixtures/upstream/common.json,packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-subagent-provider-registry-cold-start.json \
pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/conversation-session-subagent-provider-registry-cold-start.test.ts'
```

Expected after fix: PASS.

Evidência de aceitação:

```text
child subagent request model = deepseek-v4-pro
parent continuation request model = deepseek-v4-flash
Agent tool block status = completed
session state = idle
queueCount = 0
```

- [ ] **Step 3: Se o E2E ainda falhar, inspecionar a evidência de runtime**

Run:

```bash
rg "workspace/updateProviderRegistry|provider_not_found|e2e-deepseek-alt|deepseek-v4-pro" \
  packages/desktop/.e2e-home/.zcode/cli/log \
  packages/desktop/.e2e-artifacts
```

Expected after fix:

```text
workspace/updateProviderRegistry appears before child subagent request
no provider_not_found for e2e-deepseek-alt
```

- [ ] **Step 4: Atualizar a matriz somente depois que o E2E estiver verde**

Em `docs/testing/conversation-session-e2e-coverage-matrix.md`, mudar I14 de:

```markdown
| I14 | failing  | SR     | 正式 E2E 复现当前缺陷：冷启时 CLI 只有 primary runtime/config，subagent profile 绑定 alternate provider；当前实现未捕获到 alternate child 请求，修复后应最终 idle |
```

para:

```markdown
| I14 | covered  | SR     | 冷启时 CLI 只有 primary runtime/config，subagent profile 绑定 alternate provider；child subagent 请求使用 alternate provider 并最终 idle |
```

Não marcar `covered` antes de o replay passar.

---

## Fase 7: Gates do Repositório e Commit

**Arquivos:**
- Apenas os arquivos já alterados.

**Interfaces:**
- Consumes: testes unitários e E2E passando.
- Produces: um Conventional Commit contendo somente este bugfix e a atualização de status de doc.

- [ ] **Step 1: Rodar os gates obrigatórios**

Run:

```bash
pnpm --filter @zcode/desktop typecheck:e2e
pnpm typecheck
pnpm lint
git diff --check
```

Expected:

```text
typecheck:e2e exits 0
typecheck exits 0
lint exits 0
git diff --check exits 0
```

Se o lint sair com 0 mas com warnings, registrar a contagem de warnings e verificar se nenhum warning foi introduzido por esta correção.

- [ ] **Step 2: Checar a superfície staged**

Run:

```bash
git status --short
git diff --stat
```

Arquivos alterados esperados:

```text
packages/services/src/zcode-agent/zcodeAgentService.ts
packages/services/test/zcodeAgentService.providerRegistry.test.ts
docs/testing/conversation-session-e2e-coverage-matrix.md
```

`packages/ui/src/lib/remoteWorkspaceProviderSync.ts` não deve aparecer, a não ser que uma correção remota separada e aprovada tenha sido adicionada.

- [ ] **Step 3: Commitar**

Run:

```bash
git add \
  packages/services/src/zcode-agent/zcodeAgentService.ts \
  packages/services/test/zcodeAgentService.providerRegistry.test.ts \
  docs/testing/conversation-session-e2e-coverage-matrix.md
git commit -m "fix(desktop): sync provider registry before local agent sessions"
```

Omitir `docs/testing/conversation-session-e2e-coverage-matrix.md` do `git add` se o E2E ainda estiver vermelho e I14 continuar `failing`.

---

## Checklist Final

- [ ] O create/resume/read/readWorkspaceState de session do desktop local sincroniza o provider registry completo antes das operações de session da CLI.
- [ ] Mudanças na configuração de provider fazem hot push do registry completo para os clients de workspace local ativos.
- [ ] A implementação de sync do provider registry do remote workspace permanece inalterada.
- [ ] Os testes de preflight remoto continuam passando.
- [ ] O caminho de headers de runtime não dispara hot-sync do registry do workspace.
- [ ] O schema da tool `Agent` e o formato de requisição visível ao provider estão inalterados.
- [ ] O E2E formal captura o modelo de child subagent request `deepseek-v4-pro`.
- [ ] I14 só é marcado `covered` depois que o E2E passa.
- [ ] Os gates obrigatórios de typecheck/lint/diff passam.

## Plano de Rollback

Se o sync local de provider registry introduzir latência de startup ou chamadas de protocolo repetidas:

1. Reverter somente `packages/services/src/zcode-agent/zcodeAgentService.ts`.
2. Manter o E2E falhando e os testes como evidência.
3. Rodar novamente `packages/services/test/zcodeAgentService.providerRegistry.test.ts` para confirmar que a expectativa vermelha de sync local voltou.
4. Repensar uma chamada de protocolo pública e mais estreita `workspace/prepareProviderRegistry`, mas manter o helper remoto intocado, a não ser que evidência remota exija uma correção separada.