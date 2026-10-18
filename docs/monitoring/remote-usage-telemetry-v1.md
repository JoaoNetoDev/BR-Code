# Telemetria de uso em cenários remotos V1

> Status: implementado

## Objetivo e definição

Esta telemetria responde às seguintes perguntas de produto:

- Quantos usuários usam com sucesso workspaces remotos via SSH, WSL, Docker, Server.
- Quantos usuários usam com sucesso o Web Remote Control pelo celular.
- Qual a conversão do Web Remote Control, da exposição da entrada, passando pela inicialização e pareamento, até o bridge do workspace.
- Quantos dispositivos desktop estão envolvidos nesses cenários.

O UV de usuários prioriza a deduplicação pelo campo público `user_id` de `/event/report`; sem login, o fallback é a deduplicação por `device_mid`. A contagem de dispositivos desktop deduplica apenas por `device_mid`. O denominador de penetração usa uniformemente o UV do `app_daily_active` com a mesma definição.

A V1 não conta dispositivos físicos do celular nem hosts SSH. O primeiro não tem um identificador de dispositivo estável e compatível; o segundo introduziria risco de identidade e privacidade de hosts remotos.

## Fronteiras de arquitetura

```text
Desktop renderer               Desktop main / manager              Telemetry core
       |                                  |                               |
       | remote connect / web entry       |                               |
       |--------------------------------->|                               |
       |                                  | terminal lifecycle result     |
       |                                  |------------------------------>|
       |                                  | apenas campos de baixa cardinalidade + campos comuns de identidade |
       |                                  |                               |

Mobile Web -- replayable RPC --> relay/main passthrough --> shared desktop host
                 sem novo reporter        sem parse de rpc-frame   bridge bem-sucedido: desktop reporta
```

- O main do desktop só reporta nos estados terminais dos ciclos de vida já existentes de conexão, pareamento e host attachment; não carrega estado de negócio de session/task.
- O Web do celular continua usando `web-remote-replayable`; o desktop continua usando `desktop-continuous`; a telemetria não pode alterar a semântica de recuperação das duas cadeias de mensagens.
- O relay externo não faz parsing de `rpc-frame`, e o bundle Web não ganha um reporter separado.
- O controle remoto de workspace remoto continua usando shared-host attachment, sem criar novo Agent runtime, local host ou session remota.
- Falhas de telemetria devem ser best effort e não podem bloquear conexão, pareamento ou bridge.

## Definição de eventos

Todos os eventos reportam em plenitude estados terminais de ciclo de vida de baixa frequência. `event_extra_detail` só permite os campos da tabela abaixo, e todos os valores são strings.

### `remote_workspace_connect_result`

Ponto de disparo: quando uma conexão de workspace remoto iniciada pelo usuário obtém um estado terminal de sucesso ou falha no desktop main.

| Campo             | Valores permitidos                        | Descrição                                        |
| ----------------- | ----------------------------------------- | ------------------------------------------------ |
| `result`          | `success` / `failure`                     | Resultado da conexão                             |
| `remote_kind`     | `ssh` / `wsl` / `docker` / `server`       | Tipo remoto                                      |
| `connect_trigger` | `new` / `reconnect` / `restore`           | Nova, reconexão do usuário ou restauração no boot |
| `error_category`  | Ver classificação de erros; string vazia em sucesso | Classificação de falha de baixa cardinalidade |

A restauração no boot atual só restaura tabs desconectados, sem conectar automaticamente, portanto a V1 não gera `restore`; essa enumeração fica reservada para a recuperação automática real futura, e não se pode registrar a restauração de tab como conexão.

### `web_remote_control_entry_view`

Ponto de disparo: quando o usuário clica na entrada Web Remote Control e o diálogo é aberto.

| Campo            | Valores permitidos                                 | Descrição                                                     |
| ---------------- | -------------------------------------------------- | ------------------------------------------------------------- |
| `workspace_kind` | `local` / `remote`                                 | Tipo do workspace desktop atual                               |
| `remote_kind`    | `ssh` / `wsl` / `docker` / `server` / string vazia | Reportado quando resolvível pela workspace identity unificada |

### `web_remote_control_start_result`

Ponto de disparo: quando o desktop main processa um pedido explícito de inicialização ou re-pareamento e obtém um estado terminal.

| Campo             | Valores permitidos                                 | Descrição                                                     |
| ----------------- | -------------------------------------------------- | ------------------------------------------------------------- |
| `result`         | `success` / `failure` / `cancelled`                | Estado terminal de inicialização explícita ou re-pareamento; `cancelled` existe só por compatibilidade com dados históricos |
| `workspace_kind` | `local` / `remote`                                 | Tipo do workspace alvo                                        |
| `remote_kind`    | `ssh` / `wsl` / `docker` / `server` / string vazia | Reportado quando resolvível pela workspace identity unificada  |
| `error_category` | Ver classificação de erros; string vazia se não for falha | Classificação de falha de baixa cardinalidade             |

A recuperação automática de um runtime de controle remoto já existente não pertence ao funil de inicialização explícita e não gera este evento.
A cadeia atual de boot e refresh do Desktop não exibe mais confirmação nativa, portanto só produz `success` / `failure`; o schema mantém `cancelled` apenas por compatibilidade com eventos históricos ou com outras implementações de plataforma canceláveis, e isso não pode entrar na taxa de falhas.

### `web_remote_control_pair_result`

Ponto de disparo: quando o desktop recebe uma mudança de estado de pareamento definitiva vinda do relay.

