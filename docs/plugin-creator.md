# Entrada de criação de plugin e Plugin Creator

## Contrato de produto

2026-09-16: o mercado de plugins e a visão de Gerenciamento de Plugins compartilham o menu "Adicionar", contendo apenas os itens "Criar plugin" e "Adicionar marketplace de plugins"; não há gravação de skills. A visão de configuração do Workspace não exibe entrada de escrita no marketplace, e o estado vazio "Explorar plugins" mantém o comportamento original.

Criar plugin apenas abre um rascunho de nova tarefa, pré-preenchido com a referência canônica da Skill `plugin-creator` fornecida pelo `plugin-creator@zcode-plugins-official` oficial e um espaço final. Não envia automaticamente, não troca o modelo e não instala nem habilita plugins. Usa a orquestração padrão de nova tarefa Root e sua persistência de rascunho.

```text
Clique em criar -> resolve o alvo de nova tarefa Root -> skillsService.list deste workspace
                                      |
                        Valida que alvo/attachment não mudaram
                                      |
                  Correspondência exata da skill oficial + enabled + caminho válido
                                      |
                  Root valida expectedWorkspaceKey -> startDraft
                                      |
                  initialPrompt + initialPromptMention -> Composer
```

A criação duplicada fica desabilitada enquanto a requisição está em andamento; mudanças de identidade do workspace, de attachment remoto, da instância de serviço ou o desmonte da entrada invalidam resultados antigos, que não são submetidos. Skill ausente/desabilitada, desconexão ou falha de carregamento exibem aviso explícito e mantêm a tarefa atual. A identidade é `workspaceIdentity?.trim() || workspacePath`, e o caminho sempre vem do host alvo; no celular são usados apenas workspaces visíveis, no desktop segue-se o pane em foco. Não modifica continuous/replayable, runtime nem a fila de aceitação.

Adicionar marketplace de plugins reaproveita o diálogo de loja existente e a mutação de store. A página de gerenciamento abre o marketplace e o diálogo via navegação opcional `intent: "add-marketplace"`; em sucesso alterna para o segmento pessoal, em falha mantém a entrada e o erro.

## Busca de plugins

A página do marketplace e a página de gerenciamento compartilham as regras de correspondência: nome/descrição no idioma atual, nome original, ID completo e nome do marketplace continuam suportando busca textual; o nome original e todos os nomes exibidos no listing suportam pinyin sem acento e sub-string de iniciais, ignorando maiúsculas/minúsculas e espaços no pinyin. Mesmo em uma interface em inglês é possível encontrar pelo nome chinês "飞书" usando `feishu`, `fei shu` ou `fs`. Preserva-se a associação de ID completo entre marketplaces homônimos, sem tabela de aliases, tolerância a erros de digitação ou mudança de ordenação; não altera a busca de skills da caixa de entrada do chat.

## Conteúdo e distribuição da Skill

Plugin de conteúdo integrado e independente `plugin-creator`, versão 0.1.1, habilitado por padrão, nome em chinês "插件创建器". Distribuído junto com os assets de Desktop, CLI/SEA e server/agente remoto, e todos os scripts/references devem existir.

A Skill é organizada pelo fluxo scaffold -> componentes opcionais -> validate -> install/update; o corpo roteia para scripts e material de referência. O scaffold usa a biblioteca padrão do Node, IO assíncrono, caminho padrão `<cwd>/plugins/<slug>`, nome normalizado em minúsculas com hífen, e nome de diretório igual ao manifest. Arquivos existentes são recusados por padrão; apenas `force` explícito atualiza os arquivos selecionados; campos não relacionados ao marketplace e a ordem das entradas são preservados. Os componentes declaram somente os caminhos realmente gerados.

Gera o `.zcode-plugin/plugin.json` do ZCode; o listing do marketplace carrega o nome de exibição e a i18n. Convergência de 2026-09-17: a entrega padrão é o código-fonte, o manifesto de marketplace de teste e as instruções de adicionar/instalar/atualizar/experimentar manualmente, com o usuário concluindo as operações de marketplace e instalação na interface. Um usuário comum de desktop não precisa instalar CLI nem Node; quem já tem runtime de desenvolvimento pode usar opcionalmente o script auxiliar, e sem runtime usa ferramentas de arquivo para preparar o código-fonte e o JSON. Verifica-se estrutura, caminhos de recursos e placeholders; `zcode plugins validate` só é chamado extra quando já existe um CLI de desenvolvimento utilizável, e sem execução não se afirma que a validação do protocolo passou.

## Ciclo local de marketplace dev

