# Importação de Skills de Agents Externos

## Objetivo

A página de configurações "Skills" oferece a importação com um clique, a partir dos diretórios locais de skills de Agents externos, para o ZCode. A primeira fase importa apenas Skills, e não servidores MCP, plugins, comandos ou provedores de modelos.

## Escopo das origens

A entrada de importação verifica automaticamente as seguintes origens locais:

- Claude Code: nível de usuário `~/.claude/skills` e nível de workspace `<workspace>/.claude/skills`
- Codex CLI: nível de usuário `~/.codex/skills` e nível de workspace `<workspace>/.codex/skills`
- OpenCode: nível de usuário `~/.config/opencode/skills` e nível de workspace `<workspace>/.opencode/skills`
- OpenClaw: nível de usuário `~/.openclaw/skills` e nível de workspace `<workspace>/skills`
- Augment: nível de usuário `~/.augment/skills` e nível de workspace `<workspace>/.augment/skills`
- Continue: nível de usuário `~/.continue/skills` e nível de workspace `<workspace>/.continue/skills`
- Goose: nível de usuário `~/.config/goose/skills` e nível de workspace `<workspace>/.goose/skills`
- Qwen Code: nível de usuário `~/.qwen/skills` e nível de workspace `<workspace>/.qwen/skills`
- Qoder: nível de usuário `~/.qoder/skills` e nível de workspace `<workspace>/.qoder/skills`
- Qoder CN: nível de usuário `~/.qoder-cn/skills` e nível de workspace `<workspace>/.qoder/skills`
- Windsurf: nível de usuário `~/.codeium/windsurf/skills` e nível de workspace `<workspace>/.windsurf/skills`
- Trae: nível de usuário `~/.trae/skills` e nível de workspace `<workspace>/.trae/skills`
- Trae CN: nível de usuário `~/.trae-cn/skills` e nível de workspace `<workspace>/.trae/skills`
- Kiro CLI: nível de usuário `~/.kiro/skills` e nível de workspace `<workspace>/.kiro/skills`
- Roo Code: nível de usuário `~/.roo/skills` e nível de workspace `<workspace>/.roo/skills`
- CodeBuddy: nível de usuário `~/.codebuddy/skills` e nível de workspace `<workspace>/.codebuddy/skills`

Gemini não é suportado.

## Estratégia de importação

- Apenas diretórios de skill que contenham `SKILL.md` são processados.
- O destino da importação é escolhido pelo usuário no menu suspenso abaixo do botão de importação:
  - `Global` grava em `~/.zcode/skills/<skill-dir>/`.
  - `Project` grava em `<workspace>/.zcode/skills/<skill-dir>/`.
- O modo de importação é alternado pelo usuário na parte inferior do diálogo:
  - `Link simbólico`: cria no diretório de destino um link simbólico apontando para o diretório de skill de origem; opção padrão; no Windows, o link de diretório usa `junction`.
  - `Cópia direta`: copia todo o diretório da skill para o diretório de destino.
- Se nenhum workspace estiver aberto, o destino `Project` fica indisponível.
- Sem workspace aberto, as origens de nível de usuário continuam sendo verificadas e importadas; origens de nível de workspace só participam quando existe `workspacePath`.
- Se já existir um diretório de destino com o mesmo nome, ou já existir no diretório de skills do ZCode uma skill com o mesmo `name`, o item é pulado e as skills existentes do ZCode não são sobrescritas.
- O modo de link simbólico só tem efeito nas novas skills importadas; se o diretório de destino já existir como uma cópia comum, ele não é substituído automaticamente por um link simbólico e continua sendo pulado como "diretório de destino já existe".
- O resultado da importação agrega `importedCount` / `skippedCount` / `failedCount` por origem.
- Após a conclusão da importação, a lista de skills é recarregada para que as novas skills apareçam imediatamente na página de configurações.

## Comportamento da UI

