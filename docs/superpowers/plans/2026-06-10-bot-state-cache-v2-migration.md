# Bot State/Cache V2 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** Mover o estado de runtime do Bot e o cache de modelos para `bot-state.v2.json` e `bots-model-cache.v2.json`, migrando os arquivos antigos em modo somente-leitura e usando os dados de provider do `config.json` como autoridade do cache de modelos.

**Arquitetura:** Manter o fallback de nome-de-arquivo/versão na camada de repo, manter o casamento de provider/modelo em helpers de migração puros, e deixar `createBotsService` executar uma única migração preguiçosa de storage antes que as leituras de estado/cache sejam consideradas confiáveis. Os arquivos antigos nunca são escritos pelo novo caminho de código.

**Stack técnico:** TypeScript, schemas Zod, Vitest, tipos existentes de bot/model-provider do `@zcode/shared`, logger de serviço via `createServiceLogger`.

---

### Task 1: Adicionar nomes de arquivo V2 e metadados de repo

**Arquivos:**
- Modificar: `packages/services/src/bots/config.ts`
- Modificar: `packages/services/src/bots/repo.ts`
- Modificar: `packages/services/src/bots/modelCacheRepo.ts`
- Teste: `packages/services/test/botsRepo.test.ts`
- Teste: `packages/services/test/botsModelCacheRepo.test.ts`

- [ ] **Passo 1: Escrever testes de repo que falham**

Adicione `packages/services/test/botsRepo.test.ts`:

```ts
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BotsRepo } from "../src/bots/repo.js";
import { setDataBaseDir } from "../src/paths.js";

describe("BotsRepo", () => {
  let tempDir: string | null = null;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "zcode-bots-repo-"));
    setDataBaseDir(tempDir);
  });

  afterEach(() => {
    setDataBaseDir(null);
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("reads legacy bot-state.json but writes bot-state.v2.json", async () => {
    const dataDir = join(tempDir!, ".zcode", "v2");
    writeFileSync(
      join(dataDir, "bot-state.json"),
      `${JSON.stringify({
        version: 2,
        bots: {
          "feishu-1": {
            botId: "feishu-1",
            workspacePath: "/tmp/workspace",
            mode: "draft",
            activeTaskId: null,
            draftOptions: {
              provider: "glm",
              model: "custom:old-provider:deepseek-v4-flash",
            },
            updatedAt: 1,
          },
        },
      })}\n`,
    );

    const repo = new BotsRepo();
    await expect(repo.readState()).resolves.toMatchObject({
      bots: {
        "feishu-1": {
          draftOptions: {
            model: "custom:old-provider:deepseek-v4-flash",
          },
        },
      },
    });

    await repo.writeState({ version: 2, bots: {} });

    expect(existsSync(join(dataDir, "bot-state.json"))).toBe(true);
    expect(existsSync(join(dataDir, "bot-state.v2.json"))).toBe(true);
    expect(JSON.parse(readFileSync(join(dataDir, "bot-state.json"), "utf-8"))).toMatchObject({
      bots: {
        "feishu-1": {
          draftOptions: {
            model: "custom:old-provider:deepseek-v4-flash",
          },
        },
      },
    });
  });
});
```

Estenda `packages/services/test/botsModelCacheRepo.test.ts` com um teste que falha:

```ts
  it("reads legacy bots-model-cache.json but writes bots-model-cache.v2.json", async () => {
    const dataDir = join(tempDir!, ".zcode", "v2");
    writeFileSync(
      join(dataDir, "bots-model-cache.json"),
      `${JSON.stringify({
        version: 1,
        modelProviders: {
          updatedAt: 1,
          providers: [],
        },
        workspaceConfigOptions: {},
      })}\n`,
    );

    const repo = new BotsModelCacheRepo();
    await expect(repo.read()).resolves.toMatchObject({
      version: 2,
      source: {
        cacheUpdatedAt: 1,
      },
    });

    await repo.write({
      version: 2,
      updatedAt: 2,
      providers: [],
      workspaceConfigOptions: {},
    });

    expect(existsSync(join(dataDir, "bots-model-cache.json"))).toBe(true);
    expect(existsSync(join(dataDir, "bots-model-cache.v2.json"))).toBe(true);
  });
```