A entrega da fase atual é: implementação do código-fonte -> verificações executáveis e smoke de capacidades -> manifesto dev -> o usuário adiciona o marketplace manualmente, instala/atualiza e experimenta em uma nova tarefa. O envio apenas da referência da skill ainda exige esclarecer o uso pretendido; quando fica claro que só o código-fonte é desejado, nenhum marketplace é gerado. A Skill não registra, instala, atualiza nem habilita plugins automaticamente, não exige que o usuário execute comandos de CLI e não introduz novas ferramentas internas ou entradas de runtime.

- O código-fonte continua por padrão em `plugins/<slug>/` no workspace atual. O manifesto dev fica por padrão em `plugins/marketplace.json` no mesmo nível; seleção explícita de diretório/marketplace tem precedência.
- Com Node disponível, o helper existente é opcional, e o nome do marketplace é `dev-<nome-do-workspace-pai>-<8 primeiros caracteres do SHA256 da raiz do marketplace normalizada>`. Sem Node, o manifesto é gerado com ferramentas de arquivo conforme a especificação de referência, escolhendo-se um nome explícito iniciado por `dev-` e guardado no próprio manifesto; atualizações posteriores reutilizam esse nome. Um manifesto existente tem prioridade e é reaproveitado; se depois o helper passar a ser usado, o arquivo do marketplace é passado explicitamente. Nomes iguais com origens diferentes geram relatório de conflito, sem assumir nem remover o marketplace implicitamente.
- O manifesto atualiza apenas o listing correspondente e não regenera o código-fonte do plugin; sincroniza nome, versão e descrição do manifest, fornece nome de exibição exato e metadados em chinês, preservando entradas, campos e ordem não relacionados. A escrita atômica, os locks e a proteção de caminho do helper existente permanecem inalterados.
- Caminho manual: `Plugin Marketplace → Adicionar → Adicionar marketplace de plugins`, colar o caminho absoluto da raiz do marketplace (o `plugins/` do workspace padrão, não o subdiretório de um plugin individual), clicar em adicionar; depois de sucesso, encontrar o nome real do marketplace e o plugin no segmento `Pessoal` e clicar em instalar.
- As operações de marketplace são executadas pela interface e pelo serviço de plugins existentes; o registro e os registros de instalação continuam sendo o inventory de nível de usuário do Host. Em cenários de celular/remoto usam-se caminhos no Host alvo, sem escolher diretórios irrelevantes do celular ou da máquina local atual. Não se editam arquivos internos de known/installed/cache.
- Para modificar um plugin existente, primeiro aumenta-se a versão semântica e sincroniza-se o listing; depois orienta-se o usuário a entrar em `Fontes do marketplace` pelo ícone de engrenagem na página do marketplace, clicar em `Atualizar este marketplace` do mercado correspondente, abrir os detalhes do plugin e clicar em `Atualizar`, experimentando em uma nova tarefa. Escolhas explícitas de desabilitação já existentes são preservadas; a cópia instalada não é o código-fonte e não se afirma hot reload.
- A resposta de conclusão lista os caminhos absolutos do código-fonte, da raiz do marketplace e do manifesto, o nome real do marketplace/o pluginId completo/a versão do código-fonte, os passos manuais e os resultados esperados. Antes da operação, escrever explicitamente "marketplace pendente de adição manual, plugin pendente de instalação, experimentação pendente de verificação"; havendo instalação prévia mas não verificada nesta rodada, registrar o status como não verificado.
- O aviso de experimentação em nova tarefa usa apenas formas descobríveis de selecionar plugin/skill; quando não houver instalação, não se inventam caminhos de instalação nem referências de skills instaladas. Falha ao adicionar mantém o código-fonte; solicitar o erro da interface continua o diagnóstico; cancelamento ou ausência de retorno do usuário não contam como conclusão.

```text
Diretório de código-fonte (mantido pelo usuário)
  -> manifest / verificação de capacidades
  -> dev marketplace.json (ferramentas de arquivo ou helper disponível)
  -> entrega de caminhos exatos e instruções de operação
  -> usuário adiciona/atualiza o marketplace na interface -> instala/atualiza o plugin
  -> conferência no marketplace pessoal/página de gerenciamento -> usuário experimenta em nova tarefa
```

Aceitação das instruções atuais: sem CLI/Node global é possível entregar código-fonte, manifesto e passos de interface; o caminho de primeira adição e o de atualização de plugin existente ficam claros; cancelamento/falha/não experimentado preservam o estado real. Os testes de integração de CLI isolado existentes provam apenas o script auxiliar e o mecanismo de instalação, não que um usuário comum concluiu o fluxo manual. Esta rodada não adiciona UI nem protocolo de backend.

