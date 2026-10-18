# Plugin Management Lifecycle Case Catalog

Este documento define o contrato de ciclo de vida, em nível de usuário, do gerenciamento de plugins local do Desktop. Só conta como cobertura um case que tenha setup, action, assertion e evidence independentes; simplesmente passar por um estado dentro de um caminho longo não conta como cobertura.

## Scope and state ownership

- Incluído: Desktop local workspace, armazenamento de plugins em user-scope, Public/Personal, Builtin, CDN, Personal Source, exibição inline, recuperação após restart, injeção representativa em runtime, falhas recuperáveis críticas.
- Excluído: Standalone Web, `/remote` no mobile, plugin sync de remote workspace, instalação em workspace-scope, CI oficial que dependa da rede pública, o produto cartesiano completo locale/theme/viewport.
- Instalação, configuração, enabled, origem e estado de supressão são persistidos em `<E2E_HOME>/.zcode/cli/plugins` e na config da CLI; o UI store é uma projeção, não a fonte autoritativa.
- Os workspaces locais A/B do Desktop local compartilham o mesmo E2E HOME, validando a semântica atual de user-scope.

```text
UI entry
  | Settings > Plugins
  v
pluginManagementStore
  | typed plugin service
  v
ZCode Agent plugin handlers
  |                     |
  v                     v
user plugin storage     future session runtime discovery
(source/install/config) (Skill + MCP evidence)
```

## Status vocabulary

| Status          | Meaning                                            |
| --------------- | -------------------------------------------------- |
| `manual-review` | a automação foi implementada, aguardando confirmação manual das capturas e do comportamento de produto |
| `formal`        | após confirmação manual, promovido a E2E estável por padrão |
| `bug-candidate` | lacuna atual do produto; não é escrito como expectativa verde nem corrigido na tarefa de teste |
| `pruned`        | explicitamente não feito; o motivo da poda é preservado |

## Accepted cases

