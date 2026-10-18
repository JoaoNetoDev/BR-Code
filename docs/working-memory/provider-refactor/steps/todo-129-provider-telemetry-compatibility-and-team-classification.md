# Todo129: Adaptação da telemetria de Provider e correção da classificação do plano Team

> Status: **implementação local, verificação direcionada e review concluídos; aceitação real em Electron/mobile ainda pendente para a execução do lote completo**. Concluído após a autorização do Goal de 2026-09-11: classificação de Team, rótulos BigModel e restauração dos IDs de estatística antigos na construção de eventos. Relatórios, identidades reais e dados históricos não foram alterados. Os itens "pendentes" do planejamento original foram atualizados pelo registro de execução abaixo e isso não representa aceitação real já concluída.
>
> O usuário confirmou: o reconhecimento de plano desta rodada para o Coding Plan unifica Individual e Team; de quebra corrigir o bloqueio indevido de Team na entrada de off-peak da home. Além disso, as mudanças ficam limitadas à adaptação de telemetria, sem tocar no núcleo de Provider nem na persistência.

> Requisito mais recente: implementar diretamente os mapeamentos que puderem ser determinados pelo código antigo e pelos fatos já existentes; alinhar ao máximo os valores que cada evento realmente emitia, sem manter avoidabledescontinuidade de relatórios só para deixar a nova identidade mais bonita. Os poucos itens que não puderem ser revertidos com segurança mantêm o ID real, com a diferença e o motivo registrados; não se forja identidade de organização/projeto, não se bloqueia o resto e não se chama a diferença residual de compatibilidade completa.
>
> Relacionado: [Todo128 contrato de start e renovação de elegibilidade de off-peak](./todo-128-provider-start-contract-and-offpeak-eligibility.md). Este Todo corrige "Team não é reconhecido mesmo no estado mais atual"; o Todo128 corrige "estado lido é antigo, refresh e sobrescrita fora de ordem"; os dois não se substituem.

## 1. Contexto, fatos verificados e limite das evidências

### Execução e revisão de 2026-09-11

- Confrontando o staging antigo `790884b1ce`, foram aplicados os dez mapeamentos exatos de ID da §3; Team e individual compartilham o antigo balde do Coding Plan, com base em código antigo de opções de modelo / resolução de conexão; UUID, desconhecidos e IDs já antigos foram preservados. O mapeamento puro é referenciado apenas na camada de construção de eventos da UI, sem refluir para o Registry, para as requisições ou para a persistência.
- T119-01～05: duas empresas Team-only/sem direito, classificação mista Start/null já existente, builder real de evento de sucesso, relatório único de upgrade e bootstrap do WebView compartilhando o contexto congelado; cobertura por testes unitários. Os rótulos BigModel Team/Start já foram completados.
- T119-06～07: novo caso de navegador real de `OffPeakNewTaskEntry` (não um substituto helper), em que duas empresas Team-only conseguem produzir um rascunho e navegar; sem plano/inativo explícito/gray desativado/dismiss continuam bloqueando. O serviço usa fixture controlada e não solicita Ticket real; a proteção de elegibilidade a jusante segue os testes do Todo128.
- T119-08～11: builders de envio/compressão/automação/off-peak e chamadas reais de relatório; Supervisor da V4 com as duas identidades nova e antiga gerando a mesma sequência de fatos, comparando campo a campo step/completion após a troca de modelo (excluindo apenas o step_id aleatório), sem reenvio de estado terminal repetido. Subtarefas em primeiro plano usam uma identidade real independente e a atribuição de tokens não se mistura à do modelo principal; o fact bruto congelado não muda.
- T119-12: isolamento já existente entre Supervisor e attachment, ausência de backfill histórico e testes de escopo remoto incluídos no lote; Electron/mobile/SSH reais ainda aguardam a aceitação final e fixtures de navegador não os substituem.
- Reproduzir falhas primeiro: 15 asserções direcionadas falharam; após a correção o escopo foi ampliado para 229 casos em 11 arquivos. Três valores esperados de off-peak antigos foram atualizados conforme o balde antigo já decidido, sem enfraquecer as contagens de eventos nem as asserções de payload. Evidências em `/tmp/provider129-{red,final-unit,boundary,browser}.log`; a rodada final conjunta está no ledger de execução.
- typecheck da raiz, lint (0 errors / 42 warnings) e architecture (0 violations) passaram. Os casos de navegador da home passaram; os eventos de rede de compra reais do site oficial não foram solicitados e não poluem a produção de relatórios.
- Review: nenhum novo estado de negócio, cache, polling ou campo de relatório; o hostname é lido primeiro pelo Provider real e o mapeamento não afeta as consultas. IDs de negócio/modelo/login reais, configuração Personal, Core, protocolo e migração de dados não foram alterados. Nenhum requisito local esquecido foi encontrado; as limitações reais da ponta remota foram preservadas.

