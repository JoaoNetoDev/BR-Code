# Mapa de Relações de Capacidades de Produto do ZCode

## Objetivo

Este documento define o critério de manutenção do mapa de capacidades de produto do ZCode. O mapa de relações não é um mapa de diretórios de código nem um organograma; ele existe para responder:

1. Se a capacidade de produto roda principalmente no Renderer, no Host ou no ZCode CLI, ou pertence à infraestrutura de engenharia fora do runtime de produto;
2. De quais grupos de capacidades cada área de nível superior é composta;
3. Quais nós de capacidade, mantíveis de forma independente, cada grupo contém;
4. Por qual semântica os diferentes nós geram dependências;
5. Quais owners de capacidade precisam ser convidados para a revisão conjunta quando houver mudanças entre times.

O mapa de relações interativo é mantido por `apps/dev-docs`. Depois de rodar `pnpm dev:docs`, acesse
`http://localhost:5186/?view=capabilities`.

![Prévia do mapa de relações de capacidades de produto do ZCode](./product-capability-map-preview.png)

## Modelo do grafo

```text
Top-level Area
  └─ Capability Group
       ├─ Capability Node
       ├─ Capability Node
       └─ Capability Node

Capability Node ── semantic relationship ──> Capability Node
```

- **Área de nível superior (Top-level Area)**: as três primeiras áreas são divididas em Renderer, Host e ZCode CLI conforme o despliegue real e os limites de estado; a quarta área é a infraestrutura de engenharia fora do runtime de produto.
- **Grupo de capacidades (Group)**: um conjunto de capacidades dentro de uma área de nível superior adequado para atribuição a um time principal de manutenção ou a um responsável, por exemplo Agent Core, Entitlements de conta, build e release, automação de testes.
- **Nó de capacidade (Node)**: uma unidade mantível que possui semântica de produto, estado autoritativo ou efeito de commit próprios.
- **Relação (Edge)**: registra apenas dependências com semântica de produto clara; não desenha toda referência de código estática como relação de produto.

## Regras de nomenclatura

- Grupos de capacidades, nós e owners usam uniformemente "português (English)"; o português é o texto principal de identificação, e os nomes em inglês existentes são mantidos entre parênteses.
- Abreviações de produto como MCP, OAuth, CLI, UI, CDP, CUA e ARMS não são obrigatoriamente traduzidas, mas ainda devem ser acompanhadas da semântica em português.
- Os nomes no mapa descrevem capacidades de produto e não copiam diretamente nomes de diretório, de classe ou de camadas de compatibilidade históricas.

## Algoritmo de layout

O mapa de relações é renderizado com React Flow e usa um layout determinístico em duas fases, com "grupos de capacidades primeiro". Referências de nível de nó entre grupos afetam apenas a ordem adjacente dos grupos, sem mais arrastar todo o grupo para Layers diferentes:

```text
群内节点 + 群内关系 ──> 每个能力群独立 ELK Layered
                              |
                              +──> 紧凑节点位置 + 群内正交路由

同层跨群节点关系 ──> 聚合为带权群关系图 ──> 关系度优先遍历
                                           |
                                           v
                                 ELK Rectangle Packing
                                           |
                                           v
Renderer -> Host -> ZCode CLI 固定层顺序
                  +
Engineering Infrastructure 位于三层下方
                  +
React Flow 跨群连线
```

