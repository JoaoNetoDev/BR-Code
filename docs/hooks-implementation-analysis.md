# Estado atual da implementação de Hooks no ZCode

> Finalidade do documento: permitir que quem vier depois entenda rapidamente a arquitetura em camadas dos hooks do
> ZCode, as capacidades já suportadas e as lacunas conhecidas com suas direções de evolução.
>
> Atualizado em: 2026-07-10
> Especificações relacionadas: `docs/plugin-hooks-compat.md`, `apps/zcode-cli/docs/design/v2/hooks.md`

---

## 1. Camadas da arquitetura (leitura obrigatória)

Os hooks do ZCode **não são um módulo único**: eles são divididos em duas camadas, cujo comportamento pode ser
inconsistente:

| Camada                | Caminho                                                                                                   | Responsabilidade                                        | Executa de fato?                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------- |
| **Camada UI / config** | `packages/services/src/hooks/hooksService.ts`<br>`packages/ui/src/store/hooksStore.ts`                    | Ler, exibir, editar e gravar a configuração de hooks     | Entra em vigor via `.zcode/config.json` |
| **Camada CLI Runtime** | `apps/zcode-cli/packages/core/src/hooks/`<br>`apps/zcode-cli/packages/core/src/runtime/methods/hooks.ts`  | Disparar, executar e agregar decisões dentro do agent loop | **Sim**                         |

**Conclusão importante**: a camada UI consegue ler os hooks legados de `.claude/settings.json` /
`.agents/settings.json`, mas o **runtime não os executa automaticamente**; apenas hooks gravados em
`.zcode/config.json` ou injetados por **plugins habilitados** são executados na sessão.

---

## 2. Eventos suportados pelo Runtime (7)

Definição: `apps/zcode-cli/packages/contracts/src/hooks/index.ts`

| Event                | Ponto de disparo                                      | Pode bloquear                        | Entrada principal de código                                  |
| -------------------- | ----------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------ |
| `SessionStart`       | após a criação/resume da sessão, antes do 1º prompt     | Não (P0 ignora `continue:false`)     | `runtime/methods/hooks.ts` → `turn.ts` / `resume.ts`        |
| `UserPromptSubmit`   | quando a entrada do usuário entra no turn, antes de grava no histórico de mensagens | Sim | `runtime/methods/turn.ts`                                    |
| `PreToolUse`         | após a validação do schema de input da tool, antes do permission check | Sim  | `tool/executor/hook-flow.ts`                                |
| `PermissionRequest`  | quando a permission retorna `ask`, antes da UI do broker | Sim                                | `tool/executor/hook-flow.ts`                                |
| `PostToolUse`        | após o sucesso da tool, antes de serializar o resultado para o modelo | Não  | `tool/executor/hook-flow.ts`                                |
| `PostToolUseFailure` | após a falha da tool                                   | Não                                  | `tool/executor/hook-flow.ts`                                |
| `Stop`               | antes de o turn ser concluído                         | Sim (pode continuar, limite de 3 vezes) | `runtime/methods/turn-stop.ts`                            |

Valores do matcher `source` de `SessionStart`: `startup | resume | clear | compact`.

---

## 3. Tipos de hook

| Tipo                    | Suportado pelo Runtime | Descrição                                                       |
| ----------------------- | ---------------------- | --------------------------------------------------------------- |
| `process`               | ✅                     | Forma argv: `command` + `args[]`, executada via `ExecutionPort`, **sem shell por padrão** |
| `command`               | ✅                     | String de shell, por compatibilidade com plugins do Claude (como o `run-hook.cmd` do superpowers) |
| `prompt`                | ❌                     | Hook avaliado por LLM                                            |
| `agent`                 | ❌                     | Hook verificador agentic                                         |
| `http`                  | ❌                     | Hook de HTTP POST                                                |
| `callback` / `function` | ⚠️ apenas testes/SDK   | Callbacks em memória do `InMemoryHookRunner`, não uma forma de configuração persistida pelo usuário |

Ponto de entrada da implementação: `apps/zcode-cli/packages/core/src/hooks/configured-runner.ts`

---

## 4. Origens da configuração e ordem de merge

### 4.1 Configuração em vigor no Runtime