Impacto detalhado e casos: [fronteiras de implementação do Todo129](./todo-129-impact-and-cases.md).

Um colega relatou que o refactor de Provider pode quebrar relatórios: os novos Provider IDs entram em dimensões antigas de eventos e, após a separação de Team, alguns funis e a classificação do evento de sucesso ficam faltando. O usuário pediu investigar conforme o contexto listado pelo colega, sem ampliar para pedir SQL de relatórios nem investigar todo o sistema de monitoramento.

Em 2026-09-11 foi verificado que `origin/staging = 7a01923f58` após o fetch. Os pontos de merge relevantes são `279907140b` e `beb9751d9f`; o tip antigo do branch `a0b07bc685` já é ancestral remoto. A linha de base histórica é o primeiro pai de `279907140b`, sem tratar commits intermediários do refactor como contrato público antigo.

O `HEAD = 6454504b90` local; a checagem de frescor indica 5 commits atrás do remoto, e há localmente outros 7 commits de documentação, então não dá para fazer fast-forward direto. Esta rodada apenas registra o planejamento, sem merge/rebase; a telemetria, a classificação e a implementação de entrada relevantes foram comparadas e local e remoto estão iguais. Na implementação é obrigatório checar e alinhar novamente a linha de base de desenvolvimento; este registro não é permissão para pular a checagem.

### 1.1 Problemas confirmados

| Item                 | Fato atual                                                                                                                                    | Impacto                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Dimensão dos eventos centrais         | `send_btn` usa `custom:<providerId codificado>:<model>`; completion/step no caminho normal de requisição usam `<providerId>/<model>`; `model_provider` usa o ID novo real | Filtrar por IDs antigos fixos perde dados da nova versão, e o agrupamento direto divide em grupos novo e antigo; isso não equivale a o evento não ter sido enviado                                              |
| Estado de plano na entrada de Team    | `resolveCodingPlanEntryPlanStateFromProviderSettings()` procura apenas Individual e depois Start, perdendo as duas Team                                            | Team-only retorna `no_plan`; se houver Start, pode retornar `start_plan`. O helper antigo do Registry já reconhecia a connection key das duas Team |
| Family BigModel Team | `resolveCodingPlanProviderFamily()` não tem o branch Team                                                                                            | `unknown` e channel vazio; o correto seria `bigmodel` / `MaaS`; Z.ai Team funciona normalmente                                            |
| Rótulo do evento de sucesso         | `resolveProviderTelemetryLabel()` não cobre BigModel Team / Start                                                                                  | `add_model_success` carrega o ID bruto; Start já era uma omissão na versão antiga e Team é uma nova superfície exposta                                        |
| Template de off-peak da home         | `OffPeakNewTaskEntry` usa o mesmo helper de estado de plano como critério de clique                                                              | com `codingPlanActive` não explicitamente definido e a view já carregada, Team-only é bloqueado indevidamente na navegação                                         |

### 1.2 Verificação real e limitações

- Foram chamados os helpers reais do repositório: as duas Team-only deram `no_plan`; family/channel de BigModel Team ficou `unknown` / string vazia; o label de BigModel Team/Start ficou como ID bruto.
- BigModel Start + GLM-5.2, no mesmo baseURL: o antigo `send_btn.model_name` era `custom:builtin%3Abigmodel-start-plan:GLM-5.2` e o novo é `custom:account%3Abigmodel-start-plan:GLM-5.2`; `provider_name` é `zcode.z.ai` nos dois.
- 6 arquivos de teste existentes somaram **82 casos aprovados**: codingPlanFunnelTelemetry, messageTelemetry, automationTelemetry, offPeakTelemetry, codingPlanEmbeddedWebview e shared/zcodeNetworkDebugStatus. Os resultados que já passavam não cobriam estas omissões e não são aceitação da correção.
- O bootstrap do WebView realmente carrega o contexto de funil errado; o protocolo do site oficial prevê quatro eventos de compra usando esse contexto. Esta rodada não capturou o relatório real de compra do site e não pode ser escrita como se os quatro eventosem produção fossem comprovadamente errados.
- `entry_plan_status` e o `plan_status / plan_product_id` dos eventos centrais são duas fontes; este último já consulta o Team Provider em `usePlanIdentitySnapshot` e não é refatorado por aqui.
- O hostname depende da disponibilidade do endereço; quando completion/step não têm o fact de início da requisição, podem seguir o seed; não se promete que todos os eventos venham de uma requisição real.
- Nenhum evento de verificação foi enviado para o `/event/report` real, nenhuma conta real foi modificada e nenhuma tarefa foi criada.