| Case                                      | Setup                                          | Action                                                                                                         | Assertions                                                                                                 | Evidence                                          | Initial status                   |
| ----------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------- |
| `PLM-LC-001 discovery-navigation`         | HOME isolado, Public e Personal com diretórios determinísticos | Entrar em Plugins a partir de Settings; alternar segmentos; buscar/limpar entre segmentos; verificar que os grupos vêm expandidos por padrão e que o recolhimento manual funciona; entrar nos detalhes via Card, Installed Strip e Manage e voltar | Public por padrão; categorias públicas e mercado pessoal vêm expandidos por padrão, o colapso manual é efetivo; a busca unifica os resultados; limpar restaura; ao voltar, segment/query/scroll são preservados; os três pontos de entrada são alcançáveis                           | DOM + estado de UI sem URL + screenshot              | `manual-review`                  |
| `PLM-LC-002 presentation`                 | dois grupos: zh-CN/Zai Light/tela larga e en-US/Zai Dark/tela estreita | Abrir lista, detalhes, Manage e o popover de origem                                                                              | ações centrais visíveis e operáveis; sem overflow horizontal; textos longos não cobrem controles                                                           | DOM layout + a11y role + screenshot               | `manual-review`                  |
| `PLM-LC-003 personal-main-lifecycle`      | Personal Source em diretório local, plugin composto v1 | Na UI adicionar a origem, achar o plugin, abrir os detalhes, clicar duas vezes em Example Prompt, configurar, habilitar/desabilitar por diferentes entradas, checar atualização, atualizar para v2, cancelar/confirmar desinstalação     | as cinco categorias de componente são visíveis; o primeiro clique só instala; o segundo só cria um rascunho e não envia; config/enabled corretos; após checar atualização, a linha instalada exibe o selo 「atualizável」 e a entrada de atualização na própria linha; v2 em vigor; cancelar não muda o estado; confirmar faz a limpeza | UI + overview/list + storage + captura do provider   | `manual-review`                  |
| `PLM-LC-004 persistence-local-visibility` | v1 instalado, configurado e desabilitado                          | Reiniciar o app; alternar o workspace local A→B                                                                               | source/install/config/disabled persistem após o restart; B enxerga o mesmo estado de user-scope                                      | UI + JSON persistido + troca de workspace            | `manual-review`                  |
| `PLM-LC-005 source-orphan-reassociate`    | plugin Personal instalado                            | Excluir a origem; usar/configurar/habilitar-desabilitar; adicionar a mesma origem de novo                                                                     | a instalação é preservada e marcada como origem ausente; menu, detalhes, selos e a entrada de atualização na linha ficam invisíveis; a funcionalidade continua utilizável; ao adicionar de novo, a associação de listing/update é restaurada | UI + arquivos installed/config + marcador de runtime      | `manual-review`                  |
| `PLM-LC-006 builtin-suppress-restore`     | Builtin habilitado e com config/dados no HOME isolado       | Desinstalar; ficar na página de detalhes; reiniciar; restaurar a partir de Public                                                                         | config/dados do usuário são limpos; o Catalog e o cache embutido imutável são preservados; após o restart o Runtime continua não carregando; a lista de componentes nos detalhes é legível; exibe Restorable Builtin; a restauração volta ao estado padrão limpo | UI + arquivos de suppression/config/data/cache/manifest | `manual-review`                  |
| `PLM-LC-007 public-cdn-local`             | ZIP HTTP local como fixture determinístico de CDN oficial       | Navegar em Public, abrir os detalhes, instalar                                                                                        | usa o id único do marketplace oficial; o ZIP é validado na instalação; origem e versão em cache corretas                                              | UI + log do fixture HTTP + cache + overview          | `manual-review`                  |
| `PLM-LC-007b official-cdn-smoke`          | ambiente manual com acesso à internet                             | Atualizar o CDN oficial real e instalar o smoke plugin especificado                                                                       | caminho real de manifest/zip do marketplace/plugin utilizável                                                                                 | UI + artefato de rede                             | `manual-review`, nunca CI oficial |
| `PLM-LC-008 recoverable-failures`         | fixture alternável entre invalid/404/malformed/v1/v2     | Adicionar origem inválida/conflito de id oficial; falhar e repetir refresh/describe/install/update; cancelar a confirmação de desinstalação                            | erros visíveis; entrada de retry alcançável; a falha não corrompe a versão antiga, o update badge, a config ou a instalação; cancelar não tem efeito colateral                           | UI error + log de requisições do fixture + snapshot de storage | `manual-review`                  |
| `PLM-LC-009 inline-smoke`                 | plugin inline no HOME isolado                     | Ver e usar a partir de Personal, dos detalhes e do Manage em uma nova session                                                              | inline visível, componentes utilizáveis; a entrada genérica de desinstalação não é executada                                                                  | UI + marcador de runtime                               | `manual-review`                  |
| `PLM-LC-010 secret-env-agent-projection`  | plugin Personal com env de MCP `${E2E_PLUGIN_RUNTIME_SECRET}` e um agent | Após a instalação, chamar o MCP em uma nova session; abrir Settings > Subagents                                                         | o MCP retorna apenas a marca de «secret resolvido» e não ecoa o secret; no mesmo arquivo de agent há só uma linha com o nome canônico, e o nome cru continua disponível como alias de runtime     | captura do provider + DOM de Subagents + screenshots + vídeo via `capturePage()` do Electron | `manual-review`                  |
| `PLM-LC-011 no-git-github-archive`        | Anthropic Claude Marketplace real; binário Git do Agent apontando para caminho inexistente; adapter com fixture de loopback separado | Primeiro sondar o fallback de Git fora do GitHub; atualizar `claude-plugins-official` e instalar o plugin real `aikido` via Renderer → Host → Agent Protocol | o fallback retorna `plugin_git_unavailable`; a instalação via HTTP Archive do Marketplace/plugin real tem sucesso; o cache não tem `.git` e é descobrível | diagnostics + registros HTTP capturados + snapshot de installed/cache | `manual-review`, nunca CI oficial |
| `PLM-LC-012 isolated-refresh-atomic-cache` | dois Marketplaces com snapshot v1; fixture A=v2, B=falha; é possível injetar falha em copy/rename do cache | Refresh em lote; restart; recuperar B; injetar falha de ativação ao atualizar o plugin e repetir | A é atualizado; B mantém v1 e o estado de falha atravessa o restart; com B bem-sucedido a falha é limpa; falha de ativação sempre preserva o cache/registro de instalação antigo e, após o retry, troca atomicamente para v2 | diagnostics + JSON persistido + snapshots de diretório | `manual-review` |
| `PLM-LC-013 suggested-prompt-official-install` | o item recomendado de New Task referencia um Plugin ausente; o fixture do catálogo oficial pode alternar sucesso/falha/timeout | Clicar no item recomendado; atualizar `zcode-plugins-official`; confirmar a instalação User-scope no Popover; trocar para outro item recomendado durante a instalação | após a checagem local inicial de ausência, o único Popover entra em loading primeiro e, com a resolução confiável e o Composer estáveis, a mesma instância passa para a confirmação de instalação; o prompt é pré-preenchido uma única vez e não é enviado; ao atingir 10000ms o refresh é abortado e falha fechado, e falha/timeout rejeitam o snapshot antigo; o sucesso instala apenas o candidato oficial; ao trocar, a operação antiga é cancelada e resultados tardios são descartados; após o mesmo Popover terminar, o chip fica à frente e o corpo do prompt é preservado | testes de protocolo/focados + revisão manual de UI + snapshot do storage do usuário | `manual-review` |
| `PLM-LC-014 builtin-uninstall-detail-parity` | HOME isolado; plugin embutido já semeado, habilitado e com config/data | Abrir os detalhes; desinstalar; repetir na página de detalhes; reiniciar; clicar em Install | `installed=false`; a supressão existe; o Runtime não fornece Skill/Command/MCP; Catalog/cache/detalhes completos dos componentes continuam legíveis; describe não altera config/data/cache; Install restaura e não gera registro installed comum | UI + protocolo + config/data/cache/manifest + discovery novo | `manual-review` |
| `PLM-LC-015 bundled-install-ownership` | builtin suprimido e entrada oficial mesclada; além disso, um fixture de source de CDN com o mesmo nome | Seguir, respectivamente, o Install pela UI e a instalação direta por protocolo | o caminho bundled `filesystem/sea` equivale a um restore; o source de CDN continua passando pelo install do Marketplace; sem supressão obsoleta, sem ownership duplicado e sem registro installed incorreto | protocolo + registro installed + runtime | `manual-review` |
| `PLM-LC-016 seed-cache-runtime-separation` | builtin suprimido com cache presente/ausente; fixtures de seed filesystem e SEA | resolve/list/describe/skills/commands; disparar a auto-cura do cache | a supressão sempre filtra o Runtime; cache ausente pode ser recuperado pelo seed; describe funciona antes e depois; o Catalog não é filtrado; sem oscilação de seed↔uninstall com exclusão mútua | testes de bootstrap + adapter + services | `manual-review` |
| `PLM-LC-017 installed-menu-layout` | plugin embutido habilitado explicitamente em `.zcode/config.json` do Workspace (enabledSource=workspace) | Em Settings > Plugins, mudar para o scope Workspace; abrir o menu «…» na linha da lista de instalados | 「恢复 User 默认」/「Restore User default」 e os itens de atualização e desinstalação aparecem em linha única e com a mesma altura; o menu se dimensiona pelo conteúdo, e não pela largura do gatilho de ícone | contagem de caixas de linha do texto menuitem + screenshot | `manual-review` |
| `PLM-LC-018 official-auto-refresh-throttled` | HOME isolado; o catálogo oficial já tem entradas e foi atualizado há menos de um minuto | Entrar, sair e reentrar na loja | não há novo refresh; o tempo e o estado de falha do catálogo Claude permanecem inalterados; os candidatos originais continuam visíveis | DOM + overview + teste unitário de throttle | `manual-review` |
| `PLM-LC-019 official-auto-refresh-on-enter` | HOME isolado; o catálogo oficial já tem entradas, mas o tempo expirou; CDN real permitido | Entrar na loja sem clicar em refresh, sair e reentrar | o tempo oficial é atualizado sem diagnóstico de falha; reentrar não dispara novo refresh | DOM + overview + logs de runtime | `manual-review`, nunca CI oficial |
| `PLM-LC-020 plugin-subagent-override-cold` | HOME isolado; a cobertura estruturada do judge oficial especifica alternate/high, e a seleção principal é primary/max | Após um restart completo, enviar e invocar document-skills:judge pelo Agent | o request filho é alternate/high e a continuação pai é primary/max; o Agent conclui normalmente; a cobertura salva não muda | replay local do case + request real + UI + estado | `manual-review` |

