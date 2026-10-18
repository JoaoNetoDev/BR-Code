# Hooks Runtime Contract

> Status: Implementation Spec
>
> Este documento é a base de aceitação comum da implementação atual de Hooks do ZCode, da página de configurações do desktop e dos testes automatizados.

## Objetivos e limites

Esta fase suporta apenas os 7 eventos que já existem no ZCode:

- `SessionStart`
- `UserPromptSubmit`
- `PreToolUse`
- `PermissionRequest`
- `PostToolUse`
- `PostToolUseFailure`
- `Stop`

Nenhum evento de Hook novo é adicionado nesta fase. Todo evento já suportado precisa formar um ciclo completo: a configuração pode ser carregada, a semântica do matcher é clara, o stdin é compatível com Claude Code, o stdout consegue afetar o comportamento de runtime correspondente, a falha é observável e existe um teste de automação independente.

Os tipos de Hook persistidos são limitados a:

- `process`: `command + args[]`, executado por argv, sem passar por shell.
- `command`: comando shell completo, compatível com plugins do Claude Marketplace.

Esta fase não implementa a configuração persistida de `prompt`, `agent`, `http` ou `callback`, nem implementa `if`, `once` ou `asyncRewake`. Esses campos e os novos eventos não podem ser escritos pela UI nem ser marcados como suportados pela documentação.

## Posse do estado

```text
user config + enabled plugin hooks
  -> executable RuntimeConfig
  -> HookRunner

project/workspace Hook declarations
  -> isolated discovery candidate
  -> immutable bundle/declaration digests
  -> rollout gate + managed policy + Trust admission
  -> admitted project registrations or blocked lifecycle

HooksService / conversation projection
  -> 设置 → 钩子 → 工作区
  -> Runtime-owned review command
  -> atomic Trust mutation / supersede / revoke
```

- O direito de executar Hooks existe apenas no runtime do Agent em `apps/zcode-cli`.
- A UI e `packages/services` apenas gerenciam a configuração e exibem as fontes em modo somente leitura; não executam Hooks.
- Um snapshot da configuração de Hooks é capturado na inicialização de cada session. Alterações de configuração só garantem efeito em novas sessions; depois de salvar na página de configurações é preciso encerrar as deferred draft sessions ainda não usadas, evitando que o próximo primeiro envio continue reutilizando o snapshot antigo.
- O HooksService de um workspace remoto precisa vir da coleção de services remota. `workspacePath` é usado para leitura e escrita de arquivos; o cache da UI e o isolamento de requisições concorrentes usam `workspaceIdentity?.trim() || workspacePath`.

## Fontes de configuração e merge

| Source                             | Runtime execution | Settings-page editing | Regra de efetivação                                    |
| ------------------------------ | ------------ | ---------- | ------------------------------------------------------ |
| `~/.zcode/cli/config.json`     | Sim           | Sim         | Os user hooks são executados primeiro                                      |
| workspace `.zcode/config.json` | Execução condicional     | Sim         | Executado após rollout ativado e aprovação de Trust/policy exata |
| Hooks de plugins habilitados               | Sim           | Não         | Executado conforme as regras de origem de plugin existentes                             |
| `.agents/settings.json`        | Não           | Não         | Exibido em modo somente leitura, com importação explícita para `.zcode`                          |
| `.claude/settings.json`        | Não           | Não         | Exibido em modo somente leitura, com importação explícita para `.zcode`                          |

Restrições de merge da configuração:

1. A runtime executable config mescla diretamente apenas user e hooks de plugins habilitados; os project hooks de workspace permanecem em um side-channel de snapshot imutável e isolado. Antes da admission não pode existir callback executável; os diagnósticos de descoberta usam uniformemente `config_project_hooks_pending_trust`, e o Runtime blocked reason distingue ainda pending, feature-disabled, policy, store failure e snapshot mismatch.
2. `hooks.enabled:false` em uma única fonte confiável desabilita apenas os hooks daquela fonte e não pode desligar as outras fontes.
3. Hooks de plugin só são injetados no runtime quando o plugin está habilitado; com o plugin desligado, novas sessions não os executam mais.
4. Cada `process` / `command` suporta `enabled?: boolean`, com padrão `true`. O Runner precisa pular `enabled:false`, e não basta esconder ou esmaecer na UI.
5. A UI escreve hooks de `.zcode` de volta apenas nos arquivos originais de user/project e não modifica arquivos de plugin, `.agents` ou `.claude`.
6. Campos de extensão desconhecidos de um Hook individual precisam ser preservados na ida e volta pelo serviço de configurações e aceitos pelo schema de configuração do Agent; o runtime pode ignorar campos que a versão atual não reconhece, mas isso não pode invalidar o arquivo de configuração inteiro.

Exemplo:

```json
{
  "hooks": {
    "enabled": true,
    "timeoutMs": 60000,
    "maxOutputBytes": 32768,
    "events": {
      "PreToolUse": [
        {
          "matcher": "Write|Edit",
          "hooks": [
            {
              "type": "process",
              "command": "node",
              "args": ["scripts/check-write.mjs"],
              "enabled": true,
              "timeoutMs": 30000
            }
          ]
        }
      ]
    }
  }
}
```

## Contrato de matcher

Regras do matcher:

- Ausente, string vazia e `*`: casa com tudo.
- Contém apenas letras, números, underscore e `|`: casa por nome exato ou lista de nomes exatos.
- Qualquer outra string: casa por expressão regular JavaScript; uma regex inválida não executa o matcher e registra um diagnóstico.
- Eventos de tool casam por `tool_name`, mantendo compatibilidade com aliases do ZCode como `Agent` / `Task`.
- `SessionStart` casa por `source`.
- `UserPromptSubmit` e `Stop` não têm query de matcher; mesmo que a configuração traga matcher, os hooks desse grupo são executados.

## stdin compatível com Claude

Todo stdin de Hook é uma única linha de JSON com quebra de linha, preservando simultaneamente os campos camelCase do ZCode e os campos snake_case do Claude Code.

Campos básicos:

- `session_id`
- `transcript_path`
- `cwd`
- `permission_mode`
- `hook_event_name`
- `agent_type` (quando presente)

Campos por evento:

| Event                | Required Claude-compatible fields                                                   |
| -------------------- | ------------------------------------------------------------------------ |
| `SessionStart`       | `source`, com `agent_type` e `model` opcionais                                     |
| `UserPromptSubmit`   | `prompt`                                                                 |
| `PreToolUse`         | `tool_name`, `tool_input`, `tool_use_id`                              |
| `PermissionRequest`  | `tool_name`, `tool_input`, `permission_suggestions` opcional                |
| `PostToolUse`        | `tool_name`, `tool_input`, `tool_use_id`, `tool_response` completo          |
| `PostToolUseFailure` | `tool_name`, `tool_input`, `tool_use_id`, string `error`, `is_interrupt` |
| `Stop`               | `stop_hook_active`, `last_assistant_message`                             |

`PostToolUse.tool_response` usa a saída estruturada completa do handler da ferramenta; `toolResultPreview` continua sendo preservado como campo de extensão do ZCode, mas não pode substituir `tool_response`.

O ZCode hoje não tem o arquivo de transcript JSONL do Claude, portanto o runner configurado cria um transcript temporário compatível para cada Hook: Stop contém pelo menos a última assistant message e os demais eventos fornecem pelo menos um arquivo JSONL existente e legível. O diretório temporário é limpo depois que o Hook termina.

## stdout, exit code e efeitos nos eventos

Regras de stdout:

- stdout vazio: sucesso, sem efeito adicional.
- stdout que não é JSON: sucesso, serve apenas como diagnóstico e não é injetado no contexto do modelo.
- JSON válido começando com `{`: os campos conhecidos são validados e consumidos.
- Campos JSON desconhecidos são ignorados e não podem fazer o Hook inteiro falhar.
- Tipo errado em um campo conhecido ou `hookSpecificOutput.hookEventName` incorreto: aquele Hook falha; a falha é isolada dos outros Hooks.

Regras de exit code:

- `0`: sucesso e faz o parse do stdout.
- `2`: solicita bloqueio; produz o block/deny correspondente em eventos bloqueáveis, e no Stop produz feedback para mais uma rodada.
- Outro valor não zero: falha de Hook recuperável, sem derrubar o turno inteiro.

Efeitos de saída por evento:

| Event                | Bloqueável           | Modificável                                       | Contexto visível ao modelo                                   |
| -------------------- | ---------------- | -------------------------------------------- | ------------------------------------------------ |
| `SessionStart`       | Não               | Não                                           | `additionalContext` injetado antes da primeira rodada                   |
| `UserPromptSubmit`   | Sim               | Não modifica o prompt original                              | `additionalContext` injetado antes desta rodada                   |
| `PreToolUse`         | Sim               | `updatedInput`, com nova validação do tool schema    | Success/failure tool result sempre carregam `additionalContext` |
| `PermissionRequest`  | Sim               | No allow pode retornar `updatedInput` e permissions | Não                                               |
| `PostToolUse`        | Não               | Nesta fase não substitui o tool output                       | Acrescenta `additionalContext`                         |
| `PostToolUseFailure` | Não               | Não                                           | Acrescenta `additionalContext` de recovery                |
| `Stop`               | Sim, indicando não encerrar | Não                                           | block reason/context injetado na próxima rodada, no máximo 3 vezes consecutivas   |

Campos de compatibilidade:

- `decision:"approve"|"block"` no nível superior.
- `continue:false` no nível superior bloqueia em `UserPromptSubmit`, `PreToolUse` e `PermissionRequest`.
- Stop usa `decision:"block"`; para compatibilidade com configurações do ZCode já publicadas, `continue:true` com `additionalContext` também continua mais uma rodada.
- `PermissionRequest` aceita tanto o `updatedPermissions` do Claude quanto o campo histórico do ZCode `permissionUpdates`.
- `suppressOutput:true` indica que o stdout do Hook não deve ser projetado; ele não suprime a decision/context estruturada.

O resultado de falha de `PreToolUse` inclui o próprio deny do Hook, a negativa de permissão posterior e a falha do handler da ferramenta; esses caminhos de retorno antecipado também precisam preservar o `additionalContext` já produzido, e não apenas acrescentá-lo no caminho de sucesso ou de erro do handler.

## Contrato de async

Hooks `command` suportam `async:true`:

1. Depois de iniciar o comando, o Agent continua o evento atual imediatamente, sem esperar o comando terminar.
2. O stdout do async não pode bloquear, modificar a entrada nem injetar context; essas saídas são ignoradas.
3. O comando em segundo plano continua sujeito a timeout e ao cancellation do chamador; após o cancelamento do chamador o comando precisa ser encerrado e um Hook lifecycle event com `outcome: "cancelled"` precisa ser produzido.
4. A Promise em segundo plano precisa capturar erros e não pode gerar unhandled rejection.

Hooks `process` permanecem síncronos nesta fase. `asyncRewake` não faz parte da declaração de capacidades desta fase.

## Contrato da página de configurações

A página de configurações de Hooks precisa usar o mesmo componente no desktop e na Web UI e satisfazer:

- Hooks de `.zcode` suportam adicionar, editar, deletar, habilitar/desabilitar e scope user/workspace.
- O formulário suporta os 7 eventos, os tipos `process` / `command`, matcher, argv, timeout, `statusMessage` e command async.
- Hooks de `.agents` / `.claude` são marcados como fontes de compatibilidade, não editáveis nem habilitáveis diretamente, e oferecem importação explícita para `.zcode`.
- Hooks de plugin ficam em um grupo separado; a lista exibe em modo somente leitura event e command, expressando a origem com o título do grupo e o ícone do plugin.
  matcher, type, source path e o estado de habilitação efetivo são preservados como fatos de dados e não são empilhados de novo na linha da lista.