## Aceitação e impacto

| Case | Estado/ação | Asserção |
| --- | --- | --- |
| PLM-LC-018 | Listas de gerenciamento em chinês e inglês e busca | Listing associado ao ID completo; nome/descrição/feedback consistentes; nome original e chinês pesquisáveis; sem tradução, o texto original é preservado |
| PLM-LC-019 | Menu Adicionar/criação nos dois pontos | Dois itens de menu; chip de skill real e espaço final; não enviado; remount restaura o mesmo rascunho |
| PLM-LC-020 | Adição de origem com sucesso/falha/cancelamento | Uma navegação consumida; sucesso no segmento pessoal; falha mantém a entrada; cancelamento não escreve |
| creator-boundary | Cliques duplicados, troca de identity/attachment, desabilitada/ausente | Apenas o alvo atual é submetido uma vez; erro sem pré-preenchimento/habilitação |
| creator-assets | Node/SEA/Desktop/remote | Manifest, skill, scripts e references completos e descobríveis |
| creator-scaffold | Mínimo, skill, MCP, hook, marketplace, atualização | Validação do ZCode passa; entradas inválidas, fora de escopo, duplicadas/sobrescritas e TODO são rejeitadas |
| creator-dev-market | Criação/atualização de listing dev, workspaces homônimos e disputa de escrita | ID estável, dados não relacionados e código-fonte preservados; conflito de origem, duplicata, fora de escopo e lock ocupado rejeitados; falha em temp file exclusivo não apaga arquivo existente |
| creator-dev-workflow | Criação real via CLI, registro, instalação e atualização de versão | IDs available/installed e versões consistentes; diretório de instalação separado do código-fonte; atualização de conteúdo surte efeito e preserva desabilitação explícita |
| creator-manual-handoff | Sem CLI/Node, primeira adição, atualização de plugin existente, cancelamento/falha | Diretórios reais e passos de interface fornecidos; sem registro/instalação automática; sem inventar referências de instalação; status inacabado explícito |

Owner de UI/rascunho: os componentes de gerenciamento e loja são responsáveis pela exibição/entrada, o Root pela nova tarefa e o store de rascunho do Composer pelos fatos de pré-preenchimento; o conteúdo de Skill/Plugin segue o discovery do host alvo. Menu compartilhado, builder de prefill e as duas buscas são must-inspect; runtime é invariant-only. O Codegraph já foi usado para localizar workspaces antigos; o workspace de implementação não foi indexado, então o código atual foi lido pelos arquivos já localizados. Os módulos ui/zcode-cli do gate de arquitetura não são gerenciados no momento, e a aprovação do gate não substitui a verificação semântica.

Os E2E correspondentes permanecem em plugins/manual-review/pending e precisam de revisão humana antes de serem promovidos; a exibição é coberta em desktop widescreen chinês claro e narrow screen inglês escuro, e a identidade de controle remoto é coberta por testes unitários direcionados; sem rodar celular/SSH reais, é obrigatório listar como pendente de verificação.

## Verificação local (2026-09-16)

A seguir estão os registros de verificação do helper/CLI anterior e da implementação de UI; as regras atuais de entrega manual estão acima e estes registros não indicam que o usuário tenha executado adição, instalação ou experimentação.