- [ ] **Passo 2: Executar os testes para confirmar a falha**

Execute:

```bash
pnpm vitest run packages/services/test/botsRepo.test.ts packages/services/test/botsModelCacheRepo.test.ts
```

Esperado: os testes falham porque os repos ainda gravam os nomes de arquivo antigos e a versão do cache de modelos ainda é `1`.

- [ ] **Passo 3: Implementar as constantes de arquivo v2 e a leitura/gravação do repo**

Atualize `packages/services/src/bots/config.ts`:

```ts
export const BOTS_CONFIG_FILE = "bot-config.json";
export const BOTS_LEGACY_STATE_FILE = "bot-state.json";
export const BOTS_STATE_FILE = "bot-state.v2.json";
export const BOTS_LEGACY_MODEL_CACHE_FILE = "bots-model-cache.json";
export const BOTS_MODEL_CACHE_FILE = "bots-model-cache.v2.json";
```

Atualize `packages/services/src/bots/repo.ts` para que `statePath()` aponte para `BOTS_STATE_FILE`, adicione `legacyStatePath()` e faça `readState()` analisar o v2 primeiro e depois o legado:

```ts
  private statePath(): string {
    return join(getAppConfigDir(), BOTS_STATE_FILE);
  }

  private legacyStatePath(): string {
    return join(getAppConfigDir(), BOTS_LEGACY_STATE_FILE);
  }

  async readState(): Promise<BotsStateFile> {
    const fallback: BotsStateFile = { version: 2, bots: {} };
    const raw = await readJsonFile<unknown>(this.statePath(), null);
    const parsed = botsStateFileSchema.safeParse(raw);
    if (parsed.success) {
      return parsed.data;
    }
    const legacyRaw = await readJsonFile<unknown>(this.legacyStatePath(), null);
    const legacyParsed = botsStateFileSchema.safeParse(legacyRaw);
    return legacyParsed.success ? legacyParsed.data : fallback;
  }
```

Atualize `packages/services/src/bots/modelCacheRepo.ts` com um schema v2:

```ts
const BOTS_MODEL_CACHE_VERSION = 2;

const botsModelCacheFileSchema = z
  .object({
    version: z.literal(BOTS_MODEL_CACHE_VERSION),
    updatedAt: z.number(),
    migratedAt: z.number().optional(),
    source: z
      .object({
        cacheUpdatedAt: z.number().optional(),
      })
      .strict()
      .optional(),
    providers: modelProviderListSchema,
    workspaceConfigOptions: z
      .record(z.string(), botsModelCacheWorkspaceConfigOptionsSchema)
      .default({}),
    modelIdRemaps: z.record(z.string(), z.string()).optional(),
  })
  .strict();
```

Adicione um schema legado que corresponda ao formato atual `version: 1`, normalize-o para v2 em `read()` e mantenha `write()` apontando apenas para `BOTS_MODEL_CACHE_FILE`.

- [ ] **Passo 4: Executar os testes do repo**

Execute:

```bash
pnpm vitest run packages/services/test/botsRepo.test.ts packages/services/test/botsModelCacheRepo.test.ts
```

Esperado: PASS.

### Task 2: Adicionar helpers puros de migração de Provider/Model

**Arquivos:**
- Criar: `packages/services/src/bots/storageMigration.ts`
- Teste: `packages/services/test/botsStorageMigration.test.ts`

- [ ] **Passo 1: Escrever testes de migração que falham**

Crie `packages/services/test/botsStorageMigration.test.ts` com casos para correspondência direta, remapeamento por nome de provider, correspondência ambígua e remoção de segredos:

```ts
import { describe, expect, it } from "vitest";
import { createModelProviderModelConfig, encodeCustomModelValue, type BotsStateFile, type ModelProviderConfig } from "@zcode/shared";
import { createDefaultBotsModelCache } from "../src/bots/modelCacheRepo.js";
import { migrateBotsModelCacheToV2, migrateBotsStateToV2 } from "../src/bots/storageMigration.js";

function provider(params: { id: string; name: string; models: string[]; apiKey?: string }): ModelProviderConfig {
  return {
    id: params.id,
    name: params.name,
    enabled: true,
    apiKey: params.apiKey ?? "",
    endpoints: {
      anthropic: "https://example.com/anthropic",
      openai: "",
      gemini: "",
    },
    models: params.models.map((id) => createModelProviderModelConfig({ id, kinds: ["anthropic"] })),
    createdAt: 1,
    updatedAt: 1,
  };
}

function stateWithModel(model: string): BotsStateFile {
  return {
    version: 2,
    bots: {
      "feishu-1": {
        botId: "feishu-1",
        workspacePath: "/tmp/workspace",
        mode: "draft",
        activeTaskId: null,
        draftOptions: {
          provider: "glm",
          model,
          mode: "yolo",
          thoughtLevel: "max",
        },
        updatedAt: 1,
      },
    },
  };
}

describe("bot storage migration", () => {
  it("keeps draft model when provider id and model still exist", () => {
    const providers = [provider({ id: "new-provider", name: "DeepSeek", models: ["deepseek-v4-flash"] })];

    expect(
      migrateBotsStateToV2({
        state: stateWithModel(encodeCustomModelValue("new-provider", "deepseek-v4-flash")),
        legacyCache: createDefaultBotsModelCache(),
        providers,
        nowMs: 2,
      }).bots["feishu-1"]?.draftOptions?.model,
    ).toBe(encodeCustomModelValue("new-provider", "deepseek-v4-flash"));
  });

  it("remaps draft model by legacy provider name and model id when unique", () => {
    const legacyCache = {
      ...createDefaultBotsModelCache(),
      providers: [provider({ id: "old-provider", name: "DeepSeek", models: ["deepseek-v4-flash"] })],
    };
    const providers = [provider({ id: "new-provider", name: "DeepSeek", models: ["deepseek-v4-flash"] })];

    expect(
      migrateBotsStateToV2({
        state: stateWithModel(encodeCustomModelValue("old-provider", "deepseek-v4-flash")),
        legacyCache,
        providers,
        nowMs: 2,
      }).bots["feishu-1"]?.draftOptions?.model,
    ).toBe(encodeCustomModelValue("new-provider", "deepseek-v4-flash"));
  });

  it("clears draft model when matching is ambiguous", () => {
    const providers = [
      provider({ id: "provider-a", name: "DeepSeek A", models: ["deepseek-v4-flash"] }),
      provider({ id: "provider-b", name: "DeepSeek B", models: ["deepseek-v4-flash"] }),
    ];

    expect(
      migrateBotsStateToV2({
        state: stateWithModel(encodeCustomModelValue("missing-provider", "deepseek-v4-flash")),
        legacyCache: createDefaultBotsModelCache(),
        providers,
        nowMs: 2,
      }).bots["feishu-1"]?.draftOptions?.model,
    ).toBeUndefined();
  });

  it("writes v2 model cache from authoritative providers without real api keys", () => {
    const result = migrateBotsModelCacheToV2({
      legacyCache: createDefaultBotsModelCache(),
      providers: [provider({ id: "new-provider", name: "DeepSeek", models: ["deepseek-v4-flash"], apiKey: "secret" })],
      nowMs: 2,
    });

    expect(result).toMatchObject({
      version: 2,
      updatedAt: 2,
      providers: [
        {
          id: "new-provider",
          apiKey: "__zcode_cached_api_key_present__",
        },
      ],
    });
  });
});
```

- [ ] **Passo 2: Executar os testes para confirmar a falha**

Execute:

```bash
pnpm vitest run packages/services/test/botsStorageMigration.test.ts
```

Esperado: FAIL porque `storageMigration.ts` não existe.

