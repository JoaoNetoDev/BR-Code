# Matriz de Cobertura E2E do Ciclo de Vida de Gerenciamento de Plugins

Esta matriz acompanha o status dos cases candidatos do [Plugin Management Lifecycle Case Catalog](../plugin-management-lifecycle-case-catalog.md), da revisão manual até o gate formal nas três plataformas. `manual-review` não equivale à cobertura pelo gate de qualidade padrão.

## Status de cobertura

| Case                                      | Abreviação da spec | Automação de UI | Evidência de runtime/storage                                          | Revisão humana | Spec formal | Linux Docker | macOS CI | Windows CI |
| ----------------------------------------- | ----------------- | -------------- | --------------------------------------------------------------------- | -------------- | ----------- | ------------ | -------- | ---------- |
| `PLM-LC-001` discovery/navigation         | `PD`              | passagem direcionada | estado de UI + screenshot capturado                                    | pending        | blocked     | blocked      | blocked  | blocked    |
| `PLM-LC-002` presentation                 | `PP`              | passagem direcionada | DOM/a11y/overflow + screenshot capturado                               | pending        | blocked     | blocked      | blocked  | blocked    |
| `PLM-LC-003` personal main lifecycle      | `PM`              | passagem direcionada | overview/list/storage + update badge/inline entry + evidência de provider Skill/MCP v2 aprovada | pending | blocked | blocked | blocked | blocked |
| `PLM-LC-004` persistence/local visibility | `PV`              | passagem direcionada | evidências de restart/config/enabled/workspace B aprovadas            | pending        | blocked     | blocked      | blocked  | blocked    |
| `PLM-LC-005` orphan/reassociate           | `PO`              | passagem direcionada | source/config/enabled + ausência de todas as entradas de update (menu/detail/badge/inline) + evidência de Skill em sessão nova aprovada | pending | blocked | blocked | blocked | blocked |
| `PLM-LC-006` builtin suppress/restore     | `PB`              | passagem direcionada | evidências de suppression/config/data + preservação de Catalog/cache + restart pendentes | pending | blocked | blocked | blocked | blocked |
| `PLM-LC-007` local official CDN           | `PC`              | passagem direcionada | evidências de loopback HTTP ZIP/cache/overview aprovadas              | pending        | blocked     | blocked      | blocked  | blocked    |
| `PLM-LC-007b` real CDN smoke              | `PCS`             | não executado    | não capturado                                                          | pending        | never       | never        | never    | never      |
| `PLM-LC-008` recoverable failures         | `PF`              | passagem direcionada | evidências de source/refresh/describe/install/update preservation aprovadas | pending    | blocked     | blocked      | blocked  | blocked    |
| `PLM-LC-009` inline smoke                 | `PI`              | passagem direcionada | evidências de UI/list + invocação de Skill em sessão nova aprovadas  | pending        | blocked     | blocked      | blocked  | blocked    |
| `PLM-LC-010` secret env/agent projection  | `PEA`             | passagem direcionada | marcador MCP resolvido + captura sem secrets + uma linha canônica de agent + vídeo de `capturePage()` do Electron | pending | blocked | blocked | blocked | blocked |
| `PLM-LC-011` no-Git GitHub Archive        | `PGA`             | passagem direcionada | Claude Marketplace/plugin HTTP reais + diagnóstico de Git ausente; executar `desktop-e2e-20260806033745155-p99439-e61ceea7b4c68fcf` | pending | never | never | never | never |
| `PLM-LC-012` isolated refresh/atomic cache | `PRA`             | não executado    | refresh parcial + falha persistida + rollback pendentes                | pending        | blocked     | blocked      | blocked  | blocked    |
| `PLM-LC-014` builtin uninstall/detail parity | `PBD`           | não executado    | describe/components + suppression/runtime absence + cache/manifest inalterado pendentes | pending | blocked | blocked | blocked | blocked |
| `PLM-LC-015` bundled install ownership   | `PBO`             | não executado    | evidências de bundled restore vs CDN Marketplace ownership pendentes  | pending        | blocked     | blocked      | blocked  | blocked    |
| `PLM-LC-016` seed/cache/runtime separation | `PBS`           | não executado    | filesystem/SEA seed, discovery suprimido, describe e self-heal pendentes | pending    | blocked     | blocked      | blocked  | blocked    |
| `PLM-LC-017` installed row menu layout   | `PML`             | passagem direcionada | row menu de workspace-override em linha única + screenshot            | pending        | blocked     | blocked      | blocked  | blocked    |

## Caminhos candidatos de spec

