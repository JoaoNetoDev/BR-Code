# Separação Catalog / Runtime após desinstalar plugins embutidos

Status: implementação concluída (2026-08-21)
Branch aplicável: `fix/builtin-plugin-detail-after-uninstall`
Revisão: a revisão adversarial somente-leitura do Fable foi aprovada, com a conclusão de que "a direção se sustenta; o ponto de aplicação deve ficar na camada Catalog/seed".

## 1. Resumo da feature / impacto

| Campo | Valor |
| --- | --- |
| Intenção do desenvolvedor | Document Skills embutidos continuam abrindo o detalhe e exibindo a lista completa de componentes mesmo após a desinstalação; comportamento idêntico ao de plugins de Marketplace não embutidos |
| Capacidade | detalhe do Plugin Marketplace, uninstall/restore de embutidos, seed/cache oficial |
| Camada de mudança | `option-source`, `commit-effect`, `persistence`, `validation` |
| Modo de operação | `planning` → implementação |
| Seeds principais | `bundled-plugins.ts`, `plugins.ts`, `marketplace.ts`, `official-marketplace.ts`, `pluginStoreListing.ts`, UI de detalhe do Plugin Store |
| Fora de escopo | novos protocolos/schemas, ativação/desativação de componente individual, Web/mobile remote, instalação em workspace-scope, conversation E2E |

### 1.1 Fatos atuais (Fact)

1. A desinstalação de plugins embutidos é representada por `plugins.suppressedBuiltins`; o Agent discovery, o `skillsService` do Desktop, o `commandsService` e o session facade filtram os recursos de runtime com base nisso.
2. `writeOfficialMarketplace` atualmente filtra os plugins embutidos suprimidos do shard bundled do marketplace.
3. O seed atualmente remove `cache/<official>/<name>/<version>` para plugins suprimidos e pula a materialização.
4. `plugins/describe` depende, para plugins não instalados, da entry do Marketplace e da source root; a entry `filesystem/sea` hoje só é lida a partir de `cachePath` ou do diretório de cache calculado.
5. A UI reprojeta plugins embutidos suprimidos como `restorable=true`, mas a página de detalhe ainda chama `plugins/describe` por falta de `info`, resultando em `plugin_not_found` ou cache ausente.
6. O shard oficial embutido e o shard de CDN já são mesclados sob a mesma identidade `zcode-plugins-official`; o ADR-0001 exige que o listing pertença ao Catalog, e não ao estado de instalação.

### 1.2 Inferências (Inference)

- A confusão entre responsabilidades de Catalog (identidade de diretório, listing, detalhe de componente somente leitura) e Runtime (se é descoberto, se é habilitado, configuração do usuário, data) é a causa raiz deste bug.
- Os bytes do cache embutido vêm do bundle/SEA do aplicativo, não de um artefato de instalação baixado pelo usuário; removê-los não retira código embutido real do dispositivo, apenas quebra o describe offline e cria uma condição de corrida de seed↔uninstall se deletando.
- Preservar o cache embutido somente leitura e deixar o discovery continuar filtrando a supressão permite reutilizar o contrato de UI de describe dos plugins não embutidos sem precisar de um adapter com consciência de SEA.

### 1.3 Desconhecidos / explicitamente adiados (Unknown / Deferred)

- Existe hoje uma janela de baixa probabilidade de lost-update entre o read-modify-write do config e o lock de storage de plugins; esta entrega não se expande para um refactor de lock entre processos, e o registro fica como tarefa posterior.
- `ZCodeAvailablePluginSummary.installed` ainda pode projetar false para plugins embutidos ativos; nesta entrega o comportamento do Marketplace é garantido via join na UI, e a correção do campo de protocolo fica para outro momento.

## 2. Contrato de produto

### 2.1 Contrato visível ao usuário

Antes e depois da desinstalação, plugins embutidos e plugins comuns de Marketplace mantêm a mesma semântica de produto:

| Estado | `installed` | `runtimeLoaded` | Catalog/detalhe | Ação principal |
| --- | --- | --- | --- | --- |
| Instalado | true | true (se enabled) | Componentes e metadata completos visíveis | Gerenciar / Desinstalar |
| Embutido desinstalado | false | false | Catalog, listing e detalhe de componentes ainda legíveis | Install (internamente faz restore) |
| Candidato comum não instalado | false | false | Descrito a partir da source do Marketplace | Install |
| Após restaurar | true | Vale conforme enabled | Idêntico ao estado anterior à instalação | Gerenciar / Desinstalar |

A leitura de detalhe após a desinstalação deve ser uma operação somente leitura: não pode limpar a supressão, não pode habilitar o plugin, não pode criar registro de instalado, não pode disparar sessão de modelo nem runtime MCP.

### 2.2 Estado e propriedade

| Estado/fato | Owner autoritativo | Mirror/cache | Limite de leitura/escrita |
| --- | --- | --- | --- |
| Entry/listing oficial do Catalog | camada de mesclagem dos partitions bundled + CDN do marketplace | `marketplace.json` | Detalhe/listagem somente leitura; refresh atualiza apenas o shard de CDN |
| Diretório materializado da source embutida | fronteira de seed (filesystem/SEA → official cache) | `cache/<official>/<name>/<version>` | Não representa installed; pode ser lido pelo describe |
| Estado de desinstalação de embutido | config do usuário `plugins.suppressedBuiltins` | `restorableBuiltins` do overview, `restorable` da UI | Única fonte de verdade de supressão do Runtime |
| enabled/options | config de plugin do usuário | overview do Agent/UI | Limpo na desinstalação; não afeta o Catalog |
| plugin data | `data/<plugin-id>` | Nenhum | Removido na desinstalação |
| Registro de instalação comum de Marketplace | `installed_plugins.json` | summary de installed da UI | Apenas para instalações cache/Marketplace; restore de embutido não escreve aqui |

## 3. Limite arquitetural

```text
                 ┌──────────────────────────────────────────────┐
                 │ Immutable bundled source                     │
                 │ packages/*-plugin (dev) / SEA assets (prod)  │
                 └──────────────────────┬───────────────────────┘
                                        │ seed boundary
                                        │ filesystem/SEA -> files+sha -> cache
                                        ▼
      ┌──────────────────────────── Catalog layer ────────────────────────────┐
      │ bundled-marketplace.json (all builtin entries)                         │
      │ cdn-marketplace.json       ── merge by official marketplace identity   │
      │ cache/<official>/<name>/<version> (immutable materialized source)      │
      └───────────────┬───────────────────────────────────┬───────────────────┘
                      │ read-only                         │ read + filter
                      ▼                                   ▼
              plugins/describe                       Runtime discovery
              overview/listing                 adapters / skills / commands / MCP
                      │                                   │
                      │                         suppressed id is excluded
                      │                                   │
                      ▼                                   ▼
              Detail UI                         Effective runtime capabilities

  uninstall builtin = add suppressedBuiltins + clear enabled/options + rm data
                      (never remove Catalog entry or immutable source cache)
  restore builtin   = remove suppressedBuiltins + reseed if cache is missing
  Install UI         = restorable ? restoreBuiltin : marketplace install
```

### 3.1 Seed boundary

- `resolveSeedSource` continua sendo o único lugar que entende filesystem vs SEA.
- `seedBundledOfficialPlugins` sempre escreve todas as entries de plugins oficiais e materializa cache roots ausentes ou desatualizados, com as salvaguardas existentes de temp-directory + marker + atomic replacement.
- `writeOfficialMarketplace` escreve todas as entries bundled. A supressão não é compilada no Catalog.
- `resolveOfficialPluginRoots` pode continuar aceitando supressão apenas como parâmetro de compatibilidade, caso removê-lo gere churn desnecessário, mas a supressão deve continuar sendo aplicada pelo discovery e pelos leitores diretos; ela não deve apagar Catalog/cache.

### 3.2 Runtime boundary

