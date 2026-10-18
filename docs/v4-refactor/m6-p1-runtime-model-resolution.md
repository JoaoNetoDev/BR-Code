# M6 Fase 1 — desenho histórico da resolução de provider/credenciais na CLI (runtimeModel)

> **Status: substituído pelo Provider Refactor; apenas as escolhas de solução e o rastro de migração são mantidos.**
> O estado atual é criado pelo Provider Registry e pelo ModelFactory do Environment de destino; o
> `workspace model catalog`, o fallback de `runtimeModel`, o `workspace/updateProviderRegistry` e o
> envio de snapshots de credenciais saíram de cena. Os fatos atuais estão em
> `docs/working-memory/provider-refactor/design/`.

Consolidar a base do v4 "trocar de modelo só suporta troca direta no mesmo provider": fazer a troca **entre
providers / de modo de conexão** realmente valer em runtime.
Dando continuidade a `m6-model-selection-parity.md`; o usuário decidiu pelo alinhamento total, mantendo o fallback
padrão e a lógica de coding-plan.

## 0. Conclusão em uma frase (a descoberta-chave após investigar os dois lados)

**O app nunca monta o runtimeModel à mão.** A toolbar antiga empurra apenas a "seleção de ref de modelo"; o
`runtimeModel` real (credenciais/endpoint/cabeçalho Start-Plan JWT/projectId+key do Team-Plan/cabeçalho de
verificação de segurança da versão oficial/redução de thought) é resolvido de forma preguiçosa pela **camada de
service viva** (`packages/services/.../zcodeAgentService.ts` + `modelProviderService.ts`) **a partir do snapshot
do provider registry do app, a cada despacho de RPC**. Essa camada de service é **infraestrutura compartilhada,
não a toolbar de UI removida, e também não está na zona proibida `zcode-protocol/` da CLI** — o v4 pode reutilizá-la
inteiramente.
→ **"Manter coding-plan + fallback padrão" sai quase de graça: basta reutilizar a resolução/snapshot de registry da
camada de service, sem reescrever.**

## 1. Fatos atuais (investigação dos dois lados)

### Lado da CLI (primitivas de apply + fallbacks)

- o handler v4 `zcode-protocol-v4/commands/handlers/model-config.ts:41` só faz `app.setModel(formatModelRef)`
  —— **reseleciona o modelo dentro do registry atual, sem trocar o client do provider** (o próprio comentário em :36 admite
  isso).
- a primitiva central que realmente troca o client do provider (chamável nativamente pelo v4, sem tocar a zona
  proibida):
  **`record.app.setModelCatalogOverlay(overlay)` (instala o provider registry com credenciais →
  `modelAdapter.replaceRegistryConfig`, `app/model-catalog-overlay.ts:69`) → e então `app.setModel(...)` +
  `setThoughtLevel` opcional.**
- o overlay é construído por `createModelCatalogOverlay(catalog, env)`
  (`zcode-protocol/workspace-model-catalog.ts:1181`) a partir de `context.workspaceModelCatalogs`; o catalog é
  empurrado por `updateProviderRegistry`.
- **Não há proibição de ponte** (`bootstrap/tests/v4-native-boundary.test.ts`): o diretório v4 proíbe importar
  qualquer caminho `zcode-protocol/` (tanto server-operations **quanto** workspace-model-catalog); mas
  `record.app.*` / `record.app.runtime.*` podem ser chamados livremente. **O binder `v4-bridge.ts` fica no diretório
  antigo, e ali é legal importar as primitivas de workspace-model-catalog** → a construção do overlay passa por
  injeção de host capability.
- **Fallbacks da CLI a manter** (todos fora do caminho de escrita do apply; esta Fase não os toca e os mantém como
  estão):
  `reconcileResumedRuntimeSettings` (`server-operations.ts:3106`: `runtime_model_authoritative` :3136 +
  `persisted_model_unavailable` mantém o valor atual e emite warn :3145),
  `derivePersistedRuntimeSettings` (:3013), `ensureSessionModelAvailableForNextTurn` (:2535, **já ligado como hook v4
  `ensureModelReady`**), `DEFAULT_MODEL`/`createModelConfigMissingError` (`model-config.ts:33/47`).

