# Design de sincronização de Plugin remoto via SSH

## Registro de revisões

- 2026-07-06: a V1 suporta o plugin inline de nível de usuário, copiando o diretório para o remoto via SSH através de um archive.
- 2026-07-07: added a sincronização de plugin de marketplace já instalado. Essa capacidade é implementada reinstalando na remoto o plugin de mesmo nome do marketplace, sem copiar cache e sem fallback implícito.
- 2026-07-07:明确了 que plugin builtin não é sincronizado manualmente. O remoto deve携带 os assets de plugins oficiais de forma nativa pelo ZCode Agent resource; a construção do pacote de recursos remoto e a verificação de deployment precisam cobrir `packages/*-plugin`.
- 2026-07-08: added o plano de sincronização por SSH de source de marketplace local `file` / `directory` / `settings`. Essa capacidade espelha a source do marketplace para o remoto e ainda deixa a instalação do marketplace rodar no remoto, sem copiar o cache local.
- 2026-07-08: added a UX de visualização do processo de sincronização: durante a sincronização os cards de plugin são mantidos, com progresso por item, log no hover e stop por item; o stop primeiro faz a UI parar de esperar o plugin atual e seguir para os próximos plugins e, se o passo atual for um marketplace add/install com operationId, envia ainda um pedido de cancelamento de protocolo para o remoto.
- 2026-07-08: added o cancelamento por item no nível de protocolo: o diálogo de sincronização remota gera um operationId único para marketplace add/install e, no stop, cancela apenas a operação remota de gestão de plugin correspondente a esse operationId; a página de configurações de plugins local que instala, a adição de marketplace e os demais pedidos do ZCode Protocol sem operationId mantêm o comportamento original.
- 2026-07-08: added a sincronização do subconjunto seguro de `plugins.options`: apenas primitive options explicitamente configurados na máquina local, não sensíveis, não file/directory e com schema remoto compatível são sincronizados; antes de escrever no remoto, eles são mesclados com as options já existentes no remoto, sem sobrescrita total.
- 2026-07-10: added as restrições de permissão multiplataforma do arquivamento de recursos de plugin builtin remotos: no download/upload local e no upload de dev, ao gerar o tar as entradas de diretório usam POSIX `0755` de forma unificada, sem propagar a pseudo permissão POSIX do `stat.mode` do Windows que não tem bit de execução; ao detectar assets builtin antigos inacessíveis, o deployment precisa restaurar primeiro o owner `rwX` do diretório do produto e só então fazer a substituição.
- 2026-07-09: added o limite de assets do plugin oficial `browser`: ele é um plugin oficial de conteúdo habilitado por padrão, mas além de `skills` também carrega recursos de documentação de runtime em `docs/`; a whitelist de empacotamento remoto/desktop precisa cobri-lo igualmente.
- 2026-07-23: unificada a capitalização dos termos técnicos nas entradas de sincronização remota: em chinês `同步 Skill` / `同步 MCP` / `同步 Plugin`, em inglês `Sync Skill` / `Sync MCP` / `Sync Plugin`.

## Contexto

O remoto SSH já suporta a sincronização de Skill e MCP de nível de usuário. A sincronização de Skill copia o diretório de skills do usuário da máquina local para `~/.zcode/skills` no remoto, e a sincronização de MCP importa a configuração de MCP do usuário da máquina local para `~/.zcode/cli/config.json` no remoto. Ambas seguem um modelo de sincronização explícito, unidirecional e sem sobrescrita.

Plugin é mais complexo que Skill/MCP: não é um recurso único, e sim uma composição de diretório de plugin, `plugins.dirs`, enabled/options, cache do marketplace, installed records, supressão de builtin, dados do plugin e projeções de runtime de skills/commands/hooks/MCP. Portanto a sincronização por SSH precisa tratar por tipo, evitando tomar o estado de execução da máquina local por configuração portátil.

## Escopo suportado atualmente

### Plugin inline de nível de usuário

- Origem: plugin inline apontado por `plugins.dirs` em `~/.zcode/cli/config.json` de nível de usuário da máquina local.
- Manifest: suporta `.zcode-plugin/plugin.json`, `.claude-plugin/plugin.json` e `.codex-plugin/plugin.json`.
- Plugin id: gerado uniformemente como `<manifest.name>@inline`.
- Forma de sincronização: o `pluginSyncService` local exporta um archive, e o `pluginSyncService` do remoto via SSH importa para `~/.zcode/plugins/<plugin-dir>`.
- Escrita de configuração: após a importação bem-sucedida, o caminho absoluto remoto é acrescentado ao `plugins.dirs` do `~/.zcode/cli/config.json` remoto.
- Estado enabled: se `plugins.enabledPlugins[pluginId]` local for boolean, ele é sincronizado para a configuração de usuário remota.
- Estado de options: se `plugins.options[pluginId]` existir localmente, sincroniza-se apenas a configuração primitive não sensitive e não `file` / `directory` declarada no manifest `userConfig`; após a importação remota, o schema do plugin remoto é relido e a escrita via `plugins/configure` só acontece quando o remoto tem a mesma key e um tipo compatível, mesclando com as options já existentes no remoto.
- Política de conflito: quando já existe o mesmo plugin id ou o diretório alvo no remoto, pula-se sem sobrescrever.
- Exibição de components: identificar `skills`, `commands`, `hooks` e `mcp` a partir do manifest ou do diretório.