1. **Nível de usuário**: `~/.zcode/cli/config.json` → campo `hooks`
2. **Nível de projeto**: `<workspace>/.zcode/config.json` → campo `hooks`
3. **Nível de plugin**: `hooks/hooks.json` de plugins habilitados ou campo `hooks` do manifest

Lógica de merge: `mergeRuntimeHooks()` em `apps/zcode-cli/packages/bootstrap/src/app/runtime-config.ts`
→ os hooks de usuário/projeto vêm primeiro, e os **hooks de plugin são adicionados depois**.

A especificação de descoberta de plugins está em `docs/plugin-hooks-compat.md`:

- prioridade de manifest: `.zcode-plugin` > `.claude-plugin` > `.codex-plugin`
- o caminho padrão `hooks/hooks.json` é carregado automaticamente
- event desconhecido gera warning e não bloqueia o carregamento do plugin

### 4.2 Origens na página de Settings e escrita de volta

`hooksService.loadHooks()` lê na ordem:

```
project: .zcode → .agents → .claude
user:    .zcode → .agents → .claude
```

Comportamento por origem:

- Nativo do ZCode: `process` / `command` são ambos editáveis, com liga/desliga por entrada, e são gravados de volta
  separadamente no `.zcode/config.json` de usuário/projeto correspondente.
- Claude/Agents legados: exibidos como import-only, com estado disabled; a importação em um clique copia como um hook
  ZCode do mesmo escopo e nunca executa nem grava de volta o arquivo legado silenciosamente.
- Plugins: a página de Settings exibe, somente para leitura a partir do plugin runtime catalog, o nome do plugin, os
  eventos, o matcher, o comando e o estado de habilitação do plugin; a entrada de liga/desliga continua pertencendo à
  página de gerenciamento de plugins.

Modificar um Hook invalida a draft session que ainda não foi iniciada; sessões em execução ou que já possuem histórico
mantêm a semântica de snapshot da configuração.

---

## 5. Modelo de execução

```text
Hook disparado
  → InMemoryHookRunner.run()
    → correspondência por regex do matcher (sem matcher = corresponde a tudo)
    → execução seriada dos hooks correspondentes
      → stdin: HookInput JSON (camelCase + campos compatíveis com o snake_case do Claude)
      → ExecutionPort: process(argv) ou command(shell)
      → stdout: parseado como HookJSONOutput
      → processHookOutput() agrega a decisão
  → injeta additionalContext / bloqueia / modifica o input da tool
```

### 5.1 Campos usados na correspondência do matcher

| Event                                                                     | `matchValue`                          |
| ------------------------------------------------------------------------- | ------------------------------------- |
| `PreToolUse` / `PermissionRequest` / `PostToolUse` / `PostToolUseFailure` | `toolName`                            |
| `UserPromptSubmit`                                                        | sem query; executa todos os grupos de matcher desse event |
| `SessionStart`                                                            | `source`                              |
| `Stop`                                                                    | sem query; executa todos os grupos de matcher desse event |

Implementação: `matchesHookMatcher()` em `apps/zcode-cli/packages/core/src/hooks/output.ts`. O padrão simples `A|B`
usa correspondência exata de opções, `*` corresponde a tudo e outras strings são tratadas como regex; nomes de tool
também suportam alias de compatibilidade.

### 5.2 Contrato de stdin / stdout

- **stdin**: `HookInput` estruturado; eventos de tool preservam `toolName` / `toolInput` / `toolCallId` e completam os
  alias de compatibilidade do Claude `tool_name` / `tool_input` / `tool_use_id`; todos os eventos carregam o
  `transcript_path` / `transcriptPath` temporário; `PostToolUse` traz o `tool_response` completo, e o `error` dos
  eventos de falha é sempre string e vem com `is_interrupt`
- **stdout**: saída vazia ou texto não-JSON é tratada como diagnostic de sucesso; a saída JSON valida os campos
  conhecidos e ignora os desconhecidos
- **exit code 0**: normal, faz o parse do stdout
- **exit code 2**: bloqueia (PreToolUse / PermissionRequest / UserPromptSubmit; a semântica de continue do Stop é
  contada à parte)
- **outros exit code**: erro não bloqueante, registrado como diagnostic

A projeção de entrada compatível com o Claude está concentrada em `configured-runner-input.ts`, evitando a divergência de
campos que ocorreria se cada evento montasse a sua própria entrada.

