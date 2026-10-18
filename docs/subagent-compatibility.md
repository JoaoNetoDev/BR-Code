# Especificação de compatibilidade de Subagent com Claude Code

## Atualização de 2026-09-14 sobre o suporte ao diretório de Agents

O contrato atual de carregamento do diretório está em [Agent listing attachment](subagent-listing-attachment.md): o diretório
migrou da descrição de ferramenta para o attachment `agent_listing_delta` (projetado como MCS ou user reminder conforme a capacidade e a posição), e após a compactação ele é preenchido de volta conforme o histórico retido.
Uma entrada de definitions somente leitura reserva espaço para futuras adições/remoções; o carregamento existente, a prioridade de sobrescrita e o snapshot de execução mantêm o contrato original.

> **Estado atual**: as regras de runtime alias continuam válidas; a compatibilidade de histórico da UI foi migrada para a adaptação de tool row da V4 e o renderer ToolCall unificado.

## Contexto

O nome da ferramenta de agendamento de subagentes do ZCode é `Agent`; no ecossistema de plugins do Claude Code o nome da ferramenta de agendamento de subagentes é `Task`. Documentos de skill de plugins `.claude-plugin` como o Superpowers exigem diretamente que o modelo chame `Task`; se apenas se acrescentar um trecho de prompt de mapeamento no `SessionStart`, o modelo, o hook matcher, a recuperação de tarefas em background e a projeção da UI continuarão cada um com uma interpretação inconsistente.

Por isso, o objetivo de compatibilidade do ZCode é conectar `Task` como um alias estruturado de runtime, e não aplicar um patch de texto a um plugin específico. O `tools[]` visível ao provider voltado a modelos first-party continua expondo apenas o `Agent` canônico; `Task` é usado apenas em chamadas históricas, hook matcher e compatibilidade interna.

## Princípios de compatibilidade

- `Agent` é a ferramenta canônica de subagent do ZCode.
- `Task` é um runtime alias de compatibilidade com Claude Code; por baixo, delega ao handler de `Agent`, mas por padrão não entra no `tools[]` visível ao provider.
- Ambos compartilham schema de entrada/saída, capacidades de permissão, orçamento de resultado, timeout, cancellation e política de trace.
- A camada de compatibilidade não pode alterar o trajeto real de chamada de ferramenta: quando o modelo chama `Agent`, o hook input continua sendo `Agent`; quando o modelo chama `Task`, o hook input continua sendo `Task`.
- Não injetar o mapeamento de ferramentas via additional context exclusivo do Superpowers; todos os plugins do Claude Code reutilizam o mesmo conjunto de compatibilidade de runtime.

## Registro de ferramentas

`Task` é registrado como um `ToolEntry` independente, mas reutiliza o handler e as declarações de runtime de `agentToolEntry`; `ToolRegistry.toContracts()` filtra aliases com `providerVisible: false`. A fronteira de registro é idêntica à de `Agent`:

- O runtime pai só registra a runtime entry de `Agent` / `Task` quando existe `subagentPort`.
- Sem capacidade de subagent, nenhuma das duas runtime entries é registrada, evitando que chamadas históricas/internas cheguem a uma ferramenta não executável.
- O `tools[]` visível ao provider contém apenas `Agent`, nunca `Task`.
- A allowlist continua filtrando pelo nome real da ferramenta; uma allowlist explícita que não inclua `Task` não libera `Task` extra.

Principais pontos de implementação:

- `apps/zcode-cli/packages/core/src/tool/handlers/agent.ts`
- `apps/zcode-cli/packages/core/src/tool/handlers/index.ts`
- `apps/zcode-cli/packages/core/src/tool/compat.ts`

## Anti-recursão no Runtime filho

O runtime de subagente filho atualmente proíbe criar subagents recursivamente. Antes apenas `Agent` era filtrado; ao adicionar `Task`, os dois devem ser tratados como a mesma classe de ferramenta de dispatch de subagent.

Regras:

- Com `allowedTools: ["*"]`, herda-se a lista de ferramentas disponíveis do pai, mas filtrando `Agent` / `Task`.
- Quando há `disallowedTools`, primeiro se filtra as ferramentas de dispatch de subagent e só então se aplica o disallow.
- Um `allowedTools` explícito não estende aliases; o próprio runtime filho não registra `Agent` / `Task`, então mesmo que o profile os escreva por engano eles não ficam disponíveis.
- O runtime filho não expõe `EnterPlanMode` / `ExitPlanMode`. A razão é que o subagent não tem uma superfície confiável de retomada de aprovação do usuário; se o submodelo entra em plan mode, `ExitPlanMode` vai solicitar confirmação do usuário e pode deixar o turno pai esperando para sempre. Essa limitação deve ser aplicada uniformemente na camada de provider-visible tool list do filho, cobrindo o `general-purpose` e o `Explore` embutidos, o `tools: ["*"]` de profiles customizados e `tools` explícito.

Principais pontos de implementação:

- `apps/zcode-cli/packages/core/src/runtime/methods/subagent.ts`
- `apps/zcode-cli/packages/core/src/tool/compat.ts`

