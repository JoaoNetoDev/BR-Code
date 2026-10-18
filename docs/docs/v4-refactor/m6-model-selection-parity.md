# M6 Model-Selection Parity — Planejamento de Conclusão da Lógica de "Selecionar Modelo" na Caixa de Entrada

> **Status: implementado; este documento é preservado como rastro de migração do M6.** A entry
> atual é `packages/ui/src/v4/composer/V4ComposerToolbar.tsx`, `useDraftConfigControl.ts` e o
> `commands/handlers/model-config.ts` do V4; o caminho antigo `ChatInputToolbar` abaixo representa
> apenas a linha de base de reconciliação.

O princípio de separação continua de `m5-composer-parity.md`: **casca antiga, núcleo novo** — os
componentes de exibição reaproveitam os componentes puros do antigo `ModelConfigSelect` /
`ChatInputToolbar`; a orquestração de estado e o caminho de escrita são inteiramente v4 (projeção de
leitura `snapshot.config`, escrita por comandos v4, sem ponte, o novo não chama o antigo).

Linha de base de referência: z-code-2 (versão antiga em produção)
`packages/ui/src/chat-input-toolbar/*`, `packages/ui/src/lib/*`,
`packages/ui/src/ChatInputToolbar.tsx`, `apps/zcode-cli/packages/*`.
Veículo atual: `packages/ui/src/v4/composer/V4ComposerToolbar.tsx`, `SessionPane.tsx`,
`apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/model-config.ts`.

> Durante a restauração do composer do M5, "casca antiga, núcleo novo" estava certo, mas só
> alinhou "como o seletor parece + de onde o valor é lido na projeção"; **a lógica de seleção em
> torno do seletor (persistência / fallback / gate de entitlement / modo de conexão / resolução de
> credenciais entre providers) foi migrada por inteiro por omissão**. Este documento faz a
> reconciliação sistemática e dá o plano de execução. O usage breakdown / cache-hit / painel de
> consumo já registrados em `m5-composer-parity.md §六` entram na Phase 4c e não são replanejados.

## Decisões do usuário (2026-07-07)

1. **Escopo = alinhamento total**, incluindo Phase 1 (resolução de credenciais de provider no CLI)
   + Phase 4b (troca do modo de conexão). Sem essa camada, na lista do coding-plan o clique "não
   troca", e escolher o modelo de qualquer outro provider é decorativo.
2. **"Lembrar a última seleção" = restaurar a semântica global da versão antiga**: o modelo do
   ZCode-Agent é lembrado globalmente entre workspaces; custom provider é per-workspace; inclui
   migração das chaves legadas.
3. **Isolamento da implementação**: alterar+commitar+testar em um worktree separado
   `z-code-m6-model` (branch `m6-model-selection`, baseado em feature/v4-vertical-slice 52fb19e61),
   com outras sessões concorrentes no diretório principal; depois fazer cherry-pick/merge.

## 1. Lista de lacunas (capacidade × implementação antiga × situação atual no v4)

### A. Lembrar a última seleção (persistência) — lacuna real
| Capacidade | Origem antiga | Situação atual no v4 |
|---|---|---|
| Persistência do last-model (chave global `zcode-last-agent-model`, ZCode-Agent `__global__`, custom per-workspace) | `lib/zcodeModelPreference.ts:15,50,230,289` | ✗ Apenas workspace-default (per-workspace) `useDraftConfigControl.ts:221` |
| Migração das chaves legadas (workspace-scoped / path-only → global) | `zcodeModelPreference.ts:246-286` | ✗ |
| Persistência do thought-level + default-max do GLM-5.2 | `zcodeModelPreference.ts:16,327,505-553,571` | ✗ |
| Semente na inicialização + revalidação contra o diretório | `chat-input-toolbar/modelSelection.ts:609-660` | Parcial: o draft cai para o workspace-default `V4ComposerToolbar.tsx:146-150`, sem semente global/revalidação |