### 5.3 Variáveis de ambiente e substituição de templates

Injetadas no subprocesso (trecho):

- `ZCODE_SESSION_ID` / `CLAUDE_SESSION_ID` / `CLAUDE_CODE_SESSION_ID`
- `ZCODE_PROJECT_DIR` / `CLAUDE_PROJECT_DIR`
- plugins: `ZCODE_PLUGIN_ROOT`, `ZCODE_PLUGIN_DATA`, `ZCODE_PLUGIN_ID`, `ZCODE_PLUGIN_NAME`
- compatibilidade: `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`

Strings de comando suportam substituição de template como `${ZCODE_PLUGIN_ROOT}`; `${CLAUDE_SKILL_DIR}` /
`${ZCODE_SKILL_DIR}`, sem contexto de skill, geram erro explícito.

### 5.4 Agregação de decisões

Prioridade: **deny/block > ask > allow > passthrough**

- múltiplos `updatedInput`: por ordem de execução, **o último input alternativo completo e válido** prevalece
- múltiplos `additionalContext`: concatenados em ordem, sujeitos a orçamento (limite de injeção de lifecycle de
  aproximadamente 24k caracteres)
- continue do `Stop`: no máximo 3 vezes seguidas (`MAX_STOP_HOOK_CONTINUATIONS`)

### 5.5 Observabilidade

Session events (`HookRunStarted` / `Completed` / `Failed` / `Blocked`) são emitidos via `InMemoryHookRunner`.
Additional context de lifecycle é injetado no histórico de mensagens como attachment `hook_context`.
`command.async:true` é executado em fire-and-forget e o turn atual não aguarda sua saída; ao concluir ou falhar, o
lifecycle event ainda é emitido.

---

## 6. Capacidades de saída de hooks (já suportadas pelo ZCode)

### 6.1 Campos comuns

- `continue`, `reason` / `stopReason`
- `additionalContext`, `additional_context` (alias snake_case é normalizado)
- `suppressOutput`, `systemMessage`
- `hookSpecificOutput` (ramificado por `hookEventName`)

### 6.2 Campos específicos por evento

| Event                                | Capacidade de saída                                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `PreToolUse`                         | `permissionDecision` (allow/ask/deny), `permissionDecisionReason`, `updatedInput`, `additionalContext` |
| `PermissionRequest`                  | `decision.behavior` (allow/deny), `updatedInput`, `permissionUpdates`                                  |
| `UserPromptSubmit`                   | `additionalContext`; `continue:false` bloqueia o prompt                                               |
| `SessionStart`                       | `additionalContext`                                                                                   |
| `PostToolUse` / `PostToolUseFailure` | `additionalContext`                                                                                   |
| `Stop`                               | `additionalContext`; `continue:true` + context continua a execução; compatível com `decision:"block"`   |

### 6.3 Campos de saída ainda não suportados

- `updatedMCPToolOutput`
- `initialUserMessage`
- `watchPaths` (integração com FileChanged / CwdChanged)
- `WorktreeCreate.worktreePath`
- `action` / `content` relacionados a Elicitation
- `PermissionDenied.retry`

---

## 7. Pontos de compatibilidade com plugins

Para compatibilizar os hooks dos plugins do Claude Marketplace, o ZCode cobre os seguintes pontos:

- semântica dos 7 eventos centrais e objetivo de design da prioridade de decisão
- hook `command` + variáveis de ambiente / templates de caminho do Claude
- `SessionStart` → `additionalContext` → injeção de `hook_context`
- compatibilidade de `Stop` + `transcript_path` (ralph-loop e similares)
- descoberta e merge de `hooks/hooks.json` de plugin
- estrutura principal de `hookSpecificOutput`
- semântica de bloqueio do exit code 2 (caminhos de tool / permission / prompt)
- diagnostic de stdout não-JSON e ignorância de campos JSON desconhecidos
- `PostToolUse.tool_response`, error string de falha / `is_interrupt`
- fire-and-forget de `command.async:true`

---

## 8. Lacunas e riscos conhecidos

### 8.1 Limites de experiência do usuário

A página de Settings separa explicitamente "Hooks configurados", "Configuração compatível" e "Hooks de plugin": apenas a
configuração nativa do ZCode e os plugins habilitados entram no runtime; a configuração legada precisa ser importada
explicitamente pelo usuário. Alterações na página de Settings afetam as drafts novas ou ainda não iniciadas e não fazem
hot reload na sessão em execução.