### Plugin de marketplace já instalado

- Origem: `getPluginsOverview().installedPlugins` retornado pelo Agent local, ou seja, plugins de marketplace já instalados e com installed record.
- Plugin id: usa o `<plugin-name>@<marketplace>` do registro instalado.
- Scope: suporta scope `user` e `workspace`, e a instalação remota mantém o scope local.
- Forma de sincronização: não copia o cache local; chama `installPlugin({ marketplace, pluginName, scope })` no remoto, deixando o marketplace resolver remoto reinstalar o plugin de mesmo nome.
- Source do marketplace: se o remoto não tiver o marketplace de mesmo nome e a source do marketplace local puder ser serializada como `github`, `git` ou `url`, chama primeiro `addPluginMarketplace` no remoto e só então instala o plugin.
- Source de marketplace local: se o remoto não tiver o marketplace de mesmo nome e a source do marketplace local for `file`, `directory` ou um `settings` exportável por completo, espelha primeiro para o remoto, em `~/.zcode/plugins/marketplace-sources/<marketplace-id>-<hash>`, as sources necessárias ao plugin selecionado e ao closure de dependências do mesmo marketplace; depois usa esse diretório remoto para chamar `addPluginMarketplace` e, por fim, executa a instalação.
- Estado enabled: após a instalação remota bem-sucedida, chama `setPluginEnabled`, alinhando o estado enabled local.
- Estado de options: após a instalação remota bem-sucedida, relê o schema do plugin remoto e sincroniza `plugins.options[pluginId]` pelas mesmas regras de subconjunto seguro do inline; keys sensitive, de caminho ou incompatíveis com o schema remoto não são enviadas.
- Política de conflito: quando o mesmo plugin id já existe no remoto, considera-se instalado, sem reinstalar, sobrescrever ou atualizar.

### Plugin builtin / oficial

- Origem: official plugin embutido no pacote do ZCode, atualmente incluindo `android-emulator`, `browser`, `document-skills`, `ios-simulator`, `restore-legacy-sessions`, `skill-creator` e `zcode-guide`.
- Plugin id: uniformemente `<name>@zcode-plugins-official`.
- Estratégia de sincronização: não copiar manualmente pelo diálogo de sincronização de plugins. Plugin builtin é uma capacidade nativa do produto, e o remoto SSH precisa recebê-la junto do ZCode Agent resource remoto.
- Layout de recursos remoto: `glm/<platform>/packages/<plugin-package>` entra no pacote de recursos remoto e é implantado em `~/.zcode/server/agents/glm/packages/<plugin-package>`.
- Processo de seed: quando o agent remoto inicia, ele reutiliza o seed de filesystem de official plugin existente para materializar esses recursos em `~/.zcode/plugins/cache/zcode-plugins-official/<name>/<version>` no remoto.
- Whitelist de recursos: `.zcode-plugin`, `skills`, `commands`, `hooks`, `.mcp.json` e `docs` dos plugins oficiais são todos recursos seedáveis. `browser` não tem runtime de MCP, mas `runtimeFeatures.browserDocumentationRoot` aponta para `docs/` e, quando ausente, `agent.browsers.documentation()` degrada.
- Verificação de deployment: quando o remoto já tem `zcode.cjs` e o wrapper mas falta `packages/*-plugin/.zcode-plugin/plugin.json`, não se pode pular o deployment do ZCode Agent; é preciso atualizar o componente `glm` e completar os packages.
- Permissões de arquivamento: o download/upload local e o upload de dev regeraram o tar no lado desktop; as entradas de diretório precisam usar `0755` estável entre plataformas e não podem usar direto o `stat.mode` local. O Windows só implementa semântica limitada de permissão de leitura/escrita, e propagar direto gravaria diretórios com mode sem bit de execução, o que impossibilita travessiar ou apagar no remoto depois da extração.
- Migração de corrupção: packages `0644` gerados por versões antigas fazem o `rm -rf` pré-extração continuar falhando na nova versão. Quando o deployment detecta o manifest builtin inacessível e a raiz de packages existe, precisa primeiro aplicar a correção de owner `rwX` nos diretórios próprios do produto e só então atualizar os recursos; não pode modificar recursivamente o diretório de plugins do usuário.
- Limite de sincronização manual: não adicionar uma entrada de "sincronizar plugin builtin manualmente", evitando trazer o builtin como se fosse um plugin inline ou obrigar cada remoto a depender de um reparo manual do usuário.