- Áreas de nível superior e grupos de capacidades usam React Flow parent node; o grupo de capacidades fica dentro de uma única área de nível superior, e os nós de capacidade ficam dentro de um único grupo principal.
- Cada grupo de capacidades usa ELK Layered de forma independente para calcular as posições dos nós e os bend points ortogonais internos; as relações internas do grupo ainda participam da ordenação e do desvio.
- As relações entre nós de grupos distintos dentro da mesma área de nível superior são agregadas por grupo de capacidades de origem/destino em relações de adjacência não dirigidas e ponderadas; o grau de relação e o peso das arestas servem como ordem de travessia estável, para que grupos fortemente associados fiquem adjacentes primeiro, sem permitir que uma única aresta longa entre grupos aumente demais a hierarquia entre eles.
- Os grupos de capacidades usam ELK Rectangle Packing para empacotamento compacto; Renderer, Host e ZCode CLI mantêm a ordem de camadas de execução fixa da esquerda para a direita, e a infraestrutura de engenharia fica centralizada como área independente abaixo das três camadas.
- O layout usa semente aleatória estável, ordem de definição como tie-breaker e entrada determinística, garantindo o mesmo layout para os mesmos dados e facilitando revisão e comparação de capturas.
- O layout adota um profile de espaçamento compacto: comprime as margens externas das áreas de nível superior, o espaçamento entre grupos, o espaçamento entre nós do grupo e a largura dos cards de nó; o texto continua usando os níveis `text-ui-*` originais, sem ganhar densidade em-exchange de fonte menor.
- Títulos de áreas de nível superior, títulos de grupos de capacidades e a posição inicial dos seus filhos usam o mesmo conjunto de constantes geométricas; os filhos precisam ficar abaixo da linha divisória do título e manter pelo menos 12px de espaçamento no canvas, e títulos bilíngues, owners e badges de escala não podem invadir a área dos filhos.
- As relações entre grupos são desenhadas pelo React Flow conforme as posições reais dos nós; por padrão ficam atenuadas, e ao selecionar um nó ou grupo as relações e etiquetas relacionadas são destacadas, evitando que as linhas completas entre grupos sobreponham a hierarquia dos grupos.
- O React Flow cuida do viewport, da seleção, da acessibilidade por teclado e da renderização apenas dos elementos visíveis; o ELK cuida somente do layout e não possui estado de interação.

## Limites de implementação

- Os dados autoritativos de grupos de capacidades, nós e relações estão em
  `apps/dev-docs/src/data/productCapabilityMap.ts` e não podem mais ser embutidos em HTML estático.
- A página interativa está em `apps/dev-docs/src/capability-map/`, carregando React Flow e ELK sob demanda por dynamic import para não afetar a primeira tela dos documentos de stdio e de protocolo.
- `docs/product-capability-map-preview.png` é uma prévia para documentação, não uma fonte de dados autoritativa nem a implementação interativa.

## Codificação visual

- Áreas de nível superior, grupos de capacidades e nós usam cores neutras de forma uniforme; a relação de pertencimento é expressa apenas por contenção espacial e por títulos.
- Cores são usadas apenas nas linhas, nunca na classificação de grupos ou nós, evitando que a mesma cor expresse duas semânticas ao mesmo tempo.
- As linhas usam simultaneamente cor, estilo tracejado/contínuo e rótulo de texto; não é possível identificar a relação apenas pela cor.
- A ordem de camadas é fixa como "fundo do grupo → linhas semânticas → títulos de grupo e nós → rótulos das linhas"; os rótulos das linhas são a camada semântica mais alta e precisam ficar totalmente sobrepostos aos nós e às linhas, sem recorte nem oclusão pelos nós.
- Na visão geral, linhas dentro do mesmo grupo são mais chamativas que as linhas entre grupos; ao selecionar um grupo, as relações de primeira ordem são destacadas e os rótulos densos são ocultados; ao selecionar um nó, apenas os rótulos das relações de primeira ordem daquele nó são exibidos.
- Selecionar um grupo de capacidades ou um nó apenas atualiza o destaque e os detalhes, sem alterar o zoom e a posição do viewport atual.
- O mapa de capacidades não registra divisão de trabalho entre pessoas nem oferece seleção de pessoas ou destaque de responsabilidades; o owner de um grupo de capacidades apenas descreve o papel de manutenção sugerido.
- A roda do canvas serve para ampliar ou reduzir com centro na posição do ponteiro; a movimentação do canvas usa arrasto com o ponteiro, não a roda.
- Clicar em uma área vazia do canvas equivale a clicar em "Redefinir": limpa busca e seleção, restaura todos os filtros de relação e ajusta à visão geral completa.

## Estimativa de volume de código

Os grupos de capacidades podem carregar o "volume de código de produção sob responsabilidade principal (Estimated Production LOC)" e a confiança da estimativa, para ajudar a julgar o ônus de manutenção, sem substituir a análise de impacto de dependências:

- Grupos de runtime de produto são estimados pelas linhas físicas não vazias de arquivos TypeScript/JavaScript rastreados, incluindo comentários e excluindo docs, dist, node_modules, generated, fixtures e dados de locale.
- Grupos de infraestrutura de engenharia contam o código-fonte de engenharia sob sua responsabilidade principal: além de TypeScript/JavaScript, podem incluir CI YAML, Shell, PowerShell e configuração de build; harness de E2E compartilhado, runner e reporter entram como infraestrutura, e cases de E2E de funcionalidades de produto específicas não são atribuídos em duplicidade à plataforma de testes.
- O LOC de grupos em incubação conta apenas o código de produto já entregue; nós planejados podem não ter implementação, e não se pode inflar o tamanho do grupo com estimativas de código futuro.
- Cada arquivo pertence a um único grupo principal; infraestrutura compartilhada entre grupos, Workflows, protocolos genéricos, ferramentas de desenvolvimento e código sem owner estável não são forçados a nenhuma atribuição.
- O título do grupo usa um badge neutro e compacto com `≈23.6k LOC`; ao selecionar o grupo, o painel de detalhes mostra a contagem completa estimada e a confiança.
- O LOC é apenas metadado e não participa da ordenação ELK, do tamanho de área dos grupos, do tamanho de área dos nós nem do roteamento das linhas, evitando que grupos grandes engulam grupos pequenos no escalonamento linear.
- O volume de código é um snapshot de auditoria manual, não uma métrica em tempo real de build. Depois de mudanças em fronteiras de capacidade, atribuição de diretórios ou refatorações de grande porte, é preciso reauditar e atualizar os dados autoritativos.
- O código de teste pode ser contabilizado separadamente em auditorias específicas; como os testes end-to-end frequentemente cobrem vários grupos, este mapa por padrão não escreve a contagem de linhas de teste no título do grupo.

## Métricas de complexidade dos grupos de capacidades

O título do grupo de capacidades exibe simultaneamente as três dimensões `LOC · 入 · 出`, para distinguir o tamanho do código, o grau de dependência recebida e o grau de dependência externa:

- `LOC` segue a estimativa de volume de código de produção sob responsabilidade principal.
- `Grau de entrada (In-degree)` é a quantidade de arestas de capacidade dirigidas cujo nó de destino pertence ao grupo atual e cujo nó de origem pertence a outro grupo.
- `Grau de saída (Out-degree)` é a quantidade de arestas de capacidade dirigidas cujo nó de origem pertence ao grupo atual e cujo nó de destino pertence a outro grupo.
- Múltiplas relações de nível de nó entre o mesmo par de grupos de capacidades são contadas separadamente; relações internas ao grupo não entram no grau de entrada nem no grau de saída do grupo.
- Graus de entrada e saída são sempre calculados sobre o grafo de relações autoritativo completo e não mudam conforme interruptores de tipo de relação ou o filtro "somente relações entre grupos", evitando que a métrica derive conforme o estado de navegação.
- As três métricas são exibidas de forma independente e não são combinadas em um único score. O LOC representa a escala de manutenção; o grau de entrada se aproxima mais da superfície de dependência e impacto de mudança; o grau de saída se aproxima mais do ônus de integração. Como as três têm dimensões diferentes, somá-las diretamente criaria uma precisão sem embasamento.
- Após selecionar um grupo de capacidades, o painel de detalhes deve explicar separadamente o LOC completo, o grau de entrada e o grau de saída; o badge do título oferece apenas uma visão compacta.

## Tipos de linha

| Tipo        | Significado                                                          | Exemplo                                                                    |
| ----------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `state`     | Projeção de estado, fato autoritativo ou relação de persistência      | ProductProjection projeta na Conversation UI                                |
| `runtime`   | Disparo de execução, chamada ou hosting de runtime                   | Automation Scheduler dispara Agent Turn Runtime                              |
| `shared`    | Candidatos, componentes, configurações ou recursos de extensão compartilhados | Provider Registry fornece candidatos ao Model Selector        |
| `delivery`  | Entrega entre processos, entre dispositivos ou caminho de recuperação | Mobile Replayable entra no mesmo Host via Shared Host Attachment             |
| `invariant` | Fronteiras que devem permanecer isoladas, sem violação de permissão ou sem compartilhamento | O Task Index não pode ser a fonte autoritativa do corpo da sessão |

## Três camadas de execução e infraestrutura de engenharia