## 2. Fronteiras confirmadas e não objetivos

1. Corrigir o reconhecimento de plano das duas Team; para o julgamento "há Coding Plan" desta rodada, Individual e Team pertencem ao Coding Plan. Start continua separado; não se pode tratar todo account Provider ou Off-Peak como Coding Plan.
2. Manter o limiar de fato `access.type === "zhipu-account" && entitled === true`; desligar um modelo/Provider pelo usuário não equivale a cancelar assinatura. Não alterar o cálculo de entitled do Account, o estado das credenciais nem a consulta de plano.
3. Corrigir o bloqueio indevido do template de off-peak da home, mas preservar gray release, entrada desativada, elegibilidade do formulário, conexão atual, credenciais, cota e validação de envio. `codingPlanActive=false` explícito continua bloqueando pelo gate atual; não se contorna o gray por causa de Team.
4. Completar BigModel em family/channel e no label do evento de sucesso; o comportamento das duas empresas é simétrico, os nomes continuam respeitando os valores já existentes em cada evento e não são unificados em um único rótulo.
5. A compatibilidade de IDs só pode agir sobre a saída de telemetria já existente; não alterar retroativamente o Registry, o ModelSelection, os fatos reais de requisição da CLI, a identidade de autenticação, arquivos de configuração, banco de dados, mensagens históricas ou scripts de migração.
6. Não criar novos eventos de telemetria nem reenviar eventos antigos e novos, não adicionar campos de relatório por conta própria e não alterar fórmulas de token, duração, taxa de sucesso, disparo e deduplicação de eventos. Não ampliar para uma reformulação completa do ARMS.
7. **O parser antigo `zcodeTaskNetworkDebugStatusFromPayload` não é incorporado a este Todo.** A adaptação de identidade do nível superior dele é um problema da antiga cadeia de projeção; a telemetria central da V4 atual tem conversão própria. Fica apenas o registro, sem "corrigir de passagem" porgrafia.
8. O start/Registry/refresh de elegibilidade/coordenação de concorrência do Todo128 são executados de forma independente; não se altera o Composer nem se extrai nesta rodada um novo serviço genérico de planos ou outro cache de direitos.
9. Esta rodada é apenas de documentação. Não se pode tomar "escrever um Todo" como autorização para começar a mexer no código de produto.

## 3. Camada 1: plano de compatibilidade de IDs de estatística

### 3.1 fronteira de colocação recomendada

Reutilizar, na **fronteira de construção de campos de cada evento no lado do app**, uma pequena função pura de conversão, com entrada da identidade real do Provider mais os fatos necessários já existentes para aquele evento, e saída do ID de estatística conferido contra a versão antiga. Os fatos reais de requisição/seleção permanecem como estão; a função de conversão não consulta conta nem lê estado global mutável dentro dela. Os arquivos e exports concretos são determinados na implementação conforme o portão de arquitetura e as referências reais; não se transforma a camada global de transporte `/event/report` em um substitutor que adivinha o conteúdo de strings arbitrárias.

```text
真实 ModelSelection / CLI 请求事实
                 |
       事件字段构造边界
                 |
       已裁决的统计 ID 映射（纯函数）
                 |
       保留该事件既有 model_name 编码方式
                 |
             /event/report

映射结果不得回流到 Registry、模型选择、请求、持久化或鉴权
```

O mapeamento precisa mirar a parte de identidade do Provider: primeiro obter o provider/model estruturado e só então codificar por evento; não é permitido substituir por regex `account:` / `builtin:` no `model_name` inteiro, nem alterar `/`, `:` ou porcentagem dentro do ID do modelo. Não adivinhar o Provider por hostname, nome de exibição ou outra conta selecionada pelo usuário.

### 3.2 Tabela de correspondência com a semântica antiga e verificação na implementação

**Adota-se final restauração do valor antigo no lado da telemetria; relatórios, SQL, data warehouse e dados históricos reportados não mudam.** A tabela abaixo é o ponto de partida da conferência e não substitui a evidência da saída real dos eventos da versão antiga. Na implementação usa-se o staging anterior a este refactor como referência, registrando commits e entradas/saídas evento a evento; aplica-se diretamente o que a evidência permitir reconstruir, conferindo em especial Team, e não encolhe o "melhor esforço" para corrigir apenas o plano individual.