Nota de migração do Todo103: PLM-LC-018/019 vêm do staging fixo `dbb3ec0ce8` e mantêm a identidade pending. O throttling após primeira/expiração/falha e a prioridade de tempo do refresh manual são cobertos por testes unitários de critério compartilhado; falhas em ambiente com CDN real devem ser registradas separadamente da regressão mesclada, e casos de internet não são promovidos a CI offline.

PLM-LC-020 completa o ciclo de execução a frio da cobertura de plugin dessa origem; SE-04 já provou que salvar pela UI não altera os arquivos do plugin, então este case constrói diretamente uma entrada de persistência isolada do mesmo formato, sem repetir a interação completa de configuração. O modelo e o tier do request filho diferem dos do pai, então herança de erro não passa. Apenas execução nova local; não é estendido para matriz de hot update ou controle remoto.

As limitações de ambiente vindas de PLM-LC-019 permanecem: a checagem manual de internet usa fixture de replay explícito e hold de manual-review, para evitar que certificados MITM de captura façam o fetch do mercado falhar no Agent. Essa falha prévia bloqueia apenas os casos de internet e não é considerada regressão de produto nem bloqueio dos demais casos offline.

## Runtime closure for PLM-LC-003/005/009/010

- A UI de detalhes deve listar os cinco grupos MCP, Skill, Command, Agent/Subagent e Hook, mas apenas Skill e MCP são usados para o fechamento em runtime, de modo a representar os dois caminhos distintos de injeção de discovery e de registro de ferramentas.
- As asserções de runtime devem criar uma nova session; não se exige hot replacement das sessions existentes anteriores à atualização.
- O primeiro clique em Example Prompt (não instalado) só pode instalar e não pode criar session; o segundo clique cria um novo rascunho pré-preenchido e, antes do envio, a captura do provider deve estar zerada.
- O fechamento de variável de ambiente apenas afirma que o retorno do MCP contém a marca «resolvido» sem o secret; screenshots, capturas do provider, logs e textos de erro não podem registrar o valor bruto do secret.
- O nome canônico de runtime do agent do plugin e o único nome cru podem coexistir, mas a página de configurações e os detalhes do plugin exibem apenas uma linha, com o nome canônico, por identidade de recurso.

