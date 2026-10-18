# ZCode Desktop Context

## Status

- Este documento é a especificação funcional atual das restrições de apresentação de saída do ZCode Desktop que entram no system prompt do Agent.
- O desktop context continua sendo o responsável por exigir que o Agent emita `::code-comment{...}`; o parsing, os cards e a navegação para o Review no Renderer são especificados de forma independente em [Assistant Code Comment Cards](../ui/assistant-code-comment-cards.md) e controlados por uma capacidade de rollout desligada por padrão.
- O texto existente sobre exibição de terminal na Identity permanece inalterado nesta fase.

## Resumo funcional

| Campo     | Conclusão                                                                                    |
| -------- | --------------------------------------------------------------------------------------- |
| Nível de mudança | presentation, runtime config                                                            |
| Entrada do usuário | workspace local do ZCode Desktop, workspace SSH/WSL/Docker anexado ao Desktop                 |
| Entrada de avaliação | `zcode --surface desktop --prompt <text>`                                               |
| Estado autoritativo | `presentationSurface` derivado pelos Services a partir de fatos confiáveis do host e congelado na inicialização do Agent            |
| Valor padrão   | `terminal`                                                                              |
| Não envolve   | parsing de diretivas de UI, schema de protocolo, telemetria, `sourceTitle` do provider, delivery/recovery V4 |

## Contrato da Context Section

A surface desktop usa um `buildDesktopContextSection()` próprio e respeita os seguintes metadados:

```text
name: ZCode Desktop Context
source: desktop_context
injectionTarget: system
cacheHint: stable
```

O corpo é fixo como:

```text
# ZCode Desktop Context

### Files & URLs
- Return local web URLs as Markdown links (e.g., [label](http://127.0.0.1:8080)).
- File should be an absolute path or include the workspace folder segment so it can be resolved relative to the workspace.
- Unless otherwise specified, return local file references as Markdown links (e.g., [name.md](/absolute/path/to/name.md)).

### Inline Code Comments
- Use the ::code-comment{...} directive when you need to attach feedback directly to specific code lines.
- Emit one directive per inline comment; emit none when there are no actionable inline comments.
- Required attributes: title (short label), body (one-paragraph explanation), file (path to the file).
- Optional attributes: start, end (1-based line numbers), priority (0-3).
- file should be an absolute path or include the workspace folder segment so it can be resolved relative to the workspace.
- Keep line ranges tight; end defaults to start.
- Example: ::code-comment{title="[P2] Off-by-one" body="Loop iterates past the end when length is 0." file="/path/to/foo.ts" start=10 end=11 priority=2}
```

A ordem padrão das system sections é:

```text
CLI Prefix
Agent Identity
ZCode Desktop Context       <- stable, apenas zcode_desktop
Dynamic Behavior            <- dynamic
Session Guidance
Environment
...
```

`ZCode Desktop Context` e Identity entram na mesma system message estável, sem aumentar o número de system messages.
`customSystemPrompt` substitui o sistema padrão de system prompt e, por isso, não injeta o desktop context. O Subagent usa um context builder próprio e também não injeta o desktop context.

## Superfície e cadeia de inicialização

Tipo interno:

```ts
type PresentationSurface = "terminal" | "zcode_desktop";
```

O Desktop real não exige que o chamador monte explicitamente os argumentos de CLI. Os Services derivam a superfície de apresentação a partir dos fatos de host já existentes e, em seguida, o `ZCodeAgentProcessManager` acrescenta os argumentos de CLI de forma unificada; a avaliação pela CLI continua usando a entrada pública de argumentos:

```text
Desktop Local Host
  └─ agentTelemetry.runtimeSurface=desktop_local_host ─────┐
                                                           ├─> Services 内部推导 desktop
Desktop-attached Remote Host                               │            |
  └─ serviceAuthorityMode=desktop-attached-remote ─────────┘            v
                                                    app-server --stdio --surface desktop
                                                                       |
zcode --surface desktop --prompt ... -> CLI 参数解析 ──────────────────+
                                                                       |
                                                                       v
                                                    presentationSurface=zcode_desktop
                                                                       |
                                                                       v
                                              AgentRuntimeConfig -> ContextBuilderConfig
```