### Atualização das projeções de runtime após a sincronização

- Após a sincronização de plugins, o plugin management store remoto é atualizado para que a página de configurações veja imediatamente o estado de instalação mais recente.
- O shared skill store do workspace remoto é atualizado e a deferred draft session é invalidada, garantindo que a lista de skills `$` e a preparação das sessões seguintes enxerguem as novas plugin skills.
- Chamar diretamente o `commandsService.list` remoto e gravar de volta no `zcodeSessionStore.slashCommands` do workspace remoto atual, garantindo que o menu `/` da caixa de entrada veja as novas plugin commands sem precisar trocar de sessão ou abrir a página de configurações de comandos.
- Recarregar as origens de diretório de usuário do MCP store remoto, para que o estado relacionado aos MCPs contribuídos por plugins seja atualizado na UI.

## Fluxo de dados

```text
inline:
本机 base pluginSyncService
  -> listLocalUserPluginCandidates()
  -> exportPluginsArchive(pluginIds)
  -> SSH remote pluginSyncService.importPluginsArchive(archive)
  -> 远端 ~/.zcode/plugins/<plugin-dir>
  -> 远端 ~/.zcode/cli/config.json plugins.dirs / enabledPlugins

marketplace installed:
本机 base zcodeAgentService
  -> getPluginsOverview() / listPlugins()
  -> 已安装 marketplace candidates
远端 zcodeAgentService
  -> getPluginsOverview()
  -> addPluginMarketplace(source)    # 仅 github/git/url 且远端缺 marketplace 时
  -> pluginSyncService export/import source archive
  -> addPluginMarketplace(remote mirrored source dir) # file/directory/settings 且远端缺 marketplace 时
  -> installPlugin(marketplace, pluginName, scope)
  -> setPluginEnabled(pluginId, enabled)
  -> listPlugins()
  -> configurePlugin(pluginId, merged portable options)

builtin official:
远端 resource build
  -> glm/<platform>/zcode.cjs
  -> glm/<platform>/packages/*-plugin
SSH deploy
  -> ~/.zcode/server/agents/glm/zcode.cjs
  -> ~/.zcode/server/agents/glm/packages/*-plugin
远端 agent 启动
  -> filesystem seed
  -> ~/.zcode/plugins/cache/zcode-plugins-official/<name>/<version>
```

A UI sempre usa os services base para a enumeração e a exportação locais e os services do workspace atual para checagem de estado e importação remotos. A coleção de services do workspace remoto precisa repassar `pluginSyncService` e `zcodeAgentService` como services remotos, evitando que a importação ou a instalação escrevam de volta na máquina local.

## Política de segurança e de conflito

- O caminho no archive precisa ser um caminho relativo seguro; caminhos absolutos, `..`, barra invertida, drive do Windows e caminho vazio são proibidos.
- O archive aceita apenas diretórios e arquivos comuns e rejeita arquivos especiais como symlink, device e socket.
- Antes e depois da importação, valida que existe um manifest válido dentro do diretório do plugin.
- O nome de diretório dos candidatos inline é normalizado a partir do basename da raiz do plugin; em caso de conflito, pula-se sem alterar o diretório existente no remoto.
- A deduplicação inline no remoto verifica simultaneamente o diretório alvo e os plugin ids inline já registrados em `plugins.dirs` no remoto.
- A deduplicação de marketplace no remoto é pelo installed plugin id; com o mesmo id já existente, não reinstala.
- O archive tem um limite de tamanho, evitando sobrecarregar memória ou disco do host remoto.
- A sincronização de marketplace depende da rede, da source do marketplace e do resolver remotos. Em caso de falha, o erro é exposto e não há fallback implícito para o cache local.
- `plugins.options` sincroniza apenas valores primitive portáveis já salvos localmente, sem tratar o default do manifest como configuração do usuário; na escrita, faz merge com as configuredOptions já existentes no remoto, evitando que a semântica de substituição do `plugins/configure` apague keys já existentes no remoto.
- Options `sensitive`, `file` e `directory` não são sincronizadas automaticamente por padrão. Elas exigem credential store ou mapeamento de caminhos e, por enquanto, só mostram na UI que precisam de configuração manual no remoto.
- O mirror de source de marketplace local contém apenas os diretórios de source necessários ao plugin selecionado e ao closure de dependências do mesmo marketplace; symlink, caminho absoluto no archive, `..`, drive do Windows e arquivos especiais são rejeitados.
- Uma source `settings` só pode ser espelhada quando a entrada do manifest é uma source de rede, ou quando a entrada aponta explicitamente para uma source de diretório local legível; um caminho relativo de source root que não possa ser restaurado a partir do manifest sintético não faz fallback de cache.
- Quando já existe um marketplace de mesmo nome no remoto, a source não é substituída; diferenças posteriores de source hash / manifest hash são tratadas por um processo de reconcile separado.