Novos/migrados no Todo103: PLM-LC-018/019 correspondem a `plugins/manual-review/pending/plugin-store-auto-refresh-{throttled,on-enter}.test.ts`; os dois casos passaram no Pro `desktop-e2e-20260909-152018-653`. PLM-LC-020 corresponde a `plugins/manual-review/pending/plugin-subagent-override-cold.test.ts`, com verificação de requisições de child cold-start/continuação do pai passando no Pro `desktop-e2e-20260909-152419-828`, e a verificação de fixture local do case passando. Nenhum dos três foi promovido manualmente; 019 permanece como smoke de rede pública e não entra no CI formal.

| Abreviação | Spec pendente                                                             |
| ------------ | ------------------------------------------------------------------------- |
| `PD` / `PP`  | `plugins/manual-review/pending/plugin-management-discovery-presentation.test.ts` |
| `PM`         | `plugins/manual-review/pending/plugin-management-personal-lifecycle.test.ts`     |
| `PV` / `PO`  | `plugins/manual-review/pending/plugin-management-persistence-source.test.ts`     |
| `PB` / `PI`  | `plugins/manual-review/pending/plugin-management-builtin-inline.test.ts`         |
| `PC`         | `plugins/manual-review/pending/plugin-cdn-zip-marketplace-install.test.ts`       |
| `PCS`        | `plugins/manual-review/pending/plugin-cdn-zip-official-cdn-smoke.test.ts`        |
| `PF`         | `plugins/manual-review/pending/plugin-management-recoverable-failures.test.ts`   |
| `PEA`        | `plugins/manual-review/pending/plugin-runtime-env-agent-projection.test.ts`      |
| `PGA`        | `plugins/manual-review/pending/plugin-no-git-github-archive.test.ts`             |
| `PRA`        | `plugins/manual-review/pending/plugin-refresh-atomic-cache.test.ts`              |
| `PBD`        | `plugins/manual-review/pending/plugin-management-builtin-detail-parity.test.ts`  |
| `PBO`        | `plugins/manual-review/pending/plugin-management-bundled-install-ownership.test.ts` |
| `PBS`        | `plugins/manual-review/pending/plugin-management-seed-runtime-separation.test.ts` |
| `PML`        | `plugins/manual-review/pending/plugin-management-installed-menu-layout.test.ts`   |

## Última verificação direcionada

Em 2026-07-15, as pending specs `PD/PP`, `PM`, `PV/PO`, `PB/PI`, `PC` e `PF` acima foram executadas individualmente no macOS, todas passando. Essas specs não podem compartilhar o HOME de E2E em paralelo; é permitido executar em série no mesmo lote compatível, com HOME isolado por caso e build compartilhado.

Screenshots e capturas de provider foram gerados, mas a revisão manual de produto ainda não foi concluída; portanto, esta tabela não marca nenhum case como `formal` e não executa promotion apply, Docker admission nem preset de CI formal.

Em 2026-07-20, a pending spec `PEA` foi executada de forma independente no macOS e passou (run `desktop-e2e-20260720040616896-p59191-dfc1ae47585cbcf6`): os detalhes de instalação do plugin mostram um MCP e um agent, a página de Subagents exibe apenas um recurso de plugin normalizado, a chamada real de MCP tool retorna o marcador resolvido, e as capturas de provider e os logs de execução não contêm secrets sintéticos. A gravação via `webContents.capturePage()` do Electron gerou um WebM VP9 de 2400×1600, 7 segundos e 28 quadros; screenshots e vídeos principais foram gerados, mas ainda aguardam revisão manual de produto.

Em 2026-08-06, a pending spec `PGA` foi executada de forma independente no macOS e passou (run `desktop-e2e-20260806033745155-p99439-e61ceea7b4c68fcf`): o binário Git do Agent aponta para um caminho absoluto inexistente e fontes Git do GitHub retornam `plugin_git_unavailable`; em seguida, o Anthropic Claude Marketplace real foi baixado via `zipball/HEAD` do GitHub e o `aikido` foi instalado pelo SHA fixo no diretório. Marketplace e cache de instalação não possuem `.git`, o registro de instalação mantém URL/SHA e o discovery chega ao componente MCP do plugin. Esse smoke de rede pública continua sendo usado apenas para revisão manual e não será promovido a gate formal de CI.

Em 2026-08-21, a regressão direcionada da separação Catalog/Runtime foi concluída em um worktree isolado do Orca: testes de ciclo de vida de plugin no Bootstrap 33/33, testes de plugin de Adapters 74/74, testes de listing/card de UI 20/20; `pnpm typecheck` e `pnpm lint` na raiz passaram, com o lint mantendo apenas os warnings já existentes. O E2E manual formal (PBD/PBO/PBS) ainda aguarda execução com HOME isolado e revisão manual, e não é promovido nesta implementação.