A evidência de integração do Desktop Host remoto precisa atravessar toda a cadeia de montagem abaixo, e não apenas afirmar separadamente o authority parser ou o surface helper:

```text
remote connect command
  -> ZCODE_SERVICE_AUTHORITY_MODE=desktop-attached-remote
  -> entry-stdio bootstrap
  -> createLocalServices(serviceAuthorityMode)
  -> ZCodeAgentProcessManager command resolver context
  -> app-server --stdio --surface desktop
  -> protocol runtime presentationSurface=zcode_desktop
```

`zcode --prompt` comum, a TUI, o HTTP server ou a execução manual de `zcode app-server --stdio` continuam por padrão em `terminal`.
`--surface` só pode ser usado com `--prompt`, `--target`, `app-server` e `agent-server`; os valores suportados são `terminal` e `desktop`.

`--surface desktop` apenas simula a capacidade de apresentação de saída e não modifica:

- o `sourceTitle` do provider; a CLI headless continua sendo `cli` e o Protocol/Desktop continua sendo `electron`.
- o `runtimeSurface` da telemetria.
- as semânticas de delivery/recovery do `desktop-continuous` do Desktop e do `web-remote-replayable` do celular.

## Fronteira multiplataforma e remota

O workspace local do Desktop é identificado pelo `agentTelemetry.runtimeSurface=desktop_local_host` já existente, e o workspace SSH/WSL/Docker anexado ao Desktop pelo `serviceAuthorityMode=desktop-attached-remote` já existente; ambos usam `zcode_desktop`. O chamador não passa mais uma configuração de superfície separada, evitando que a estratégia de exibição se espalhe pelas camadas de montagem do Desktop Host e do remote server.

O `/remote` do celular não inicia outro Agent, mas se conecta ao Host/CLI que a janela do desktop já tem; ele vê o texto gerado pelo mesmo Agent, mas continua usando `web-remote-replayable`. O Desktop Root, o external relay do celular e as duas Roots de workspace bridge por token/WebSocket habilitam explicitamente a capacidade de rollout, e o Renderer projeta de forma determinística o texto do corpo e os cards de code-comment a partir do mesmo row text original; a entrada comum de Web Server permanece desligada por padrão e continua exibindo a diretiva original. Essa projeção de UI não altera a fronteira de entrega continuous/replayable nem acrescenta campos ao snapshot da session.

Essa configuração não entra na requisição do ZCode Protocol e não participa da workspace identity. O workspace remoto continua usando `workspaceIdentity?.trim() || workspacePath` para isolamento, e `workspacePath` é usado apenas como cwd do Agent.

## Rollout do servidor SP do Desktop

O Desktop Main, na inicialização, faz uma requisição sidecar a `/api/v1/client/configs`; depois, na criação de cada Host, dispara uma atualização de expiração com TTL de 1 hora e lê a configuração abaixo:

```json
{
  "data": {
    "configs": {
      "desktopContextPrompt": {
        "enabled": true,
        "config_version": "desktop-sp-v1"
      }
    }
  }
}
```

Somente respostas bem-sucedidas em que `code` está ausente ou é `0` entram na decisão de configuração: quando há configuração publicada, exige-se que `enabled` seja boolean; quando `desktopContextPrompt` não é publicado, trata-se como `{enabled:false}` e sobrescreve o snapshot antigo de habilitação. O Main passa o snapshot desta decisão ao Local Host via `ZCODE_DESKTOP_CONTEXT_PROMPT_ENABLED=1|0` e o passa ao Host remoto anexado ao Desktop pela whitelist já existente de runtime env do Remote; o Host não consulta o servidor nem refaz o bucket. Quando essa variável de ambiente não é fornecida, preserva-se a semântica histórica de montagem do Host, para que a CLI, o HTTP server comum e os testes existentes continuem funcionando.

