# Lista de comandos em Configurações

A lista de comandos nas configurações exibe os comandos de usuário e de plugin sem expor detalhes de armazenamento nem repetir orientações de gerenciamento de plugins em cada grupo ou linha.

- As linhas exibem o nome do comando, a dica de argumentos, a descrição, os metadados de propriedade relevantes e os controles disponíveis. Comandos de workspace mantêm o rótulo Workspace, enquanto comandos de usuário não repetem o rótulo User; comandos de plugin mantêm o rótulo com o nome do plugin.
- As linhas de comando de usuário não exibem o caminho do diretório que as sustenta.
- As linhas de comando de plugin e o cabeçalho do grupo de plugin não exibem «Registered by a plugin. Edit it in the plugin.». O título do grupo de plugin e o rótulo com o nome do plugin já comunicam a propriedade.
- As descrições dos itens usam `text-ui-sm text-foreground-subtle` como texto secundário.
- A barra de busca no topo de Commands e o agrupamento `Installed` unificam o uso do `mt-6` (24px) explícito da área de conteúdo; a raiz compartilhada das Tabs não fornece mais `gap-2`, evitando que a caixa de busca e o botão New somem 32px.
- As linhas de comando usam o mesmo ícone `Terminal` da entrada de comandos nas configurações. A arte do plugin tem precedência quando disponível; uma imagem de plugin ausente ou com falha faz fallback para `Terminal`, não para `Cable`.
- O escopo de workspace e a propriedade de plugin usam o tratamento de escopo compartilhado: um Badge `rounded-full border-border bg-surface text-ui-sm` com um ícone Folder ou Cable de 14px.

## Escopo de workspace no editor de comando

O editor de comando usa o mesmo menu de escopo concreto das configurações de MCP de plugin.

- Um novo comando tem escopo User por padrão.
- O menu de Scope lista User mais cada aba de Workspace atualmente aberta na janela.
- As opções de Workspace são deduplicadas e selecionadas por `workspaceIdentity?.trim() || workspacePath`; o caminho real do arquivo de comando continua usando `workspacePath`.
- Escolher um Workspace altera apenas o rascunho atual do comando e seu destino de salvamento. Não ativa aquela aba de Workspace nem altera a lista de Commands do pai.
- Salvar em outro Workspace local ou remoto usa o serviço Host resolvido daquele Workspace. Passar outro caminho ao Host atual não é um salvamento cross-Workspace válido.
- A lista atual de Commands é atualizada apenas quando o destino salvo é o Workspace representado por essa lista. Um salvamento em outro Workspace não pode anexar o novo comando à projeção da lista atual.
- Commands existentes mantêm um Scope travado. A edição não pode mover um comando entre armazenamento de User e de Workspace, nem entre Workspaces.
- Se um Workspace selecionado fechar durante a criação, o rascunho faz fallback para User. Se o Workspace proprietário fechar durante a edição, o editor sai em vez de mudar o destino travado.

```text
Escopo do formulário de comando
       |
       +-- User ----------------------> Host da lista atual -> diretório de commands de usuário
       |
       +-- Chave de Workspace
              |
              +-- resolver metadados da aba aberta
              |      workspaceIdentity / remoteSessionId / remoteTarget
              |
              +-- resolver o serviço Host de destino
              |
              +-- gravar em workspacePath/.zcode/commands
```

## Resumo de impacto

| Campo | Decisão |
| --- | --- |
| Camadas de mudança | Apresentação, origem das opções, padrão do rascunho, efeito do commit, persistência |
| Superfície de UI | `CommandsSection` e `CommandForm` |
| UI compartilhada | `PluginScopeMenu` |
| Proprietário do rascunho | Chave de escopo do formulário de comando |
| Destino do commit | `commandsService` do Host do Workspace selecionado |
| Persistência | Diretório de comandos de User ou de Workspace; sem migração de formato |
| Limite de modo | Abas de Workspace local e remoto compartilham a semântica de escopo, mas resolvem serviços Host diferentes |
| Fora de escopo | Ordem de descoberta de comandos, comportamento de runtime dos slash commands, gerenciamento de comandos de plugin, seleção de Workspace entre janelas |

## Casos aceitos

| Caso | Setup | Ação | Asserções |
| --- | --- | --- | --- |
| CMD-SCOPE-01 | Dois Workspaces locais abertos | Criar e selecionar o Workspace B | B é exibido pelo nome; o salvamento grava o caminho de B pelo serviço de destino resolvido; a lista de A não é contaminada |
| CMD-SCOPE-02 | Dois Workspaces remotos com o mesmo caminho e identidades diferentes | Abrir o menu de escopo | Ambas as identidades permanecem como chaves de escopo distintas e são roteadas para suas próprias sessões remotas |
| CMD-SCOPE-03 | Novo editor com um Workspace selecionado | Fechar a aba selecionada | O escopo faz fallback para User sem escrita |
| CMD-SCOPE-04 | Command de Workspace existente | Abrir o formulário de edição | O proprietário real é exibido, o Scope fica desabilitado e o salvamento não pode migrar o armazenamento |
| CMD-SCOPE-05 | O proprietário do Command de Workspace existente fecha | Fechar a aba do proprietário | O editor sai e não realiza nenhuma escrita |
| CMD-SCOPE-06 | Escopo User | Salvar um novo Command | O salvamento omite o `workspacePath` do projeto e atualiza a lista atual |