Em 2026-09-02, foram adicionadas as asserções de `PM`/`PO` para «badge de atualização na lista de instalados + botão de atualização inline» (o badge e a entrada inline aparecem / não aparecem em plugin órfão), além do novo teste unitário de UI `packages/ui/test/pluginStoreUpdateEntries.test.ts` (5/5 passando). As duas pending specs não foram reexecutadas: elas ainda referenciam os seletores já desativados `plugin-store-manage`, `plugin-store-installed-row` e `plugin-store-check-updates` (a visão de manage foi incorporada a Settings → lista de plugins `plugin-settings-plugin-row`), e precisam de uma correção separada antes de nova revisão manual.

## Regras de admissão

1. A pending spec precisa ter fixtures determinísticos de filesystem/provider locais do case e seletores estáveis.
2. A execução manual precisa produzir evidências de list/detail/manage/error/presentation relevantes para seus cases.
3. A revisão humana muda `Human review` para `approved`; somente então a promoção pode mover a spec para fora de pending.
4. Cases de runtime promovidos precisam passar na verificação de fixture, em replay isolado comum+do case e no replay padrão.
5. Cada grupo de compatibilidade precisa passar em uma spec Docker isolada antes da admissão ao preset `plugins`.
6. O preset admitido precisa passar no Linux; o mesmo conjunto formal de specs precisa ser selecionado pelo CI de macOS e de Windows.

## Exclusões explícitas

- `PLM-BC-001` install cancel, `PLM-BC-002` standalone source diagnose e `PLM-BC-003` inline uninstall permanecem como candidatos a bug, e não como cases de ciclo de vida com falha.
- Web standalone, `/remote` em celular, sincronização de plugins em remote workspace e instalação em escopo de workspace não foram marcados como covered nesta matriz.

## PLM-STRIP-CLIP: corte do badge na faixa de instalados (2026-09-15)

- Caso: `packages/ui/test/browser/manual-review/pending/plugin-installed-strip.test.mjs`, com `PluginStoreListView` real + callbacks de ação de teste.
- Chrome/macOS, navegador: 8/8 passando: 390/1200px × chinês/inglês × tema claro/escuro, validando badge do primeiro e do último item e espaço de foco, hit area após hover, clique de atualização no fim da rolagem, ausência de abertura indevida de detalhes e overflow horizontal da página. O estilo original reproduz top=false / hit=false.
- Screenshots: diretório temporário do sistema `zcode-plugin-strip-clipping/`. typecheck da raiz, typecheck:e2e do desktop, lint e verificação de arquitetura passaram; o teste unitário existente de entradas de atualização passou 5/5.
- Pending, não promovido; a validação de renderização e clique no navegador não representa validação completa de atualização de plugin no Electron, em celular real ou em Windows/Linux.

## Plugin Creator e localização

PLM-LC-018/019/020: `plugins/manual-review/pending/plugin-localization-creator.test.ts`, pending, não executado, sem revisão humana. O teste unitário complementa com invalidação assíncrona de alvo, isolamento por ID completo e creator ausente/desativado; não serve como evidência real de ponta a ponta em celular ou SSH.

Complemento de 2026-09-16: as categorias públicas e os agrupamentos do mercado pessoal vêm expandidos por padrão, mantendo recolhimento/expansão manual. As asserções de PLM-LC-001 foram sincronizadas; o E2E plugin-localization-creator ganhou uma regressão de 8→6→8 cartões, e as combinações público/pessoal com chinês/inglês são cobertas por testes unitários de interação de componente. Entrada: `packages/ui/test/browser/manual-review/pending/plugin-store-mode-order.test.mjs`.

## PLM-MISSING-CONFIG

- Status: manual-review (sem promoção formal para CI).
- Automação: `PLM-MISSING-CONFIG` em `packages/ui/test/browser/manual-review/pending/plugin-store-mode-order.test.mjs`; o fixture passa por buildStoreItems → PluginStoreListView → projeção de cartões/busca reais.
- Cobertura: larguras 1200/390, en-US/zh-CN, light/dark; configuração deslistada não gera produto, diretório sem pacote é instalável e novos plugins não desaparecem.
- Complemento: configuração original no Electron de dev → Agent list/overview → Host → Renderer medidos de verdade; navegador em tela estreita é validação de UI compartilhada e não se alega validação de conexão de remote control real em celular. O caso desktop formal com HOME isolado ainda não foi promovido.