O resultado bem-sucedido é cacheado por 1 hora no processo do Desktop Main, e requisições in-flight do mesmo instante são combinadas. Uma requisição espera no máximo 3 segundos:

```text
Main ready
   |
   +-- request config (旁路，不阻塞首个 Host)
   |       |
   |       +-- success + valid --> cache {enabled, config_version}
   |       |
   |       +-- error/invalid/timeout (>3s)
   |                    |
   |                    +-- 有历史成功 --> 复用上一份快照
   |                    +-- 无历史成功 --> {enabled:false}
   |
   +-- Host spawn --> 读取当时快照 --> 注入/不注入 Desktop Context
```

Falha de rede, resposta anômala ou timeout nunca bloqueiam o início do cliente. O snapshot bem-sucedido só é reutilizado dentro do ciclo de vida atual do Desktop Main; um Host iniciado depois lê o snapshot mais recente, e um Agent já iniciado não troca a superfície de apresentação dinamicamente em execução.

## Casos de aceitação

| Caso    | Setup                                                  | Ação                             | Asserções                                               |
| ------- | ------------------------------------------------------ | ---------------------------------- | -------------------------------------------------------- |
| DCTX-01 | ContextBuilder padrão/terminal                           | construir o context                       | não contém `desktop_context`                                 |
| DCTX-02 | ContextBuilder `zcode_desktop`                         | construir o context                       | section exatamente uma vez, metadados corretos, antes de `dynamic_behavior` |
| DCTX-03 | `zcode_desktop` + custom system prompt                 | construir o context                       | não contém `desktop_context`                                 |
| DCTX-04 | runtime de subagent                                       | construir o context                       | não contém `desktop_context`                                 |
| DCTX-05 | `--surface desktop --prompt`                           | criar o App                           | runtime config é `zcode_desktop`, `sourceTitle` inalterado    |
| DCTX-06 | `app-server --stdio --surface desktop`                 | iniciar o protocol runner               | cada session App injeta `zcode_desktop`                    |
| DCTX-07 | fato de runtime Desktop local / autoridade remota anexada | criar Services e resolver o comando do Agent | os argumentos contêm `--surface desktop`                             |
| DCTX-08 | HTTP server comum / stdio manual, sem fato de host Desktop     | criar Services e resolver o comando do Agent | a superfície Desktop não é adicionada automaticamente                               |
| DCTX-09 | valor inválido / comando não suportado                                      | validação de argumentos da CLI                       | retorna erro claro e não inicia o App                                 |
| DCTX-10 | `entry-stdio` recebe `desktop-attached-remote`           | resolver o comando do Agent pela montagem real de Services | authority, superfície do resolver e argumentos do comando mantêm Desktop      |

## Resumo de impacto

| Rank           | Relação                                           | Conclusão                                      |
| -------------- | ---------------------------------------------- | ----------------------------------------- |
| must-inspect   | CLI parser -> Runtime config -> ContextBuilder | única cadeia principal de injeção da Desktop section            |
| must-inspect   | fatos de host -> Services -> argumentos do processo do Agent   | reaproveita fatos confiáveis de host para derivar a superfície Desktop      |
| conditional    | remote do celular -> Host/CLI compartilhado                 | herda o mesmo prompt, mas não altera a entrega replayable |
| invariant-only | `sourceTitle` / telemetria                      | não muda com os argumentos de avaliação da CLI                     |
| invariant-only | custom prompt / subagent                       | não injeta a Desktop default section               |
| evidence-only  | testes de integração de Core/CLI/Bootstrap/Services/Server    | cobre a montagem de host local e remoto, sem adicionar UI E2E     |

A ferramenta codegraph não está disponível no ambiente atual, e o escopo de impacto foi conferido com base no mapa funcional, na documentação de fatos atual, nos chamadores diretos do código-fonte e nos testes existentes.