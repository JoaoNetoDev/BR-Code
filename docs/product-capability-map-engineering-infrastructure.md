# Mapa de Capacidades do Produto: Extensão de Infraestrutura de Engenharia

## Resumo de Funcionalidades

| Campo | Valor |
| --- | --- |
| Intenção do desenvolvedor | Listar separadamente, fora do runtime de produto de três camadas, o trabalho de CI/CD, release, automação de E2E e dados de qualidade |
| Capacidade | Engineering Infrastructure |
| Camada de mudança | presentation |
| Modo de operação | planning |
| Sementes principais | `.gitlab/ci/*.yml`、`packages/desktop/scripts`、`packages/desktop/test/e2e`、`packages/distillation`、`packages/e2e-report`、`scripts/ci` |
| Fora de escopo | Modificar o comportamento real de CI, release, E2E ou do runtime de produto |

## Matriz de Superfície de UI

| Cenário do usuário | Entrada de UI | Implementação compartilhada | Dono de exibição/draft | Origem de padrão/herança | Validação/gate | Ação de commit | Autoridade/persistência | Limite de modo | Deve permanecer isolado de |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Navegar pela atribuição de capacidades e pela complexidade de manutenção | Mapa de capacidades dos Developer Docs | React Flow, ELK, dados autoritativos do mapa de capacidades | Estado local de filtro e seleção da página | `productCapabilityMap.ts` | Testes de regressão de referência de dados e de layout | Seleção somente leitura de nós/grupos | Dados de auditoria estática no repositório | Mesmo grafo somente leitura em Desktop/Web/Mobile | Runtime de produto, CI e o estado real dos sistemas de release |

## Comportamento Compartilhado e Divergente

| Preocupação | Compartilhado entre superfícies | Deliberadamente diferente | Por que importa para esta mudança |
| --- | --- | --- | --- |
| UI/componente | Quatro áreas de nível superior reutilizam o mesmo conjunto de componentes de grupo, nó e aresta | As três primeiras camadas são dispostas horizontalmente; a infraestrutura de engenharia fica abaixo | A posição espacial expressa diretamente “não é a 4ª camada de processo de produto” |
| Origem de opções | Os mesmos dados de relação entre capacidades | Os nós de infraestrutura usam fatos de código-fonte de engenharia e de pipeline | Evita descrever trabalho de teste/release como funcionalidade online |
| Efeito de commit | Nenhum | Nenhum | Esta rodada altera apenas a visualização de documentação |
| Persistência/recuperação | Sem persistência de estado de execução | Os dados do mapa de capacidades são mantidos com a versão do Git | Não se conecta a tarefas, sessões, telemetria ou backends de CI |

## Relações entre Funcionalidades

| Rank | De | Aresta semântica | Para | Condição | Por que inspecioná-la | Evidência |
| --- | --- | --- | --- | --- | --- | --- |
| must-inspect | Engenharia de build e release | produz artefatos de atualização para | Ciclo de vida de atualização do cliente Host | Entregue apenas via pacote de instalação e update feed | O “Atualização e Release” existente do Host mistura release de P&D com o updater do cliente | `.gitlab/ci/30-build.yml`、`.gitlab/ci/50-release.yml`、`packages/desktop/src/main/autoUpdater.ts` |
| must-inspect | Plataforma de automação de testes | publica resultados para | Dados de qualidade e governança de engenharia | Gera summary, coverage e video ao final do E2E | Relatórios e plataforma de execução são dois limites de manutenção | `packages/desktop/test/e2e/reporting`、`packages/e2e-report` |
| should-inspect | Pipeline de CI | agenda | Build, testes e gates estáticos | Pipeline do GitLab | Confirmar que a CI é a orquestradora e não a dona de todas as capacidades | `.gitlab/ci/20-test.yml`、`.gitlab/ci/30-build.yml` |
| invariant-only | Dados de qualidade de engenharia | deve permanecer isolado de | Observabilidade do produto | Todos os ambientes | Taxa de aprovação de testes, cobertura e duração não são dados de comportamento do usuário | `docs/testing/desktop-e2e-reporting.md`、`docs/monitoring/performance-telemetry-catalog.md` |
| evidence-only | Caso de E2E | verifica | A capacidade de produto correspondente | Apenas como evidência de validação | A alcançabilidade por testes não constitui dependência do runtime de produto | `docs/feature-impact-discovery.md` |

