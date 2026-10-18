# Filtro de Origem dos Comandos nas Configurações

A seção "命令" da página de configurações gerencia os slash commands definidos pelo usuário, organizados por origem do ZCode Agent.

## Origens

- `zcodeAgent`: o diretório de comandos do usuário é `~/.zcode/commands` e o diretório de comandos do projeto é `<workspace>/.zcode/commands`.
- Durante o período de migração, a camada de serviço ainda mantém os descritores `claudeCli`, `opencodeCli` e `geminiCli`, usados para ler explicitamente os diretórios antigos e para testar o formato antigo de arquivos, mas a UI não expõe mais essas origens. Quando `agentSource` não é informado, todas as leituras e escritas usam `zcodeAgent` por padrão.

## Formato dos arquivos

- `zcodeAgent` usa arquivos de comando em Markdown e suporta `description` e `argument-hint` no frontmatter.
- Os formatos antigos `claudeCli`, `opencodeCli` e `geminiCli` mantêm apenas a leitura explícita de compatibilidade e não são um ponto de entrada do produto.

## Contrato do serviço

`list`, `writeCommandFile`, `updateCommandFile`, `deleteCommandFile` e `getPrimaryUserCommandsDirectory` de `ICommandsService` aceitam `agentSource` opcional. Quando não informado, o padrão é `zcodeAgent`; quando não informado em `list`, apenas comandos do ZCode Agent são retornados.

`UserCommand.id` contém a origem, o escopo e o nome do comando, por exemplo:

- `zcodeAgent:global:/review`

Dessa forma ele permanece distinto de IDs históricos, e ao mesmo tempo a nova UI trabalha apenas em torno dos comandos do ZCode Agent.