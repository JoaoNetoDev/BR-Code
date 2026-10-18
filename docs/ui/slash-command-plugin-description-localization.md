# Localização das Descrições de Slash Commands e Plugins Oficiais

## Contexto

O painel `/` combina na exibição os slash commands visíveis do ZCode Agent e as skills habilitadas. As descrições dos commands embutidos vêm da tabela de comandos do protocolo, enquanto as descrições de commands, skills e ferramentas MCP fornecidos pelos plugins oficiais vêm dos metadados do próprio pacote do plugin e das informações de registro do MCP server.

## Objetivos

- Na UI em chinês, as descrições dos `/compact` e `/goal` embutidos devem ser exibidas em chinês.
- O `description` do frontmatter dos commands fornecidos pelos plugins oficiais deve estar em chinês.
- O `description` do frontmatter das skills fornecidas pelos plugins oficiais deve estar em chinês.
- O `title`, a `description` dos MCP tools fornecidos pelos plugins oficiais e os `describe(...)` dos parâmetros devem estar em chinês, evitando que a lista de ferramentas continue exibindo explicações em inglês.

## Limites

- Commands definidos pelo usuário, skills de usuário/workspace e as descrições originais de plugins de terceiros não são traduzidos automaticamente; continuam exibindo o texto fornecido pelo autor.
- Os commands embutidos mantêm os campos de compatibilidade da camada de protocolo; na exibição da UI, a descrição dos commands embutidos estáveis é sobrescrita conforme o locale atual.
- Os plugins oficiais atualmente não possuem um protocolo de manifest/frontmatter por locale; por isso, as descrições dos recursos oficiais são escritas diretamente em chinês.

## Aceitação

- No painel `/` em chinês, `/compact` e `/goal` não exibem mais descrições em inglês.
- As descrições das skills `android-dev`, `ios-dev`, `control-browser`, `docx`, `pdf` e `skill-creator` dos plugins oficiais estão em chinês.
- As descrições dos commands `android-dev` e `ios-dev` dos plugins oficiais estão em chinês.
- Os títulos, as descrições e as descrições de parâmetros das ferramentas MCP do Android Emulator e do iOS Simulator estão em chinês.