- [ ] **Passo 3: Implementar os helpers de migração**

Crie `packages/services/src/bots/storageMigration.ts` com:

```ts
import {
  decodeCustomModelValue,
  encodeCustomModelValue,
  normalizeAgentProviderToZCodeAgent,
  type BotsStateFile,
  type BotDraftOptions,
  type ModelProviderConfig,
} from "@zcode/shared";
import {
  type BotsModelCacheFile,
} from "./modelCacheRepo.js";

const BOT_MODEL_CACHE_API_KEY_PLACEHOLDER = "__zcode_cached_api_key_present__";

export function migrateBotsModelCacheToV2(params: {
  legacyCache: BotsModelCacheFile;
  providers: readonly ModelProviderConfig[];
  nowMs: number;
}): BotsModelCacheFile {
  return {
    version: 2,
    updatedAt: params.nowMs,
    migratedAt: params.nowMs,
    source: {
      cacheUpdatedAt: params.legacyCache.updatedAt,
    },
    providers: params.providers.map(sanitizeModelProviderForCache),
    workspaceConfigOptions: params.legacyCache.workspaceConfigOptions,
    modelIdRemaps: buildModelIdRemaps(params.legacyCache, params.providers),
  };
}
```

Implemente `migrateBotsStateToV2()` preservando todos os campos de estado do bot, normalizando `draftOptions.provider` e usando um helper `migrateDraftModel()` com esta ordem:

```ts
function migrateDraftModel(params: {
  value: string | undefined;
  legacyCache: BotsModelCacheFile;
  providers: readonly ModelProviderConfig[];
}): string | undefined {
  if (!params.value) {
    return undefined;
  }
  const custom = decodeCustomModelValue(params.value);
  if (!custom?.providerId || !custom.modelName) {
    return findUniqueProviderByModel(params.providers, params.value)
      ? params.value
      : undefined;
  }
  const directProvider = params.providers.find((provider) => provider.id === custom.providerId);
  if (directProvider && providerHasModel(directProvider, custom.modelName)) {
    return encodeCustomModelValue(custom.providerId, custom.modelName);
  }
  const legacyProviderName = params.legacyCache.providers.find((provider) => provider.id === custom.providerId)?.name;
  const remappedProvider = legacyProviderName
    ? findUniqueProviderByNameAndModel(params.providers, legacyProviderName, custom.modelName)
    : findUniqueProviderByModel(params.providers, custom.modelName);
  return remappedProvider ? encodeCustomModelValue(remappedProvider.id, custom.modelName) : undefined;
}
```

Inclua um comentário perto do ramo de correspondência ambígua:

```ts
// Bugfix: o providerId no bot-state antigo pode vir de um snapshot de provider anterior à migração.
// Quando vários providers novos casam ao mesmo tempo não é possível adivinhar, senão as requisições
// subsequentes do Bot seriam enviadas ao fornecedor errado.
```

- [ ] **Passo 4: Executar os testes de migração**

Execute:

```bash
pnpm vitest run packages/services/test/botsStorageMigration.test.ts
```

Esperado: PASS.

### Task 3: Ligar a Migração à Hidratação do Serviço de Bot

**Arquivos:**
- Modificar: `packages/services/src/bots/botsService.ts`
- Modificar: `packages/services/test/botsService.fixtures.ts`
- Teste: `packages/services/test/botsService.config.test.ts`

- [ ] **Passo 1: Escrever um teste de nível de serviço que falha**

Adicione um teste a `packages/services/test/botsService.config.test.ts` que cria um repo em memória com estado legado, um cache em memória com snapshot legado de provider e um serviço de model provider com o novo id de provider. O teste deve chamar `/model` e afirmar que a lista de providers contém o novo provider e que o modelo do estado salvo foi remapeado.