```text
Renderer（Desktop / Web / Mobile）
  Composer / Settings / Timeline / Charts / Workbench UI
                         |
                         | intent、query、projection subscription
                         v
Host（Local / SSH / WSL / Docker / Shared Host）
  platform services / process supervision / routing / attachment
                         |
                         | ZCode Protocol / service RPC
                         v
ZCode CLI
  AgentRuntime / CommandInbox / ProductProjection /
  session event journal / usage SQLite
```

| Camada de execução        | Estado ou efeitos que possui                                                                            | O que explicitamente não possui                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Camada de renderização (Renderer) | Rascunhos de entrada, estado de seleção, escopo de filtro, range dos gráficos, cache de projeção da UI | Estado de execução do Agent, corpo da sessão, fila do CLI, fatos de usage |
| Camada de host (Host)     | Serviços de nível de janela, Credential, conexões remotas, supervisão de processos, roteamento de anexos, IO de plataforma, requisições de entitlements remotas, envio de Telemetry/ARMS | Corpo da conversation, agent turn, estado de negócio replayable do celular |
| Camada de execução do agente (ZCode CLI) | Agent/Turn, CommandInbox, ProductProjection, session event, execução de modelo/ferramentas, recuperação de sessão, fatos autoritativos de usage SQLite | Rascunhos do Renderer, layout de janela, estado de plataforma do Electron |

- O Desktop Renderer, o futuro Web App e o Mobile Renderer reutilizam a semântica de produto, mas se conectam ao Host por attachments diferentes.
- SSH, WSL, Docker e janelas locais são todos são sets pela a conexão de nível de workspace pelo Host; um workspace remoto precisa atravessar `workspaceIdentity` e `remoteSessionId`.
- Host e relay apenas roteiam e entregam, sem copiar a autoridade de conversation, queue, snapshot ou usage do CLI.
- O `desktop-continuous` da área de trabalho e o `web-remote-replayable` do celular são capacidades de entrega do Host; ambos consomem o mesmo ProductProjection do CLI, mas a semântica de recuperação não pode se espalhar de um para o outro.
- O mapa de capacidades exibe `desktop-continuous` como "comunicação contínua de desktop (Desktop Continuous)"; aqui `continuous` se refere ao profile completo de comunicação direta em tempo real, e não a "entrega contínua", nem inclui a semântica de recuperação gap/snapshot do replayable do celular.

A infraestrutura de engenharia não pertence às três camadas acima e não participa da cadeia de requisições em produção:

```text
Renderer  ->  Host  ->  ZCode CLI
    \           |          /
     \          |         /
      +---------+--------+
                |
                | 构建、验证、度量、发布
                v
Engineering Infrastructure
  Build & Release Engineering
  Test Automation Platform
  Quality Intelligence & Engineering Governance
```

- A infraestrutura de engenharia pode construir, verificar, observar e publicar as três camadas, mas não pode se tornar uma dependência de runtime em produção do Renderer, do Host ou do CLI.
- O "ciclo de vida de atualização do cliente" do Host cobre apenas verificação do cliente, download, instalação e apresentação da conclusão da atualização; empacotamento por CI, assinatura, notarização, upload de artefatos, aquecimento de CDN e publicação canary/stable pertencem a "Engenharia de Build e Release".
- A plataforma de testes possui o harness compartilhado, o runner, capture/replay, o contrato de fixtures, a execução multiplataforma e as ferramentas de promoção; as asserções de produto dos cases de funcionalidades específicas continuam sendo mantidas conjuntamente pelo grupo de capacidades correspondente.
- Os dados de qualidade registram apenas resultados de teste, cobertura, artefatos de falha, duração, tendências e orçamento de engenharia; não podem ser misturados com `/report`, ARMS/RUM, Conversation telemetry ou App Usage local.

## Grupos de capacidades