## Pruned combinations

| Dimension                 | Decision                                                      | Reason                                                                    |
| ------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Client                    | testar apenas o Desktop local                                 | os limites de attachment, workspace identity e replayable de Web/remote pertencem a suítes independentes |
| Source × lifecycle        | Personal Source roda o fluxo principal completo; Builtin/CDN/inline só rodam os caminhos divergentes | evitar repetir o mesmo contrato de instalação/habilitação/desinstalação                                            |
| Entry × operation         | Card/Detail/Manage cada um com uma operação representativa      | não fazer o produto cartesiano entre entradas e todas as operações                                              |
| Locale × theme × viewport | duas combinações pairwise                                       | separar o contrato de comportamento do contrato de apresentação e controlar o custo de CI                                      |
| Component runtime         | fechamento com Skill + MCP; nos outros três tipos só se verifica a enumeração nos detalhes | os dois limites distintos de integração com runtime já estão cobertos                                              |
| Network                   | a CI oficial usa apenas fixture de loopback                                 | a internet é instável e não reproduzível                                                      |
| Install scope             | testar apenas o user scope vigente                                           | a UI não tem seletor de workspace-scope                                          |

## Bug candidates

| ID           | Gap                                 | Test treatment                         |
| ------------ | ----------------------------------- | -------------------------------------- |
| `PLM-BC-001` | não há UI de cancelamento na instalação da loja de plugins em Settings | não se declara cobertura; a entrada independente de cancelamento do Prompt recomendado é coberta por PLM-LC-013 |
| `PLM-BC-002` | o gerenciamento de origens não tem Validate/Diagnose independente | cobrem-se a validação na adição, o update e o remove       |
| `PLM-BC-003` | o menu genérico de inline expõe uma desinstalação sem semântica de backend | o smoke não clica em desinstalar, mantendo a suíte oficial toda verde     |