| Campo             | Valores permitidos                                 | Descrição                                                     |
| ----------------- | -------------------------------------------------- | ------------------------------------------------------------- |
| `result`         | `success` / `failure`                              | Resultado do pareamento                                       |
| `pair_kind`      | `initial` / `reconnect`                            | Primeiro pareamento no ciclo de vida do manager atual ou reconexão posterior |
| `workspace_kind` | `local` / `remote`                                 | Tipo do workspace alvo ao iniciar o controle remoto           |
| `remote_kind`    | `ssh` / `wsl` / `docker` / `server` / string vazia | Reportado quando resolvível pela workspace identity unificada  |
| `error_category` | Ver classificação de erros; string vazia em sucesso | Classificação de falha de baixa cardinalidade                |

Notificações repetidas do mesmo estado de transport não geram novo report; entrar novamente em paired a partir do estado desconectado é registrado como `reconnect`.

### `web_remote_control_bridge_result`

Ponto de disparo: quando o celular pede para abrir o bridge do workspace e o shared-host attachment é estabelecido com sucesso ou falha.

| Campo             | Valores permitidos                                 | Descrição                                     |
| ----------------- | -------------------------------------------------- | --------------------------------------------- |
| `result`         | `success` / `failure`                              | Resultado do bridge                           |
| `workspace_kind` | `local` / `remote`                                 | Tipo do workspace alvo                        |
| `remote_kind`    | `ssh` / `wsl` / `docker` / `server` / string vazia | Tipo do alvo remoto; vazio em local           |
| `entry_kind`     | `home` / `task`                                    | Abrir a home do workspace ou uma task específica |
| `error_category` | Ver classificação de erros; string vazia em sucesso | Classificação de falha de baixa cardinalidade |

Bridge com sucesso é a definição principal de "uso efetivo do Web Remote Control". Pareamento bem-sucedido sem abertura de workspace não conta como usuário de uso efetivo.

## Classificação de erros e privacidade

`error_category` só permite:

- `auth`
- `connect`
- `deploy`
- `host_start`
- `attach`
- `relay`
- `unknown`

O classificador pode ler código ou mensagem de erro localmente, mas envia apenas o valor da enumeração. É proibido subir em qualquer evento:

- `workspacePath`
- `workspaceIdentity`
- `remoteSessionId`
- host SSH, usuário ou porta
- container Docker
- distro WSL
- mensagem de erro original ou stack trace

## Cálculo das métricas

| Métrica                                  | Cálculo                                                                                   |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| Usuários de SSH                         | `remote_workspace_connect_result` com `result=success && remote_kind=ssh`, deduplicado por actor |
| Usuários por tipo remoto                 | O mesmo, agrupado por `remote_kind` e deduplicado por actor                               |
| Usuários de Web Remote Control           | `web_remote_control_bridge_result` com `result=success`, deduplicado por actor            |
| Taxa de uso do Web Remote Control        | Usuários de Web Remote Control / UV de actors do `app_daily_active` do mesmo período      |
| Dispositivos desktop                     | Deduplicação por `device_mid` nos eventos de sucesso do alvo                             |
| Conversão do funil                       | entry view → start success → pair success → bridge success, cada um por UV de actors do mesmo período |

A regra de consulta do actor é: usar `user_id` quando não vazio, caso contrário `device_mid`. O cliente não cria o campo `actor_id` nem faz deduplificação de UV entre eventos.

## Propriedade dos estados e locais de implementação

| Estado / fato                            | Owner                                            | Local da telemetria                 |
| ---------------------------------------- | ------------------------------------------------ | ----------------------------------- |
| Estado terminal de conexão de workspace remoto | desktop remote IPC / session manager             | Antes de o IPC retornar sucesso ou falha |
| Exposição da entrada Web Remote Control  | desktop renderer                                 | Na ação de abertura do diálogo      |
| Estado terminal da inicialização explícita | desktop remote IPC                               | No estado terminal do pedido start/reset |
| Estado de pareamento do relay             | WebRemoteControlManager                          | Nas migrações de estado do transport |
| Host attachment de escopo de workspace    | WebRemoteControlManager + shared-host attachment | No estado terminal do attachment de bridge |
| Campos comuns de usuário e dispositivo desktop | TelemetryCore                                 | Campos comuns existentes de `/event/report` |

## Planejamento de cases e podas

Obrigatório cobrir:

- Estabilidade de campos para conexões novas SSH/WSL/Docker/Server com sucesso e falha.
- `reconnect` carregando explicitamente `connect_trigger=reconnect`; conexão normal com `new` por padrão.
- Eventos de entrada, inicialização e bridge para workspace local e remoto.
- Primeiro paired e reconnect paired após desconexão.
- Falha de attachment gerando apenas as classificações de erro permitidas, sem vazar informação do alvo.
- Falha no envio de telemetria não alterando o valor de retorno de negócio original.

Podas desta fase:

- Não criar novos E2E de conversation/session; esta funcionalidade não modifica a semântica de estado de conversation nem o protocolo.
- A V1 não conta dispositivos de celular, hosts remotos, concorrência de sessions lógicas ou duração de conexão; concorrência de sessions lógicas e duração de conexão observável ficam a cargo dos [eventos customizados ARMS de conexão de workspace remoto](./remote-usage-arms-telemetry.md), e o `active_target_count` do ARMS serve apenas como diagnóstico anonimizado, não equivalendo ao número de hosts remotos.
- Não forjar eventos de conexão para os tabs desconectados da restauração no boot.
- Não adicionar telemetria no relay, no bundle Web ou no `rpc-frame`.