# Design de Sincronização Remota de Skills via SSH

## Contexto

Atualmente os skills do ZCode são lidos pelo sistema de arquivos em tempo de execução. Um workspace local lê os skills de usuário e de projeto da própria máquina; workspaces remotos via SSH / Docker / WSL leem os skills do sistema de arquivos remoto. Um workspace remoto pode usar skills, mas的前提 é que os diretórios com `SKILL.md` correspondentes já existam na máquina remota.

O `SettingsSyncService` existente resolve o problema de "importar de um Agente externo para o ZCode" dentro do mesmo runtime; ele não grava um diretório local em uma máquina remota via SSH. A camada de conexão remota existente tem `IRemoteBackend.upload()` internamente, mas `RemoteConnection` só expõe `services` para as camadas superiores, e não se deve expor a capacidade genérica de upload diretamente ao renderer só por causa da sincronização de skills.

## Objetivos

- Permitir que o usuário, em um workspace SSH remoto já conectado, sincronize os skills locais de nível de usuário para o diretório remoto `~/.zcode/skills` do usuário naquela máquina SSH.
- Os candidatos locais sincronizáveis devem ter semântica consistente com a descoberta local de skills de nível de usuário: incluir `~/.zcode/skills` e também o diretório compatível `~/.agents/skills`; quando um skill de mesmo nome em `.agents` já tiver sido coberto por `.zcode` pelo nome do diretório, pelo nome do skill ou pelo caminho real de `SKILL.md`, apenas a versão de `.zcode` é exibida. A descoberta de candidatos precisa dar suporte recursivo a diretórios de agrupamento e seguir symlinks de diretório; na sincronização para o remoto, escreve-se conteúdo de diretório comum, sem criar symlinks no remoto.
- Permitir seleção item a item e selecionar tudo.
- Quando um skill de mesmo nome já existe no remoto, pular por padrão, sem sobrescrever.
- Após a sincronização, exibir os resultados synced / skipped / failed e atualizar a lista de skills remota.
- A entrada de UI precisa expressar claramente que o alvo da ação atual é "esta máquina SSH", evitando que o usuário acredite se tratar de uma configuração global.
- Preservar a fronteira de roteamento `workspaceIdentity` / `remoteSessionId` do workspace remoto, para que requisições remotas não caiam nos serviços locais.

## Não objetivos

- A primeira versão não suporta sobrescrever um skill remoto de mesmo nome.
- A primeira versão não coloca a entrada de sincronização de skills no menu de contexto da task; a sincronização de skills é uma ação de host / workspace, não de task.
- A primeira versão não suporta sincronização em um clique de itens históricos de SSH não conectados; a sincronização de itens históricos exige estabelecer uma sessão SSH temporária e será desenhada separadamente depois.
- A primeira versão não sincroniza skills gerenciados por plugin / skills de sistema, nem sincroniza o estado de instalação de plugins locais para o remoto.
- A primeira versão não grava por padrão no diretório de projeto remoto `.zcode/skills`.
- Não criar uma nova API genérica de escrita de arquivos remotos.

## Design de UI

Adiciona-se um diálogo reutilizável `RemoteSkillSyncDialog`, e todas as entradas abrem o mesmo diálogo.

As entradas são divididas em três categorias por prioridade:

1. Entrada principal no header / overflow menu do workspace remoto: `同步 Skill`. O menu `...` da linha de workspace à esquerda também oferece uma entrada com o mesmo nome, para facilitar que o usuário atue diretamente no workspace SSH atual a partir da lista de projetos. As duas entradas só aparecem quando o workspace atual é um remote SSH conectado.
2. Entrada de gerenciamento em `Settings > Skills`: `同步 Skill`. Só aparece quando o workspace recente ou atual é um remote SSH conectado. O topo dessa seção precisa exibir o contexto atual, por exemplo `SSH user@host · /home/dev/project`, deixando claro que a lista atual e o alvo da sincronização pertencem ao contexto remoto.
3. Entrada auxiliar no diálogo de conexão SSH: `同步 Skill` aparece somente depois que o SSH já está conectado e o usuário entrou na etapa de seleção de diretório remoto / já conectado. Não fica ao lado do formulário de parâmetros de login.