| ID real atual                                              | Identidade antiga / saída candidata verificável                                          | Estado                                                                                                  |
| -------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Identidades históricas relacionadas a `zai-api` / `bigmodel-api`                  | `builtin:zai` / `builtin:bigmodel`                               | Restaurar depois de conferir a origem dos eventos e das instâncias antigas; o ID de template não é igual ao ID de instância atual, e não se pode forçar todas as instâncias UUID criadas por template para o balde builtin antigo |
| `account:zai-individual-coding-plan`                     | `builtin:zai-coding-plan`                                        | Restauração candidata do valor estatístico antigo                                                                                      |
| `account:bigmodel-individual-coding-plan`                | `builtin:bigmodel-coding-plan`                                   | Restauração candidata do valor estatístico antigo                                                                                      |
| `account:zai-start-plan` / `account:bigmodel-start-plan` | o `builtin:*-start-plan` correspondente                                      | Restauração candidata do valor estatístico antigo                                                                                      |
| Os dois `account:*-team-coding-plan`                        | a cadeia antiga contém connection key de plano e a identidade antiga do Coding Plan; consultar a saída antiga de cada evento | Priorizar a recuperação da semântica antiga real; se os eventos antigos de fato compartilhavam o balde do Coding Plan, mantê-lo, sem se passar sem base por Individual nem inventar keys antigas       |
| Os dois `account:*-offpeak-idle-plan`                       | valor antigo comum `offpeak-idle-plan`                                     | Restaurar o balde original se os eventos antigos de fato o compartilhavam, sem mudar a semântica antiga de relatório só para separar a nova family                                        |
| Provider customizado / ID desconhecido / já é um ID antigo                    | preservar como está                                                         | Restrição de proteção; não pode ser atribuído a um oficial por nome ou endereço                                                                    |

Restaurar a semântica antiga pode reagrupar identidades estatísticas que a nova versão separou; esse é o objetivo desta transição, e não se exige manter o novo agrupamento. Se Team depender de identidade de conexão nos eventos antigos, só pode ser usado o fato correspondente que aquele evento já possui e em que se confia; não se pode usar outras conexões da UI atual para completar requisições históricas, nem adicionar consulta de identidade sensível, protocolo ou persistência só por estatísticas. Quando realmente não for possível reconstruir, manter como está e listar os itens residuais; só pedir outra decisão quando for necessário mudar a semântica de produto ou ultrapassar o escopo da adaptação local.

Não se exige nenhuma entrega nova para o lado dos relatórios, não se constrói um framework genérico de compatibilidade e não se reenviam eventos antigos e novos. Constrói-se o par evento antigo/novo para provar o grau de compatibilidade; não se pode anunciar que a semântica de relatório já está totalmente restaurada só porque um helper devolveu um ID antigo.

### 3.3 Cada evento mantém a própria semântica de campo

| Evento                                                 | model_provider          | model_name                                             | provider_name / outros                                             |
| ---------------------------------------------------- | ----------------------- | ------------------------------------------------------ | ---------------------------------------------------------------- |
| `send_btn`                                           | usa o ID de estatística conferido na versão antiga | `custom:<ID de estatística codificado>:<model>`                     | mantém o hostname do endereço da UI no momento do envio; não inventa valor quando falta o endereço                    |
| `message_completion` / `agent_step`                  | usa o ID de estatística conferido na versão antiga | requisição normal `<ID de estatística>/<model>`; mantém o fallback existente quando não há fato de requisição | continua vindo da requisição real correspondente; não se usa o ID de estatística corrigido para consultar o Registry          |
| `context_compaction`                                 | idem                    | mantém a regra de prefixo de Provider já existente                             | não adiciona provider_name                                             |
| `automation_create_result` / `automation_run_now_ck` | idem                    | mantém o ID de modelo puro                                          | mantém a regra existente de que só standard-personal, sem template e com API-key usam hostname |
| `off_peak_task_create_result`                        | segue o mapeamento já decidido para a linha de off-peak      | mantém o ID de modelo puro                                          | mantém o provider_name fornecido pelo objeto de resultado                                 |
| `app_login_success`                                  | não se aplica                  | não se aplica                                                 | não altera o `login_provider` do OAuth, continua `z.ai` / `bigmodel`            |

A adaptação de IDs não pode mudar a correlação e a contagem dos eventos: send continua sendo o snapshot da seleção enviada, step/completion continuam sendo atualizados pelos fatos da requisição real; trocar de modelo entre múltiplas requisições ou etapas não pode ser sobrescrito pela primeira seleção da UI. As regras existentes de coleta para múltiplos Workspaces, foreground/background e reconexão não mudam.