| Área de nível superior | Grupo de capacidades                                                        | Limite de manutenção                                                                                   |
| --------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Renderer  | Experiência de Conversation e Task（Conversation & Task Experience）        | Composer, Projection Store, Timeline, ações de sessão, navegação de tarefas, experiência de anexos        |
| Renderer  | Experiência de Modelo e Conta（Model & Account Experience）                 | Provider Settings, Model Selector, estado/compra de plano, interface de uso de plano                     |
| Renderer  | Experiência de Extensões（Extension Experience）                            | Configurações de extensões como Plugin/Skill/MCP, mercado e entradas de importação                       |
| Renderer  | Experiência de Browser e Workbench（Browser & Workbench Experience）       | Interfaces de produto de Browser, File, Terminal, Git/Diff                                               |
| Renderer  | Incubação de Office Suite e Computer Use（Office Suite & Computer Use Incubation） | Roadmap de preview/edição de PDF/Office, experiência de tarefas de Computer Use, takeover manual e confirmação de segurança |
| Renderer  | Experiência de Automação（Automation Experience）                           | Interface de configuração/histórico de automação agendada, tarefas ociosas e Bots                        |
| Renderer  | Plataforma de UI（UI Platform）                                            | Design system, tema, internacionalização, responsividade, Settings/Onboarding                           |
| Renderer  | Experiência de Insights e Feedback（Insights & Feedback Experience）        | Gráficos de App Usage, entrada de Feedback, exibição do Resource Manager                                |
| Host      | Conta e Entitlements（Account & Entitlements）                            | OAuth/Credential, Plan Identity, Start/Coding/Team Plan, pagamento, quota/monitor remoto                 |
| Host      | Gestão e Sincronização de Extensões（Extension Management & Sync）          | Instalação e atualização de Plugins, contribuição de recursos, sincronização local/remota                |
| Host      | Plataforma de Browser e Computer Use（Browser & Computer Use Platform）    | BrowserView/WebContentsView, backend CDP, ciclo de vida do Computer Use Helper, broker confiável, observação do sistema e execução de entrada |
| Host      | Workspace e Delivery（Workspace & Delivery）                              | workspace identity, Local/Remote Host, controle remoto do celular, continuous/replayable               |
| Host      | Serviços de Workbench（Workbench Services）                                | Serviços de File/Terminal/Git                                                                           |
| Host      | Runtime de Automação e Canais（Automation & Channel Runtime）              | scheduler, automation record, off-peak, Bots, canais de terceiros                                       |
| Host      | Plataforma do Cliente（Client Platform）                                   | Ciclo de vida do Electron, atualização do cliente, ticket de Feedback e pacote de diagnóstico             |
| Host      | Dados e Observabilidade（Data & Observability）                            | Bridge de App Usage, instrumentação de produto, Conversation telemetry, ARMS, performance e confiabilidade, logs e monitoramento de processos |
| ZCode CLI | Núcleo do Agente（Agent Core）                                             | montagem de runtime, máquina de estados de turn, contexto, memory, compact, stream recovery, goal/target, fechamento de falhas |
| ZCode CLI | Runtime de Conversation（Conversation Runtime）                             | session lifecycle, input admission, CLI queue, event journal, ProductProjection, fork/rewind             |
| ZCode CLI | Capacidades de Modelo（Model Capabilities）                                | provider runtime, capacidades de catálogo, orçamento de tokens, multimodalidade, raciocínio e capacidades de ferramentas |
| ZCode CLI | Runtime e Segurança de Ferramentas（Tool Runtime & Safety）                 | ferramentas internas, agendamento, permissões, políticas de modo, artefatos de ferramentas              |
| ZCode CLI | Multiagente（Multi-Agent）                                                 | Subagent profile, child runtime, coordenação interativa e tarefas em segundo plano                       |
| ZCode CLI | Runtime de Extensões（Extension Runtime）                                  | MCP, Skill, Hooks, Commands, Memory resources                                                            |
| ZCode CLI | Runtime de Browser（Browser Runtime）                                      | Browser Use Plugin, Node REPL/Playwright, backend headless                                                |
| ZCode CLI | Observabilidade de Uso（Usage Observability）                              | fatos de usage de model/turn/tool, retenção de 30 dias no SQLite e agregação SQL de App Usage            |
| Infraestrutura | Engenharia de Build e Release（Build & Release Engineering）        | pipeline do GitLab, builds multiplataforma, empacotamento e assinatura, notarização, artefatos, CDN, publicação canary/stable |
| Infraestrutura | Plataforma de Automação de Testes（Test Automation Platform）     | harness de E2E de Desktop/CLI, capture/replay, execução multiplataforma, injeção de falhas, admissão e promoção de cases |
| Infraestrutura | Qualidade e Governança de Engenharia（Quality Intelligence & Engineering Governance） | Relatórios de E2E, cobertura, tendências de qualidade, portões estáticos, performance de engenharia e artefatos de falha |

