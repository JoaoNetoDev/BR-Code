# Design de sincronização remota de MCP via SSH

## Contexto

O ZCode já suporta sincronizar Skills locais de nível de usuário para hosts remotos via SSH. O caminho de execução do MCP tem pontos em comum com o das Skills: a página de configurações local lê a configuração de MCP do diretório de usuário da máquina local; ao criar ou retomar uma sessão do ZCode Agent, as configurações de MCP habilitadas são enviadas explicitamente ao agent; e o agent então inicia o MCP stdio ou conecta um MCP HTTP / SSE no seu próprio runtime.

Isso significa que, em um workspace remoto via SSH, o processo MCP roda de fato na máquina do zcode-server remoto. Atualmente o MCP local de nível de usuário pode ser passado temporariamente ao runtime remoto via parâmetros de sessão, mas o diretório de usuário remoto não persiste esse conjunto de configurações MCP. Quando o usuário reabre o workspace no host remoto, entra pelo celular no mesmo workspace remoto via shared-host, ou quando o runtime remoto lê a configuração por conta própria, ainda falta a configuração de MCP de nível de usuário em `~/.zcode/cli/config.json` no remoto.

## Objetivos

- Permitir que, em um workspace remoto via SSH já conectado, o usuário sincronize sua configuração local de MCP do ZCode Agent de nível de usuário para o `~/.zcode/cli/config.json` de nível de usuário desse host SSH.
- Os candidatos locais incluem apenas MCPs de nível de usuário, não MCPs de nível de workspace, MCPs de plugin, MCPs embutidos do sistema nem origens brutas de Agents externos.
- A semântica de descoberta de candidatos é a mesma das configurações locais de MCP: ler primeiro `mcp.servers` de `~/.zcode/cli/config.json`; quando não houver nenhum MCP server do ZCode nesse escopo, ler compativelmente `mcpServers` de `~/.agents/mcp.json`.
- A importação remota grava em `mcp.servers` de `~/.zcode/cli/config.json`, sem escrever em `.agents`.
- Quando já existe um MCP remoto com o mesmo nome, o padrão é pular, sem sobrescrever.
- MCPs de comando como stdio / context7 podem ter a configuração copiada diretamente; não verifica se o comando, gerenciador de pacotes ou dependências já estão instalados no remoto.
- MCPs HTTP / SSE copiam diretamente URL, headers, token e outros campos secret, permitindo gravar secrets no arquivo de configuração remoto.
- O MCP filesystem precisa ter seus caminhos locais reescritos para caminhos utilizáveis no remoto durante a sincronização.
- Preservar a fronteira de roteamento de `workspaceIdentity` / `remoteSessionId` do workspace remoto, sem deixar a importação remota cair por engano no diretório de usuário local.

## Fora de escopo

- A primeira versão não suporta sobrescrever MCP remoto com o mesmo nome.
- A primeira versão não sincroniza MCP de nível de workspace. Configuração de workspace pertence aos arquivos do projeto e deve ser tratada pelo repositório de código, por edição remota de arquivos ou por um design separado de sincronização de configuração de workspace.
- A primeira versão não migra MCPs de plugin. MCPs de plugin derivam do estado de instalação de plugins e não podem ser tratados como configuração de nível de usuário.
- A primeira versão não valida a disponibilidade do ambiente remoto. A existência de context7, npx, uvx ou comandos personalizados é exposta pelo runtime remoto no `mcp/list` real ou na inicialização da sessão.
- A primeira versão não migra `.agents/mcp.json` remoto para `.zcode/cli/config.json`; se o server correspondente já existir validamente no remoto, o resultado da sincronização aparece como skipped.
- Não adiciona uma nova API genérica de escrita remota de arquivos.

## Lógica de execução local do MCP

A leitura local de MCP acontece no MCP store do renderer:

1. `mcpStore.loadMcpFromUserDirectory()` lê o diretório de usuário do host através de `IPlatformService.loadMcpFromUserDirectory()`.
2. A implementação da plataforma desktop lê o escopo de workspace e depois o de usuário; em cada escopo lê primeiro `.zcode` e, se não houver server, lê `.agents`.
3. Obtém-se `ZCodeMcpServer[]` na memória da UI, e o usuário pode habilitar, desabilitar, editar ou apagar.
4. Antes de criar / retomar uma task, `getEnabledMcpServersForZCode()` converte as configurações `zcodeagentmcp` habilitadas no parâmetro `mcpServers` do ZCode Protocol.
5. O adaptador de serviço passa `mcpServers` para o create/resume session do zcode-agent.
6. O zcode-server / bootstrap converte o MCP do protocolo em runtime config, e o agent runtime chama o adaptador de MCP.
7. MCP stdio usa `command` / `args` da máquina onde o agent runtime roda; MCP HTTP / SSE conecta ao serviço remoto usando URL e headers.

Portanto, sob SSH remoto, o MCP roda na máquina do zcode-server remoto. Uma configuração local passada diretamente ao runtime remoto tem efeito temporário, mas não significa que o diretório de usuário remoto foi persistido.

## Limites de serviço