## Limites atuais não suportados ou não garantidos

| Limite | Estado atual | Exemplo | Deveria suportar | Direção de implementação futura |
| --- | --- | --- | --- | --- |
| Fallback de cache do marketplace / cópia direta de `installed_plugins.json` | Não implementado, e o design atual deliberadamente não faz isso | O cache local de `canva@claude-plugins-official` tem código já baixado, mas a rede remota está indisponível. Atualmente a instalação falha, e o cache local não é empacotado para o remoto | Por padrão não deveria suportar. O cache pode conter artefatos gerados localmente, caminhos absolutos, produtos de resolver antigos ou arquivos dependentes de plataforma, e a cópia não é necessariamente equivalente a uma instalação remota | Se o modo offline for realmente necessário, fazer uma "sincronização de espelho offline" explícita: o cache só é copiado após escolha do usuário, com verificação de manifest/source/sha/versão, gravando o installed record remoto e deixando claro que não equivale a um marketplace reinstall |
| Sincronização total de `plugins.options` | Já suporta o subconjunto seguro; não suporta sensitive, `file`, `directory`, keys ausentes/incompatíveis com o schema remoto, nem trata default como configuração do usuário | O `region="cn"` local é sincronizado; `token` marcado como sensitive ou `workspaceDir="/Users/dev/project"` não é sincronizado automaticamente | Precisa continuar suportando mapeamento de caminhos e credential store, mas não pode copiar tudo por padrão | Adicionar depois detalhes de diff de options, confirmação de mapeamento de caminhos e escrita em credential store; por enquanto fazer apenas merge de primitive não sensível |
| `data/` do plugin | Não implementado | O plugin salva índices, cache de sessão, tokens e arquivos temporários em `data/` local; o runtime remoto deveria regenerar | Na maioria dos cenários não deveria suportar | Oferecer migração de dados opt-in apenas para plugins com semântica de migração clara; o plugin declara os arquivos e a versão migráveis e o programa principal apenas executa uma importação controlada |
| Estado de builtin / builtin restaurável / builtin suprimido | Os assets são implantados nativamente junto do recurso remoto; a sincronização de estado do usuário não está implementada | O `android-emulator@zcode-plugins-official` está desabilitado localmente, mas o remoto é Linux e não tem o mesmo ambiente iOS/Android; sincronizar o estado desabilitado pode esconder ferramentas disponíveis no remoto | Os assets precisam ser suportados; o estado de habilitação/supressão é opcional e não deve se misturar à sincronização de plugin comum | Primeiro corrigir a construção do pacote de recursos remoto e a verificação de deployment. Se for sincronizar o estado depois, fazer uma "sincronização do estado de habilitação de plugins integrados" separada; escrever enabled/suppressed apenas quando o remoto tiver o mesmo id, a mesma origem e compatibilidade |
| Plugin de marketplace candidato não instalado | Não implementado | A página de Discover mostra `formatter@team-market`, mas não está instalado localmente. O diálogo de sincronização atual não o lista como candidato | Geralmente não é necessário. A semântica de sincronização é "levar ao remoto os plugins já usados localmente", não instalar em lote candidatos de marketplace | Se for suportado, fazer sincronização de source do marketplace ou uma entrada de instalação remota via Discover, em vez de colocar isso na "sincronização de plugins locais" |
| Versão de marketplace totalmente idêntica | Implementação incompleta; só garante que o mesmo marketplace + mesmo nome de plugin instale com sucesso e retorne o mesmo plugin id | O local é `demo@team-market` 1.0.0; o marketplace remoto já foi atualizado para 1.1.0. Atualmente o remoto pode instalar 1.1.0 | Precisa ser suportado, especialmente para reproduzir ambientes de experimento | Adicionar parâmetros version/source lock/sha ao protocolo; o candidato local carrega o source/sha do installed record; o remoto instala pelo lock e verifica version/source/sha depois da instalação, falhando se não bater |
| Source de marketplace `file` / `directory` / `settings` levada automaticamente ao remoto | Já suporta source mirror; não garante substituir um marketplace de mesmo nome existente no remoto nem garante que todo source `settings` sintético consiga restaurar a source root local | O marketplace local aponta para `/Users/dev/plugins/marketplace.json`, que não existe no remoto. Na sincronização, a source do plugin selecionado é espelhada para o remoto e o install é feito no remoto | Precisa ser suportado, mas não se pode adivinhar caminho remoto | Já foi adotado o source mirror explícito: apenas o plugin selecionado e o closure de dependências do mesmo marketplace são empacotados; quando já existe um marketplace de mesmo nome no remoto, ele não é substituído, e uma source local relativa em `settings` que não consiga localizar a source root continua falhando, sem fallback de cache |
| Source mirror de dependency entre marketplaces | Não implementado | `hello-world@hello-market` depende de `shared@base-market`; hoje só o closure de dependências dentro do `hello-market` é espelhado e uma dependência entre marketplaces falha | Precisa ser suportado, mas exige um design separado para a ordem de sincronização e a política de conflito de vários marketplaces | Estender o plano de source mirror, enumerando recursivamente os marketplaces de dependência, verificando um a um se o remoto já os tem e se precisam ser espelhados, e mostrando na UI a lista de marketplaces que serão sincronizados |
| Interrupção forçada de ponta a ponta no stop | Não garantida; hoje só há cancelamento de protocolo para marketplace add/install com operationId, e o archive export/import inline e o `setPluginEnabled` não são abort forçado | Se o usuário clica em stop durante um git clone muito lento e o agent remoto já entrou em um add/install cancelável, é enviado `plugins/cancelOperation`; se o passo atual for a exportação local ou a escrita remota de enabled, só é possível parar de esperar/pular as esperas seguintes o quanto antes | Manter a granularidade atual, para não afetar a página de configurações de plugins local nem os RPCs comuns de gestão de plugin | Para reforçar depois, adicionar operationId/AbortSignal também ao archive export/import do plugin sync service; é obrigatório garantir que apenas a entrada de sincronização remota passe operationId |
| Log de sync no hover equivale ao log de shell/stdout remoto | Não garantido; hoje o log mostra as etapas de sincronização, métodos RPC, operationId, diagnósticos de erro e resultados de stop/cancel, sem garantir o stdout/stderr completo do git/fetch/copy interno do resolver | O usuário vê `RPC plugins/install code-review@claude-plugins-official (...)`, mas não vê o stdout completo do `git clone` executado de fato pelo agent | Deveria suportar um diagnóstico mais completo, mas sem despejar logs de baixo nível de alta frequência na UI por padrão | Adicionar depois um evento de progresso de operação ao protocolo de plugin; assinar ou limitar a exibição apenas quando o usuário abrir o log, evitando sobrecarregar o log de produção e o estado da UI |
| Atualização/sobrescrita de plugin de mesmo id já existente no remoto | Não implementado; hoje pula por já existir | O `canva@claude-plugins-official` local é 1.0.0 e o remoto já tem 0.9.0. Não há upgrade automático | Deveria ser suportado como um modo independente futuro | Adicionar um modo compare/reconcile: exibir diferenças de versão, source e enabled; o usuário escolhe pular, reinstalar, atualizar ou sobrescrever |