## Limites de plano, App Usage e observabilidade

```text
Renderer
  套餐状态/购买 UI ─────────────> Host Subscription & Billing
  套餐用量 UI <────────────────── Host Plan Quota & Monitor <── Coding / Team Plan backend
  Start Plan UI <──────────────── Host Start Plan balance       （不走 monitor）

  App Usage Dashboard
          ^
          | snapshot
Host      |
  App Usage Protocol Bridge       Product Telemetry / ARMS / Logs
          ^                                  |
          | usage/stats                      `--> 外部数据与诊断后端
ZCode CLI |
  App Usage SQL Aggregation
          ^
          |
  model_usage / turn_usage / tool_usage SQLite（30 天）
          ^
          |
  Model / Turn / Tool lifecycle facts
```

- Personal Coding Plan, Team Plan e Start Plan são três identidades de entitlement diferentes e precisam ser separadas em nós independentes.
- O Start Plan usa o OAuth zcode JWT com balance/daily quota; ele não usa a API de monitor do Coding Plan.
- O Team Plan usa isolamento por organization/project/project-key e não pode degenerar em um rótulo de exibição do Coding Plan pessoal.
- Plan Quota & Monitor são dados de planos comerciais remotos; em caso de falha não se pode recorrer ao App Usage.
- App Usage são estatísticas locais de uso do produto. A fonte autoritativa são as tabelas `model_usage`, `turn_usage` e `tool_usage`, de semântica independente, no `~/.zcode/cli/db/db.sqlite` padrão do ZCode CLI, disponibilizadas ao Host e ao Renderer pelo protocolo `usage/stats`; não é um livro-razão de faturamento.
- A instrumentação de produto `/report`, ARMS/RUM, Conversation telemetry, a infraestrutura de logs e o App Usage são canais distintos, e não podem mais ser fundidos em um único nó `telemetry` ou `usage-quota`.

## Limites entre Núcleo do Agente e Runtime de Conversation

O Núcleo do Agente não é mais comprimido em quatro nós: Turn, Context, Compact e Session. Dentro do ZCode CLI é preciso distinguir ao menos:

```text
Agent Core
  Runtime Bootstrap
  Turn Orchestration
  Context Assembly
  Memory Recall & Write
  Context Compaction
  Model Step / Streaming Recovery
  Goal / Target Continuation
  Runtime Fault Recovery

Conversation Runtime
  Session Lifecycle & Resume
  Input Admission / Queue / Steering
  Command ACK / Dedupe / Recovery
  Session Event Journal
  ProductProjection
  Branch / Retry / Rewind
  Session Store
```

- O Agent Core é responsável por como uma rodada de trabalho é executada; o Conversation Runtime é responsável por como o estado de produto de múltiplas rodadas é admitido, persistido, projetado e recuperado.
- Model Capabilities fornece o catálogo de modelos, limits, modalities e provider options; a ordem de streaming, o backpressure e o fechamento de durable events da etapa de modelo pertencem ao Agent Core.
- Tool Runtime possui registry/scheduler/executor/permission; o Agent Core apenas consome os resultados do ciclo de vida das ferramentas para continuar o turn.
- Extension Runtime possui a descoberta e o carregamento de MCP/Skills/Hooks/Memory resources; o Agent Core possui como eles entram no contexto e no turn.
- Multi-Agent possui o child runtime e o broker; cada child ainda reutiliza o Agent Core internamente, mas eventos brutos de child não podem contaminar diretamente a projeção da sessão pai.

## Limites das capacidades de modelo

As capacidades de modelo são uma capacidade central independente, não pertencem ao núcleo do agente e não são fundidas com os entitlements de conta. Elas fornecem fatos de modelo simultaneamente ao runtime e a várias entradas de produto:

```text
模型供应商注册表（Provider Registry）
               |
               v
模型目录与能力元数据（Model Catalog & Capabilities）
        |              |                 |
        |              |                 +--> 推理与工具能力（Reasoning & Tool Capabilities）
        |              +--------------------> 多模态能力（Multimodal Capabilities）
        +-----------------------------------> 上下文与输出预算（Context & Output Limits）
               |
               v