## 4. Camada 2: reconhecimento de plano, funil e elegibilidade na home

### 4.1 Reconhecimento de plano

Em `resolveCodingPlanEntryPlanStateFromProviderSettings()`, completar os dois IDs de Team, mantendo o 판단 simples e explícito ou reaproveitando um helper existente de semântica precisa. **Não usar diretamente o helper amplo isCodingPlan que inclui Start**, que classificaria Start por engano como Coding Plan.

```text
ProviderSettingsView 尚未就绪 → unknown（沿用原逻辑）
             |
             v
筛选 zhipu-account 且 entitled=true
             |
存在任一家 Individual 或 Team？ ──是──> coding_plan
             |
             否
             v
存在 Start？ ──是──> start_plan
             |
             否
             v
           no_plan
```

Não se adiciona inferência de nível de plano. Quando o helper original não consegue obter o level real, ele continua vazio; as entradas que já obtêm o level direto do Usage snapshot são preservadas e não podem ser esvaziadas uniformemente por causa da correção de Team. A consulta autoritativa de `entry_plan_list`, o momento de congelamento e o conteúdo não mudam.

### 4.2 family/channel e rótulo de sucesso

- `resolveCodingPlanProviderFamily()`: BigModel Team retorna `bigmodel`, com channel correspondente `MaaS`; Z.ai Team mantém `zai` / `Z_AI`.
- `resolveProviderTelemetryLabel()`: BigModel Individual / Team / Start retornam todos `bigmodel`; os valores correspondentes de Z.ai continuam `z.ai`. IDs desconhecidos mantêm o valor original.
- Não confundir `provider_family=zai`, o rótulo de sucesso `z.ai` e o hostname `api.z.ai` só para unificar a função.
- Verificar nas chamadas reais o cartão de plano nas configurações, a entrada de time, o upgrade no Composer/sidebar e o aviso de elegibilidade de off-peak; a origem do entry state e a purchase audience deles não são exatamente iguais, então se corrigem apenas as atribuições erradas, sem redefinir tudo como uma entrada unificada.
- `coding_plan_upgrade_ck` e o bootstrap do WebView devem vir do mesmo funnelContext, garantindo family/channel/status consistentes; não se regenera o funnel ID nem se alteram campos do site como produto, ciclo ou valor da compra.
- Nos quatro eventos de compra do site oficial, verifica-se apenas o contrato de injeção do app e as evidências de runtime disponíveis, sem ampliar por padrão para mudanças no repositório do site.

### 4.3 Entrada de off-peak na home

`OffPeakNewTaskEntry` continua consumindo o mesmo fato corrigido, sem adicionar no componente um fallback `providerId.includes("team")`.

```text
两家 Team entitled=true + 灰度允许
          |
修正后的套餐识别 coding_plan
          |
点击首页闲时模板 → 正常进入创建页
          |
表单/Host 原有当前连接、凭据、资格、额度检查
          |
仅全部满足才允许创建与执行
```

"Unificar incluindo Team" não significa conceder direito a qualquer conta de equipe, nem significa que ter um Team de outra family permita substituir a conexão atual. Só se corrige o não reconhecimento já confirmado, preservando a autorização precisa posterior.

## 5. Superfície de impacto, fontes de dados e pontos de entrada de código