- `discoverNodePluginsSync` continua filtrando candidatos oficiais por ID suprimido antes de produzir o `PluginLoadOutcome`.
- As varreduras diretas de cache de `skillsService` e `commandsService` continuam aplicando a mesma verificação de supressão.
- `plugin-facade`, os feature gates de runtime do browser e as startup marks continuam usando o resultado filtrado.
- Nenhum novo leitor pode tratar a presença de cache como prova de instalação ou habilitação.

### 3.3 Boundary de describe/install do Marketplace

- `plugins/describe` para um embutido suprimido lê a entry do Catalog mesclado que foi preservada e o cache materializado; não chama restore nem altera config.
- `plugins/restoreBuiltin` continua sendo a operação canônica de recuperação de embutidos.
- Qualquer caminho de instalação direto via CLI/protocolo que resolva uma entry oficial `filesystem`/`sea` deve ser roteado para o restore de embutido, em vez de escrever um registro de instalado pertencente ao marketplace. Entries de CDN com o mesmo nome e uma source CDN real continuam sendo instalações normais de Marketplace.

## 4. Matriz de superfícies de UI

| Cenário do usuário | Entrada de UI | Implementação compartilhada | Owner de exibição/rascunho | Validação/gating | Ação de commit | Autoridade/persistência | Limite de modo | Deve permanecer isolado de |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Navegar em plugin público | lista/card de `PluginStorePage` | `buildStoreItems`, `PluginStoreCard` | projeção do store de gestão de plugins | entry do Catalog existe; `restorable` controla a ação principal | `onOpenDetail` / `onInstall` | `plugins/overview` do Agent, partitions do Catalog | Desktop local e abstração de serviço Web existente; sem novo ramo remote | habilitação de runtime |
| Ver detalhe de embutido desinstalado | `PluginStoreDetailView` | mesmo detalhe + cache de `plugins/describe` | `describeCache` indexado por ID de plugin estável | Catalog/cache legíveis; `info` de runtime não é obrigatório | `plugins/describe` somente leitura | Catalog do Agent + cache imutável | Sem mudança de sessão/clientMode | `suppressedBuiltins`, enable/options, data |
| Desinstalar embutido | detalhe/card/menu de gestão + diálogo de confirmação | `usePluginUninstall`, store de gestão | estado da operação no store de gestão de plugins | confirmação explícita; embutido é desinstalável | `plugins/uninstall` | config do usuário + limpeza de data; Catalog intocado | Apenas ciclo de vida local do Desktop | semântica de remoção de source do Marketplace |
| Restaurar embutido | botão Install em item restorable | `handleInstall`, `restoreBuiltin` | estado da operação + overview atualizado | `item.restorable === true` | `plugins/restoreBuiltin` | supressão removida; seed auto-repara cache ausente | Apenas ciclo de vida local do Desktop | registro de instalado comum |
| Ver detalhe de plugin instalado | detalhe/gestão | projeção de runtime `ZCodePluginInfo` | `item.info` | info de runtime disponível | sem mutação para leitura | resultado do discovery | inalterado | fallback de detalhe só de catálogo |

## 5. Comportamento compartilhado e divergente

| Aspecto | Compartilhado entre superfícies | Deliberadamente diferente | Por que importa |
| --- | --- | --- | --- |
| Catalog/detalhe | Todas as entries de Marketplace usam listing + `plugins/describe` | A source embutida é um cache local imutável; source Git/URL pode clonar/baixar | O contrato de detalhe visível ao usuário permanece idêntico sem tornar o adapter consciente de SEA |
| Runtime | Todas as capacidades efetivas vêm do discovery filtrado | A supressão de embutidos usa config; a ausência de plugin comum usa registro de instalado/estado de source | A presença de cache nunca pode implicar presença em runtime |
| Install | A UI sempre mostra Install para `installed=false` | Install de embutido vai para restore; candidato comum vai para install | Evita que o embutido seja reescrito como pertencente ao marketplace |
| Uninstall | Confirmação de UI e semântica de limpeza | O embutido limpa supressão/config/data mas preserva Catalog/cache de source; plugin comum remove seu cache/registro de instalação | Alinha o comportamento de produto respeitando a source imutável embutida no App |
| Falha | Falha de describe é visível e pode ser repetida | Cache ausente é uma falha de seed/storage, não um estado normal de "desinstalado" | Evita loops determinísticos de Retry após uma desinstalação válida |