Um novo serviço restrito de sincronização de MCP, em vez de estender a leitura/escrita de diretórios da plataforma:

- `IMcpSyncService.listLocalUserMcpCandidates()`: lista candidatos MCP de nível de usuário na máquina de quem chama. Quando o renderer chama via base services, lê o diretório de usuário local; quando chama via remote services, lê o diretório de usuário remoto.
- `IMcpSyncService.listRemoteUserMcpStatuses({ names })`: consulta no remoto se o server de mesmo nome já existe.
- `IMcpSyncService.exportMcpServers({ serverIds })`: exporta localmente os DTOs de configuração MCP por id de candidato, junto com o caminho home local para reescrita de caminhos.
- `IMcpSyncService.importMcpServers({ servers, localHomeDir, remoteWorkspacePath, localWorkspacePath?, overwrite: false })`: grava no remoto em `~/.zcode/cli/config.json`, pulando quando já existe um de mesmo nome; MCPs filesystem passam por reescrita de caminho antes da gravação.

O serviço precisa ser registrado, assim como o skill-sync, no host local e no service collection do zcode-server remoto. Quando o renderer desktop mescla os services de um workspace remoto, `mcpSyncService` precisa ser substituído pelo service remoto; caso contrário a importação escreveria de volta no diretório de usuário local.

## Conteúdo da sincronização de dados

A unidade mínima de dados sincronizada é a configuração de um único MCP server de nível de usuário:

- `name`
- estado `enabled`. O estado desabilitado é gravado no server config pelo campo de compatibilidade existente `enable: false`; o estado habilitado não grava campo adicional.
- campos brutos de `config`, incluindo:
  - stdio: campos como `type`, `command`, `args`, `env`, `timeout` / `timeoutMs`.
  - HTTP / SSE: campos como `type`, `url`, `headers`, `http_headers`, `timeout` / `timeoutMs`.
  - campos secret específicos de provider, por exemplo `apiKey`, `personalAccessToken`, header `Authorization`.

Não são sincronizados diretamente o conteúdo de arquivos, pacotes binários, dependências npm / uv / pip, o ambiente do host referenciado por variáveis de ambiente, nem o `.zcode/config.json` do workspace.

## Reescrita de caminhos do MCP filesystem

Regras de identificação do MCP filesystem:

- o nome do server normalizado é igual a `filesystem`, `file-system` ou `fs`; ou
- os `args` stdio contêm `@modelcontextprotocol/server-filesystem`; ou
- `command` / `args` stdio contêm `mcp-server-filesystem`.

A reescrita de caminhos trata apenas argumentos de caminho dentro dos args stdio; não reescreve command, env, URL HTTP nem headers.

Regras de reescrita:

1. Se o argumento é o caminho do workspace local ou um subdiretório dele, e o chamador forneceu `localWorkspacePath` e `remoteWorkspacePath`, reescreve para o caminho do workspace remoto preservando o sufixo relativo.
2. Se o argumento é o caminho home local ou um subdiretório dele, reescreve para o caminho home remoto preservando o sufixo relativo.
3. Outros caminhos absolutos permanecem como estão, por exemplo `/tmp/mcp-cache`. Se esses caminhos existem no remoto é responsabilidade do runtime remoto expor o erro.
4. Caminhos relativos, nomes de pacotes, flags, URLs e valores puramente argumentais permanecem como estão.
5. Suporta reescrever o caminho home local do Windows para um home remoto POSIX / Windows, com o separador de caminho remoto definido pelo `process.platform` remoto.

Exemplo:

Configuração local de nível de usuário:

```json
{
  "mcp": {
    "servers": {
      "filesystem": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/alice/workspace/z-code", "/Users/alice/Documents"],
        "enable": true
      },
      "context7": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@upstash/context7-mcp"]
      },
      "docs-api": {
        "type": "http",
        "url": "https://mcp.example.com/mcp",
        "headers": {
          "Authorization": "Bearer secret"
        }
      }
    }
  }
}
```

Sincronizando para o remoto `dev@host:/home/dev/z-code`, com home remoto `/home/dev`, grava-se:

```json
{
  "mcp": {
    "servers": {
      "filesystem": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/dev/z-code", "/home/dev/Documents"],
        "enable": true
      },
      "context7": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@upstash/context7-mcp"]
      },
      "docs-api": {
        "type": "http",
        "url": "https://mcp.example.com/mcp",
        "headers": {
          "Authorization": "Bearer secret"
        }
      }
    }
  }
}
```

## Design da UI

Em `Settings > MCP Servers`, a lista de configurações MCP deve, assim como as Skills, acompanhar os services do workspace atual:

- Workspace local lê e escreve no diretório de usuário / diretório de workspace da máquina local.
- Workspace remoto via SSH lê e escreve no diretório de usuário / diretório de workspace do host SSH.
- O topo da página exibe o contexto remoto atual, evitando confundir configurações remotas com configurações locais.
- Antes de criar / retomar / continuar na fila uma ZCode task, o MCP store precisa ser atualizado pelos services do workspace atual; uma task remota via SSH só pode passar as configurações MCP remotas ao agent runtime remoto.