## Donos de Estado e Destinos de Commit

| Estado/fato | Dono de draft/exibição | Dono autoritativo | Comando/serviço de commit | Persistência/cache | Evidência |
| --- | --- | --- | --- | --- | --- |
| DAG do pipeline | UI do GitLab | `.gitlab/ci/*.yml` | GitLab Runner | pipeline/job/artifact de CI | `.gitlab-ci.yml` |
| Artefatos de release | Job de CI | Pipeline de build e release | scripts de build/sign/upload/publish | artifact do GitLab, OSS/CDN, update feed | `.gitlab/ci/30-build.yml`、`.gitlab/ci/50-release.yml` |
| Execução de E2E | Runner WDIO/CLI | contrato de test harness + fixture | WDIO, Docker, runner de capture/replay | `.e2e-artifacts`、fixture/capture | `packages/desktop/wdio.conf.ts`、`packages/distillation` |
| Summary de qualidade | gerador/viewer de relatório | artefatos de summary e coverage de E2E | scripts de reporter/upload | summary JSON/Markdown, vídeo, plataforma Bitable/de relatórios | `packages/e2e-report`、`scripts/ci/push-e2e-*.mjs` |

## Invariantes que Devem Ser Preservados

| Invariante | Superfícies/modos | Prova necessária | Evidência |
| --- | --- | --- | --- |
| A infraestrutura de engenharia não se torna uma dependência do runtime de produto | Renderer/Host/CLI | No grafo só se desenham relações de build, validação, medição e entrega | Auditoria de arestas do mapa de capacidades |
| O updater do cliente e o pipeline de release de P&D pertencem a nós distintos | Desktop + CI | O nó do Host mantém apenas verificação/download/instalação; a infraestrutura possui empacotamento/assinatura/publicação | Texto dos nós e arestas |
| Casos de E2E de funcionalidades de produto não contam de novo no LOC da plataforma de testes | Todos os domínios de teste | Contam-se apenas harness/runner/reporter compartilhados | Critério de auditoria de LOC |
| Dados de qualidade de engenharia não entram no telemetry/App Usage do produto | CI + runtime | A relação de isolamento é expressa explicitamente | Nós de dados de qualidade e de observabilidade |

## Evidência de Codegraph

O worktree atual do mapa de capacidades não possui índice de codegraph, portanto não houve nova chamada ao índice congelado; nesta rodada, conforme a restrição da skill, foram conferidos arquivos e sementes de texto precisas para validar configurações, scripts e documentação não indexados.

| Semente | Consulta | Chamadores diretos / caminho principal | Profundidade | Interpretação |
| --- | --- | --- | --- | --- |
| `.gitlab/ci/00-workflow.yml` | `rg` stage/rule | test -> build -> notify -> approve -> validate -> upload -> preload -> publish -> promote | 2 | O release é um DAG de CI assíncrono, não uma capacidade de processo do Host |
| `packages/desktop/wdio.conf.ts` | `rg` helper/reporter de E2E | serviço do Electron, fixture, capture/replay, summary | 2 | O E2E de desktop tem uma plataforma compartilhada independente |
| `packages/e2e-report` | inventário de arquivos | reporter node -> viewer -> upload de CI | 2 | Os dados de qualidade têm uma cadeia independente de geração, exibição e upload |

## Candidatos a Drift do Grafo