- As colunas User / Workspace dos Hooks de plugin usam apenas o scope autoritativo dos registros de instalação do overview. Quando o overview está degradado ou o registro de instalação está ausente, é preciso preservar `unknown` e nunca assumir User como padrão; um Hook de scope desconhecido permanece visível nas duas Tabs e exibe a etiqueta "作用域未知", evitando forjar origem ou perder dados silenciosamente.
- A habilitação dos Hooks de plugin acompanha a configuração do plugin, sem criar um segundo conjunto de overrides na página de Hooks.
- Os textos da página suportam `zh-CN` / `en-US`, usando cores semânticas e os controles existentes; em tela estreita o conteúdo e as ações não podem se sobrepor.
- A página informa claramente: as alterações valem para novas sessions.
- A página segue a arquitetura de informação unificada das páginas de configurações de MCP, Skills e Commands: no topo usa o menu compartilhado de Scope, com o total de Hooks do Scope atual e a entrada de busca; dentro do Scope atual os grupos são `Installed`, o plugin específico e `Legacy`.
- Após a busca, apenas os grupos que possuem Hooks com correspondência são exibidos; sem resultados aparece um estado vazio uniforme, sem manter títulos de grupo com contagem 0.
- Dentro do grupo usa-se um único contêiner de lista com surface de cantos arredondados e linhas divisórias. O Hook Item usa o Event como título principal e o command com `font-mono text-ui-sm`; configurações diretas exibem um toggle e permitem entrar na edição pela linha inteira, Hooks de plugin são somente leitura e usam o ícone do plugin, e fontes de compatibilidade exibem Import.
- Ao criar um Hook no Scope atual, o formulário seleciona por padrão o mesmo scope e reaproveita `PluginScopeMenu`.
  Ao editar um Hook existente, o Scope não pode ser migrado. Sem workspace disponível, o menu oferece apenas User.
- A página de criação/edição reaproveita o link de retorno, o título e a hierarquia de descrição da página de configurações de recursos; desktop e Web no celular usam o mesmo layout responsivo.
- HooksSection precisa receber e repassar `workspaceIdentity`, e a leitura, escrita e invalidação de session do workspace remoto são isoladas por `workspaceIdentity?.trim() || workspacePath`.

## Matriz de aceitação

| ID    | Event                | Ponto de prova                                                                            | Camada de automação                 |
| ----- | -------------------- | --------------------------------------------------------------------------------- | ------------------------ |
| HK-01 | `SessionStart`       | matcher de startup, stdin snake_case, contexto da primeira rodada                                   | core + desktop E2E       |
| HK-02 | `UserPromptSubmit`   | stdin de prompt, matcher sem filtro, block/context                                       | core + desktop E2E       |
| HK-03 | `PreToolUse`         | matcher de tool, deny/ask/allow, updatedInput, context; as três saídas de falha antecipada não perdem context | core + desktop E2E       |
| HK-04 | `PermissionRequest`  | dispara só no caminho ask, allow/deny/modify, permission updates                            | core + desktop E2E       |
| HK-05 | `PostToolUse`        | `tool_response` completo, context                                                     | core + desktop E2E       |
| HK-06 | `PostToolUseFailure` | error string, interrupt, contexto de recovery                                         | core + desktop E2E       |
| HK-07 | `Stop`               | last assistant, transcript, limite de rodadas com block                                        | core + desktop E2E       |
| HK-08 | Config/source        | ordem user+project+plugin, disabled por Hook realmente pula                                 | adapter/bootstrap/core   |
| HK-09 | Settings             | `.zcode` gravável, legacy importável, plugin somente leitura e visível                                     | service/UI + desktop E2E |
| HK-10 | Executors/async      | argv de process, command shell/fire-and-forget, cancelamento do pai, lifecycle em segundo plano, isolamento de erro   | core + desktop E2E       |

A suíte completa em nível de janela usa `HK-LC-01`, `HK-EF-01`, `HK-ST-01` e `HK-UP-01`, definidas em `docs/testing/hooks-e2e-coverage-matrix.md`. Nelas o cancelamento do pai permanece no teste determinístico de AbortSignal do core; a validação em nível de janela confirma que o command async realmente inicia/termina e que sua decisão de stdout não altera retroativamente o evento que já continuou.