| Prioridade         | Cenário/entrada                             | Implementação compartilhada e fonte autoritativa                                                                                                                       | Fronteira de mudança desta rodada                                                    |
| -------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| must-inspect   | Envio pelo Composer, completion, step, compactação | `v4/telemetry/conversationPromptTelemetry.ts`, `conversationTelemetrySupervisor.ts`, `lib/messageTelemetry.ts`; snapshot de seleção e CLI live fact | Alterar apenas a identidade estatística da construção de campos, sem mexer no protocolo de fact normalizado nem no ciclo de vida dos eventos |
| must-inspect   | Entradas de upgrade em configurações, sidebar, Composer e off-peak  | `lib/codingPlanFunnelTelemetry.ts`; snapshots de settings/usage já existentes em cada entrada                                                                       | Classificação de Team, family/channel                                       |
| must-inspect   | Painel de compra do site oficial                          | `settings/model-provider-section/codingPlanEmbeddedWebview.ts`; funnelContext já congelado                                                     | Verificar valores injetados, sem criar novo owner de estado do WebView                           |
| must-inspect   | Template de off-peak da home                          | `v4/OffPeakNewTaskEntry.tsx`; gray config + settings view                                                                                | Corrigir o bloqueio indevido de Team, sem mudar as regras de envio                                    |
| must-inspect   | Feedback de sucesso de assinatura de Provider                 | `lib/appTelemetry.ts`, `settings/model-provider-section/oauthActions.ts`                                                                 | Normalização do rótulo de sucesso                                                    |
| should-inspect | Criação/execução imediata de automação e off-peak             | `lib/automationTelemetry.ts`, `lib/offPeakTelemetry.ts`, `settings/AutomationsSection.tsx`; snapshot de envio                                     | Adaptar o campo de provider conforme a decisão, mantendo o nome de modelo puro                          |
| invariant-only | Login, snapshot de plano dos eventos centrais                | `root/useRootOAuthEffects.ts`, `hooks/usePlanIdentitySnapshot.ts`                                                                        | Regressão sem mudanças; não alterar o fluxo de login nem consultar plano em outro lugar                              |
| invariant-only | Requisições reais, reporte do Service, sincronização multiplataforma      | CLI fact producer, `services/src/telemetry/telemetryCore.ts`                                                                             | Requisições usam o ID real, o reporte não ganha IO nem substituição global de strings; não mexer no shared-host   |
| excluded       | Projeção antiga de status de rede                        | shared parser, projeção antiga de Service/UI                                                                                                  | Problema separado, não corrigido nesta rodada                                              |

Os caminhos de UI acima são relativos a `packages/ui/src/`. A posição real da implementação segue o resultado do portão na implementação, sem adicionar dependência entre domínios só por causa da tabela de compatibilidade.

Não há ferramenta de codegraph disponível; a verificação das cadeias de chamada de um ou dois saltos foi feita com rg, histórico do Git e execução real das funções, sem alegar uma varredura de codegraph. Os níveis da superfície de impacto são commit-effect de saída de telemetria e validação da home, sem envolver persistence/recovery. O candidato a complemento do grafo é "o helper de estado do funil também é usado na elegibilidade de off-peak da home"; esta rodada apenas documenta o Todo, sem mudar fatos formais do sistema nem ampliar a governança de arquitetura.

## 6. Ordem de implementação e casos de aceitação

### 6.1 Execução por etapas

1. Checar novamente a linha de base e as referências das chamadas; este Todo serve primeiro como base de design em NL no Working Memory. Depois que a implementação estabilizar, sincronizar a documentação formal de telemetria, sem escrever antes a semântica estatística candidata como fato já vigente.
2. **Primeiro adicionar testes, depois corrigir as omissões de classificação claras**: reconhecimento de plano das duas Team, family/channel de BigModel e rótulo de sucesso; a home é corrigida naturalmente pela função compartilhada. Anexar comentários explicativos em chinês.
3. Rodar o E2E da entrada isolada, verificando a navegação normal de Team e a preservação dos gates de sem direito/gray/envio. Não misturar nestas conclusões de sucesso o problema de snapshot antigo que o Todo128 ainda não corrigiu.
4. Conferir os mapeamentos evento a evento contra a versão antiga conforme a seção 3.2, adicionando primeiro os testes de saída em par e só então implementando a adaptação no lado da telemetria; avançar direto nos itens determináveis e deixar registro de diferença nos poucos irreconstituíveis, sem esperar mudanças do lado dos relatórios.
5. Conferir o payload completo de envio e o bootstrap do WebView, e não apenas os helpers puros; por fim executar architecture, tipos, Lint, testes unitários afetados e o E2E necessário.
6. Preencher os arquivos modificados, os resultados reais, os itens não verificados e a informação de commit. As três correções de classificação concluídas não significam que a subitem de compatibilidade estatística esteja concluída; não encerrar este Todo cedo demais.

### 6.2 Dimensões e cortes

A dimensão principal inclui apenas: family (Z.ai/BigModel), plano (Individual/Team/Start/sem direito), entrada (home/configurações/outros funis/construção de eventos), identidade (antiga/nova/customizada/desconhecida), origem do fato (send seed/requisição real) e ponta (desktop local/workspace remoto/mobile).

- accepted: reconhecimento das duas Team, atribuição, limites de permissão existentes e verificação em par de eventos com recuperação de melhor esforço da semântica antiga no lado da telemetria.
- evidence-pending: os valores antigos exatos por evento da seção 3.2; os resultados de teste são determinados a partir da saída da versão antiga e não preenchidos retroativamente a partir da nova implementação. A direção da recuperação já está confirmada e fatos comuns deixam de ser pendência de decisão do usuário.
- pruned: todas as combinações de OS × tema × plano × evento. Mapeamentos puramente de campo usam testes unitários parametrizados; interações representativas cobrem as entradas existentes de desktop e mobile, sem repetir combinações de tema sem mudança de layout.
- excluded: parser antigo, correções de timing do Todo128, implementação do site em segundo plano, backfill histórico, novo schema e alterações no caminho de requisição de produto.