### B. Fallback / posicionamento automático — lacuna real
| Capacidade | Origem antiga | Situação atual no v4 |
|---|---|---|
| Modelo atual fora do grupo selecionável → recuar para o primeiro disponível / limpar | `modelSelection.ts:678` + máquina de estados `ChatInputToolbar.tsx:1937-2085` + `setTaskVisibleModelListFallback:1923` | ✗ Inválido não se auto-cura, exibe o id cru |
| Selecionar automaticamente o primeiro modelo do provider após o login | `modelSelection.ts:755` (`resolveLoginProviderFirstModel`) + `:733` | ✗ |
| Placeholder `<synthetic>` | `modelSelection.ts:350-414` | ✗ Synthetic exibido diretamente |
| Posicionamento adiado enquanto o entitlement está hidratando | `modelSelection.ts:690-697,785` | ✗ |
| Degradação com config vazio | — | Tem: `SessionPane.tsx:792-801` + `modelMenuVisible` `V4ComposerToolbar.tsx:338` |

### C. Correção da lista de coding-plan — lacuna parcial
| Capacidade | Origem antiga | Situação atual no v4 |
|---|---|---|
| Montagem dos grupos + agrupamento/badge de coding-plan | `lib/modelSelectionGroups.ts:810,76,537` | ✅ `buildModelSelectGroups` `V4ComposerToolbar.tsx:215-227` |
| **Gate de visibilidade por entitlement** (não exibir sem autorização, start↔coding mutuamente exclusivos) | `modelSelection.ts:830-884` aplicado em `ChatInputToolbar.tsx:1123-1170` | ✗ Só passa `shouldIncludeModelProviderInSelection`; `entitlements` só alimenta o saldo de start `V4ComposerToolbar.tsx:129-184` |
| **Select do modo de conexão** (Start/Individual/Team/API Key) | `ModelConfigSelect.tsx:365` + `onConnectionValueChange`; opções `modelSelectionGroups.ts:371-498` | ✗ Não passa `onConnectionValueChange` `V4ComposerToolbar.tsx:375-391` |
| Painel de consumo do coding-plan | `chat-input-toolbar/CodingPlanContextUsage.tsx` + ~150 linhas em `ChatInputToolbar` | ✗ (`m5-composer-parity §六` segunda etapa) |
| Breakdown de context-usage + cache-hit | `chat-input-toolbar/contextUsage.tsx` | ✗ `SessionUsageState` sem os campos (`m5-composer-parity §六` primeira etapa) |

### D. Caminho de escrita do CLI: resolução de provider / credenciais (base de C) — lacuna real
| Capacidade | Origem antiga | Situação atual no v4 |
|---|---|---|
| Ao trocar de modelo, resolver o client do provider + credenciais + trocar o runtime conforme o modo de conexão | `chat-input-toolbar/modelChangeActions.ts:462,647,982` + `useToolbarRecoveryModelChange.ts` | ✗ `handlers/model-config.ts:36-37` "as credenciais não foram feitas… só suporta troca direta no mesmo provider"; apenas `app.setModel` `:64` |

### E. Polish
- `showManageModelsAction={false}` (`V4ComposerToolbar.tsx:379`); `isItemLocked={()=>false}` (`:331`); logs de depuração `[v4-toolbar]/[v4-draft-config]/[v4-pane]`; guarda de compactação mantida em data de expiração (a discutir se necessário).

## 2. Plano de execução por fases

Dependências: **4b depende de 1**; 2 se beneficia de 1 no lado do CLI; 3/4a/4c são basicamente
independentes. Ordem recomendada: **4a + 4c → 1 → 4b → 2 → 3 → 5**.