## Compatibilidade de Hook Matcher

Hooks de plugins do Claude Code podem escrever `matcher: "Task"`, enquanto a chamada nativa do ZCode ainda pode ser `Agent`. O hook runner do ZCode suporta um `matchValue` real mais um conjunto de `matchValues` de compatibilidade:

- Uma chamada `Agent` casa com o matcher `Agent` e com o matcher `Task`.
- Uma chamada `Task` casa com o matcher `Task` e com o matcher `Agent`.
- O `toolName` no stdin do hook sempre preserva o nome real da ferramenta que ocorreu.
- Outros eventos de hook não são afetados; sem alias, o matching continua por matcher único.

Principais pontos de implementação:

- `apps/zcode-cli/packages/core/src/hooks/types.ts`
- `apps/zcode-cli/packages/core/src/hooks/runner.ts`
- `apps/zcode-cli/packages/core/src/tool/executor/hook-flow.ts`
- `apps/zcode-cli/packages/core/src/tool/compat.ts`

## Tarefas em background e permissões

O `run_in_background` de `Agent` retorna `async_launched`, e o rastreamento de tarefas em background precisa tratar `Task` como a mesma classe de subagent task:

- O async launch de `Task` recupera o snapshot via `subagentPort.getTask`.
- `Task` não passa pelo cancel de background de execução comum; assim como `Agent`, é gerenciado pelo ciclo de vida do subagente.
- O permission service / scheduler classifica `Task` como ferramenta de subagent read-only, de baixo risco e de escopo de sessão; a declaração de permissão continua vindo do `agentToolEntry.permission` compartilhado.
- `run_in_background` é uma capacidade fixa de `Agent` / `Task`: ao solicitar execução em background, retorna `async_launched` diretamente e entra no ciclo de vida do snapshot de background; a execução em foreground pode entrar automaticamente no mesmo caminho de background via `subagents.autoBackgroundMs` após um timeout.

Principais pontos de implementação:

- `apps/zcode-cli/packages/core/src/tool/executor/background-tasks.ts`
- `apps/zcode-cli/packages/core/src/permission/service.ts`
- `apps/zcode-cli/packages/core/src/tool/scheduler.ts`

## UI e dados históricos

A camada App/UI precisa reconhecer simultaneamente o `Task` vigente e as projeções históricas de ZCode Agent:

- `packages/shared/src/tool-identity.ts` classifica `Task` na family `agent`.
- A camada de services e a normalização de mensagens da UI aceitam `Task` ao parsear o resultado de agent activity.
- `packages/ui/src/lib/toolIdentity.ts` mantém o fallback legacy: em dados históricos, `kind: "think"` + `title: "Task"` continua sendo legacy agent identity e não pode ser promovido indevidamente a não-legacy só porque `Task` passou a ser um nome de ferramenta vigente.

Principais pontos de implementação:

- `packages/shared/src/tool-identity.ts`
- `packages/services/src/zcode-agent/zcodeTaskServiceAdapter.ts`
- `packages/ui/src/v4/toolCallRowAdapter.ts`
- `packages/ui/src/ToolCallBlocks.tsx`
- `packages/ui/src/lib/toolIdentity.ts`

## Matriz de testes

Cobertura chave de regressão:

- `apps/zcode-cli/packages/core/tests/tool-contracts.test.ts`: `Agent` / `Task` só são registrados quando a subagent port está disponível, e compartilham handler/schema/permissão; os contracts visíveis ao provider contêm apenas `Agent`.
- `apps/zcode-cli/packages/core/tests/tool-hook-context.test.ts`: o alias de hook matcher entre `Agent` / `Task` casa nos dois sentidos, e o hook input não é reescrito.
- `apps/zcode-cli/packages/core/tests/main-tool-pool.test.ts`: o runtime pai tem a capacidade de runtime `Agent`, e `Task` é mantido apenas como alias não visível ao provider.
- `apps/zcode-cli/packages/core/tests/subagent-explore.test.ts`: o runtime filho não expõe `Agent` / `Task`.
- `apps/zcode-cli/packages/core/tests/tool-executor-trace.test.ts`: o `SessionStart` do Superpowers não adiciona mais mapeamento de ferramentas exclusivo.
- `packages/ui/test/toolIdentity.test.ts`: a fronteira entre o `Task` vigente e a projeção legacy `title: "Task"` não se mistura.

## Regras de extensão

Ao adicionar um novo alias de compatibilidade de ferramenta do Claude Code, é obrigatório verificar simultaneamente:

- se o registro da ferramenta deve expô-la como uma ferramenta real visível ao provider, ou apenas como runtime alias.
- se o hook matcher precisa de alias, mas o hook input ainda deve manter o nome real da ferramenta.
- se a allowlist / disallowlist do runtime filho precisa filtrar recursão ou capacidades perigosas.
- se tarefas em background, permission e scheduler tratam a tool family da mesma forma.
- se a identity de shared/UI pode atingir por engano dados de projeção histórica.
- se é preciso atualizar `docs/plugin-hooks-compat.md` e o spec do plugin específico.