## Resumo das conclusões seguintes

O que já está implementado é "levar explicitamente ao remoto SSH os plugins que já funcionam localmente": o plugin inline por cópia do diretório em archive, e o plugin de marketplace já instalado por reinstalação do plugin de mesmo nome no remoto. Os dois caminhos tratam apenas do que falta no remoto e, por padrão, não sobrescrevem plugins já existentes no remoto.

O que precisa ser completado, mas não pode ser simplesmente copiado em bloco total, é o subconjunto de caminhos/secrets de `plugins.options`, o lock de versão do marketplace, dependencies entre marketplaces, o tratamento de diferenças de plugins/marketplaces já existentes no remoto e o log mais completo de operações remotas. Esses itens não são sem valor nenhum; é que a implementação atual ainda não está completa: uma sincronização direta esbarraria em vazamento de secret, caminhos locais indisponíveis, drift de versão na instalação remota, ordem de source entre marketplaces indefinida, sobrecarga de logs ou sobrescrita do estado já existente no remoto. Por isso o passo seguinte deve ser um fluxo de reconcile / progress com pré-visualização, escolha e validação.

O que não é recomendado por padrão é o fallback implícito de cache, a cópia direta de `installed_plugins.json` e o `data/` comum de plugin. Esses contenidos parecem tornar o remoto "utilizável offline", mas não garantem equivalência a uma reinstalação remota: o cache pode trazer artefatos gerados localmente, diferenças de plataforma, produtos de resolver antigos ou caminhos absolutos, e o `data/` ainda pode conter tokens, índices e estados temporários. Se no futuro for realmente necessária a capacidade offline, ela deve ser exposta explicitamente como um modo separado de "sincronização de espelho offline", deixando claro na UI que ela não equivale a um marketplace reinstall.