### 6.3 Cenários aceitos e camada de verificação

| Case ID | Setup → Ação                                                                         | Asserções obrigatórias                                                                       | Camada de evidência/status                             |
| ------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------- |
| T119-01 | Cada uma das duas empresas apenas com Team, entitled=true → ler o estado de plano da entrada                                    | `coding_plan`, sem precisar forjar direito de Individual                                      | teste unitário parametrizado, a adicionar                        |
| T119-02 | Mistura Individual/Team + Start → classificação; apenas Start/sem direito/view null → classificação                | Coding Plan tem prioridade; os demais respectivamente start_plan/no_plan/unknown; desligar o modelo não nega entitled | teste unitário, a adicionar                              |
| T119-03 | Individual/Team/Start das duas empresas e ID desconhecido → criar contexto de funil                                  | family/channel corretos, Start continua separado; desconhecido continua desconhecido, sem adivinhar pelo nome                    | teste unitário, a adicionar                              |
| T119-04 | Sucesso BigModel Team/Start → builder real de add_model_success                              | label=bigmodel; Z.ai=z.ai; valores/contagem dos eventos de login inalterados                                 | teste de construção/chamada de evento, a adicionar                 |
| T119-05 | Entrada de Team cria o mesmo funnelContext → upgrade do App e bootstrap do WebView                     | mesmo funnel ID, status/family/channel; audience, level/list com valores originais preservados           | teste de builder + injeção no WebView, a adicionar        |
| T119-06 | Duas empresas Team-only, view da página já pronta e gray permitido, codingPlanActive não definido → clicar no template de off-peak da home | entra na página de criação, sem o aviso "sem Coding Plan"; captura os fatos atuais de settings/rota                 | APP E2E, a adicionar; não basta chamar o helper        |
| T119-07 | Sem direito ou codingPlanActive=false → mesmo clique na entrada; falha de elegibilidade depois do envio                         | mantém o bloqueio/aviso; ter Team não contorna as verificações posteriores de conexão atual, credenciais e cota                      | teste unitário + APP E2E representativo, a adicionar             |
| T119-08 | Mapeamentos oficiais conferidos contra a versão antiga, IDs antigos existentes, IDs customizados/desconhecidos, modelos com caracteres especiais → construir eventos por categoria         | identidade consistente entre provider e model_name, codificação correta, desconhecidos intactos; o ID real do modelo não muda      | teste unitário, expectativas da versão antiga a completar na implementação            |
| T119-09 | send seed → início da requisição de modelo → step/completion; e então múltiplas requisições e falha antecipada sem requisição                         | send mantém o snapshot da seleção; eventos de execução usam a requisição correspondente; sem fact, mantém o fallback existente, sem adicionar/perder eventos   | teste de integração de telemetria V4, expectativas da versão antiga a adicionar |
| T119-10 | Sucesso e falha de criação de automação/off-peak, execução imediata, compactação → capturar o payload                               | regras de nome puro/prefixo mantidas cada uma; falha também é adaptada; condições existentes de preenchimento de hostname inalteradas           | testes de builder/chamada de evento, expectativas da versão antiga a adicionar |
| T119-11 | Completar uma conversa representativa e uma abertura de funil com um reporter de teste                                     | eventExtraDetail final correto e reportado apenas uma vez; nenhuma sonda enviada ao endpoint de produção                   | integração/E2E interceptando o transporte, a adicionar         |
| T119-12 | Workspace remoto desktop, entradas existentes em mobile, recuperação histórica/reconexão                                        | sem poluir a identidade entre workspaces, sem nova requisição de telemetria real em mobile, sem reenvio a partir do histórico recuperado              | testes de isolamento existentes + revisão direcionada multiplataforma, a executar     |

Os casos de regressão formais cobrem primeiro os cenários que hoje falham, e não apenas repetir "82 casos aprovados". "A adicionar/a executar" na tabela não significa que os testes existentes já forneçam prova.

### 6.4 Handoff de E2E e evidências de execução