## 6. Relações de impacto

| Rank | De | Aresta semântica | Para | Condição | Por que inspecionar | Evidência |
| --- | --- | --- | --- | --- | --- | --- |
| must-inspect | official seed | materializa | Catalog/cache | source filesystem ou SEA | Corrigir a supressão não pode quebrar assets empacotados | `bundled-plugins.ts`, `official-marketplace.ts` |
| must-inspect | Catalog/cache | lido-por | `plugins/describe` | detalhe sem info de runtime | Causa raiz direta da captura de tela | `marketplace.ts:941-1025` |
| must-inspect | supressão | filtra | Runtime discovery | ID oficial estável | Preservar o invariante de ausência em runtime | adapters `index.ts`, scanners de services |
| must-inspect | projeção restorable da UI | roteia-para | restoreBuiltin | ID duplicado available/restorable | Evitar propriedade errada do registro de instalado | `pluginStoreListing.ts`, `PluginStorePage.tsx` |
| must-inspect | uninstall | persiste-em | config do usuário + data | caminho de confirmação de embutido | Separar Catalog do estado do usuário | `plugins.ts`, adapter de config |
| should-inspect | mesclagem do Catalog | sobrescreve | entry de CDN com mesmo nome | source CDN oficial presente | Preservar identidade/propriedade oficial | `official-marketplace.ts`, ADR-0001 |
| invariant-only | gestão de plugins | executa-através-de | Agent Host | workspace local ou remoto | Sem novo runtime de processo/remoto | escopo de catálogo de lifecycle |
| evidence-only | contrato de lifecycle | coberto-por | cases/matrix PLM | fixtures de revisão manual | Prova de regressão | `docs/plugin-management-lifecycle-case-catalog.md` |

## 7. Invariantes que devem ser preservados

| Invariante | Superfícies/modos | Prova necessária |
| --- | --- | --- |
| Plugin embutido suprimido nunca contribui com Skill/Command/MCP/Hook | Agent discovery, scanners diretos do Desktop, session facade | cache existe + suprimido; listas de runtime omitem o plugin |
| O Catalog continua legível após a desinstalação | lista pública, card, detalhe | describe retorna componentes/metadata; sem diff de config |
| O describe é somente leitura | detalhe/retry | supressão/config/data/cache inalterados antes/depois |
| O restore de embutidos não cria registro de instalado comum | botão Install e instalação direta via protocolo | `installed_plugins.json` inalterado; supressão removida; runtime retorna |
| A propriedade de mesmo nome na CDN continua sendo baseada em source | Catalog oficial mesclado | source CDN usa instalação de Marketplace; source bundled usa restore |
| Seed e uninstall não oscilam o cache | startup/list/overview + uninstall | sem loop de delete/recreate; cache marker permanece válido |
| Limites de Desktop contínuo e web-remote-replayable inalterados | todas as superfícies de configurações de plugins | sem mudanças em stream de sessão/tarefa ou entrega remota |
| Contrato de identidade de workspace inalterado | chamadas de serviço local/remoto | fallback existente `workspaceIdentity?.trim() || workspacePath` permanece |

## 8. Cases aceitos e podados

### 8.1 Cases aceitos

| Case ID | Setup | Ação | Asserções | Camadas de evidência | Status |
| --- | --- | --- | --- | --- | --- |
| `PLM-LC-014 builtin-uninstall-detail-parity` | HOME isolado; embutido seeded e enabled com config/data | Abrir detalhe; desinstalar; permanecer no detalhe; retry; restart; restore | Após a desinstalação: `installed=false`, supressão presente, runtime ausente, Catalog/cache e componentes completos ainda visíveis, sem banner de erro; retry é somente leitura; restart preserva o detalhe; Install restaura o runtime e não deixa registro de instalado comum | UI + protocolo + config/data/cache + discovery limpo | aceito / cobertura de unitário focada |
| `PLM-LC-015 bundled-install-ownership` | Embutido suprimido e entry oficial mesclada; fixture opcional de CDN com mesmo nome | Invocar Install via UI e via protocolo direto | source bundled vai para restore; source CDN vai para instalação de Marketplace; sem supressão obsoleta nem propriedade duplicada | protocolo + registro de instalado + runtime | aceito / cobertura de unitário focada |
| `PLM-LC-016 seed-cache-runtime-separation` | Embutido suprimido com cache presente/ausente; fixtures de filesystem em dev e de SEA | Resolver/listar/describe/skills/commands; remover cache e resolver de novo | A supressão sempre filtra o runtime; cache ausente se auto-repara a partir do seed; describe funciona antes/depois; sem filtragem de Catalog | bootstrap + adapter + testes de services | aceito / cobertura de unitário focada |