O que não deve se misturar ao fluxo principal de sincronização de plugins são candidatos de marketplace não instalados e o estado de builtin/suppressed builtin. Candidatos não instalados parecem mais com instalação remota via Discover ou sincronização de source do marketplace; o estado de builtin se relaciona ao sistema operacional remoto e à disponibilidade dos plugins integrados e deve passar por um julgamento de compatibilidade antes de sincronizar o estado de habilitação.

Para plugins builtin, a conclusão mais recente é: a falta de assets é um problema de construção/deploy do pacote de recursos remoto, não um problema de sincronização manual pelo usuário. Em teoria o remoto deveria suportar plugins builtin nativamente; se a página de plugins remota mostrar 0 plugins integrados, a causa raiz deve ser verificada primeiro em `~/.zcode/server/agents/glm/packages/*-plugin`, checking se foi implantado junto com o `zcode.cjs`. A sincronização manual de builtin transformaria uma capacidade nativa do produto em um passo de remendo do usuário e ainda poderia importar um plugin oficial por engano como plugin inline; por isso não é feita.

## Comportamento da UI

- A entrada de sincronização de plugins só é exposta em workspace remoto SSH; WSL/Docker/local não recebem nova entrada.
- A página de configurações de plugins e a de Skill/MCP mantêm o mesmo tipo de barra de dica de alvo SSH, a entrada de sincronização no canto superior direito e o estilo do diálogo.
- As entradas de sincronização remota no menu de workspace, no menu de tarefas e na página de configurações usam uniformemente os termos técnicos capitalizados `Skill`, `MCP` e `Plugin`, sem voltar a minúsculas por causa da posição da entrada ou do idioma.
- O diálogo exibe os plugins inline e de marketplace instalados que podem ser sincronizados a partir da máquina local, o caminho de origem, a versão, os components e se já existem no remoto.
- Para options já configuradas, o diálogo mostra um resumo: a quantidade de configurações primitive portáveis locais que será tentada sincronizar automaticamente e a quantidade que precisa de configuração manual no remoto por ser sensitive, de tipo de caminho ou por schema local ausente; schema remoto ausente ou incompatível é indicado no log de sincronização e pulado.
- Por padrão o diálogo exibe os itens que já existem no remoto, facilitando confirmar o estado remoto; por padrão apenas os itens ausentes no remoto vêm marcados, e os itens que já existem no remoto não são selecionáveis, não são reinstalados.
- Mostra um lembrete de risco de hooks/MCP: depois da sincronização, os hooks/MCPs dentro do plugin serão executados no ambiente do host SSH.
- Depois de clicar em "sincionar os itens selecionados", a UI não troca mais para um cartão separado de loading global; o diálogo mantém os plugin cards selecionados nesta rodada e exibe à direita do card correspondente os estados queued / syncing / synced / failed / stopped.
- O card que está sincronizando mostra o estado de loading; o ícone de loading abre um overlay de log rolável com o log das etapas de sincronização daquele plugin, incluindo exportação, importação, adição de marketplace, instalação, escrita do estado enabled, operationId e o motivo da falha ou do stop; esse log não é um encaminhamento completo do shell/stdout interno do resolver remoto.
- Durante a sincronização, cada plugin incompleto tem um botão de stop por item. Ao clicar em stop, o plugin é marcado como stopped, a página de resultado registra "interrompido" e a fila de sincronização continua processando os próximos plugins.
- Para marketplace add/install, o stop chama adicionalmente o `cancelPluginOperation(operationId)` remoto. Ao receber, o agent server aborta o `AbortSignal` da operation correspondente, e o adapter precisa passar o signal para passos canceláveis como git clone / fetch / cópia local. Se o cancelamento falhar ou a versão remota não suportar cancelamento, a UI continua para os próximos plugins como stopped e registra no log o motivo da degradação.
- O stop não cancela operações comuns de gestão de plugin sem operationId, não faz abort forçado do archive export/import inline nem do `setPluginEnabled`, e não afeta o fluxo original de install / add marketplace / update da página de configurações de plugins do workspace local.
- Depois de uma sincronização bem-sucedida, se houver options sincronizáveis, o `plugins/configure` remoto é chamado para gravar as options já mescladas; esse passo só vale para a entrada de sincronização remota e não altera a semântica de salvamento da página de configurações de plugins local.
- Depois da sincronização, o plugin store, o shared skill store, o commands store, os slashCommands do workspace atual e o estado relacionado ao MCP store remotos são atualizados.