O `SettingsPage` hoje é uma forma mista de "casca de configuração global + algumas seções com escopo de workspace": `PluginsSection`, `CommandsSection` e `SubagentsSection` já recebem `activeWorkspacePath` / `activeWorkspaceIdentity`, e `SkillsSection` também precisa passar a receber explicitamente `workspacePath`, `workspaceIdentity`, `remoteSessionId` e `remoteTarget`, evitando ler implicitamente o tab store dentro da página de configurações e deixando o contexto confuso.

Conteúdo do diálogo:

- No topo, exibe-se a máquina SSH alvo e o diretório remoto de nível de usuário alvo.
- À direita do título, exibe-se um ícone compacto de aviso de risco com exclamação, usando o componente de tooltip existente para carregar o texto explicativo. O aviso precisa explicar: a sincronização migra Skills locais para a máquina remota, mas não garante que todos os dados dependentes e o ambiente do sistema estejam disponíveis; se um Skill ficar indisponível por causa do ambiente do sistema remoto, de permissões ou da falta de dependências, o usuário precisa instalar ou completar as dependências manualmente no servidor remoto. Esse aviso é uma explicação global de risco da sincronização, não ocupa espaço na lista e não afeta a quebra de linha da linha alvo e do filtro em telas estreitas. O tooltip não é exibido automaticamente, apenas quando o usuário passa o mouse sobre o ícone.
- A lista exibe os skills locais de nível de usuário, e cada linha contém nome, descrição, caminho de origem e status de sincronização. A descrição fica recolhida em uma linha por padrão, e o controle de expandir/recolher fica na mesma linha do nome do skill, usando um botão de ícone; clicar no corpo do card alterna a seleção, e clicar no checkbox, no label do nome ou no botão de expandir não dispara a alternância da linha. A origem dos candidatos de nível de usuário deve permanecer consistente com os skills "pessoais" da página de configurações local; não se deve varrer apenas `~/.zcode/skills` e perder `~/.agents/skills`, diretórios de agrupamento ou symlinks de diretório.
- À direita da linha alvo há um checkbox `显示远端已存在` que atua como filtro, exibido na mesma linha das informações da máquina alvo e quebrando linha automaticamente em telas estreitas; vem marcado por padrão para preservar a visibilidade existente. Desmarcá-lo apenas oculta as rows com `remoteStatus.exists === true`, sem requisitar o serviço novamente e sem alterar a determinação de estado remoto. Se não houver itens visíveis após o filtro, exibe-se o estado vazio "当前仅有远端已存在的 Skills", com a sugestão de remarcar para visualizar. O diálogo mantém a mesma altura antes e depois do filtro, e a mudança ocorre apenas na área de rolagem interna da lista, evitando que a variação no número de rows visíveis faça o tamanho do diálogo oscilar.
- Fornece-se um único checkbox `全选`; desmarcado / parcialmente marcado / marcado correspondem a nenhum selecionado, itens ausentes parcialmente selecionados e todos os itens ausentes no remoto selecionados. Desmarcar esse checkbox limpa a seleção atual.
- Por padrão, os skills ausentes no remoto ficam marcados, e os skills de mesmo nome já existentes no remoto não são marcados e recebem a marcação "已存在，将跳过". Quando o filtro oculta itens existentes, a contagem no rodapé e o `全选` continuam considerando apenas os itens sincronizáveis ausentes no remoto; itens ocultos não podem ser sincronizados.
- O botão de envio exibe a quantidade selecionada.
- A página de conclusão exibe o detalhamento synced / skipped / failed.

## Fronteira de serviços

Adiciona-se um serviço de sincronização de skills restrito, em vez de expor escrita genérica de arquivos:

- Capacidade do lado local: enumerar os skills locais de nível de usuário sincronizáveis e gerar um arquivo compactado restrito para os skills selecionados. A lógica de enumeração precisa cobrir `~/.zcode/skills` e `~/.agents/skills` e reutilizar a semântica local de deduplicação de nível de usuário, incluindo diretórios de agrupamento e symlinks de diretório.
- Capacidade do lado remoto: receber o arquivo compactado e importá-lo para o `~/.zcode/skills` remoto, pulando quando o diretório de mesmo nome já existir.

Recomenda-se adicionar `ISkillSyncService`, registrado nos services do host local e nos services do zcode-server remoto. O renderer o acessa pelo roteamento de services existente:

- Leitura de candidatos locais: usa `useBaseWorkspaceServices()` para obter os base services locais.
- Estado e importação remotos: usa os remote services do workspace SSH atual, resolvidos por `remoteSessionId` / `workspaceIdentity`, sem recair para os serviços locais.
- Quando o renderer desktop mescla os remote workspace services, `skillSyncService` precisa ser sobrescrito como remote service, assim como `skillsService`; caso contrário, a entrada da página de configurações / do header grava o resultado da importação no `~/.zcode/skills` local, enquanto a UI ainda mostra a sincronização remota como bem-sucedida.
- Quando o `init-remote` do host desktop expõe diretamente os services da conexão remota, ele também precisa registrar o `skillSyncService` remoto; caso contrário, a requisição do renderer ao channel `skill-sync` fica esperando o registro no host e falha com `Channel name 'skill-sync' timed out after 1000ms`.
- A versão do `zcode-server.cjs` remoto pode ser igual à local e ainda assim o bundle continuar sendo um pacote de desenvolvimento antigo; a verificação de implantação da conexão SSH precisa sondar se o bundle do server implantado contém o channel `skill-sync` e, quando faltar, atualizar o server principal.

Métodos de serviço sugeridos:

- `listSyncCandidates({ workspacePath?, workspaceIdentity? })`
  - Quando chamado localmente, lista os skills locais de nível de usuário.
  - Quando chamado remotamente, pode ser usado para consultar o estado de existência de mesmo nome no `~/.zcode/skills` remoto.
- `exportSkills({ skillIds })`
  - Retorna um arquivo compactado tar.gz binário com manifest.
  - Só permite exportar diretórios de skills de nível de usuário já descobertos.
- `importSkillsArchive({ archive, overwrite: false })`
  - Descompacta para o `~/.zcode/skills` remoto de nível de usuário.
  - `overwrite` é fixado como `false` na primeira versão.
  - Retorna o resultado synced / skipped / failed de cada skill.

A importação do arquivo compactado precisa fazer validação de segurança de caminho:

- Rejeitar caminhos absolutos, travessia de caminho com `..`, caminhos com barra invertida, symlinks e arquivos de dispositivo especiais.
- Só é permitido gravar subdiretórios de skill abaixo do diretório raiz alvo.
- Cada skill precisa conter `SKILL.md`.
- Symlinks de diretório locais são desreferenciados em conteúdo de diretório comum apenas na entrada de exportação; dentro do arquivo compactado ainda não são permitidos symlinks nem arquivos especiais.

## Fluxo de dados

1. O usuário abre o diálogo de sincronização a partir do header do workspace SSH, de Settings > Skills ou do diálogo de conexão SSH.
2. O diálogo obtém os skills candidatos locais pelos base services.
3. O diálogo obtém os nomes de skills já existentes no remoto pelos remote services.
4. A UI marca por padrão os itens ausentes no remoto, e o usuário pode ajustar manualmente ou selecionar todos os ausentes.
5. No envio, o service local gera o arquivo compactado e o service remoto importa o arquivo.
6. O service remoto verifica conflito por skill name / nome de diretório e pula quando já existe.
7. A UI exibe o resultado, atualiza o `ISkillsService.list()` remoto e dispara a invalidação do skill context da draft session remota.