### 8.2 Reaproveitar / atualizar case existente

`PLM-LC-006 builtin-suppress-restore` continua sendo o case de lifecycle, mas suas asserções mudam:

- remover as asserções de "cache cleanup" e "restart sem reseed";
- exigir a preservação de Catalog/cache e a legibilidade do detalhe;
- continuar exigindo limpeza de config/data, persistência da supressão, ausência em runtime e restore limpo.

### 8.3 Combinações podadas

| Dimensão | Valores podados | Motivo |
| --- | --- | --- |
| Client | Web standalone, mobile `/remote` | sem novo protocolo remoto ou comportamento de entrega |
| Scope | instalação de plugin em workspace-scope | o contrato de UI atual é apenas de user-scope |
| Runtime de componente | fechamento MCP + Skill; enumeração de Command/Agent/Hook | o catálogo de lifecycle existente já cobre caminhos de runtime representativos |
| Source | SEA de rede pública e CDN real no CI formal | usar fixtures locais determinísticos de filesystem/SEA/HTTP; CDN real permanece como smoke manual |
| Locale/theme/viewport | contrato de UI existente pairwise | não é uma nova mudança de apresentação |

## 9. Plano mínimo de implementação

1. Atualizar a spec/ catálogo/ matrix de lifecycle e o grafo de features (este dossiê primeiro).
2. Adicionar testes de bootstrap/adapter inicialmente falhando para embutido suprimido: manifesto bundled completo, cache retido/auto-reparado, describe com sucesso, runtime ainda filtrado.
3. Adicionar testes de UI de listing/detalhe inicialmente falhando para ID duplicado `available + restorable` e renderização de detalhe com sucesso.
4. Alterar a propriedade de seed/catalog/uninstall em `bundled-plugins.ts` e `plugins.ts`.
5. Corrigir a mesclagem de `buildStoreItems` e o roteamento de install de embutidos; manter os schemas de protocolo inalterados.
6. Rodar testes focados e inspecionar os snapshots persistidos de config, data, cache, manifesto e registros de instalado.
7. Rodar `pnpm typecheck` e `pnpm lint` obrigatórios; em seguida rodar os testes mais amplos de lifecycle de plugins e `git diff --check`.

### Arquivos de código planejados

- `apps/zcode-cli/packages/bootstrap/src/app/bundled-plugins.ts`
- `apps/zcode-cli/packages/bootstrap/src/plugins.ts`
- `apps/zcode-cli/packages/bootstrap/src/app/startup-marks.ts` (somente se o parâmetro de supressão for removido)
- `apps/zcode-cli/packages/ui/src/settings/pluginStoreListing.ts`
- `apps/zcode-cli/packages/adapters/src/plugins/marketplace.ts` somente se o roteamento de instalação bundled exigir um helper estreito
- testes de bootstrap/adapters/services/UI cobrindo os cases aceitos acima

### Explicitamente não alterado

- schemas de protocolo de `packages/shared`
- Web remote / estado replayable do mobile
- catálogos de cases de conversation
- modelo de enable/disable por componente
- redesenho de lock de config entre processos

## 10. Rollback / limites de falha