- 66 testes unitários direcionados de UI, 54 de bootstrap, 92 de assets de distribuição e 6 de scaffold Node/SEA passaram; os cinco tipos de scaffold (mínimo, Skills, MCP, hooks e combinado) passaram na validação do ZCode CLI realmente construído.
- E2E em Electron `plugin-localization-creator.test.ts` passou: os dois menus, referência real e espaço final/foco, não enviado, restauração do rascunho ao voltar, buscas em chinês e pinyin, adição de origem com sucesso/falha mantendo a entrada/cancelamento; cobertura de 1440px chinês claro e 480px inglês escuro. 480px é a largura mínima de janela do Electron, entrando no breakpoint de celular da UI compartilhada; não substitui a verificação real de celular via controle remoto.
- O WDIO da linha de base injeta agent command customizado que não suporta storage startup. Nesta rodada foi usada uma configuração WDIO temporária que limpa `ZCODE_AGENT_SERVER_COMMAND` e `ZCODE_AGENT_SERVER_ARGS_JSON` (incluindo worker runnerEnv), reutilizando os hooks originais e o bundle já construído e restaurando a inicialização do Agent embutido; não houve modificação do runtime de produção nem da configuração de E2E do repositório.
- typecheck da raiz, typecheck do CLI, lint da raiz (47 warnings existentes na primeira verificação, 0 erros) e verificação de arquitetura passaram. O lint completo inicial do CLI não passou: os 103 arquivos reportados são idênticos ao conteúdo do baseline de staging inicial `94cc393296`; os scripts e definições do CLI alterados nesta rodada passages lint isolado com 0 warnings e 0 erros.
- O feature graph mantém as 4 arestas pendentes existentes, sem novas arestas pendentes, e todos os novos code seeds existem; este worktree não tem índice Codegraph. Não foi gerado pacote de instalação formal nem conectado SSH/celular reais; os manifestos de assets de distribuição e o fixture de empacotamento foram verificados, e a troca de identidade/attachment remoto é coberta por testes unitários direcionados.
- O gate estendido foi complementado com o manifesto creator do fixture de deploy remoto, as asserções do botão antigo de criação e o caminho de isolamento do E2E; a regressão correspondente passou. Após o merge do staging `c32957bdad`, passaram 92 testes direcionados de UI/navegação, o typecheck da raiz, lint (51 warnings, 0 erros) e a verificação de arquitetura; o registro de execução do E2E em Electron é `desktop-e2e-20260916-110001-302`. Ao iniciar o helper de MR localmente via uv, é preciso garantir que o PATH dos subprocessos use preferencialmente o Node 24.14.0, evitando que o Node 26 do Homebrew sobrescreva o runtime do repositório.
- Incremento do ciclo dev: passaram 8 testes unitários do helper em Node, 24 testes de bootstrap de distribuição/status de instalação e 2 testes de assets SEA; o CLI realmente construído completou registro, instalação da 0.1.0, desabilitação, refresh e atualização para 0.1.1 em storage isolado, com conferência da separação entre código-fonte/cópia instalada e da mudança de conteúdo instalado. Typecheck da raiz e do CLI, lint da raiz e verificação de arquitetura passaram; o lint completo do CLI ainda tem falhas existentes, e o lint isolado dos arquivos alterados fica em 1 warning existente e 0 erros.
- Revisão estática dos limites da Skill: referência nua exige esclarecimento de uso primeiro; apenas código-fonte/apenas registro seguem a escolha do usuário; desenvolvimento normal completa registro e instalação local; atualização não re-gera scaffold, não mexe no cache e não restaura desativações explícitas; conflito interrompe e preserva o código-fonte. Não foi executada a aceitação de nova tarefa orientada por modelo, e os testes de integração do CLI não equivalem ao uso bem-sucedido da nova capacidade por um modelo.
- Na atualização de MR foi mesclado o staging `2772217134`, o manifesto SEA manteve Guide 0.2.0 e Creator 0.1.1 simultaneamente, e o fixture do plugin de conteúdo foi complementado. Após o merge passaram 51 testes de empacotamento Node/SEA, 24 de bootstrap e 65 testes direcionados de UI; o ciclo de desenvolvimento do CLI reconstruído, o typecheck da raiz e do CLI, o lint da raiz (52 warnings, 0 erros) e a verificação de arquitetura passaram.

## Verificação das instruções de entrega manual (2026-09-17)

- Nesta rodada só 5 arquivos Markdown foram modificados; nenhuma ferramenta, runtime, interface ou protocolo foi adicionado. Foram conferidas a entrada de diretório do diálogo de adição, o segmento pessoal, o refresh de fontes do marketplace e a entrada de atualização nos detalhes do plugin.
- Metadados da Skill, 4 links de documentação local e 5 exemplos JSON passaram na verificação; o documento de referência de instalação do usuário não contém comandos de CLI. Primeira criação, ausência de CLI/Node, atualização de plugin existente, cancelamento/falha, referência de instalação e status pendente foram revisados estaticamente item a item.
- Passaram 2 testes existentes de distribuição do creator, o typecheck da raiz e o lint da raiz (52 warnings, 0 erros); nenhum E2E de APP foi adicionado ou reexecutado, e não se afirma que o modelo concluiu o fluxo manual do usuário com as novas instruções.

## Ícone do Plugin Creator

O `plugin-creator@zcode-plugins-official` oficial usa o asset local `packages/ui/src/assets/plugin-icons/plugin-creator.png` no cartão da loja, na barra de instalados, nos detalhes e na lista de gerenciamento: peça de construção com cantos arredondados e gradiente azul com sinal de mais branco, fundo transparente, continuando o estilo dos ícones de plugins de documentação já existentes. A imagem antiga em caches existentes é sobrescrita por esse ícone local da identidade oficial; plugins homônimos de outros marketplaces mantêm seu próprio ícone de listing.