### 8.2 Lacunas funcionais (ordenadas de forma aproximada por prioridade)

| Prioridade | Lacuna                                                    | Descrição                            |
| ---------- | --------------------------------------------------------- | ------------------------------------ |
| P1 ecossistema | `PreCompact` / `PostCompact`                         | integração com a compactação de contexto |
| P1 ecossistema | `SubagentStart` / `SubagentStop`                       | dependência de plugins no cenário de subagent |
| P1 ecossistema | `SessionEnd`                                           | hooks de limpeza/relato               |
| P2         | tipos de hook `prompt` / `agent` / `http`               | formas avançadas de hook             |
| P2         | pré-filtragem `asyncRewake` / `once` / `if`              | refinamento de performance e segurança |
| P2         | Config snapshot                                        | evitar drift de configuração na sessão |
| P3         | Notification / Elicitation / Worktree / FileChanged etc. | cobertura completa de eventos        |

O planejamento P1 do documento de design está em `apps/zcode-cli/docs/design/v2/hooks.md`.

### 8.3 Casos internos

Ao habilitar o session mailbox, o `AgentRuntime` registra hooks em memória adicionais
(`createSessionMailboxHookRegistrations`), que são um mecanismo interno e não hooks de configuração do usuário.

---

## 9. Índice de código clave

| Módulo                      | Caminho                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| Schemas de event / entrada e saída | `apps/zcode-cli/packages/contracts/src/hooks/index.ts`                                  |
| Hook runner                 | `apps/zcode-cli/packages/core/src/hooks/runner.ts`                                            |
| Adaptação de config → callback | `apps/zcode-cli/packages/core/src/hooks/configured-runner.ts`                               |
| Parse e agregação de saída | `apps/zcode-cli/packages/core/src/hooks/output.ts`                                            |
| Disparo de lifecycle        | `apps/zcode-cli/packages/core/src/runtime/methods/hooks.ts`                                   |
| Disparo na cadeia de tool   | `apps/zcode-cli/packages/core/src/tool/executor/hook-flow.ts`                                 |
| Merge de configuração do Runtime | `apps/zcode-cli/packages/bootstrap/src/app/runtime-config.ts`                             |
| Descoberta de hooks de plugin | `apps/zcode-cli/packages/adapters/src/plugins/index.ts`                                     |
| Leitura/gravação de config da UI | `packages/services/src/hooks/hooksService.ts`                                           |
| Tipos compartilhados (UI)   | `packages/shared/src/hooks.ts`                                                                |
| Especificação de compatibilidade de plugins | `docs/plugin-hooks-compat.md`                                                      |
| Design / aceitação v2       | `apps/zcode-cli/docs/design/v2/hooks.md`                                                      |
| Testes de contrato dos 7 eventos | `apps/zcode-cli/packages/core/tests/hooks-seven-events.test.ts`                          |
| E2E desktop completo        | `packages/desktop/test/e2e/conversation-session/conversation-session-hooks-lifecycle.test.ts` |

---

## 10. Sugestões de análise posterior

1. **Eventos Compact / Subagent**: verificar os plugins existentes e as dependências do marketplace para determinar o
   conjunto mínimo de eventos P1.
2. **async rewake**: só introduzir estado de registry/rewake quando algum plugin realmente depender de acordar o modelo
   após a conclusão em segundo plano.
3. **Segurança**: definir claramente a política de workspace trust e de habilitação explícita de hooks de projeto.
4. **Expansão da matriz de testes**: os 7 eventos centrais já estão cobertos; expandir incrementalmente com os novos
   eventos e as origens de alto risco, sem fazer um cruzamento completo sem benefício.

---

## 11. Comandos de teste de referência

```bash
# Testes unitários (lifecycle + tool hooks)
pnpm --filter @zcode/core test runtime-hooks
pnpm --filter @zcode/core test tool-hook-context

# hooksService + página de settings
pnpm exec vitest run packages/services/test/hooksService.test.ts packages/ui/test/hooksSection.test.ts

# Lifecycle desktop dos 7 eventos
pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts \
  --spec './test/e2e/conversation-session/conversation-session-hooks-lifecycle.test.ts'
```