- **Phase 1 (D)**: o `switchModelConfig` do CLI ganha resolução de provider/credenciais/modo de conexão (autoritativo, sem resolver no backend); payload de `command.ts` aditivo com `connection?`; credenciais ausentes → ACK failed estruturado; `applyRequestedSessionConfig` sincronizado. L2 + e2e.
- **Phase 2 (B)**: validação no resume do CLI com auto-cura de inválidos + hook `useV4ModelAutoPosition` no cliente (portar as funções puras de `modelSelection.ts`: synthetic/primeiro modelo do login/atraso de hidratação/disparo de switchModelConfig para inválidos). L1 + e2e.
- **Phase 3 (A)**: portar a camada global de `zcodeModelPreference` (escopo de chaves/migração/thought/GLM-5.2 default-max); `useDraftConfigControl` como semente do draft; o workspace-default mantém a camada per-workspace. L1 + e2e (após trocar de workspace, continua sendo a última seleção global).
- **Phase 4 (C)**: 4a gate de entitlement (o mais leve, os dados já estão em mãos); 4b select do modo de conexão (depende de 1); 4c painel de consumo + breakdown/cache-hit (alinha com `m5-composer-parity §六`). Cada uma com L1/e2e.
- **Phase 5 (E)**: manage-models, bloqueio durante execução, limpeza dos logs; a guarda de compactação fica para decisão.

## 3. Critérios de aceitação

- Cada Phase traz L1/L2 + e2e; atualizar primeiro `docs/conversation-session-case-catalog.md` e `docs/testing/conversation-session-e2e-coverage-matrix.md` e só então escrever os cases.
- Disciplina: sem ponte em `zcode-protocol-v4/`; código novo não chama o protocolo antigo; protocolo aditivo + sincronização de `10-protocol-spec.md`; caminhos antigos que podem ser removidos recebem data de expiração e são removidos.
- Antes de rodar o e2e: `node scripts/build-desktop-agent-cli.mjs` para reconstruir o bundle do CLI; `unset ELECTRON_RUN_AS_NODE`.

### Consistência da identidade do gatilho de modelo (2026-07-13)

- A identidade da seleção de modelo é `provider + model id`; não se pode decidir se houve troca apenas pelo nome do modelo.
- O item de menu e o gatilho recolhido devem compartilhar a mesma fonte de verdade, `modelSelectGroups + normalizedValue`: o gatilho casa com precisão o item de menu pelo valor codificado completo e exibe o `name` daquele item. É proibido buscar de novo o nome de exibição em `model.name` da config do provider, porque configurações históricas podem ter apelidos antigos inconsistentes com o model id real.
- O gatilho recolhido sempre exibe apenas o nome do modelo do item de menu; o provider serve só para agrupamento do menu, seleção precisa e identidade do comando, e não pode aparecer no texto do gatilho; mesmo que modelos com o mesmo nome existam em vários providers, não se deve exibir "nome do modelo · provider". O controle remoto Web do celular continua reaproveitando a regra existente de truncamento compacto.
- Quando o valor codificado atual não está no grupo selecionável, continua-se usando a lógica de placeholder synthetic / modelo inválido da Phase 2, sem expor o valor interno ao usuário.

Cadeia de estados:

```text
用户点击 provider A / glm-5.2
          |
          v
onValueChange(encoded(provider A, glm-5.2))
          |
          v
CLI switchModelConfig -> snapshot.config(provider A, glm-5.2)
          |
          v
rawModelValue = encoded(provider A, glm-5.2)
          |
          v
modelSelectGroups 精确命中同一菜单项
          |
          `--> 触发器始终只显示：glm-5.2
```

### Compatibilidade de thought entre modelos e observabilidade do comando (2026-07-14)

- O `thought` de `switchModelConfig`, no cenário de troca pelo menu de modelos, é o valor atual do modelo de origem; não representa que o usuário escolheu um nível de pensamento de mesmo nome para o modelo alvo. Em troca entre modelos/providers ele não pode ser usado como nível forçado do modelo alvo; o modelo alvo é escolhido pelo runtime conforme a preferência global e a própria capacidade, e `ModelSelected` deve publicar o valor final efetivamente usado pelo runtime.
- Quando provider/model não mudam, aí sim o `thought` representa uma troca explícita de nível de pensamento; valores não suportados continuam retornando falha, sem fingir sucesso silenciosamente.
- O `createSession.config` pode carregar o thought deixado pelo modelo anterior. Depois de aplicar o modelo alvo, só sobrescreva quando o `listThoughtLevels()` alvo o suporte explicitamente; caso contrário mantenha o nível padrão do modelo alvo, para que uma sessão pré-aquecida não fique num estado semi-completo de "runtime já trocou, projeção ainda é do modelo antigo" por causa de `Unsupported reasoning effort`.
- ACK, projeção de eventos e runtime precisam ir na mesma direção: assim que a identidade do modelo troca com sucesso, publique `ModelSelected` com o thought efetivamente usado; é proibido fazer o comando inteiro falhar depois que o modelo já mudou só porque o thought anexado é incompatível.

Cadeia de estados:

```text
源 snapshot: GLM-5-Turbo / enabled
              |
              | 用户只选择 DeepSeek-V4-Flash
              v
