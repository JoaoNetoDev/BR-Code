# Especificação de compatibilidade de Hooks de Plugin

## Contexto

O ZCode já suporta plugins oficiais, plugins inline, skills, commands, MCP server e hooks em nível de plugin. Plugins existentes, representados por `superpowers`, normalmente escrevem a injeção do contexto de inicialização em `hooks/hooks.json` e usam shell command hooks, variáveis do diretório raiz do plugin e a saída `additionalContext` do `SessionStart`.

Esta especificação define a fronteira de compatibilidade do ZCode para hooks de plugin, com o objetivo de tornar `.zcode-plugin/plugin.json` uma forma de primeira classe, mantendo compatibilidade com a ordem de descoberta de manifests de plugins Claude / Codex.

## Ordem de descoberta do Manifest

O manifest é procurado na raiz do plugin na seguinte ordem:

1. `.zcode-plugin/plugin.json`
2. `.claude-plugin/plugin.json`
3. `.codex-plugin/plugin.json`

`.zcode-plugin` sempre tem prioridade; quando um plugin externo contém simultaneamente manifest do Claude e do Codex, o manifest do Claude tem prioridade sobre o do Codex. Essa ordem é usada para ler os metadados do plugin, as declarações de skills / commands / MCP / hooks e o id do plugin.

## Descoberta de Hooks

Após habilitar um plugin, o ZCode coleta os hooks do plugin na etapa de descoberta de plugins e os mescla nos runtime hooks:

### Fronteira de confiança

- O Hook do plugin compartilha o estado de ativação do próprio plugin; após desabilitar o plugin, novas sessions não injetam mais seu Hook, e a página de configurações continua exibindo apenas em modo leitura as declarações.
- Plugins de marketplace de terceiros atualmente habilitados podem executar shell Hooks `command`, assim como plugins oficiais, e o subprocesso herda o
  ambiente do processo do Agent. Isso significa que "habilitar o plugin" também concede a ele a capacidade de executar comandos locais e de ler as variáveis de ambiente herdadas.
- A versão atual não possui um interruptor de confiança de Hook independente nem autorização de Hook por plugin. A origem da instalação, a revisão do código do plugin e a ativação/desativação do plugin são as
  fronteiras de segurança existentes; caso o workspace trust seja introduzido no futuro, ele deve ser aplicado de forma uniforme antes da injeção no runtime, e não apenas escondido na página de configurações.

- Leitura automática do local padrão `hooks/hooks.json`.
- Leitura do campo `hooks` do manifest como complemento; são suportados caminhos relativos de arquivo JSON, objetos de hooks inline ou um array com ambos.
- `hooks/hooks.json` usa a estrutura wrapper `{ "description"?: string, "hooks": { ... } }`.
- Hooks inline do manifest usam diretamente a estrutura `{ "SessionStart": [...] }`.
- O `hooks/hooks.json` padrão é carregado automaticamente; o manifest não deve apontar novamente para o mesmo arquivo — em caso de duplicata, um diagnóstico é registrado e o arquivo é ignorado.
- Somente hook events suportados pelo runtime atual do ZCode são carregados; events desconhecidos geram warning e não bloqueiam o carregamento do plugin.

Hooks de plugin só entram no runtime depois que o plugin é habilitado. Hooks de usuário/projeto são executados primeiro, hooks de plugin depois. A deduplicação de hooks entre plugins distintos precisa incluir a raiz do plugin, para evitar que múltiplos plugins usando os templates `${ZCODE_PLUGIN_ROOT}` ou `${CLAUDE_PLUGIN_ROOT}` se sobrescrevam.

## Tipos de Hook

O ZCode mantém o hook `process` existente e adiciona compatibilidade com o hook `command`:

- `process`: forma argv, `command` é o executável e `args` é o array de argumentos.
- `command`: forma de string de shell, `command` é entregue ao shell do sistema para execução.

O hook `command` suporta os campos:

- `command: string`
- `timeout?: number`, em segundos, compatível com a configuração de hooks do Claude.
- `timeoutMs?: number`, em milissegundos, usado internamente pelo ZCode com prioridade.
- `statusMessage?: string`
- `async?: boolean`

`async: true` usa semântica de fire-and-forget: o runtime inicia o comando e continua imediatamente, sem ler o stdout dele para decisão,
portanto um hook em segundo plano não pode bloquear, modificar entradas de ferramentas nem injetar contexto; conclusão e falha ainda emitem hook lifecycle events.

## Variáveis do Plugin

O subprocesso de um hook de plugin recebe as seguintes variáveis de ambiente injetadas:

- `ZCODE_PLUGIN_ROOT`: raiz de instalação do plugin atual.
- `ZCODE_PLUGIN_DATA`: diretório de dados persistentes do plugin atual.
- `ZCODE_PLUGIN_ID`: `<name>@<marketplace>`.
- `ZCODE_PLUGIN_NAME`: name do manifest do plugin.

Para compatibilidade com plugins existentes, as seguintes também são injetadas e substituídas:

- `CLAUDE_PLUGIN_ROOT`
- `CLAUDE_PLUGIN_DATA`

`${ZCODE_PLUGIN_ROOT}`, `${ZCODE_PLUGIN_DATA}`, `${CLAUDE_PLUGIN_ROOT}` e `${CLAUDE_PLUGIN_DATA}` em strings de comando são substituídos pelos caminhos correspondentes antes da execução. Os valores substituídos vêm do root / data path resolvidos na etapa de descoberta do plugin, e não do ambiente do usuário.

## Campos de compatibilidade no stdin do Hook

O runtime do ZCode continua usando internamente o `HookInput` em camelCase como contrato principal; o stdin recebido pelo subprocesso de um hook de plugin
precisa trazer adicionalmente os aliases snake_case comuns do Claude Marketplace, garantindo que scripts que só leem campos antigos possam
executar sem quebrar os campos próprios do ZCode:

| Campo do ZCode  | Alias compatível com Claude | Eventos aplicáveis                                                            | Descrição                                          |
| --------------- | --------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------- |
| `hookEventName` | `hook_event_name`           | Todos os eventos                                                               | Campo de compatibilidade já existente, mantido.  |
| `sessionId`     | `session_id`                | Todos os eventos                                                               | Campo de compatibilidade já existente, mantido.  |
| `toolName`      | `tool_name`                 | `PreToolUse` / `PermissionRequest` / `PostToolUse` / `PostToolUseFailure`       | Alias sem perdas.                                 |
| `toolInput`     | `tool_input`                | `PreToolUse` / `PermissionRequest` / `PostToolUse` / `PostToolUseFailure`       | Alias sem perdas, preserva a estrutura original da entrada. |
| `toolCallId`    | `tool_use_id`               | `PreToolUse` / `PermissionRequest` / `PostToolUse` / `PostToolUseFailure`       | Alias sem perdas, usa o tool call id atual do ZCode. |
| `toolResponse`  | `tool_response`             | `PostToolUse`                                                                  | Saída estruturada completa da ferramenta bem-sucedida. |
| `isInterrupt`   | `is_interrupt`              | `PostToolUseFailure`                                                           | Indica se o erro foi produzido por uma interrupção. |
| `transcriptPath` | `transcript_path`          | Todos os eventos                                                               | Caminho do arquivo de transcript temporário da session atual. |

`PostToolUse` também mantém o `toolResultPreview` do ZCode, mas scripts compatíveis com o Claude devem ler o
`tool_response` completo; o preview não substitui o resultado estruturado completo. `PostToolUseFailure.error` é sempre uma string para fora.

## Saída do Hook