- A página de configurações "Skills" exibe um botão de ícone de importação ao lado do botão de criação.
- Ao clicar, abre-se o diálogo de importação, que por padrão verifica e lista as origens de skills importáveis.
- O diálogo referencia o arredondamento, o respiro e o estilo de painéis do workspace do assistente de onboarding, mas mantém a estrutura de coluna única; a linha de título mantém o Select de escopo e o botão de atualizar à direita, sem exibir o texto de descrição do título. O Select de escopo não exibe label adicional, apenas o valor atual `Global` / `Project`. A visão atual usa uma árvore de origens em dois níveis: o primeiro nível exibe o Agent e o caminho verificado, e o segundo exibe a lista de skills sob esse caminho, por padrão colapsada; clicar na seta ou no texto da origem expande para confirmar o detalhe das skills. Os dois escopos são sempre selecionáveis, e quando o escopo atual não tem origens a área de lista exibe um estado vazio.
- O usuário pode marcar skills individualmente no segundo nível, que exibe apenas skills importáveis; skills já importadas, cujo diretório de destino já existe ou cuja skill de mesmo nome já existe são filtradas e não aparecem na lista de importação. Se houver `version` no frontmatter do `SKILL.md`, exibe-se um badge de versão logo após o nome da skill, sem mostrar o caminho. O checkbox do primeiro nível serve para selecionar/desmarcar todas as skills importáveis daquela origem e exibe estado indeterminado quando há seleção parcial.
- No topo da lista há um checkbox de selecionar/desmarcar todas do escopo atual, que afeta apenas as skills importáveis dentro do `Global` / `Project` atual e não interfere no estado de seleção do outro escopo. Ao abrir o diálogo ou fazer uma nova varredura, o padrão é `Global`, mas nem as origens `Global` nem `Project` vêm marcadas por padrão; é preciso o usuário escolher explicitamente.
- O botão de importação é um botão dividido: o lado esquerdo, ao ser clicado, processa as skills selecionadas conforme o destino e o modo de importação atuais; o menu suspenso à direita apenas troca o destino da importação, sem disparar a importação diretamente; skills existentes do ZCode com o mesmo nome ou o mesmo `name` continuam sendo puladas e não são sobrescritas. O menu suspenso inferior alterna entre `Cópia direta` e `Link simbólico`, e o ícone de exclamação ao lado, ao passar o mouse, explica por tooltip o impacto do modo de importação atual.
- A página de conclusão da importação suaviza os números de estatística do topo e exibe a lista das skills envolvidas nesta execução; cada skill exibe um ícone de status, o nome e a versão opcional, sem mostrar o caminho do arquivo, e os itens pulados exibem o motivo específico por meio do ícone.
- Um resultado de varredura vazio mantém o diálogo aberto e informa que não há skills importáveis no momento, evitando que o usuário acredite que o botão não funciona.

## Compatibilidade e limites

- O `settings-sync` continua soportando a máquina de estados da importação; esta funcionalidade adiciona a categoria `skills` e a origem de Agents externos, mas não altera a visibilidade padrão de `providers` do onboarding.
- O diálogo de importação não varre `.agents/skills` de nível de usuário ou de projeto, porque a lista comum de skills já lê diretamente o diretório de skills `.agents`; a importação apenas copia outras origens de Agents externos para o diretório de skills do ZCode.
- Ao percorrer do diretório atual até a raiz do worktree, a lista de skills do workspace mescla em cada camada a leitura de `.zcode/skills` e `.agents/skills`, mantendo consistência com os roots padrão do Agent runtime; não se pode, por já haver skills em `.zcode/skills` na mesma camada, pular `.agents/skills` em toda a raiz. Quando as duas raízes atingem o mesmo realpath, mantém-se apenas uma; skills com o mesmo nome mas caminhos diferentes continuam preservadas separadamente como itens instalados; o obsoleto `.zcode/cli/skills` e `.claude/skills` não participam da descoberta.
- A lista de skills de nível de usuário lê simultaneamente `~/.zcode/skills` e `~/.agents/skills`, evitando que, após importar uma skill global, as skills globais restantes de Agents externos sejam ocultadas na página de configurações; se uma skill em `.agents` já foi copiada para `.zcode/skills` com o mesmo nome de diretório ou o mesmo `name`, a lista exibe prioritariamente a cópia em `.zcode`, evitando duplicatas.
- O Agent runtime e a página de configurações devem usar semântica consistente para o frontmatter de `SKILL.md`: `description` suporta scalar YAML de linha única, bloco folded `>` e bloco literal `|`. Skills escritas à mão em `~/.agents/skills` frequentemente usam `description: >` para escrever instruções de disparo em várias linhas; não se pode ler apenas o literal de `description: >` de nível superior e descartar as linhas indentadas; caso contrário a página de configurações consegue exibir a descrição completa, mas a lista de skills injetada pelo Agent fica só com `>`.
- Workspaces remotos usam apenas caminhos do sistema de arquivos acessíveis ao processo do host atual; a semântica de isolamento de identidade continua passando `workspaceIdentity`, e a execução de caminhos continua usando `workspacePath`.
- O modo de cópia direta não referencia diretórios externos, evitando que remoções ou alterações posteriores do Agent externo afetem o ZCode; o modo de link simbólico aponta continuamente para o diretório externo, sendo adequado para quem deseja acompanhar as mudanças de skills do Agent externo.

## Verificação

- Cobrir diretório ausente, diretório vazio, pulo por nome duplicado, importação de nível de usuário e importação de nível de workspace.
- Cobrir o caso em que `.zcode/skills` e `.agents/skills` existem na mesma camada do workspace, garantindo que ambos sejam descobertos, e continuar ignorando `.zcode/cli/skills` e `.claude/skills`.
- Cobrir o frontmatter multilinha com `description: >` / `description: |` em `.agents/skills`, garantindo que o resultado da descoberta do Agent runtime seja consistente com a página de configurações.
- A UI deve cobrir o botão de importação, a lista de origens do diálogo e a recarga após a conclusão da importação.
- É obrigatório executar `pnpm typecheck` e `pnpm lint`.