Verificação de 2026-09-17: `node --test --test-name-pattern=PLM-MISSING-CONFIG packages/ui/test/browser/manual-review/pending/plugin-store-mode-order.test.mjs` passou 8/8; CDP de dev verificou 0 cartões antigos, 5 cartões de novos plugins e a preservação do diagnóstico original de missing. O resultado é mantido ao reabrir a loja.

## PLM-DOCUMENT-ORDER (2026-09-17)

Os plugins oficiais de documentos são ordenados por PDF, PPT, Excel e Word. O caso de navegador cobre as categorias da loja e a faixa de ícones de instalados, em desktop/celular × chinês/inglês × tema claro/escuro; os grupos predefinidos de gerenciamento, desativação, item ausente, isolamento homônimo pessoal e prioridade da ordenação do servidor são cobertos principalmente por testes unitários.
Entrada: `packages/ui/test/browser/manual-review/pending/plugin-store-mode-order.test.mjs`.
Este caso pertence à validação de exibição no navegador e não serve como evidência de ciclo de vida de instalação no Electron nem de admissão formal de CI.

## PLUGIN-CREATOR-ICON

O ícone local do creator oficial percorre a loja, os candidatos `@`, as tags do Composer e a projeção de mensagens de Session.
O caso `PLUGIN-CREATOR-ICON` de `plugin-picker-order.test.mjs` cobre abrir o candidato e inserir a tag quando o catalog não tem icon remoto, em 1200/390, chinês/inglês e tema claro/escuro; mensagens de Session e isolamento homônimo no mercado pessoal são cobertos por `pluginCreatorMentionIcon.test.ts`.
Status manual-review, sem promoção automática; nenhuma mensagem de teste é enviada a um modelo real.

## Interação e classificação do mercado de plugins (2026-10-12)

- Regressão de expansão dentro do grupo de plugins da aplicação (2026-10-15): o `PLM-UI-GROUP` de `plugin-store-mode-order.test.mjs` cobre público/comunidade/pessoal, exibição padrão de 8 cartões, 8→6→8 no lugar, a preservação das demais categorias, a limpeza da busca, a preservação da seleção manual na ida e volta de origem, a operação por teclado e os temas em chinês/inglês claro/escuro em visores largo e estreito. Este item é uma validação real de interação de componente no navegador e não representa validação de controle remoto real em celular nem do ciclo de vida de instalação no Electron; continua em manual-review/pending.

- PLM-LC-001/002: `plugin-management-discovery-presentation.test.ts` passou no macOS Electron, run `desktop-e2e-20261011-170738-518`. Cobre a busca segmentada, expandir/recolher, o detalhe do cartão, a ida e volta do gerenciamento dentro do mercado e a exibição em visores largo e estreito.
- PLM-UI-001: `plugin-management-ui-market.test.ts` passou no macOS Electron, run `desktop-e2e-20261011-170634-701`. Cobre a instalação real, a abertura de um recurso MCP em uma sessão existente, o handshake do sandbox, fechar sem desinstalar, o gerenciamento dentro do mercado no Side Pane, a suspensão por projeto e o isolamento entre o global e outro projeto, a abertura após habilitar, a herança na restauração e o cancelamento/confirmação da desinstalação. A verificação estática do fixture passou; permanece em manual-review/pending, sem promoção automática.
- Casos de navegador de recomendação padrão: os dois grupos passaram, cobrindo a exclusão dos plugins de desenvolvimento não catalogados, a abertura por mouse e por teclado, a deduplicação de tags, os visores largo e estreito e os temas em dois idiomas.
- A faixa de ícones do antigo PLM-STRIP-CLIP foi removida; o teste de navegador correspondente agora cobre a atualização na linha do cartão, o alcance do foco, o ponto de entrada de gerenciamento e a ausência de overflow horizontal, com 8 grupos passando; há ainda 2 grupos passando para a ampliação da imagem de detalhe da UI, o fechamento por Escape e o retorno do foco. A validação histórica anterior representa apenas a interface daquele momento.
- Regressão de navegador de classificação e ordenação de modos 18/18 passando: busca segmentada atual, expansão padrão, modo office, projeção de pacote ausente e a ordem oficial dos documentos; mantém a asserção de falha de refresh.
- Ainda não foram concluídas a validação de controle remoto real em celular e a validação no Windows/Linux Electron; o resultado em visor estreito não substitui essas validações.
- Verificação estática: typecheck da raiz e de cada pacote do CLI, root lint e architecture --changed passaram. O root lint mantém os warnings já existentes, e a arquitetura tem 0 violações. Os testes unitários de UI relacionados a plugins passaram 224/224, assim como os conjuntos direcionados de abertura adicional de UI, de tags e de credenciais de inicialização; no CLI, o ciclo de vida e o protocolo do bootstrap passaram 64/64 e a resolução de diretório 4/4.
- Screenshots em `packages/desktop/.e2e-artifacts/plugin-management/plm-ui-001/`: `real-ui-sandbox.png`, `side-pane-market.png`, `project-override.png`. A imagem do sandbox usa uma página de teste determinística e não representa os plugins recomendados por padrão.
- Repositório do catálogo de plugins: de 239 testes, 219 passaram e 20 foram pulados; 27 plugins passaram na validação e no build de publicação, e o caminho, o número de bytes e o sha256 de todos os ZIPs são idênticos antes e depois da migração do catálogo. O catálogo remoto ainda não foi publicado.