- Ler primeiro o `DESIGN.md` (se houver mudança em componente de UI), o `e2e-case-lifecycle` e o workflow atual de case/coverage de conversation antes de adicionar cenários; não tratar casos pendentes como formalmente aceitos.
- Reaproveitar a infraestrutura de `off-peak-create-manage.test.ts`, `off-peak-limit-pre-gate.test.ts` e dos cenários existentes de parity de telemetria / Team Plan; conferir a cobertura real antes da implementação e não declarar aprovação pelo nome do arquivo.
- O fixture de Provider precisa de family explícita, Team-only, entitled e gray config, sem ler credenciais reais. A view da página deve estar pronta antes do clique pelo caminho normal de serviço/Store, sem tratar o retorno de helpers de configuração manual como verificação de UI.
- Esperas síncronas usam condições observáveis de prontidão/rota/evento, sem novo sleep fixo. Ao reproduzir o bloqueio indevido, capturar as condições de settings anonimizadas, o comportamento da página e as chamadas ao reporter; logs de UI passam pelo logger existente.
- Ao validar o transporte, injetar sink/interceptor de teste para não poluir a produção de relatórios. Quando só se puder validar o bootstrap do site oficial, registrar explicitamente a limitação de que os eventos de rede reais de compra não foram verificados.
- Novos casos preenchem o case catalog e a coverage matrix dos diretórios relevantes; os IDs T119 deste Todo servem como fonte de rastreabilidade de requisitos. O preset Docker específico segue o workflow de E2E existente, sem criar predefinições de teste do nada.
- O desktop continua continuous; o mobile continua replayable/shared-host e segue a regra existente de não reportar. Não se inicia um segundo conjunto de Agent/Host por causa de relatórios e não se altera owner, fila ou workspaceIdentity.

## 7. Critérios de conclusão, riscos e reversão

- As mapeamentos recuperáveis a partir da versão antiga e dos fatos já existentes foram recuperados no melhor esforço e verificados evento a evento; corrigir apenas a classificação não conta como concluir a adaptação de telemetria. Os poucos itens irreconstituíveis precisam listar explicitamente valor antigo, valor atual, fato ausente e motivo da preservação, sem alegar compatibilidade total de todos os relatórios.
- Team-only obtém a classificação correta de relatório e também passa pela entrada da home que originalmente deveria permitir; sem direito e bloqueio explícito de gray continuam não passando.
- family/channel de BigModel Team e os rótulos de sucesso das duas empresas seguem o contrato existente dos eventos; os valores do bootstrap a jusante são consistentes.
- Foi verificado que o ID real do Provider, a identidade da requisição de modelo, a seleção e a persistência não foram poluídos pelo mapeamento estatístico.
- Não se introduz reenvio, backfill histórico, permissão extra ou arquivo/campo/tabela novos; o parser antigo não sofre modificação de passagem.
- A implementação segue os requisitos do repositório executando `pnpm architecture:check --changed`, `pnpm typecheck`, `pnpm lint`, testes unitários afetados e o E2E necessário; escopos reais ou do site oficial que não puderem ser verificados ficam registrados como tal.

O principal risco é **união indevida da semântica estatística ou adaptação incompleta**, e não migração de armazenamento. Eventos que usam o mesmo ID de Provider precisam ser verificados conforme a semântica de cada um, sem misturar hostname com family/Provider ID. A correção afeta apenas eventos novos e não promete corrigir dados com o novo ID que já entraram no data warehouse; se dados históricos serão normalizados é um trabalho separado do lado do consumidor.

Recomenda-se que as correções de classificação e a adaptação de IDs formem commits revisáveis de forma independente. Se necessário, o mapeamento de telemetria pode ser revertido sozinho, preservando o reconhecimento correto de Team; não é preciso restaurar configuração antiga nem rodar migração de banco. A própria reversão estatística afeta os valores de dimensão posteriores, então o registro de lançamento precisa informar o limite de versão.

## 8. Entregas desta rodada

- Concluído: contexto de investigação, decisões do usuário, fronteiras concretas de implementação, mapeamentos candidatos, superfície de impacto das chamadas e plano de verificação T119 documentados.
- Concluído mais recentemente: o usuário confirmou que o lado dos relatórios não muda e que a telemetria recupera os IDs antigos no melhor esforço; a decisão de direção foi fechada.
- Não concluído: verificação da semântica antiga evento a evento, testes formais e qualquer implementação de produto/aceitação de execução; relatórios, parser antigo, Todo128 e Composer não foram alterados.
- Após o fim da implementação, acrescentar os resultados reais de teste e o registro de commits sem sobrescrever o histórico desta investigação e sem registrar os mapeamentos candidatos como se já tivessem sido confirmados pelo usuário.