| Candidato | Evidência em código vivo | Relação de grafo ausente/desatualizada | Seguimento proposto |
| --- | --- | --- | --- |
| Engineering Infrastructure | `.gitlab/ci`, harness de E2E e pacote de relatórios são limites estáveis | O grafo semântico de funcionalidades antes tinha apenas capacidades de runtime de produto | Acrescentar capacidades de build/release, automação de testes e governança de qualidade, além das relações de isolamento |
| Client Update Lifecycle | `autoUpdater.ts` e os scripts de release de CI têm fontes autoritativas diferentes | O mapa de capacidades original “Update & Release” misturava dois donos | Estreitar o nó do Host e conectá-lo por uma aresta de artefato de release |

## Delta do Grafo

| Status | Nó/aresta | Razão semântica | Evidência | Ação |
| --- | --- | --- | --- | --- |
| confirmed | `capability.engineering-infrastructure` | O usuário confirmou a necessidade de uma área de infraestrutura independente fora dos três grandes blocos de runtime | Decisão do usuário + fatos do repositório | Atualizar o grafo semântico de funcionalidades |
| confirmed | build/release, test automation, quality intelligence | Os três tipos de trabalho têm fontes autoritativas e entregáveis diferentes | CI, WDIO/distillation, relatório de E2E | Atualizar o grafo semântico de funcionalidades |
| confirmed | quality intelligence must remain separate from data observability | Qualidade de engenharia e dados de comportamento de produto têm usos, objetos e canais diferentes | Documentação atual de monitoramento e E2E | Acrescentar aresta de isolamento |

## Questões em Aberto

Nenhuma. Esta rodada não reatribui o dono de casos de E2E de produto específicos e não modifica o comportamento real dos pipelines.

## Decisões de Limite

| Limite | Decisão | Inclui | Exclui / poda | Fonte |
| --- | --- | --- | --- | --- |
| Layout de nível superior | Infraestrutura de engenharia como área independente na parte inferior | Os três grupos de capacidades de infraestrutura | Uma 4ª camada de processo de runtime de produto | Usuário |
| Limite de atualização | Separar o release de CI do updater do Host | Produção/publicação de artefatos; consumo/instalação no cliente | Um único nó possuindo os dois tipos de estado | Usuário + code |
| LOC | Contar o código-fonte de engenharia de responsabilidade principal | Configuração de CI, scripts, harness/reporter compartilhados | Casos de funcionalidade de produto, fixtures, docs | Critério atual do mapa de capacidades |
| Relações | Desenhar apenas relações semânticas | Agendamento, validação, dados de qualidade, entrega de artefatos, isolamento | Import simples de teste e alcançabilidade estática | Especificação de impacto de funcionalidades |

## Casos Aceitos

| Case ID | Setup | Ação | Asserções | Camadas de evidência | Status E2E |
| --- | --- | --- | --- | --- | --- |
| INFRA-MAP-01 | Carregar o mapa de capacidades completo | Ajustar à visão global | As três primeiras camadas horizontais, infraestrutura de engenharia abaixo | DOM + layout | automated |
| INFRA-MAP-02 | Selecionar um grupo de infraestrutura | Ver detalhes | Exibir LOC de engenharia, grau de entrada/saída entre grupos e nós | DOM | automated |
| INFRA-MAP-03 | Larguras desktop e celular, tema claro/escuro | Navegar e aplicar zoom | Sem overflow horizontal da página, nós e detalhes legíveis | screenshot | manual |

## Handoff de Planejamento

| Item | Destino | Status |
| --- | --- | --- |
| Atualização do spec | `docs/product-capability-map.md` | complete |
| Catálogo de casos | Accepted Cases deste documento | complete |
| Matriz de cobertura | Accepted Cases deste documento | complete |
| Backlog de decisões | Nenhum | complete |
| Handoff de E2E | Testes unitários de layout/dados de dev-docs + smoke de navegador | ready |