### Regressão de correções do Review (2026-10-12)

- Projeção global e scoped de plugins, sincronização remota, configuração de usuário do Source, mesclagem de consultas, preservação de erros e invalidação de consultas antigas: `pluginManagementProjectionSync.test.ts` 8/8; inclui as asserções de wiring de que o hook real `useCuaComposerEntry` fica oculto quando o mercado é suspenso. Store, atribuição de erros, sincronização remota, navegação e componentes de detalhe somam 67/67, e o fixture de credenciais de inicialização 5/5.
- Cartão/detalhe no navegador 12/12: novo botão de detalhe independente para a UI instalada, e ver o detalhe no estado suspenso não dispara abertura nem habilitação; cobre o teclado e as combinações 390 chinês escuro / 1200 inglês claro.
- PLM-UI-001: run `desktop-e2e-20261012-050628-695` passou; tanto a UI instalada e habilitada quanto a suspensa podem entrar no detalhe de forma independente, sem gravar o estado de habilitação e sem adicionar nenhuma tab de UI.
- PLM-LC-001/002: run `desktop-e2e-20261012-050703-560` passou, complementando o retorno ao chat pela navegação principal sem cair na antiga página de gerenciamento nas configurações.
- WPL-015: run `desktop-e2e-20261012-051242-142` passou: após instalar pelo mercado, volta ao chat e entra no gerenciamento User / Workspace; salvar, sobrescrever, limpar campos, suspender e restaurar a herança mantêm as asserções originais. O startup ready, o breadcrumb e o ponto de entrada de restauração do menu do script antigo foram sincronizados com a interação atual.
- PLM-LC-018: run `desktop-e2e-20261012-051408-560` passou; sair do mercado voltar ao chat e reentrar pela barra lateral ainda acerta o throttling de refresh, e o horário de atualização do catálogo oficial permanece inalterado.
- O typecheck da raiz, o lint e a verificação de architecture passaram. O controle remoto real em celular, a mistura de versões, o Windows/Linux Electron e o smoke de refresh na rede pública não foram executados; hoje o Source/sincronização remota é uma regressão com mock de store/service e não se apresenta como validação remota de ponta a ponta. Todos os casos continuam pending, sem promoção.

### Injeção de falhas da segunda rodada do Review

- Conjunto de testes de plugins 241/241 passando. Novas verificações de projeção secundária que nunca retorna/rejeita, de capacidade remota necessária que não é bloqueada pela projeção, e de o projeto A não atualizar o projeto B nem a surface remota; erros de diagnóstico de instalação e de restauração não invalidam o rascunho nem o refresh de skills, e o encerramento continua ocorrendo no caso de sucesso.
- PLM-UI-001 run `desktop-e2e-20261012-053949-887` passou: removendo ao mesmo tempo o pacote de origem original e o managed, o erro de instalação real fica visível e nenhum registro de instalação é gerado; restaurado o pacote de origem, o retry tem sucesso e as regressões seguintes de sandbox de UI, override de projeto, herança e desinstalação passam.
- PLM-UI-001 run `desktop-e2e-20261012-090553-480`, `desktop-e2e-20261012-092305-636` (após alinhar o texto da página de inicialização ao protótipo) passou; o caso é gravado inteiramente como `plm-ui-001.webm` e emite os pontos de tempo dos passos em `plm-ui-001.chapters.json`: regressão depois de alinhar o cabeçalho do mercado e a página de inicialização do Side Pane ao protótipo; saída de screenshots numerados 01–15 por capítulo do PRD (`.e2e-artifacts/plugin-management/plm-ui-001/`), esperando o fim das animações por um tempo limitado antes de cada screenshot. O modelo de replay não tem o nível de pensamento high; em tempo de execução é definido `E2E_PROVIDER_THOUGHT_LEVEL=` e o case fixture é especificado explicitamente.
- root typecheck, lint (0 errors / 222 warnings), architecture (0 violações) e E2E typecheck passaram. As limitações de validação de plataforma e de mistura de versões permanecem as mesmas.