## Limites de estado

- O serviço inline local lê somente a configuração de usuário e os diretórios de plugin locais, sem modificar config/cache/data locais.
- A importação inline remota escreve somente na raiz de plugins do usuário remoto e na config de usuário remota.
- A sincronização de marketplace instala somente pelo protocolo de plugin do Agent remoto e não escreve diretamente no cache do marketplace remoto nem no `installed_plugins.json`. Para sources de marketplace locais `file` / `directory` / `settings`, escreve-se somente o diretório de source espelhado remoto, e a instalação é concluída pelo `addPluginMarketplace` e `installPlugin` remotos.
- Os assets de plugin builtin são de responsabilidade da construção e do deploy dos recursos remotos e não são escritos pelo plugin sync service no diretório de plugins do usuário remoto.
- Identity/isolation continua obedecendo a `workspaceIdentity?.trim() || workspacePath`; o caminho de execução continua usando `workspacePath`.
- desktop continuous e mobile replayable não mudam por causa desta funcionalidade. O `/remote` do celular continua usando o remote host service existente via shared-host attachment, sem criar um runtime independente.

## Casos de aceitação

| ID | Cenário | Asserção |
| --- | --- | --- |
| RPS-INLINE-01 | O `plugins.dirs` local tem um plugin inline válido e o remoto não tem | Importa para `~/.zcode/plugins/<dir>` no remoto e acrescenta o caminho na config remota |
| RPS-INLINE-02 | O remoto já tem o mesmo plugin id inline | Retorna skipped, não sobrescreve o diretório e não regrava a config |
| RPS-INLINE-03 | O diretório alvo remoto já existe | Retorna skipped, não sobrescreve o diretório |
| RPS-INLINE-04 | O plugin inline local contém symlink | A exportação falha, evitando empacotar caminhos arbitrários do host para o remoto |
| RPS-INLINE-05 | O plugin inline local tem um override enabled boolean | A config remota recebe o mesmo estado enabled |
| RPS-MKT-01 | Plugin de marketplace instalado localmente, ausente no remoto e com marketplace já existente | O remoto chama `installPlugin` para instalar o plugin de mesmo nome e chama `setPluginEnabled` |
| RPS-MKT-02 | Plugin de marketplace instalado localmente, sem marketplace no remoto e com source `github`/`git`/`url` | O remoto faz `addPluginMarketplace` primeiro e só então instala o plugin |
| RPS-MKT-03 | O remoto já tem o mesmo plugin id de marketplace | O candidato aparece como já existente, não vem marcado por padrão e não é reinstalado |
| RPS-MKT-04 | A instalação do marketplace remoto falha | O resultado do candidato mostra failed e os diagnósticos de install remotos, sem fallback de cache local |
| RPS-MKT-05 | O plugin de marketplace local está com enabled=false | Após a instalação remota bem-sucedida, o mesmo estado disabled é escrito |
| RPS-MKT-06 | Plugin de marketplace instalado localmente, sem marketplace no remoto, com source `directory` e plugin source em diretório local | O local exporta o plugin selecionado e as sources de dependência do mesmo marketplace, o remoto importa o source mirror, faz add do marketplace com o diretório remoto e instala |
| RPS-MKT-07 | A source do marketplace local é `file` | Sincroniza o JSON do marketplace e os diretórios de source relativos dos plugins, e o install remoto não depende de caminhos locais |
| RPS-MKT-08 | A source do marketplace local é `settings` e a entry é uma source de rede | Exporta o JSON do marketplace normalizado e o remoto faz add do marketplace por esse JSON antes de instalar |
| RPS-MKT-09 | A source do marketplace local é `settings` mas a entry é uma source relativa local que não pode ser localizada | A sincronização desse plugin falha mostrando que a source root não pôde ser restaurada, sem fallback de cache |
| RPS-OPT-01 | O plugin local salvou options primitive não sensíveis | Após a importação/instalação remota bem-sucedida, lê o schema remoto, faz merge com as options já existentes e chama `plugins/configure` para gravar essas keys |
| RPS-OPT-02 | O plugin local salvou options sensitive, file ou directory | Essas keys não são sincronizadas por padrão e o log de resultado indica a necessidade de configuração manual no remoto |
| RPS-OPT-03 | O schema do plugin remoto não tem a option de mesmo nome ou o tipo é incompatível | A key não é escrita, evitando colocar a configuração de um schema local antigo na config remota |
| RPS-OPT-04 | O remoto já tem outras options | Ao sincronizar as keys portáveis locais, as keys já existentes no remoto são preservadas e não são apagadas pela semântica de substituição de `plugins/configure` |
| RPS-UX-01 | Sincronizar vários plugins, sendo que a instalação remota de um deles é muito lenta | O diálogo mantém a lista de plugins, apenas o card do plugin atual mostra loading e o hover no loading mostra o log de sincronização daquele item |
| RPS-UX-02 | Clicar em stop em um plugin durante a sincronização | O resultado desse plugin vira stopped e a fila segue para os próximos plugins; se o passo atual for marketplace add/install, é enviado o pedido remoto de cancelamento do operationId correspondente |
| RPS-UX-03 | A página de conclusão da sincronização mostra os itens com falha | O estado do resultado à direita usa um badge de status compacto, e não um container estreito e alto em forma de botão |
| RPS-UX-04 | O log de sincronização é longo | O overlay de log é rolável e não usa um tooltip não interativo para carregar log longo |
| RPS-BUILTIN-01 | Construção do pacote de recursos remoto de produção | `glm/<platform>` contém ao mesmo tempo `zcode.cjs` e `packages/*-plugin/.zcode-plugin/plugin.json` |
| RPS-BUILTIN-02 | O remoto já tem o `zcode.cjs` da mesma versão, mas faltam os builtin packages | O deployment não pode pular o ZCode Agent; é preciso completar `~/.zcode/server/agents/glm/packages/*-plugin` |
| RPS-BUILTIN-03 | Deployment SSH de dev do `zcode.cjs` local | O sync envia os packages de plugins oficiais locais e o `plugins list` remoto consegue descobrir plugins com `source:"official"` |
| RPS-BUILTIN-04 | O lado desktop Windows / macOS / Linux regera o tar dos builtin packages para o upload local via SSH | Todas as entradas de diretório no tar são `0755`; depois da extração no remoto, `rm -rf ~/.zcode/server/agents/glm/packages` consegue atualizar os recursos normalmente |
| RPS-BUILTIN-05 | O remoto ficou com `~/.zcode/server/agents/glm/packages` não travessável e a checagem do manifest builtin falha | O deployment faz primeiro a correção de owner `rwX` e só então entra na atualização normal dos packages, sem exigir chmod manual do usuário |