### Lado App/service (resolução do runtimeModel + coding-plan + fallbacks)

- **Duas camadas**: toolbar (`modelChangeActions.ts` com três handlers: empurra model-ref + decide restart +
  empurra o registry)
  → service (`zcodeAgentService.ts`: `const runtimeModel = params.runtimeModel ?? await
  resolveRuntimeModelConfig({...})`, resolvido preguiçosamente a partir de
  `modelProviderService.getProviderRegistrySnapshot()` e enviado junto com o RPC).
- **Motor de resolução do runtimeModel** (service, compartilhado, **reutilizado e não reescrito**):
  `resolveRuntimeModelConfig` (`zcodeAgentService.ts:1569`) + `createRuntimeModelConfig` (:645) +
  `modelProviderService.buildProviderRegistrySnapshot` (:803).
- **A injeção de credenciais de coding-plan/start-plan/team-plan está toda na camada de service** (⚠️ manter):
  `pickResolvedFamilyProvider` (seleção do modo de conexão Start/APIKey/Coding/Team, :196),
  `buildStartPlanRuntimeAuthorizationHeaders` (`Authorization: Bearer <jwt>` do Start Plan, :541),
  `resolveSelectedBigModelTeamPlanRuntimeApiKey` (org/projectId + project key do Team Plan, :559),
  helpers que removem o cabeçalho de uso único de verificação de segurança da versão oficial (:516),
  `resolveSupportedRuntimeThoughtLevel` (descarta quando o modelo alvo não suporta thought, :615), e a guarda de
  remoção do Team Plan (se o provider é filtrado, lança unavailable em vez de cair silenciosamente na key pessoal,
  :1615/:855).
- **Schema do runtimeModel** (`shared/zcode-protocol/index.ts:523` `zcodeModelRuntimeConfigSchema`):
  `{revision, generatedAt, model{providerId,modelId,variant?}, provider(providerId,kind,apiFormat?,baseURL?,apiKey?(inline/credential/env),apiKeyRequired?,headers?,providerOptions?,models[]…), thoughtLevel?}`.
- **Contratos de service**: `IZCodeAgentService.setModel({..., model, runtimeModel?, modelProviderFamilySelectedKeys?})`
  / `updateRuntimeModelConfig({..., runtimeModel, applyModelSelection?})` / `updateProviderRegistry({..., registry})`.
- **Fallbacks do app a manter** (a maioria pertence à Fase 2; nesta Fase basta reutilizar a parte embutida no
  resolver de service):
  fallback embutido em `resolveRuntimeModelConfig` (histórico ausente→undefined deixa o agent restaurar :1583;
  provider removido→lança unavailable :1615; default stale→primeiro disponível do registry :1678).
  `resolveUnavailableModelListFallback` / `resolveLoginProviderFirstModel` / `<synthetic>` / guard de context window /
  caminho de recuperação do lado da toolbar pertencem à **Fase 2** (não são feitos nesta Fase, mas o desenho não pode
  bloqueá-los).

## 2. Desenho central: híbrido 1c (decisão do usuário em 2026-07-07)

Como o runtimeModel (com credenciais) entra na CLI? Depois de comparar três opções, **optou-se pelo híbrido 1c**: no
caso normal segue-se 1b (a CLI resolve a partir do registry já enviado); quando o provider não está no registry
(acabou de ser adicionado/corrida/remoto), há fallback para 1a (o app resolve o runtimeModel e o envia com o comando).
Implementando literalmente a decisão do usuário "priorizar o envio pelo app (registry) / na ausência usar o valor atual
da CLI / atualizar sincronizando (re-push)".