### Convergência da abertura da UI para o mercado à direita da sessão (2026-10-12)

- Regra: no mercado da navegação principal, o cartão e a linha da página de gerenciamento entram no detalhe pela linha inteira, sem botão «Abrir» nem «Detalhe», e o botão principal do detalhe é «Experimentar agora»; no mercado à direita da sessão, o cartão, o detalhe e a linha da página de gerenciamento têm um «Abrir» a mais (no estado suspenso, «Habilitar»: é preciso habilitar antes de abrir).
- Cartão/detalhe no navegador 14/14: novo `PLM-UI-MAIN-NAV` (na navegação principal não há abrir, a linha inteira entra no detalhe e o detalhe é «Experimentar agora»); `PLM-UI-DETAILS` passa a entrar no detalhe pelo cartão inteiro com Enter do teclado.
- PLM-UI-001 run `desktop-e2e-20261012-104955-651`, `desktop-e2e-20261012-105655-477`, `desktop-e2e-20261012-105824-912` passou; os screenshots de passo 06–16 passaram a ser: navegação principal sem abrir → abrir pelo mercado à direita → abrir pela página de gerenciamento à direita → após suspender o projeto, «Habilitar» à direita e abrir → entrar no detalhe pela linha inteira da página de gerenciamento e restaurar a herança. O caso fecha a aba do mercado à direita antes das asserções da navegação principal: a visão de sessão permanece montada em segundo plano, e com dois mercados coexistindo a busca por testid pega a cópia oculta.
- Ocorrência conhecida e esporádica: `desktop-e2e-20261012-105221-558` deu timeout ao esperar `plugin-store-manage` na segunda entrada na página de gerenciamento pela navegação principal; as 3 execuções seguintes em sequência não reproduzeram, e a causa não foi localizada.

### Recomendações de UI do servidor (2026-10-13)

- `side-pane-plugin-menu.test.mjs` não substitui mais o módulo de lista estática; passa a solicitar a resposta de configuração e a usar o parser real de configuração pública.
- 1200px / inglês / Zai Light e 390px / chinês / Zai Dark, os dois grupos passaram: interseção das recomendações, deduplicação de itens repetidos, exclusão de plugins de desenvolvimento não catalogados e de painéis desconhecidos, página de inicialização/menu, abertura por teclado e a regressão de configuração vazia/falha de requisição.
- A opção `ZCODE_UI_RECOMMENDATIONS_LIVE_CONFIG_URL` foi ligada à configuração real do ambiente de teste; desta vez a interface retornou 5 recomendações e a exibição e as asserções dos parâmetros de abertura foram concluídas. O painel do workspace continua sendo fornecido pelo fixture e não representa a aceitação de uma instalação real ou de execução no sandbox.
- A interface de teste do serviço de configuração real do Host: leituras paralelas disparam apenas uma requisição, as leituras seguintes atingem o cache, e a identidade dos 5 plugins/painéis é a mesma dos pacotes de publicação já validados.
- A configuração de teste do Nacos mantém os 16 itens originais e apenas acrescenta `uiPluginRecommendations`; publicada com o MD5 original, relida de forma exata e com o retorno da interface pública conferido. A configuração de produção não foi modificada.
- Não foram reexecutadas as instalações reais nem as execuções no sandbox de cada plugin, e não houve verificação real em Windows/Linux nem de controle remoto em celular. Os casos permanecem pending, sem promoção.

### Instalação e habilitação na área de recomendações (2026-10-13)

- A exposição das recomendações passa a usar o catálogo completo, e os itens não instalados ou desabilitados continuam sendo exibidos; a ordem da configuração e a deduplicação pela identidade completa permanecem estáveis.
- A regressão de `useRecommendedUiPlugins` cobre a instalação no nível do usuário, a habilitação no nível do projeto, o clique repetido, o retry em caso de falha, a troca de serviço e o isolamento de resultados tardios depois de sair da sessão e voltar; reutiliza o store de gerenciamento de plugins existente.
- `side-pane-plugin-menu.test.mjs` acrescenta à página de inicialização e ao menu do botão «+» o fluxo «instalar → habilitar → clicar de novo para abrir», asseverando depois do sucesso que não houve abertura automática; também assere o scope user/workspace realmente solicitado ao serviço. O menu permanece aberto durante a instalação e a habilitação.
- O fixture de navegador simula o serviço de instalação e o catálogo de painéis; o staging real é usado apenas para validar a resposta de configuração das recomendações. Esta rodada não repete a instalação real de plugins, o sandbox, Windows/Linux nem a aceitação em dispositivo móvel.

