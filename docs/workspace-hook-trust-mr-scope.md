# Escopo de alterações do MR 2028: Workspace Hook Trust v2 (feat/hook-trust-v2 → staging)

**Total**: 21 commits / 196 files / +25.700 −1.225 (com base em origin/staging).

## 0. O que este MR faz

Workspace Hook Trust = mecanismo de confiança/admissão de Hook em nível de workspace (portão suave). Cadeia de ataque de fundo: deep link externo → abertura de um workspace malicioso → o hook SessionStart declarado na configuração do projeto executa automaticamente comandos locais. A correção anterior havia removido os hooks de projeto da configuração executável (ignorados sempre); este MR constrói sobre isso um sistema de confiança completo e restaura a usabilidade dos hooks de projeto:

- As declarações de hooks de projeto são normalizadas em um `HookBundleSnapshot` imutável, com `hookDeclarationDigest` calculado item a item;
- A Trust persistente usa `workspaceIdentity + hookDeclarationDigest` como chave em um trust store do lado do usuário (`~/.zcode/security/workspace-hook-trust-v1.json`; o arquivo do workspace não pode se autoconceder confiança);
- **Portão suave**: um hook não confiável não bloqueia o turn — ele é pulado nesta rodada e `HookRunBlocked` é reportado, e um banner pending aparece na base do chat; o usuário clica em "信任" item a item em `设置 → 钩子`; a confiança só vale para eventos naturais futuros, e um SessionStart já pulado não é reexecutado; mudança na semântica da declaração → mudança no digest → a Trust antiga expira;
- managed policy deny tem prioridade; sem capable host, store corrompido ou snapshot incompatível, tudo é fail-closed;
- headless/CLI opera por `zcode hooks trust status|grant|revoke`.

Spec autoritativo de semântica: `docs/specs/workspace-hook-trust-persistent-only.md` (v2 mantém apenas uma forma de autorização, a Trust persistente item a item sobre a declaração exata, removendo as autorizações polimórficas allow_once/trust_all/keep_blocked do v1).

## 1. Visão geral das camadas alteradas

```
┌─ UI ─────────────────────────────────────────────────────────────┐
│ 设置→钩子 行内[信任]按钮+锁定开关 · pending banner · review store  │  27 files
├─ Services ───────────────────────────────────────────────────────┤
│ hooksService 读取 trust store（完整 schema 同判）· 设置数据模型   │  18 files
├─ Shared ─────────────────────────────────────────────────────────┤
│ v4 协议投影 workspaceHookAdmission/review · discovery · store     │  30 files
│ 文件 schema（单源权威，contracts re-export）                      │
├─ Bootstrap（apps/zcode-cli）─────────────────────────────────────┤
│ app 装配 · review controller/supervisor · pretrust RPC ·         │  46 files
│ CLI status/grant/revoke · v4 commands handlers                   │
├─ Core ───────────────────────────────────────────────────────────┤
│ 信任域（digest/records/evaluation）· coordinator · runtime        │  31 files
│ admission（软门禁+HookRunBlocked）· review flow · policy/telemetry│
├─ Contracts / Adapters / CLI ─────────────────────────────────────┤
│ trust store 文件/记录/decision schema · 原子持久化（rename 重试） │  26 files
│ · zcode hooks trust 命令                                         │
├─ Desktop E2E ────────────────────────────────────────────────────┤
│ HK05–HK07 manual-review pending spec + fixture + wdio 冷启动接线  │   3 files
├─ Docs / Scripts ─────────────────────────────────────────────────┤
│ 主 spec/persistent-only/soft-gate · 用户指南 · 人工验收 ·         │  13 files
│ UAT fixture 生成器 · coverage matrix · 改动范围文档               │
└──────────────────────────────────────────────────────────────────┘
```

## 2. Detalhes por módulo