## Promotion gate

Todos os novos specs começam em `packages/desktop/test/e2e/plugins/manual-review/pending/`. Depois de revisar manualmente as capturas, interações e evidências, executa-se primeiro o promotion dry-run e só então o apply; specs pending não revisados não entram no WDIO padrão, no preset Docker nem na CI oficial de macOS/Windows.

## PLM-STRIP-CLIP（2026-09-15）

Aceito: 12 plugins instalados e atualizáveis, verificados a 390/1200px, em zh/en e temas claro/escuro, com os selos totalmente visíveis; passando o mouse e focando pelo teclado no primeiro/último item, rolar horizontalmente até o fim e clicar no selo dispara apenas a atualização correspondente, sem abrir os detalhes. Sem overflow horizontal de página e sem barra de ícones com scroll vertical. Usa componentes compartilhados reais e callbacks de ação de teste, sem cobrir o backend de instalação.

## Casos confirmados em 2026-09-16

PLM-LC-018 (localização da lista de gerenciamento), PLM-LC-019 (criação de rascunho de plugin por dois pontos de entrada) e PLM-LC-020 (navegação para adicionar ao mercado) foram confirmados pela solução de produto; status, ações, asserções e limites estão em [plugin-creator](plugin-creator.md). Não cobrem skills gravadas nem a busca difusa do mercado.

## PLM-MISSING-CONFIG（2026-09-17）

Cenário confirmado: existe uma configuração antiga de document-skills com packageStatus=missing e nenhum dos conjuntos de diretório/instalação/restauração tem esse ID; ao mesmo tempo, cinco plugins novos ainda têm diretório. Entrar na loja e buscar pelo nome antigo: o cartão antigo e o botão de instalar não existem, enquanto os plugins novos continuam visíveis.
Contraste: quando o catálogo ainda oferece um pacote reparável mas ele falta localmente, a entrada de instalar é preservada. O conjunto diagnóstico original de plugins não é alterado.
Evidências: regressão de buildStoreItems + fixture de navegador (desktop/tela estreita, zh/en, claro/escuro) + medição real com a config de usuário original em dev.
Nenhuma migração automática ou exclusão de configuração é executada; a property de plugins instalados órfãos, da restauração de embutidos e da atribuição de config Workspace/User não muda.

## PLM-DOCUMENT-ORDER（2026-09-17）

O plugin oficial de documentos vem por padrão ordenado em PDF, PPT, Excel, Word. O caso de navegador cobre as categorias da loja e a faixa de ícones de instalados, desktop/mobile × zh/en × temas claro/escuro; o agrupamento administrativo predefinido, a desativação, itens ausentes, o isolamento homônimo pessoal e a prioridade da ordenação do servidor são cobertos principalmente por testes unitários.
Entrada: `packages/ui/test/browser/manual-review/pending/plugin-store-mode-order.test.mjs`.
Este caso pertence à verificação de apresentação em navegador e não serve como evidência de admissão para o ciclo de vida de instalação do Electron nem para a CI oficial.