### Estado de carregamento das recomendações (2026-10-13)

- Reprodução com requisição controlada no navegador: quando a configuração ainda não havia retornado, a implementação antiga já exibia «No recommended UI plugins yet».
- Agora, enquanto a configuração ou o catálogo completo ainda estiver carregando, exibe-se um esqueleto. O navegador libera a configuração e o catálogo separadamente por meio de um portão de requisição e assere que o estado vazio não aparece no meio; também cobre o menu do botão «+» do carregamento até a configuração vazia, e o fim do carregamento por falha. Os visores largo e estreito e os dois temas usam o mesmo conjunto de casos.

### Telemetria do ciclo de vida (2026-10-15)

| Case        | Cenário                                                                                              | Caso de teste                                                        | Verificação                    | Status                     |
| ----------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------ | -------------------------- |
| PLM-TEL-001 | Resultado final da instalação de plugin e privacidade | `plugins/manual-review/pending/plugin-lifecycle-telemetry.test.ts` | replay no macOS Electron passou | pending, não incluído no CI |

Lote de verificação `desktop-e2e-20261015031949530-p54859-5f1860f2585df3f1`: a instalação pelo detalhe real da loja teve sucesso, e a saída HTTP final contém apenas um resultado de install, com event_id e duration_ms, sem operation_id e sem caminho. A whitelist de celular, o resultado da sincronização remota e a atribuição de MCP são validados por testes unitários direcionados; Windows/Linux e a instalação remota real não foram executados.

### Inicialização e execução em segundo plano (2026-10-15)

| Case                        | Cenário                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Entrada                                                                                 | Fronteira                                                                                                                                                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PLM-UI-BACKGROUND           | cold start sem âncora/tab oculta, primeira criação e execução após minimizar, execução mesmo com a sessão ociosa sem destruí-la, liberação na remoção                                                                                                                                                                                                                                                                      | `mcp-apps-host-e2e.mjs --background-only`                                            | Electron real, owner/Agent/sandbox de produção; página controlada, não promovido ao CI                                                                                                                                     |
| PLM-UI-BACKGROUND-ADMISSION | resultado real de ferramenta sem card montado e sem subscrição de conversation criando pela primeira vez, execução em segundo plano, reuso no retorno; instância do mesmo plugin preservada e liberada em sessões diferentes de duas janelas                                                                                                                                                                                                                                           | `mcp-apps-host-e2e.mjs --background-only`                                            | macOS Electron passou; a admissão concorrente na mesma janela e o isolamento por chave de sessão são cobertos por testes unitários separados, não promovido ao CI                                                                                                     |
| PLM-UI-VISIBILITY           | barra lateral mantida viva, troca de aba, invisível e sem bloquear cliques ao sair do chat/do workspace; trabalho em segundo plano, estado de edição e instância preservados, interação restaurada                                                                                                                                                                                                                                                                           | `mcp-apps-host-e2e.mjs --managed-only`                                               | macOS Electron passou nos temas claro e escuro; integração com componentes de produção, e a projeção na página do host é coberta por UT de desktop/mobile shell, não promovido ao CI                                                                                               |
| PLM-UI-BACKGROUND-CRAFT     | janela minimizada e sem card: um resultado real de ferramenta dispara a primeira inicialização do WASM; operação na camada de segundo plano, estado de edição preservado e screenshot da exibição restaurada; UI oculta ao trocar a página principal, edição em segundo plano e retorno                                                                                                                                                                                                | `mcp-apps-host-e2e.mjs --photocraft-background-only`, definindo `ZCODE_PHOTOCRAFT_SERVER` | macOS Electron passou; PhotoCraft 0.2.2 não modificado, e o screenshot de restauração inclui a camada adicionada em segundo plano, o que não substitui a validação do caminho de instalação pela loja                                                                          |

A ausência de fallback em Web/remote, a invalidação de runtime, o scroll inline e a retenção da página seguem usando `--managed-only`.
Windows/Linux, celular real e outros plugins de terceiros exigem verificação independente.

`PLM-UI-CONNECTION-READY`: `--managed-only` controla a ordem de conclusão do initialize real do MCP e verifica que o painel React de produção roda automaticamente após a conexão, sem flash de erro e sem instância duplicada. Passou no macOS Electron em 2026-10-16; não promovido ao CI.
Em um worktree independente, a regressão do grupo inteiro com os comandos padrão passou: `managed` 27 itens, `managed-empty` 1 item e `interaction` 1 item, com o lote de evidência `zcode-mcp-host-e2e-f1vN0y`. Execuções anteriores do grupo inteiro tiveram um timeout de reconstrução por crash do guest e uma falha de asserção de clique após a troca de âncora; as reexecuções independentes passaram todas; a evidência original da falha é preservada, e com base nela não se considera que o problema de estabilidade já esteja resolvido.