Exibir um botão de ícone `同步 MCP 到此 SSH 主机` no topo do contexto remoto via SSH. Ao clicar, abre o `RemoteMcpSyncDialog`:

- O topo exibe o host SSH de destino e o caminho do workspace remoto.
- A lista exibe os MCP servers locais de nível de usuário, com nome, tipo, caminho do arquivo de origem e status.
- Itens ausentes no remoto vêm marcados por padrão; itens que já existem no remoto vêm desmarcados por padrão e rotulados como “远端已存在” (existe no remoto).
- Oferece o filtro `显示远端已存在` e um checkbox de selecionar todos os ausentes.
- Após o envio, exibe os resultados synced / skipped / failed.
- Após a sincronização, atualiza a leitura do diretório de usuário remoto no MCP store e a lista de status de MCP remoto. Os “candidatos locais” dentro do diálogo continuam usando base services; a lista de configurações MCP fora do diálogo usa os services do workspace atual.

Todas as entradas de workspaces remotos via SSH devem aparecer em par com as entradas de sincronização de Skills e reutilizar o mesmo conjunto de componentes de entrada:

- O menu "mais" do cabeçalho do workspace, o menu "mais" da sidebar do workspace, a página de seleção de diretório após conectar via SSH e as páginas de gerenciamento de Skills / MCP em Settings só exibem a entrada de sincronização em contexto remoto via SSH.
- As entradas de menu usam o mesmo conjunto de itens `同步 Skill` / `同步 MCP`, evitando que alguma entrada fique sem MCP.
- A página de seleção de diretório após conectar usa um único botão dropdown `同步`, com um ícone de nuvem de upload à esquerda e uma seta à direita; o dropdown contém `同步 Skill` e `同步 MCP`, podendo ganhar depois `同步 Subagent` e `同步 Plugin`.
- Na página de seleção de diretório após conectar, o item de menu MCP só pode ser clicado quando o caminho do diretório remoto atual estiver disponível, porque a reescrita de caminhos do MCP filesystem depende do caminho do workspace remoto.
- Todas as entradas abrem o mesmo `RemoteSkillSyncDialog` / `RemoteMcpSyncDialog`, cada uma com seu próprio callback de atualização pós-sincronização.

## Compatibilidade com remoto e múltiplos dispositivos

- Workspace local não exibe a entrada de sincronização de MCP remoto.
- Workspace remoto via SSH exibe a entrada.
- Workspace remoto via Docker / WSL não exibe a entrada na primeira versão, evitando confundir a semântica de reescrita de caminhos entre alvos de transporte diferentes.
- O controle remoto Web pelo celular não adiciona um runtime independente nem contorna o attachment de shared-host. Se o usuário entrar no celular no mesmo host de workspace remoto, as chamadas de serviço continuam roteadas pelos remote services já existentes.
- Toda busca de estado em nível de workspace usa `workspaceIdentity?.trim() || workspacePath`; a leitura e escrita real de arquivos usa `workspacePath`.

## Tratamento de erros

- Queda de conexão remota: o diálogo exibe o erro e impede o envio.
- Sem MCP de nível de usuário na máquina local: exibe estado vazio.
- Mesmo nome no remoto: pula, sem sobrescrever.
- Falha parcial: mantém os resultados já sincronizados e exibe o erro nos itens que falharam.
- Falha ao gravar JSON ou permissão insuficiente: o service remoto retorna um erro claro.
- Caminho filesystem sem correspondência no mapeamento home / workspace: permanece como está, sem bloquear a sincronização.

## Testes e validação

- Testes unitários:
  - A lista de candidatos lê os `mcp.servers` de nível de usuário de `~/.zcode/cli/config.json` na máquina local.
  - Quando não há server de usuário em `.zcode`, lê o fallback `mcpServers` de `~/.agents/mcp.json`.
  - Na importação de MCP HTTP, preserva URL, headers e secrets.
  - Na importação de MCP context7 / stdio, copia command / args / env diretamente.
  - Na importação de MCP filesystem, reescreve o caminho home local para o caminho home remoto.
  - MCP remoto de mesmo nome é pulado e não sobrescrito.
- Testes de UI:
  - Workspace local não exibe a entrada de sincronização de MCP.
  - `Settings > MCP Servers` de workspace remoto via SSH exibe a entrada de sincronização.
  - O diálogo seleciona por padrão os itens ausentes no remoto e exibe o resultado ao final.
- Obrigatórios no repositório:
  - `pnpm typecheck`
  - `pnpm lint`

## Riscos

- Copiar secrets para o remoto é uma escolha explícita de produto; a implementação da funcionalidade não faz mascaramento nem filtragem, e o usuário precisa confiar no host SSH remoto.
- context7 / npx / comandos stdio personalizados podem não estar disponíveis no remoto. A primeira versão não faz detecção de ambiente e usa o status do MCP remoto e os logs de execução como feedback.
- A reescrita de caminhos do filesystem cobre apenas mapeamentos determinísticos. Caminhos absolutos impossíveis de inferir permanecem como estão e podem falhar ao conectar no remoto.