| Módulo | Escala | Conteúdo principal |
| --- | --- | --- |
| **bootstrap** | 46 files +6.879−337 | `requestReview` como única entrada de produção do review flow (controller L607: reuse do flow/supervisor/fila serial/deadline de fechamento); RPC de pretrust de Settings em nível de workspace (novo no v2, sem cenário de session, gravado em disco após validar a managed policy); lógica de domínio da CLI `zcode hooks trust` (o status expõe explicitamente `workspace_hooks_trust_store_corrupt` para store corrupt); conexão dos v4 protocol commands |
| **core** | 31 files +3.480−358 | O trio do domínio de confiança (types/domain/records); `evaluateWorkspaceHookEntry` (`effectiveRunnable = admitted && configuredEnabled && policy != deny`); coordinator por workspace (security revision, assinatura de policy); admission do runtime (relatório de pending `{pendingCount,bundleDigest,workspaceIdentity}`); portão suave do runner emitindo `HookRunBlocked` (reasonCode `workspace_hooks_pending_trust`, sem bloquear o turn) |
| **shared** | 30 files +2.625−55 | Protocolo v4: `zcode-protocol-v4/workspace-hook-review` (decision/target/payload), campos incrementais de snapshot/delta `workspaceHookAdmission` (additive, default null); alinhamento do discovery; **fonte única do schema de arquivo do store** `workspace-hook-trust-store-file.ts` (ponto de correção de CR-01) |
| **ui** | 27 files +2.524−103 | `HooksSection`/`HooksList` com interação de confiança em linha (linhas não confiáveis: botão [信任] + Switch de bloqueio desligado, sem badge de estado e sem ações em massa); `useWorkspaceHookInlineTrust` (o RPC precisa ser roteado ao host do workspace alvo, evitando ultrapassar a fronteira); `WorkspaceHookPendingBanner` ([去审核]/[忽略], sendo o ignorar um dismiss local do renderer); review store; mapeamento reasonCode→i18n |
| **services** | 18 files +1.575−240 | `hooksService` lê a configuração do workspace + o trust store (estado final do v2: schema strict completo, com o mesmo julgamento do runtime/adapters; distinção do ENOENT assíncrono); modelo de settings de hooks do workspace (discovery→linha da UI); relatório de trust store corrupt `trustStoreCorrupt` |
| **adapters** | 11 files +1.432−83 | Trust store em arquivo: escrita atômica (temp+fsync+rename, com retry limitado para EPERM/EBUSY no Windows), file lock + limpeza de stale, recuperação de corrupt por renomeação (`*.corrupt-<ts>`), rejeição de array vazio em revoke, compact |
| **contracts** | 6 files +724−2 | Schema de digest v1, review timeout, `WorkspaceHookTrustState`/classes de admission/enum de reasonCode, schema de estado efetivo, schema de bundle snapshot, review flow state, schema de arquivo do store (agora re-export do shared), schema de policy |
| **cli** | 9 files +610−20 | Comandos `zcode hooks trust status|review|grant|revoke` (--workspace/--hook-digest/--all-current/--bundle-digest/--json); saída human com orientação de grant quando há pending e de recuperação quando há corrupt |
| **desktop** | 5 files | e2e oficial HK05–HK07 + helper de fixture + conexão de cold start no wdio.conf + fixture/manifest de provider local ao caso |
| **docs** | 13 files +5.005−27 | Spec principal `workspace-hook-trust.md`, spec autoritativo de semântica `workspace-hook-trust-persistent-only.md`, design do portão suave `workspace-hook-trust-soft-gate.md`, guia do usuário (incluindo recuperação de corrupt), manual de aceitação manual, catálogo de casos de conversation-session (HK05–07) + coverage matrix, documento de escopo de alterações (este arquivo) |
| **scripts** | 1 file +258 | `create-workspace-hook-trust-uat-fixture.mjs`: gera um workspace de UAT inofensivo (3 declarações + executions.jsonl recorder), com `--verify` contra drift no local |
| **raiz/outros** | 2 files +137 | `pnpm-lock.yaml` (contracts ganha a dependência workspace `@zcode/shared`); `.agents/skills/feature-boundary-planner/references/zcode-feature-graph.yaml` (registro no grafo de features) |

## 3. Decisões de design principais