## Plano de testes

- `packages/services/test/pluginSyncService.test.ts` cobre a enumeração de candidatos inline, exportação/importação, pulo de conflito, caminhos seguros e estado enabled.
- `packages/services/test/pluginSyncService.test.ts` cobre a exportação/importação de archive de source de marketplace `directory`, `file` e `settings`, o closure de dependências local e os caminhos de falha de source root não restaurável.
- `packages/ui/test/remotePluginSyncDialog.test.ts` cobre a construção das linhas inline/marketplace, a seleção padrão, o filtro de itens já existentes no remoto, a serialização de source do marketplace e a renderização do resultado.
- `packages/ui/test/remotePluginSyncDialog.test.ts` cobre source de marketplace não rede ausente: primeiro o source mirror, depois `addPluginMarketplace(remotePath)` e só então a instalação.
- `packages/ui/test/remotePluginSyncDialog.test.ts` cobre o progresso de sincronização por item, o stop por item seguido do início dos próximos plugins, o resultado stopped e os eventos do log de sincronização.
- `packages/ui/test/remotePluginSyncDialog.test.ts` cobre a sincronização do subconjunto seguro de options, o pulo por schema incompatível e o merge com as options já existentes no remoto.
- `packages/ui/test/remotePluginRefresh.test.ts` cobre a atualização dos `slashCommands` do workspace remoto atual após a sincronização, mesmo sem a página de configurações de comandos carregada.
- `packages/ui/test/remoteSyncActions.test.ts` cobre a entrada de sincronização de plugins exclusiva de SSH e a injeção do diálogo.
- `packages/desktop/test/*remote*Services.test.ts` cobre o uso, pela coleção de services remotos, do `pluginSyncService` remoto e do protocolo de plugin do Agent remoto.
- `packages/server/test/remoteDeploy.test.ts` cobre o marker `plugin-sync` no remote bundle.
- `packages/server/test/remoteDeploy.test.ts` cobre a instalação, no deployment do ZCode Agent, do diretório de `packages` builtin, além de o fato de o deploy não ser pulado quando faltam builtin packages no remoto.
- `packages/desktop/test/runtime-asset-scripts.test.ts` cobre o script de build de assets remotos fazer stage dos packages de plugins oficiais em `glm/<platform>/packages`.
- Verificação manual: conectar por SSH em remotos macOS/Linux e sincronizar, respectivamente, um plugin inline, um plugin de marketplace oficial do Claude e um plugin de marketplace customizado via github/git/url, conferindo o `installed_plugins.json`, o `config.json.plugins.enabledPlugins` e o cache de plugins no remoto.