模型选择器（Model Selector）
        |
        +--> 发送消息 / 当前会话（Composer / Conversation）
        +--> 子智能体配置（Subagent Profiles）
        +--> 定时自动化（Scheduled Automation）
        +--> 闲时任务、机器人（Off-Peak / Bots）

上下文与输出预算 ──> 模型运行时（Model Runtime）
        |
        +────────────> 上下文压缩与记忆（Compact & Memory）
```

- O catálogo de modelos possui fatos de capacidade como `contextWindow`, `maxOutputTokens`, modalidades de entrada e saída, reasoning, tool call e structured output.
- `contextWindow - maxOutputTokens` determina em conjunto o orçamento de entrada e o limiar de compact; o limite de saída do modelo também entra na requisição do provider adapter.
- O schema do catálogo pode descrever as modalidades text, image, video, audio e PDF; a cadeia de requisições do Agent já faz capability gating de image, video e PDF, e audio ainda não é uma cadeia de entrada entregue. O mapa de capacidades registra as duas camadas de fronteira "declaração do catálogo de modelos" e "capacidade efetiva no wire model/provider", sem escrever a declaração do catálogo como se fosse suporte a runtime de áudio já plenamente entregue.
- O seletor de modelos pode reutilizar a construção de candidatos e os componentes de UI, mas o rascunho e o estado de submissão de cada entrada precisam ficar isolados: a seleção da sessão escreve no runtime/projection atual, a automação escreve no automation record e o Subagent escreve no profile/override.
- OAuth, Credential, Coding Plan, Usage e Quota afetam a disponibilidade e a cota do provider, mas são mantidos independentemente por "Conta e Entitlements (Account & Entitlements)", conectados às capacidades de modelo por arestas de relação e sem compartilhar estado autoritativo com o catálogo de modelos ou o runtime de modelo.

## Limites de incubação de Office e Computer Use

Office e Computer Use são domínios de produto que cruzam camadas, mas não adicionam uma quarta camada de execução de produto. O Renderer possui preview, edição, trilha de operações e experiência de takeover; o Host possui os serviços de arquivo/conversão e o principal de permissões CUA em nível de sistema; o ZCode CLI executa a intenção do Agente por meio de Document Skills e Computer Use MCP.

```text
Renderer
  Office Preview / Editor（PDF、DOCX/DOC、XLSX read-only current；native editing/PPTX preview planned）
  Computer Use Task / Takeover UX（permission entry current；control UX planned）
                    |
                    | intent / projection / workspace-scoped IO
                    v
Host
  File Service + Office Document Service（planned）
  Computer Use Helper Lifecycle + Trust Broker + Surface/Input Backend（macOS beta）
                    ^
                    | ZCode Protocol / per-server MCP broker credentials
                    |
ZCode CLI
  Document Skills（DOCX/PDF/PPTX/XLSX current）
  Computer Use MCP Integration（current beta）