| Opção                              | Lado do app                                                                                        | Protocolo v4                                                | Lado da CLI                                                                                                        | Avaliação                                                                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| **1a empurra o runtimeModel a cada troca** | reutiliza o resolver de service para resolver o runtimeModel e o coloca no payload de `switchModelConfig` | `switchModelConfig` aditivo com `runtimeModel?` (redefine o schema) | o host capability funde `runtimeModel.provider` no catalog, monta o overlay e faz setModel | o mais próximo da versão antiga (o legacy `session/setModel` sempre carrega o runtimeModel), o mais estável e com suporte a remoto; mas leva credenciais em cada comando e acopla o v4 a um schema pesado |
| **1b a CLI resolve a partir do registry já enviado** | envia apenas `{provider,model}` (como hoje), garantindo que o registry já foi enviado (re-push em mudança de conexão/credencial) | nenhuma alteração                                            | o host capability monta o overlay a partir de `context.workspaceModelCatalogs` e faz setModel                       | o mais enxuto (sem mudança de protocolo, sem credenciais voando), o mais alinhado ao "CLI autoritativa" do v4; depende da atualidade do registry |
| **1c híbrido (recomendado)**        | no caso normal segue 1b (registry autoritativo); quando o provider não está no registry da CLI (recém-adicionado/corrida/remoto), há fallback para 1a com runtimeModel | aditivo com `runtimeModel?` (opcional, só para o fallback)  | host capability: usa o runtimeModel se ele vier no payload; senão monta o overlay a partir do registry; sem nenhum dos dois → lança unavailable para o app fazer re-push e tentar de novo | materializa exatamente a regra de três partes do usuário: **priorizar o envio pelo app (registry) / na ausência usar o valor atual da CLI / atualizar sincronizando (re-push)**; cadeia de fallback completa |