## PLM-CONCURRENT-INSTALL: estado ocupado da instalação concorrente

- Candidato de navegador: `packages/ui/test/browser/manual-review/pending/plugin-concurrent-install.test.mjs`. Store e botão de instalação reais, 390/1200px × chinês/inglês × tema claro/escuro, 8 grupos passando; na implementação antiga, os 8 grupos falhavam todos no ponto em que a segunda instalação limpava o estado ocupado da primeira. Logs e screenshots vão para o diretório temporário do sistema `zcode-plugin-concurrent-install/`.
- Candidato desktop: `plugins/manual-review/pending/plugin-concurrent-install.test.ts`. macOS Electron + CLI real; com um portão de resposta no download HTTP local de origem pessoal, verifica duas instalações simultâneas em andamento, que a falha da primeira não limpa a segunda e que ambas podem ser repetidas após falhar; a execução `desktop-e2e-20261015143344848-p62610-27dafbf8f737df99` passou. Screenshot em `.e2e-artifacts/plugin-management/plm-concurrent-install/both-pending.png`.
- Execução offline: `ZCODE_E2E_MANUAL_REVIEW=1 E2E_PROVIDER_HTTP_MODE=replay E2E_PROVIDER_REPLAY_FIXTURE_PATH=packages/desktop/test/e2e/fixtures/upstream/common.json pnpm --filter @zcode/desktop test:e2e -- --spec './test/e2e/plugins/manual-review/pending/plugin-concurrent-install.test.ts'`.
- PLM-DETAIL-DURING-INSTALL: no mesmo caso desktop, com o download de A suspenso pelo portão de resposta e B enfileirado atrás de A, abrir o detalhe do plugin local renderiza as skills na área de componentes em até 30 segundos, e os dois itens continuam em instalação depois do retorno. Depois da correção, a execução `desktop-e2e-20261019044431890-p93406-b0458048236a975f` passou, com o screenshot `.e2e-artifacts/plugin-management/plm-detail-during-install/detail-loaded.png`; ao reverter a correção do CLI, a execução `desktop-e2e-20261019044633752-p3203-b44c097feed8ea0d` falhou na espera da área de componentes.
- Skeleton de nova aba à direita (list/overview enfileirado): no mesmo caso desktop, com o download de A suspenso e B enfileirado, as requisições de `listPlugins` e `getPluginsOverview` pela cadeia de serviço do desktop devem retornar em até 10 segundos. Depois da correção, a execução `desktop-e2e-20261019062945458-p57938-d3a0c643c27817e2` passou; revertendo apenas o despacho imediato de list/overview no transport, a execução `desktop-e2e-20261019063058281-p64564-98a2c55f0e022488` falhou nessa etapa (`plugins/list and plugins/overview waited for the install`). Evidência em campo: o log de dev mostra `listPlugins`/`getPluginsOverview` com 14569 ms, retornando 1,4 s após o fim da segunda instalação.
- A regressão de store cobre o sucesso fora de ordem, a falha, as operações homônimas e o isolamento na troca de contexto, a validação de origem e a sobreposição de instalações. O caminho de sucesso no navegador usa um serviço controlado e não equivale à validação de um download real bem-sucedido. Celular real/controle remoto e Windows/Linux não foram executados; o caso fica pending, sem promoção manual nem admissão no CI.

## PLM-BUILTIN-UI-UNINSTALL: agrupamento após a desinstalação de um plugin de UI embutido

- Candidato desktop: `plugins/manual-review/pending/plugin-builtin-ui-uninstall.test.ts`. macOS Electron + CLI real; após desinstalar `documents@zcode-plugins-official`, o cartão continua na seção de plugins de UI. Depois da correção, a execução `desktop-e2e-20261019071852360-p65132-d5426628aee5a21e` passou, com o screenshot `.e2e-artifacts/plugin-management/plm-builtin-ui-uninstall/restorable-in-ui-section.png`; ao reverter a correção do CLI, a execução `desktop-e2e-20261019072006864-p72979-1022c7e87a447a4e` falhou na etapa restorable (o cartão não está na seção de plugins de UI).
- Teste unitário do bootstrap: a definição embutida do tipo de componente `ui` é consistente com o `ui.surfaces` do pacote do plugin; após a desinstalação, tanto o catálogo oficial quanto a lista de restauráveis carregam `ui`. As duas asserções falham na implementação antiga e passam na nova. Windows/Linux e o controle remoto em celular não foram executados; o caso fica pending.