```ts
it("migrates bot draft model to current config provider before /model", async () => {
  const repo = createMemoryRepo(baseConfig, {
    version: 2,
    bots: {
      "webhook-1": {
        botId: "webhook-1",
        workspacePath: "/tmp/workspace",
        workspaceIdentity: "ssh://host/tmp/workspace",
        mode: "draft",
        activeTaskId: null,
        draftOptions: {
          provider: "glm",
          model: encodeCustomModelValue("old-provider", "deepseek-v4-flash"),
        },
        updatedAt: 1,
      },
    },
  });
  const legacyProvider = createTestProvider({ id: "old-provider", name: "DeepSeek", models: ["deepseek-v4-flash"] });
  const currentProvider = createTestProvider({ id: "new-provider", name: "DeepSeek", models: ["deepseek-v4-flash"] });
  const modelCacheRepo = createMemoryModelCacheRepo({
    version: 2,
    updatedAt: 1,
    providers: [legacyProvider],
    workspaceConfigOptions: {},
  });
  const service = createBotsService({
    repo,
    modelCacheRepo,
    modelProviderService: createModelProviderService([currentProvider]),
    credentialService: createCredentialService(),
  });

  const replies = await service.handleInboundMessage({
    provider: "webhook",
    botId: "webhook-1",
    actor: {
      provider: "webhook",
      botId: "webhook-1",
      providerUserId: "user-1",
      chatType: "private",
    },
    text: "/model",
    receivedAt: 2,
  });

  expect(replies[0]?.selection?.options.some((option) => option.id === "new-provider")).toBe(true);
  await expect(repo.readState()).resolves.toMatchObject({
    bots: {
      "webhook-1": {
        draftOptions: {
          model: encodeCustomModelValue("new-provider", "deepseek-v4-flash"),
        },
      },
    },
  });
});
```

- [ ] **Passo 2: Executar o teste focado para confirmar a falha**

Execute:

```bash
pnpm vitest run packages/services/test/botsService.config.test.ts -t "migrates bot draft model"
```

Esperado: FAIL porque a hidratação do serviço ainda não executa a migração de storage.

- [ ] **Passo 3: Adicionar o gate de migração preguiçosa em `createBotsService`**

Em `packages/services/src/bots/botsService.ts`, importe os helpers de migração e adicione:

```ts
let botStorageMigrationPromise: Promise<void> | null = null;

async function ensureBotStorageMigrated(): Promise<void> {
  if (!botStorageMigrationPromise) {
    botStorageMigrationPromise = (async () => {
      const providers = await refreshModelProviderConfigs("migration");
      const state = await repo.readState();
      const migratedState = migrateBotsStateToV2({
        state,
        legacyCache: modelCacheFile,
        providers,
        nowMs: Date.now(),
      });
      if (JSON.stringify(migratedState) !== JSON.stringify(state)) {
        await repo.writeState(migratedState);
      }
    })().catch((error: unknown) => {
      botsLogger.warn(
        undefined,
        `migrate bot state/cache v2 failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }
  await botStorageMigrationPromise;
}
```

Chame `await ensureBotStorageMigrated()` no início de `readContext()`; `writeContext()` não precisa disso, pois grava apenas o estado v2 já normalizado.

Adicione uma guarda para evitar recursão caso `refreshModelProviderConfigs()` já chame `ensureModelCacheHydrated()`.

- [ ] **Passo 4: Fazer a hidratação do cache de modelos usar os providers atuais na primeira migração**

Em `ensureModelCacheHydrated()`, após ler o cache, se o cache veio do legado/padrão ou não tiver providers, chame `deps.modelProviderService?.getAll()` uma vez e persista `migrateBotsModelCacheToV2({ legacyCache, providers, nowMs })`. Mantenha o comportamento de falha conservador: se o serviço de provider estiver indisponível ou falhar, semear o cache existente e registrar `warn`.

Inclua um comentário:

```ts
// Bugfix: o snapshot de providers do cache v2 deve vir do ModelProviderService após a migração do config.json.
// O bots-model-cache.json antigo só pode ajudar na migração; não pode continuar sendo a fonte de verdade
// de fornecedores para o /model.
```

- [ ] **Passo 5: Executar o teste de nível de serviço**

Execute:

```bash
pnpm vitest run packages/services/test/botsService.config.test.ts -t "migrates bot draft model"
```

Esperado: PASS.

### Task 4: Atualizar Testes e Documentos Existentes

**Arquivos:**
- Modificar: `packages/services/test/botsService.fixtures.ts`
- Modificar: `packages/services/test/botsModelCacheRepo.test.ts`
- Modificar: `docs/bots.md`

- [ ] **Passo 1: Atualizar as fixtures para padrões de cache v2**

Faça `createMemoryModelCacheRepo()` usar `createDefaultBotsModelCache()` com `version: 2`, `updatedAt`, `providers` e `workspaceConfigOptions`. Mantenha a API do helper inalterada para os testes existentes.

- [ ] **Passo 2: Atualizar as expectativas do teste existente do cache repo**

Mude o teste existente `persists model providers with apiFormat metadata` para gravar o formato v2:

```ts
await repo.write({
  version: 2,
  updatedAt: 1,
  providers: [
    {
      id: "custom-openai",
      name: "Custom OpenAI",
      endpoints: {
        anthropic: "",
        openai: "https://example.com/v1",
        gemini: "",
      },
      apiFormat: "openai-responses",
      apiKey: "__zcode_cached_api_key_present__",
      models: [
        createModelProviderModelConfig({
          id: "gpt-example",
          kinds: ["openai"],
        }),
      ],
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  workspaceConfigOptions: {},
});
```

- [ ] **Passo 3: Atualizar a lista de arquivos de `docs/bots.md`**

Substitua os itens de estado/cache por:

```md
- `bot-state.v2.json`: estado de runtime atual indexado por bot id. Armazena o workspace ativo, o modo draft/task, a task ativa, permissões pendentes, o offset do Telegram e o horário de atualização.
- `bots-model-cache.v2.json`: cache atual de seleção de modelos. Os snapshots de provider são derivados de `config.json` através de `modelProviderService.getAll()` e nunca armazenam API keys reais.
- `bot-state.json` / `bots-model-cache.json`: arquivos legados. As novas versões os leem apenas como entrada de migração e nunca os modificam.
```

- [ ] **Passo 4: Executar todos os testes de bot focados afetados pela mudança**

Execute:

```bash
pnpm vitest run packages/services/test/botsRepo.test.ts packages/services/test/botsModelCacheRepo.test.ts packages/services/test/botsStorageMigration.test.ts packages/services/test/botsService.config.test.ts packages/services/test/botsModelSelectionHelpers.test.ts
```

Esperado: PASS.

### Task 5: Verificação Completa e Commit

**Arquivos:**
- Verificar todos os arquivos modificados

- [ ] **Passo 1: Inspecionar o git diff**

Execute:

```bash
git diff -- packages/services/src/bots packages/services/test docs/bots.md docs/superpowers/plans/2026-06-10-bot-state-cache-v2-migration.md
```

Esperado: o diff inclui apenas a migração v2, os testes e a documentação.

- [ ] **Passo 2: Executar as verificações obrigatórias do projeto**

Execute:

```bash
pnpm typecheck
pnpm lint
```

Esperado: ambos PASS.

- [ ] **Passo 3: Fazer o commit da implementação**

Execute:

```bash
git status --short
git add packages/services/src/bots/config.ts packages/services/src/bots/repo.ts packages/services/src/bots/modelCacheRepo.ts packages/services/src/bots/storageMigration.ts packages/services/test/botsRepo.test.ts packages/services/test/botsModelCacheRepo.test.ts packages/services/test/botsStorageMigration.test.ts packages/services/test/botsService.config.test.ts packages/services/test/botsService.fixtures.ts docs/bots.md docs/superpowers/plans/2026-06-10-bot-state-cache-v2-migration.md
git commit -m "fix: migrate bot state and model cache to v2 files"
```

Esperado: Conventional Commit criado; `.turbo/` permanece untracked e não staged.