**Recomendação de 1c**: corresponde literalmente à mentalidade do usuário ("priorizar o envio do app para a CLI; na
ausência usar o retorno da CLI; atualizar sincronizando"), com registry no caso normal e runtimeModel apenas como
fallback de corrida/remoto. Se quiser entregar rápido, pode-se fazer primeiro o **mínimo ciclo fechado de 1b** (apoiado no envio
do registry atual) e depois completar o fallback 1a.

## 3. Implementação por etapas (1c)

**Camada A — protocolo v4 (aditivo)** `packages/shared/src/zcode-protocol-v4/command.ts:65`

- `switchModelConfig` ganha `runtimeModel?` (opcional). O schema reaproveita o `zcodeModelRuntimeConfigSchema` de
  `@zcode/shared/zcode-protocol` (referência dentro do pacote compartilhado, não a ponte de service da CLI; se o
  acoplamento incomodar, pode-se definir um espelho v4 — a decisão está na §5).
- `createSession.config` também pode carregá-lo (desde o primeiro uso já com o provider correto), consumido por
  `applyRequestedSessionConfig`.

**Camada B — binder da CLI + handler**

- `commands/types.ts:41` `V4CommandCoreHost` ganha a capability
  `resolveAndApplyRuntimeModel(sessionId, { model, runtimeModel? }): Promise<{applied:boolean, reason?}>` (hook de
  transição, com prazo de morte = a config do v4, na mesma categoria de `ensureModelReady`).
- `v4-bridge.ts:42` implementação no coreHost (legal por estar no diretório antigo):
  - payload com runtimeModel (fallback 1a) → `applyRuntimeModelConfigToWorkspace` e funde no catalog;
  - senão pega o registry já enviado em `context.workspaceModelCatalogs.get(workspaceKey)`;
  - `syncAppWorkspaceModelCatalog` → `app.setModelCatalogOverlay(overlay)`; provider ausente → devolve
    `{applied:false, reason:"provider_not_in_registry"}` (não lança, deixando o handler emitir um ACK estruturado para
    o app fazer re-push e tentar de novo).
- `handlers/model-config.ts:41` `switchModelConfig`: chama `host.resolveAndApplyRuntimeModel(...)` **antes** de
  `app.setModel`; `applied:false` → ACK `failed` (reasonCode `provider.notInRegistry`) sem silêncio; o resto mantém
  setModel/setThoughtLevel/emitModelSelected. `applyRequestedSessionConfig` recebe o mesmo tratamento.

**Camada C — renderer/service (lado do app)**

- 1b no caso normal: garantir a atualidade do registry — reaproveitar o `updateProviderRegistry` existente; **disparo
  de re-push na mudança de modo de conexão (P4b) / ao adicionar provider** (alinhado ao antigo
  `syncModelProviderRegistryBeforeCustomModelWrite`).
- fallback 1a: expor o resolver de service para o v4 — `IZCodeAgentService` ganha
  `resolveRuntimeModelForV4({model, modelProviderFamilySelectedKeys})` (encapsulamento fino do
  `resolveRuntimeModelConfig` existente, **sem reescrever coding-plan/fallback**); o `handleSelectModel` do SessionPane
  resolve o runtimeModel e reenvia uma vez ao receber o ACK `provider_not_in_registry`.
- Manter os fallbacks da toolbar (corpo da Fase 2, mas que esta Fase não pode bloquear): guard de context window na
  confirmação/compressão ao trocar para um modelo de janela pequena em uma sessão viva
  (`modelSwitchContextWindowGuard`, reserva de 64k); decisão de restart do runtime (trocar de modelo em um tipo de
  agent externo que não é GLM exige restart, **GLM não reinicia** — o principal alvo do v4, GLM, quase nunca dispara).

### 3.1 Semântica de fechamento do fallback de app da Fase 2 (2026-07-09)

A Fase 2 restaura apenas dois comportamentos antigos, sem reconstruir a máquina de estados completa da toolbar antiga:

```text
用户选模型
  -> SessionPane 发 switchModelConfig(provider, model, thought)
  -> CLI ACK: failed/provider.notInRegistry
  -> app 强制 syncWorkspaceModelProvidersToAgent(force=true)
  -> app 调 service resolver 解析 runtimeModel
  -> SessionPane 再发一次 switchModelConfig(provider, model, thought, runtimeModel)
  -> 第二次 ACK 作为最终结果，不再循环
```

Restrições:

- `provider.notInRegistry` só se recupera automaticamente uma vez. Se a segunda tentativa falhar, o ACK failed e o log
  originais são mantidos, apresentados pela UI de erro e pelo buffer de debug existentes.
- o lado do app apenas sincroniza o provider registry e anexa o `runtimeModel` a este retry; não modifica as
  semânticas de stream, snapshot, queue ou replay.
- o desktop continua sendo a cadeia em tempo real `desktop-continuous`; o celular em `/remote` continua sendo a
  cadeia de recuperação `web-remote-replayable`. O provider registry é o plano de controle de configuração do
  workspace e não pode ser anexado às mensagens de recuperação replayable do desktop continuous, nem o celular pode
  contornar os limites de gap/snapshot do replayable.
- panes remotos/de tela dividida devem passar `remoteSessionId` para o sync do provider registry; a chave de
  identidade/isolamento é uniformemente `workspaceIdentity?.trim() || workspacePath`, e o caminho de execução
  continua usando `workspacePath`.

Ao falhar prepare/configOptions, recupera-se a seleção de custom provider:

```text
workspace configOptionsStatus=error
  -> 用户仍能在模型菜单点 custom provider value
  -> app 写 last-selected + selectedSupplierKey=custom:<providerId>
  -> app 写 workspace default model
  -> app restartWorkspaceProcess(bumpRuntimeEpoch=true)
  -> app force prepare/readWorkspaceState
  -> configOptions 回填，模型菜单恢复
```

Este caminho serve apenas à recuperação de falha de prepare; não restaura a UI completa de `modelSwitchStage` da
versão antiga, o guard de context window, os detalhes de busy lock entre providers nem a antiga matriz de decisão de
restart.

## 4. Lista do que manter (comparação de aceitação)

- **coding-plan/modo de conexão** (mantido ao reutilizar o resolver de service): cabeçalho Authorization do Start
  Plan, org/projectId+project key do BigModel Team Plan, cabeçalho de uso único de verificação de segurança da versão
  oficial (caminho de sub agent com `applyModelSelection:false`, caso de borda, registrado como TODO), seleção de
  conexão por family, redução de thought e remoção do Team Plan sem fallback silencioso.
- **Fallback padrão**: `reconcileResumedRuntimeSettings` no resume da CLI (dois bugfixes) + `ensureModelReady` +
  `DEFAULT_MODEL`/missing error (mantidos como estão); os três fallbacks de `resolveRuntimeModelConfig` no service
  (histórico ausente/removido/stale primeiro disponível).
- **Colaboração com P4b**: o Select de modo de conexão `onConnectionValueChange` = escrever
  `modelProviderFamilySelectedKeys` (AppSettings) → invalidar o cache do registry → re-push (1b no caso normal) ou
  resolver o novo runtimeModel de conexão e reenviar (1a). **Com o P1 pronto, o P4b equivale a apenas "escrever a
  family key + disparar o re-push".**

## 5. Pontos de decisão

1. ~~1a/1b/1c~~ **Definido: híbrido 1c (decisão do usuário em 2026-07-07)**. Ordem de implementação: primeiro o núcleo
   de 1b (a CLI resolve a partir do registry), depois o fallback 1a (o app resolve o runtimeModel e reenvia com
   `provider.notInRegistry`).
2. Schema do `runtimeModel` no comando v4: **tendência a referenciar o `zcodeModelRuntimeConfigSchema` compartilhado**
   (DRY, referência interna ao pacote compartilhado e não à ponte de service da CLI) com comentário de
   rastreabilidade; se o acoplamento for pesado demais na implementação, mudar para um espelho v4.
3. Cabeçalho de uso único de verificação de segurança da versão oficial (sub agent do Start Plan,
   `applyModelSelection:false`): **registrado como TODO nesta Fase e não implementado** (cenário de borda, pertence ao
   caminho de verificação de segurança do sub agent).

## 7. Ordem de implementação (1c) — progresso

1. ✅ **Protocolo v4 aditivo** (`command.ts` com runtimeModel?, referenciando o schema compartilhado) — commit
   `c9c67b061`.
2. ✅ **Host capability de binder na CLI** `resolveAndApplyRuntimeModel` (o v4-bridge reutiliza a construção de overlay
   do workspace-model-catalog, conforme com a regra de ponte) + interface em types.ts.
3. ✅ **Handler da CLI** (switchModelConfig/applyRequestedSessionConfig chamam a capability antes do setModel,
   `provider.notInRegistry` → ACK failed estruturado).
4. ✅ **L2 + gate sem ponte** (4 casos novos + 6 casos existentes de applyRequestedSessionConfig migrados de
   assinatura; model-config 18 / v4-commands 13 / shared-schema 8 / boundary tudo verde; turbo typecheck da CLI
   20/20).
5. 🚧 **Fallback do app (1a) — fechamento da Fase 2**: o 1b normal já basta (o registry é enviado no prepare do
   workspace, o catalog da CLI tem todos os providers configurados → `catalog.providers.has` acerta → a troca entre
   providers vale). O 1a cobre a aresta de desync "provider no app mas não enviado para a CLI" (recém-adicionado/
   corrida/remoto): o SessionPane recebe `provider.notInRegistry` → `syncWorkspaceModelProvidersToAgent({ force: true })`
   reenvia o registry → o service `resolveRuntimeModelForV4` resolve o runtimeModel → `switchModelConfig` é tentado
   novamente uma vez com o runtimeModel. Em falha de prepare/configOptions, restaura-se apenas a seleção de custom
   provider, a escrita do default do workspace, restart + prepare, sem restaurar a antiga UI global de stages.
6. ⬜ **e2e** (execução exclusiva em lote): selecionar um modelo de provider com custom key → projeta a troca de
   provider + envia de fato um turno, validando o fechamento normal do 1b.

> **O núcleo do P1 (habilitação da troca entre providers na CLI) está concluído e endossado pelo L2; o fallback de
> borda 1a e o e2e são os itens de fechamento.**

## 6. Testes

- L2 (v4 CLI): troca entre providers → aplicação do overlay → `getModelRef` trocando o provider; provider fora do
  registry → ACK estruturado `provider.notInRegistry`; a troca direta no mesmo provider segue o caminho existente;
  regressão dos dois fallbacks de reconcile do resume.
- L1: passagem transparente do resolver de service fino (sem regressão nos snapshots de coding-plan/team-plan —
  reaproveitando os testes de modelProvider existentes).
- e2e (execução exclusiva em lote): selecionar um modelo de provider com custom key → projeta a config com a troca de
  provider + envia de fato um turno; troca de modo de conexão (depois que o P4b for entregue).
- Completar primeiro `docs/conversation-session-case-catalog.md` + coverage matrix.