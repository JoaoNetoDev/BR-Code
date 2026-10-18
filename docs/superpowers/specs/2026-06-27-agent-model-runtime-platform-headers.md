# Agent Model Runtime Platform Headers

## Contexto

As requisições de modelo do Agent já carregam headers de origem e atribuição de requisição como `User-Agent`, `X-ZCode-App-Version`, `X-Title`, `x-request-id` e `x-session-id`. Ao investigar as requisições de modelo, o backend ainda precisa saber o sistema operacional, a arquitetura de CPU e a versão do sistema da máquina onde está o agent runtime que fez a requisição, para distinguir macOS, Windows, Linux e os ambientes de execução em workspaces remotos.

## Objetivo

- Todas as requisições de modelo do agent do zcode-cli carregam por padrão headers do ambiente de execução:
  - `X-Platform`: `${process.platform}-${arch()}`
  - `X-Os-Category`: `macos` / `windows` / `linux`
  - `X-Os-Version`: `release()`
- A semântica dos headers representa a máquina do agent runtime que realmente fez a requisição de modelo. Workspaces remotos SSH / WSL / Docker geram os headers pelo zcode-cli runtime remoto, portanto registram o ambiente remoto e não o ambiente do desktop local ou do cliente `/remote` no celular.
- Reaproveitar os nomes de header já existentes no lado do app, sem adicionar `X-ZCode-OS` / `X-ZCode-Arch` / `X-ZCode-OS-Version`.
- Os valores de header só podem ser ASCII imprimível; quando não for possível gerar um valor seguro, omitir o header opcional correspondente, evitando que o HTTP fetch falhe antes do envio por valor de header inválido.
- Quando o usuário configura explicitamente um header de mesmo nome no provider config, a configuração do usuário continua sobrescrevendo o header de ambiente padrão.

## Fora de escopo

- Não modificar o `@zcode/protocol`; essas informações de ambiente não precisam ser passadas do app para o agent.
- Não alterar a semântica de atribuição por requisição de `x-request-id`, `x-zcode-trace-id`, `x-session-id`, `x-query-id`.
- Não escrever informações de dispositivo do `/remote` do celular nos headers de requisição de modelo do agent.
- Não adicionar variáveis de ambiente nem configurações visíveis ao usuário.

## Design

Os headers de ambiente de execução são construídos na etapa de geração dos headers padrão do provider em `apps/zcode-cli/packages/bootstrap/src/model-config.ts`, no mesmo nível de `User-Agent`, `X-ZCode-App-Version`, `X-Title` e `X-ZCode-Agent`.

A ordem de mesclagem permanece como está:

1. O bootstrap gera os headers padrão do provider.
2. `target.headers` do provider config sobrescreve os headers padrão.
3. O adapter mescla os headers de atribuição por requisição antes do envio de cada requisição `generateText` / `streamText`.

Assim os headers de plataforma não poluem a atribuição dinâmica de session/request nem contornam a configuração explícita de headers do provider pelo usuário.

## Matriz de Cobertura

| Case ID | Setup | Action | Assertions | Evidência |
| --- | --- | --- | --- | --- |
| AMRPH-001 | provider config padrão sem header customizado | Criar a config de registry do provider do AI SDK | Os provider headers contêm `X-Platform`, `X-Os-Category` e `X-Os-Version` | Teste unitário do bootstrap |
| AMRPH-002 | provider config define explicitamente um header de mesmo nome | Criar a config de registry do provider do AI SDK | A configuração do usuário sobrescreve o header de plataforma padrão | Teste unitário do bootstrap |
| AMRPH-003 | Os provider headers já contêm os headers de plataforma | Criar as options da requisição `generateText` | O header de plataforma coexiste com headers de atribuição por requisição como `x-request-id` e `x-session-id` | Teste unitário de options do adapter |

## Verificação

- Executar `pnpm --dir apps/zcode-cli --filter @zcode/bootstrap test -- model-config`.
- Executar `pnpm --dir apps/zcode-cli --filter @zcode/adapters test -- runner-options`.
- Executar `pnpm typecheck` e `pnpm lint` conforme exigido pelo repositório.