- Se a retenção de Catalog/cache causar um vazamento em runtime, o rollback deve primeiro provar que todo leitor ainda filtra a supressão; não "corrigir" escondendo a UI de detalhe.
- Se um seed falhar, manter o cache marker válido anterior e expor um diagnóstico; não escrever cache parcial.
- Se o restore falhar, a supressão permanece e o plugin continua ausente do Runtime; o detalhe do Catalog continua legível quando o cache é válido.
- Se não for possível distinguir com segurança a propriedade de instalação direta para entries de CDN com o mesmo nome, manter o caminho de restore da UI e adiar a rota direta de CLI como uma correção com gate separado; nunca criar um registro de instalado duplicado.

## 11. Saída do Feature Boundary Planner

### Evidência do codegraph

Este checkout não tem diretório `.codegraph/`, então a varredura usou as fontes/documentos/testes atuais com `rg` após confirmar que o índice do CodeGraph está ausente. Os caminhos principais de profundidade 2 são:

```text
PluginStorePage
  -> pluginManagementStore.describePlugin / restoreBuiltin / installPlugin
  -> Agent plugins/overview + plugins/describe + plugins/restoreBuiltin
  -> bundled seed + marketplace resolver + runtime discovery
  -> skillsService / commandsService / session facade
```

### Candidatos a drift de grafo

1. O grafo existente tem `capability.plugin-source-acquisition` e `persistence.plugin-marketplace-installed-cache`, mas nenhuma separação explícita Catalog-vs-Runtime nem owner de supressão de embutidos.
2. O case de lifecycle existente `PLM-LC-006` codifica o contrato superado de remoção de cache.
3. A relação entre `restorableBuiltins` da UI e `plugins/describe` não está representada como uma aresta separada do grafo.

### Delta de grafo proposto

Adicionar `capability.plugin-catalog-runtime-separation` com code seeds para bundled seed, marketplace oficial mesclado, resolver de describe, filtro de supressão, uninstall/restore de embutidos, detalhe de UI e evidência de lifecycle. Adicionar as arestas:

- capability → persistência de Catalog/cache (`must-inspect`);
- capability → supressão/discovery de Runtime (`must-preserve-runtime-contract`);
- Catalog/cache → `plugins/describe` (`read-by`, `must-inspect`);
- projeção restorable da UI → `restoreBuiltin` (`commits-to`, `must-inspect`);
- capability → evidências PLM-014/015/016 (`covered-by`, somente evidência).

## 12. Handoff do planejamento

| Item | Destino | Status |
| --- | --- | --- |
| Feature spec / dossiê | este arquivo | completo antes do código |
| Catálogo de cases de lifecycle existente | `docs/plugin-management-lifecycle-case-catalog.md` | atualizar PLM-LC-006 + adicionar PLM-LC-014/015/016 |
| Coverage matrix | `docs/testing/plugin-management-lifecycle-e2e-coverage-matrix.md` | adicionar/atualizar linhas |
| Grafo de features | `.agents/skills/feature-boundary-planner/references/zcode-feature-graph.yaml` | adicionar a capability confirmada e as arestas |
| Prova formal | `packages/formal-proof` | não aplicável; sem mudança de espaço de estados de conversation |
| Handoff de E2E | specs de plugin em revisão manual pendentes | planejado após os testes focados; sem promoção formal nesta tarefa |

## 13. Implementação e verificação

- `bundled-plugins.ts` agora materializa sempre o Catalog/cache oficial completo e deixa a supressão de Runtime para o discovery.
- A desinstalação de embutidos agora preserva o Catalog/cache oficial enquanto ainda limpa a config controlada por supressão e os dados do plugin.
- A instalação direta de uma entry `filesystem`/`sea` bundled suprimida passa por `restoreBuiltin`; entries com CDN mantêm a propriedade de Marketplace.
- A UI faz join de IDs duplicados available/restorable, de modo que os metadados de listing e o detalhe de componentes permanecem disponíveis no estado desinstalado.
- Verificação focada: Bootstrap `tests/plugins.test.ts` 33/33, Adapters `tests/plugins.test.ts` 74/74, testes de listing/card de UI 20/20; typechecks de pacote passam; `pnpm typecheck` e `pnpm lint` da raiz passam (o lint reporta apenas warnings já existentes).