O ZCode continua suportando o `hookSpecificOutput` padrão:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "..."
  }
}
```

Para compatibilidade com outros runtimes de plugin, também são aceitos:

- `additionalContext` no nível superior
- `additional_context` no formato de saída de hooks do Cursor

Esses dois campos são normalizados para o `additionalContext` do hook event atual e, em seguida, injetados no system reminder `hook_context` do runtime.

## Compatibilidade de ferramentas com Claude Code

Quando o ZCode é compatível com plugins do Claude Code, a conversão de nomes de ferramentas precisa acontecer na camada estruturada do runtime, e não por meio de acréscimo de textos de prompt a plugins individuais:

- `Task` é exposto como nome de ferramenta compatível com Claude Code, delegando por baixo ao subagent handler `Agent` do ZCode; ambos compartilham schema, capacidades de permissão, orçamento de resultado e semântica de tarefas em segundo plano.
- Quando não há subagent port configurado, nem `Agent` nem `Task` são registrados; quando subagents têm recursão proibida, `Agent` e `Task` são ambos filtrados da lista de ferramentas disponíveis.
- O `toolName` no stdin de tool hooks mantém o nome real da ferramenta; o hook matcher usa aliases compatíveis, de modo que `Agent` pode casar com o matcher `Task` e `Task` também pode casar com o matcher `Agent`.
- Caso o `ApplyPatch` seja reabilitado, o hook matcher pode ser compatível com os matchers `Write` / `Edit` de plugins do Claude Code, sem alterar o toolName real.

A fronteira completa de compatibilidade de subagents está em `docs/subagent-compatibility.md`.

## Superpowers embutido

`superpowers` é distribuído como plugin oficial embutido:

- Usa `.zcode-plugin/plugin.json` como manifest principal.
- Desabilitado por padrão; skills/hooks só são injetados no runtime depois que o usuário o habilita explicitamente.
- Fornece `skills/` e `hooks/hooks.json`.
- O hook `SessionStart` injeta o contexto `using-superpowers` em `startup|clear|compact`.
- O ZCode não acrescenta um mapeamento de ferramentas dedicado à saída de `SessionStart` do Superpowers; a compatibilidade `Task` / `Agent` fica a cargo do registro geral de ferramentas e da camada de alias de hook matcher, de modo que a forma externa `.claude-plugin` do Superpowers não precisa modificar os arquivos originais do plugin.

Os plugin skills do Superpowers suportam tanto o nome simples quanto o alias totalmente qualificado. O contexto do modelo exibe preferencialmente `superpowers:<skill>`, e o nome simples é mantido apenas como alias de compatibilidade.

O caminho de empacotamento dos plugins oficiais deve cobrir ao mesmo tempo o CLI SEA e o runtime bundle do Electron desktop, mantendo a política padrão de habilitação da página de gerenciamento e do runtime consistente.

Ao fazer seed dos plugins oficiais no cache do usuário, o executable bit precisa ser preservado; wrappers/scripts executáveis sob `hooks/` não podem ser gravados como `0644`, senão macOS/Linux apresentarão `permission denied` já na execução do `SessionStart`.

## Verificação

Após a implementação, é obrigatório cobrir:

- Prioridade entre os manifests `.zcode-plugin`, `.claude-plugin` e `.codex-plugin`.
- Carregamento automático de `hooks/hooks.json`.
- Mesclagem de arquivo `hooks` do manifest e hooks inline.
- Hook `command` executado via shell, recebendo as variáveis de ambiente compatíveis do ZCode / Claude.
- Injeção do `additionalContext` do `SessionStart` em `hook_context`.
- A ferramenta `Task`, como alias compatível com Claude Code, consegue agendar um subagent do ZCode.
- Interoperabilidade de aliases de hook matcher entre `Agent` / `Task`, e o hook input preserva o nome real da ferramenta.
- O plugin oficial `superpowers` vem desabilitado por padrão; após habilitação explícita, expõe skills/hooks.
- `Skill(skill="superpowers:test-driven-development")` carrega a skill do Superpowers, e o nome simples continua disponível.
- O `SessionStart` do Superpowers não recebe mais um mapeamento de ferramentas ZCode dedicado injetado.
- Hook wrappers como `hooks/run-hook.cmd` no cache de plugins oficiais continuam executáveis.
- `pnpm typecheck`
- `pnpm lint`