## Compatibilidade entre remoto e local

- Workspaces locais não exibem a entrada de sincronização remota.
- Workspaces remotos via SSH exibem a entrada.
- Workspaces remotos via Docker / WSL não exibem a entrada na primeira versão, evitando estender a semântica de "sincronização com máquina SSH" a alvos de transporte diferentes.
- O controle remoto Web pelo celular não cria um remote runtime separado. Se o celular entrar no mesmo host de workspace remoto, os remote services devem continuar usando o shared-host attachment; na primeira versão a entrada de sincronização pode aparecer apenas no desktop.
- Toda busca de estado no nível do workspace usa `workspaceIdentity?.trim() || workspacePath`, e a leitura/escrita de caminhos continua usando o `workspacePath` real.

## Tratamento de erros

- Queda da conexão remota: o diálogo exibe que a conexão foi interrompida e bloqueia o envio.
- Sem skills locais de nível de usuário: exibe-se o estado vazio e o botão de envio não é mostrado.
- Falha parcial: mantém-se o resultado de sucesso, os itens com falha exibem o motivo do erro e o usuário pode reabrir o diálogo para tentar de novo.
- Arquivo compactado grande demais: o servidor retorna um erro explícito. A implementação da primeira versão deve definir um limite de tamanho por sincronização, evitando transmitir diretórios muito grandes via RPC.
- Permissões insuficientes: o service remoto retorna o erro de que não foi possível criar ou gravar `~/.zcode/skills` e orienta o usuário a verificar as permissões do usuário remoto.

## Testes e verificação

- Testes unitários:
  - A lista de candidatos locais inclui os skills de nível de usuário de `~/.zcode/skills` e `~/.agents/skills`, e exclui skills de plugin / sistema.
  - Candidatos de `.agents/skills` já cobertos por `.zcode/skills` pelo nome do diretório, pelo nome do skill ou pelo caminho real de `SKILL.md` não aparecem duplicados.
  - Skills de nível de usuário em diretórios de agrupamento podem ser sincronizados para o mesmo diretório relativo remoto.
  - Skills de nível de usuário na forma de symlink de diretório local podem ser sincronizados como diretório comum remoto.
  - O arquivo compactado de exportação contém apenas os user skills selecionados.
  - Na importação, um skill de mesmo nome é pulado e o diretório original não é sobrescrito.
  - A importação rejeita arquivos compactados com travessia de caminho, caminho absoluto, symlink ou sem `SKILL.md`.
- Testes de UI:
  - Um workspace local não exibe a entrada de sincronização.
  - O header de um workspace remoto SSH exibe a entrada de sincronização.
  - `Settings > Skills` exibe o contexto e o botão de sincronização em contexto remoto SSH.
  - O diálogo suporta seleção item a item, selecionar todos os ausentes e a exibição do resultado de conclusão.
- Verificação de integração:
  - Depois de sincronizar um skill local em um workspace remoto SSH, o `ISkillsService.list()` remoto enxerga esse skill.
  - Um skill remoto de mesmo nome já existente é pulado.
  - Ao criar ou restaurar uma draft session após a sincronização, o contexto de skills atualizado é visível.
- Obrigatórios no repositório:
  - `pnpm typecheck`
  - `pnpm lint`

## Riscos

- A transmissão binária por RPC é adequada para diretórios de skill pequenos a médios. Se o skill do usuário contiver ativos grandes, o limite de tamanho da primeira versão impedirá a sincronização; depois isso pode ser trocado por um arquivo temporário no host + backend upload.
- A página de Settings mistura seções globais e seções com escopo de workspace; é obrigatório deixar explícito o contexto remoto atual na UI, caso contrário o usuário tende a entender errado o alvo da sincronização.
- A estratégia de conflito entre skill name e nome de diretório precisa permanecer estável. Na primeira versão, a existência do diretório alvo remoto é o critério de skip, e o nome real do diretório é exibido no resultado.