# Metadata de Dispositivo e Sessão nas Requisições Anthropic

## Status

- Este documento é a especificação factual do `metadata.user_id` das requisições de modelos Anthropic do zcode-cli.
- A identidade do dispositivo segue o `deviceMid` de `{dataBaseDir}/.zcode/v2/telemetry-state.json`.
- A montagem e injeção do metadata acontecem apenas no zcode-cli, sem modificar o Desktop, o Host, a Web ou o protocolo app-agent.

## Contrato de Requisição

Todas as requisições em formato Anthropic enviadas pelo AI SDK adapter do zcode-cli devem carregar:

```json
{
  "metadata": {
    "user_id": "{\"device_id\":\"7f1431f0-53e8-41c1-9cf9-22d11aa51d6a\",\"account_uuid\":\"\",\"session_id\":\"2d480878-38af-4bae-a54f-096e2fb0f4d7\"}"
  }
}
```

`metadata.user_id` é uma string JSON, com a semântica dos campos internos abaixo:

- `device_id`: o `deviceMid` persistido do ambiente de runtime atual do Agent, usado como UUID sem alteração e sem conversão para outro tipo de ID.
- `account_uuid`: hoje é sempre a string vazia; o zcode-cli ainda não tem um UUID de conta OAuth da Anthropic correspondente.
- `session_id`: o session id da requisição de modelo atual, reaproveitando a lógica externa de normalização de `x-session-id`, removendo os prefixos internos `sess_` e `subagent_agent_`; quando a chamada de baixo nível não tem session context, usa-se a string vazia.

O metadata de nível de requisição precisa sobrescrever o `anthropic.metadata.userId` da configuração estática do provider, para evitar que a configuração estática traga identidade de dispositivo ou de sessão antiga para uma requisição nova; as outras provider options da Anthropic (por exemplo `thinking`, `effort`) devem permanecer inalteradas.

## Propriedade do DeviceMid

O Desktop, o zcode-server remoto e o zcode-cli têm entradas «garantir que o deviceMid existe» independentes, mas leem e escrevem o mesmo estado:

```text
Desktop ensure（同步） ─────────┐
远端 server ensure（启动时异步）├─> {dataBaseDir}/.zcode/v2/telemetry-state.json.deviceMid
CLI ensure（异步） ─────────────┘                          │
                                                  v
                                  zcode-cli Anthropic metadata.device_id
```

- O Desktop local normalmente gera o `deviceMid` antes de iniciar o Agent, e o zcode-cli lê e consome o mesmo valor.
- Uma CLI independente ou um Agent via SSH/WSL/Docker não depende do Desktop: o próprio CLI gera e persiste; o `zcode-server` remoto via SSH/WSL/Docker também garante que o mesmo arquivo tenha `deviceMid` na inicialização, e o Agent depois lê o mesmo valor.
- A CLI usa o mesmo formato `createUuid()` do Desktop/telemetria e preserva os outros campos do arquivo de estado.
- A CLI usa `telemetry-state.lock` para coordenar leituras/escritas concorrentes e, dentro do processo, mantém em cache a mesma promise de ensure por arquivo de estado.
- Exceções de leitura/escrita de arquivo ou de lock não podem bloquear a requisição de modelo; nesse caso, retorna-se e armazena-se em cache o UUID gerado pelo processo atual, com nova tentativa de persistência na inicialização do próximo processo.
- `ZCODE_DATA_BASE_DIR` define a raiz de dados efetiva; sem configuração, há fallback para o diretório home do ambiente atual do Agent.
- O log de debug de model I/O preserva a estrutura do metadata, mas substitui `user_id` inteiramente por `[REDACTED]`, sem gravar a identidade do dispositivo em disco.

Portanto, o Desktop local e o Agent que ele inicia consomem a mesma identidade de dispositivo; um Agent remoto tem uma identidade de dispositivo própria no diretório de dados remoto.
O `/remote` do celular usa a identidade do Agent conectado por shared-host attachment e não gera uma identidade no celular.

## Caminho da Requisição e Limites