```

- A base de produto atual de Office é o Preview Pane somente-leitura de PDF, DOCX/DOC e XLSX e as Document Skills oficiais de DOCX/PDF/PPTX/XLSX; isso não equivale a já ter um editor nativo de Office, comentários/revisões ou preview nativo de PPTX.
- A análise, conversão, gravação e o tratamento de conflito de versão da futura UI nativa de Office permanecem primeiro dentro do limite dos Workbench Services do Host; o Renderer não referencia diretamente implementações em Node, LibreOffice ou caminhos locais.
- O Computer Use atual é uma beta interna desktop-local para macOS/Windows, com opt-in explícito e kill switch; em caso de falha na validação de assinatura do Helper, verificação de peer/token, permissões ou execução de entrada, é preciso falhar fechado.
- O Web do celular só pode reutilizar o Local Host já existente na área de trabalho via attachment de shared host; SSH/WSL/Docker ou mobile remote Host não podem iniciar outro Computer Use Helper local.
- O mapa de capacidades usa o scope do nó para distinguir "Current (atual)", "Incubating (em incubação)" e "Planned (planejado)"; o LOC e a complexidade de nível de grupo refletem apenas o código atual e as arestas semânticas já confirmadas.

## Complemento de fatos de capacidadescurrent de 2026-08

Esta atualização incorpora ao mapa as capacidades de granularidade fina entregues recentemente; elas continuam seguindo a fronteira de estado autoritativo Renderer → Host/transport → runtime do CLI.

| Capacidade                        | Fato atual                                                                                                                                    | Fronteira no mapa                                                                                        |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Preview de arquivos Office        | O Preview Pane já suporta PDF, DOCX/DOC e XLSX (somente leitura, bytes obtidos do serviço de arquivos do workspace); edição nativa, gravação, comentários e revisões ainda são planejadas | O preview se conecta ao `file-service`; o futuro Office Document Service apenas a rota de edição nativa/conversão |
| Entrada de vídeo e mídia enviada   | O Composer pode anexar image/video, e a capacidade do modelo junto com o wire do provider decidem se é possível enviar; a mídia enviada é exibida em galeria ordenada/preview de vídeo, e a entrada de áudio ainda não foi entregue | O preview de mídia consome apenas preview local/remoto seguro, sem gravar rascunho de anexo nem estado de mídia no relay |
| Resumo de Hooks desta rodada      | Apenas execuções de Hook reais e visíveis ao cliente exibem resumo em Anchor/Popover, com conteúdo de origem, status, duração e outros fatos seguros | Projetado de ProductProjection para desktop-continuous e web-remote-replayable, sem expor detalhes sensíveis como comandos/caminhos |
| Configurações de MCP e Server MCP oficial | A página de Settings exibe diagnósticos localizados de initialize/tools/list e atribui por `pluginId`; o Server MCP oficial trata auth/quota/unavailable separadamente e não pode tratar capacidade anunciante como entitlement | Os diagnósticos pertencem à projeção de Settings do Renderer; credenciais, cota e estado de requisição continuam mantidos pelo Host/Conta e Entitlements |
| Ciclo de vida de tabs do Browser   | O Embedded Browser tem limite rígido de 32 tabs e ciclo de vida intra-processo; `open` reutiliza por padrão a tab do mesmo site pertencente ao agent, e só cria uma nova quando não há candidata; a semântica de `tabs.new` não muda | Reuso e limite são fatos do runtime de Browser + host, sem nova limpeza ao fim da task nem persistência entre processos |
| Entrada rápida `/plan`            | `/plan` vazio só alterna o Plan Mode; com texto de task, alterna via compare-and-set e submete; o cenário com anexos rejeita o shortcut | É uma intenção de UI de Composer/Commands, sem novos campos de protocolo, eventos persistidos ou uma segunda fila de entrada |

## Fronteiras de estado autoritativo

```text
UI intent
   |
   v
Host service / transport
   |
   v
workspace CLI command inbox
   |
   v
Agent runtime + ProductProjection
   |
   +---- desktop-continuous ------> Desktop UI
   |
   `---- web-remote-replayable ---> Mobile UI
```

- O runtime do CLI / ProductProjection é a fonte autoritativa do corpo da conversation e do estado de execução.
- O índice SQLite de Task possui apenas metadados da lista de tarefas, não o corpo da session.
- O Main do Desktop e o relay externo apenas fazem agendamento, pareamento e repasse de dados, sem possuir estado de negócio de task/session/queue/snapshot.
- `workspaceIdentity?.trim() || workspacePath` é usado para isolamento de identidade; `workspacePath` é usado para execução de arquivos e comandos.
- UI, nomes de campo ou origem de opções compartilhados não representam estado de rascunho compartilhado nem efeitos de commit compartilhados.

## Manutenção

Ao adicionar ou modificar um nó de capacidade:

1. Confirme primeiro a semântica para o usuário, o estado autoritativo e o ponto de commit do nó;
2. Julgue primeiro se a capacidade pertence ao runtime Renderer / Host / ZCode CLI ou apenas à infraestrutura de engenharia que constrói, verifica, mede e publica o produto, e só então a coloque no único grupo principal;
3. Adicione apenas relações entre nós com semântica explícita;
4. Se for apenas uma dependência de teste ou uma relação de alcançabilidade estática, não entre no mapa de produto;
5. Ao envolver desktop/mobile e local/remote, deixe explícitas as fronteiras de `clientMode`, `deliveryKind` e workspace identity;
6. Atualize em sincronia os dados de grupos, nós e relações em `apps/dev-docs/src/data/productCapabilityMap.ts`.