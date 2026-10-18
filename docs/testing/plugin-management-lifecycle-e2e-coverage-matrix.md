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