1. **v2 = persistent-only** (`141ebf7bda`): removida a máquina de estados de autorizações polimórficas do v1 (allow_once/trust_all/keep_blocked/decisão automática por timeout/reexecução do SessionStart/painel de revisão independente), mantendo apenas a Trust persistente exata e item a item. O contrato de decisão converge para `{ action: "trust_selected"; reviewItemIds }`.
2. **Fonte única do schema do trust store** (CR-01): o schema desceu para `@zcode/shared` (zod4), com re-export em contracts (sem composição de referências no lado zod3), e services/runtime/CLI julgam o mesmo arquivo igualmente — erro de sintaxe JSON e estrutura inválida (schemaVersion/campos obrigatórios ausentes, decision/timestamp inválidos, campos desconhecidos) são corrupt com fail-closed, e sob corrupt nenhum trusted_persistent é exibido.
3. **Semântica do portão suave**: hook não confiável é pulado nesta rodada + `HookRunBlocked` (sem se passar por `HookRunFailed`), e o turn não para esperando; a confiança só vale para eventos naturais futuros; o ignorar do banner é comportamento local do renderer (key = sessionId+bundleDigest) e não gera mutação de Trust.
4. **Isolamento por workspaceIdentity em toda a cadeia**: trust key, review binding, pretrust RPC e dedupe de cache usam `workspaceIdentity` como critério (com fallback local para workspacePath); um workspace remoto não pode se tornar um canal local de submissão por fallback de path.

## 4. Estado de testes e validação

| Camada | Evidência |
| --- | --- |
| Testes unitários/integração | 2.800+ casos: cobertura total de contracts/core/adapters/bootstrap/cli/services/shared/ui (incluindo 9 casos de parity do CR-01 indo de vermelho a verde, 12 casos de amostra de schema corrompido, e sequenciamento/concorrência/superseded do review controller) |
| E2E desktop | Spec manual-review pending HK05–HK07, replay em macOS 3/3 aprovado (`desktop-e2e-20260817093717062-p95687-5fe4ae6a35334d65`, reexecutado após a integração no staging) |
| typecheck/lint | shared/services/contracts/bootstrap/cli + desktop, tudo aprovado |
| Aceitação manual | `docs/testing/workspace-hook-trust-manual-acceptance.md` (UAT-01~05) + script de fixture UAT |

**Validações pendentes** (acompanhar após a integração):

- Windows: retry de rename do trust store, shards de e2e Docker admit / CI (`run-windows-e2e-shards.mjs`).
- Os specs de e2e, após review manual, devem passar por `e2e:promote` para o diretório oficial e atualizar o caminho na matrix.
- Os 6 testes unitários já falhando no upstream de staging (appARMSBootstrap minified pattern / asserções de base de feedback / mock de onRuntimeLifecycle) não têm relação com este MR e precisam ser corrigidos separadamente.

## 4.5 Correção de concorrência v4 acompanhante (nota de revisão)

Existe no MR uma alteração v4 de outro domínio, mas com acoplamento lógico, declarada explicitamente aqui para ciência da revisão:

**Semântica de incerteza de turn-start em prompt-turn.ts / queue.ts** (+133/−81 e +31):

- Novo sinalizador `turnStartUncertain` e o reasonCode `fault.command.turnStartProjectionCommitFailed`; o sendQueuedNow de `queue.ts`, quando a promoção falha e a falha é de incerteza, **mantém promoting e não faz rollback para queued** — um TurnStarted canônico tardio, se concorrente com o retry, formaria mensagens duplicadas.
- Associação lógica com o portão suave: o portão suave exige que o turn "nunca pare esperando revisão", e o caminho de pulo do hook pending compartilha com o início do turn a mesma sequência de submissão de authority/projection; a janela de concorrência exposta pela injeção de exceção no admission pertence à mesma cadeia de submissão e não pode ser removida de forma limpa (remover exigiria reescrever o histórico e rebasear todos os commits seguintes).
- Sugestão de revisão: tratar como uma correção independente de corretude de concorrência; o foco é o ramo `isPromptTurnStartUncertainFailure` de queue.ts (mantém promoting) e a avaliação `isTurnStartAuthorityObserved` de prompt-turn.ts.

**fork-edit-retry.ts**: o ruído de reordenação do prettier que tinha se misturado (+24/−57 com zero mudança semântica) foi revertido para a versão do staging e não aparece mais no diff do MR.

## 5. Nota de compatibilidade

- Todos os incrementos de protocolo são additive (novos campos default null em snapshot/delta do v4), e clientes antigos podem ignorá-los.
- Para usuários que já têm zcode.json/.zcode/config.json, após a atualização o hook de projeto passa de "ignorado pela política de segurança" para "portão suave aguardando confiança" e, na primeira vez, a página de settings mostra a entrada de confiança item a item — mudança de comportamento esperada e com orientação por banner.
- Cadeias desktop continuous e mobile replayable: a decisão de trust acontece na camada compartilhada de runtime/services, sem alteração da semântica de stream/snapshot/fila/owner; o celular usa o mesmo RPC de review e o mesmo trust store.