switchModelConfig(provider=deepseek, model=deepseek-v4-flash, thought=enabled)
              |
              v
runtime.setModel(deepseek/deepseek-v4-flash)
              |
              +--> enabled 被视为源模型附带值，不强制写入目标模型
              |
              v
runtime 实际 thought（目标模型兼容值，例如 max）
              |
              v
ModelSelected(deepseek/deepseek-v4-flash, max) -> accepted ACK -> snapshot/UI

同模型只切 thought：
snapshot model identity 不变 -> setThoughtLevel(用户显式值) -> 成功发布 / 不支持则失败且模型不变
```

## 4. Progresso da execução
- [x] **Phase 4a — gate de entitlement** (`5c14a3927`): função pura `filterModelProvidersByEntitlement` + integração na montagem de grupos do V4ComposerToolbar + 7 testes unitários.
- [x] **Phase 3 — persistência global do last-model**: `seedDraftOptionsFromGlobalPreference` (semente do diretório do draft, com revalidação contra o diretório) + escrita da semente global/consistente de primeiro envio em `useDraftConfigControl` + `SessionPane` também escreve no global ao trocar no meio da sessão + 4 testes unitários.
- [~] **Phase 2 — fallback/posicionamento automático (slice1+2 concluídos)**: slice1 exibição no gatilho (placeholder "选择模型" para `<synthetic>`/modelo indisponível, `resolveModelSelectTriggerDisplay`); slice2 auto-cura de modelo inválido no estado de sessão trocando para o primeiro disponível (função pura `resolveV4ModelAutoFallback` com 8 testes unitários + effect na toolbar, exclusão durante a hidratação de entitlement + guard antideflutuação). **slice3 (seleção automática do primeiro modelo após o login) deferred** (o v4 não tem o evento de login; `resolveLoginProviderFirstModel` já existe, será conectado quando a face de login for v4-izada).
- [ ] Phase 4c — usage breakdown/cache-hit + painel de consumo
- [~] **Phase 1 — resolução de provider/credenciais no CLI (núcleo concluído, `c9c67b061`)**: 1c híbrido, a host capability de overlay do CLI (setModelCatalogOverlay→setModel, sem ponte) habilita a troca entre providers; 4 novos testes L2 + gate sem ponte verde. **Itens de fechamento**: 1a re-push/resend no lado do app com edge fallback + e2e (ver `m6-p1-runtime-model-resolution.md §7`).
- [ ] Phase 4b — troca do modo de conexão (depende de P1)
- [~] **Phase 5 — polish**: manage-models e bloqueio durante execução concluídos; correção da identidade/fonte única da exibição do gatilho de modelo concluída; os demais polish aguardam fechamento.

### Pendências / acompanhamento
- Phase 3 já cobre: seleção no draft/troca no meio da sessão → escrita no global; novo draft → replay da semente (entre workspaces). **e2e pendente** (após trocar de workspace o modelo do ZCode-Agent continua sendo a última seleção global); atualizar primeiro o case catalog + coverage matrix.
- A isenção de team-plan da Phase 4a depende de `modelProviderFamilySelectedKeys` do `useSettings` (face de config que sobrevive); a troca do modo de conexão em si pertence à Phase 4b.