```text
ModelStatusContext.sessionId ──归一化──────────────┐
CLI ensureDeviceMid() ────────读取/生成────────────┼─> JSON.stringify(user_id)
account_uuid ─────────────────固定空字符串─────────┘
                                                    │
                                                    v
                         providerOptions.anthropic.metadata.userId
                                                    │
                                                    v
                                  AI SDK Anthropic 请求 metadata.user_id
```

- `generateText`, `streamText`, compact, title, subagente, modelo secundário de ferramenta e adapter retry compartilham o mesmo caminho de opções de requisição de modelo.
- A injeção ocorre somente quando `providerKind === "anthropic"`; OpenAI, OpenAI-compatible, gateway e custom transport não recebem esse metadata.
- O retry pode gerar um novo `x-request-id`, mas o `device_id` e o `session_id` da mesma requisição lógica permanecem iguais.
- Esse campo é usado apenas para atribuição da requisição a montante, não como base para autenticação local, roteamento de sessão ou isolamento de workspace.

## Impact Brief

| Campo              | Valor                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Intenção do dev    | Requisições Anthropic carregam a identidade de dispositivo compartilhada com Desktop/telemetria e a session atual       |
| Capacidade         | Metadata de atribuição de requisição Anthropic                                                                         |
| Camada de mudança  | `commit-effect`、`persistence`                                                                                         |
| Modo de operação   | `planning`                                                                                                             |
| Sementes primárias | `ensureDesktopDeviceMidSync`、`createTelemetryCore`、`runGenerateText`、`runStreamText`、`createGenerateTextOptions`       |
| Fora de escopo     | UI, headers de app services, protocolo, estado de conversation/replay, providers não-Anthropic                           |

UI Surface Matrix: sem entrada de UI. A persistência autoritativa é o
`telemetry-state.json.deviceMid` do host onde o Agent roda; o model adapter do zcode-cli é o metadata commit sink.

| Rank           | Relação                                            | Motivo                                                          |
| -------------- | ------------------------------------------------- | ---------------------------------------------------------------- |
| must-inspect   | CLI deviceMid ensure → telemetry state            | Deve reaproveitar o mesmo campo e preservar o outro estado de telemetria |
| must-inspect   | model runner → Anthropic provider options         | generate/stream e retry devem compartilhar o comportamento de injeção |
| should-inspect | session attribution header → metadata session     | Header e body não podem ter dois conjuntos de regras de prefixo    |
| conditional    | local Agent → remote Agent data root              | A identidade do dispositivo segue o ambiente real de execução do Agent |
| invariant-only | non-Anthropic providers                           | Não adicionar metadata nem alterar provider options             |
| invariant-only | desktop continuous / mobile replayable            | Não alterar fluxo de mensagens, snapshot ou limites de recuperação |

Drift do grafo: o feature graph atual não declara o Anthropic request metadata nem a persistência compartilhada do deviceMid;
após a confirmação desta funcionalidade, complementam-se as capabilities, services, persistências e arestas semânticas correspondentes.

## Casos Aceitos

| Caso   | Configuração                                    | Ação                     | Asserções                                              |
| ------ | ----------------------------------------------- | ------------------------ | ------------------------------------------------------ |
| ARM01  | state já tem `deviceMid`                        | generate Anthropic       | body usa o valor existente e a session normalizada     |
| ARM02  | state sem `deviceMid`                           | primeira requisição de CLI independente/remota | CLI gera UUID, preserva o resto do state e persiste |
| ARM03  | primeiras requisições concorrentes              | generate/stream Anthropic | o mesmo arquivo de state produz e consome apenas um ID persistido |
| ARM04  | metadata Anthropic estático convivendo com thinking | iniciar requisição   | userId dinâmico sobrescreve o valor estático e as outras options são preservadas |
| ARM05  | provider OpenAI-compatible                      | iniciar requisição       | nenhum metadata Anthropic é injetado                   |
| ARM06  | falha de IO do state                            | retry Anthropic          | a requisição continua e o mesmo processo usa o mesmo ID de fallback |

Não são necessários catálogo de casos de conversation, matriz de cobertura ou handoff de E2E; a evidência são os testes unitários do adapter e o teste do body Anthropic real no wire.