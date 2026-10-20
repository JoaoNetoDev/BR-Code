# Working Memory da refatoração de Provider

> Status: implementação principal consolidada, entrando na verificação completa
>
> Última atualização: 2026-09-09
>
> Fase atual: arquitetura central e limites de configuração já implementados; organizando o Design V2 e a verificação de lançamento

Este diretório guarda o design alvo, a implementação por etapas e o levantamento do código atual da refatoração de Provider. É a memória contínua deste trabalho macro.

## Entrada nos documentos

- [内置 Provider 模板与模型日常维护](../../builtin-provider-maintenance/README.md)：2026-10-14 整理，包含范围、原理、正式/测试配置、当前库存、官方资料跟踪、人工 Key 验证和交付流程。重构历史留在本目录，实时维护从新入口展开。

```text
provider-refactor/
├─ provider-refactor.md
│  └─ 当前状态与总入口
│
├─ design/
│  └─ design.md
│     └─ 历史演进中的层次化设计树
│
├─ design-v2/
│  ├─ design.md
│  │  └─ 当前核心设计唯一入口
│  └─ evidence-and-contradictions.md
│     └─ 历史矛盾、证据与裁定
│
├─ steps/
│  └─ steps.md
│     └─ 迁移路线、实施目标、结果和问题
│
├─ plan/
│  └─ plan.md
│     └─ 合并、自动化门禁、真实验证与最终收尾的上线总计划
│
├─ research/
│  └─ research.md
│     └─ 当前代码与协议的专项调研
```

- [`design-v2/design.md`](./design-v2/design.md) é a única entrada do design central atual.
- [`design-v2/evidence-and-contradictions.md`](./design-v2/evidence-and-contradictions.md) explica como o material antigo foi substituído,
  em que se baseiam os fatos atuais e o que ainda não foi concluído.
- [`design/design.md`](./design/design.md) preserva o design hierárquico da evolução; em caso de conflito, ele não substitui mais o Design V2.
- [`steps/steps.md`](./steps/steps.md) apresenta o Roadmap de migração, os registros de implementação de M1-M3 e o design e resultado de implementação da fase M4.
- [`plan/plan.md`](./plan/plan.md) fixa as quatro fases de fechamento de lançamento antes de o Provider refactor entrar em Release Candidate.
- [`research/research.md`](./research/research.md) apresenta os levantamentos específicos do código e do protocolo atuais, citando cada documento de fatos.

## Fase atual

- [Todo156: correções seguintes do Provider Start independente e decisão final de páginas](./steps/todo-156-start-plan-followup-final-decisions.md): **implementado e auto-revisado; o usuário já pediu commit e push; o registro de falha de baseline é preservado**. Este item mantém o Start persistente, o reuso de estado, a correção da dependência de conexão, o fluxo de resgate, o dropdown de equipe, a etiqueta de plano, a primeira recomendação no ecrã secundário e o escopo final de saldo compartilhado/atualizado sob demanda/com validade de 60 segundos; a governança da construção dos dados de equipe fica adiada, o cartão de cota de múltiplas instâncias permanece no baseline, e as evidências de implementação e verificação e os itens não cobertos estão na §14 deste item.

- [Todo155: limpeza da dependência de conexão do Start e identificação de plano na troca de modelo](./steps/todo-155-start-plan-selection-dependency-cleanup.md): investigação inicial arquivada; as decisões finais posteriores estão em [Todo156](./steps/todo-156-start-plan-followup-final-decisions.md).

- [Todo138: rascunho de modelo vazio e fallback de nível de raciocínio na camada Model](./steps/todo-138-reasoning-level-ui-and-api-defaults.md): concluído; um rascunho vazio na UI não pré-preenche o nível, o fallback genérico do Model é disabled/enabled e o mapa genérico das três APIs converte enabled em high; a hierarquia e as regras dedicadas são preservadas. Revisão de origem 23, versão mesclada 24; a verificação está no corpo do texto e no registro de merge.

- [Todo137: selo visual de ocultação do GLM-5.3 no plano de experiência](./steps/todo-137-start-plan-glm53-vision-badge.md): implementado e aprovado na regressão de exibição; apenas amplia o escopo de exibição compartilhado, preservando a capacidade de imagem e a marca Flash.

O M1 já unificou a fronteira `Model`/`ModelRequest` de todas as chamadas de modelo em produção. O M2 já unificou a origem dos Models comuns de longa duração:

```text
ProviderConfigService
├─ ZCode Built-in Provider Config
├─ Account Provider Config
└─ Personal Provider Config ────────────────┐
                                            ├─> Effective Provider Config
ZCode Built-in Model Config Rules ──────────┤
Personal Model Config Rules ────────────────┘
                             |
                             v
            ProviderRegistryService
                     ├─ Provider[] / { modelId, config: ModelConfig }[]
                     └─ createModel(selection)
                                  |
                                  v
                             ModelFactory
                                  |
                                  v
                                Model
                                  |
                                  v
                           ModelRequest
```

Config Overlay, Registry View, Facade de Settings/Selection, ModelFactory e a autenticação por requisição do Account Provider já entraram na cadeia de produção. O Account Config é sincronizado ao Worker local por um protocolo de processo próprio, em vez de ser extraído de volta do Workspace Registry Snapshot; o antigo Provider Store serve apenas como insumo único da migração Personal/Account.

O M3 já concluiu, sobre essa base, a seleção de modelo, a Submission atómica, Guide/Imediato, a página de configurações de Provider e o formato de entrada/saída de Model,
e removeu o ModelRef substituído, o estado de modelo Runtime mutável compartilhado, o mapa de capability de media e o desvio de conectividade.

O M4 já concluiu a implementação conforme o desenho estabelecido: o Provider oculto continua sendo um Provider completo no Registry, e a visibilidade filtra apenas a página de configurações e o seletor de modelos;
o Provider de conta Zhipu declara o modo de acesso estático com `zhipu-account + family + mode` e obtém a autenticação dinâmica na fase de requisição; a tarefa off-peak usa
o mesmo Registry, ModelFactory e Model, sem modificar nem restaurar a Session Selection. O processo da fase está em
[`steps/04-model-execution-cutover.md`](./steps/04-model-execution-cutover.md); nele, o termo de fase `request-auth`
foi substituído pelo Todo 26, e o contrato vigente é o do Design V2.

## Progresso atual

| Fase | Tema | Estado |
| --- | --- | --- |
| M0 | Arquitetura macro e mapa do estado atual | Primeira rodada concluída |
| M1 | Model e ModelRequest | Concluído, MR !2006 já mergeada no staging |
| M2 | Configuração de Provider, Registry e criação de Model | Concluído, como slice base do M3 |
| M3 | Troca da arquitetura de Provider e consolidação do formato de Model | Concluído |
| M4 | Cadeia de execução de modelo, tarefa off-peak e Subagent | Concluído |
| Fechamento posterior | Publicação de Config, boundaries de Account e Settings | Corpo principal implementado; itens restantes no Design V2 |
| Tópico à parte | Configuração de Environment e Provisioning | Não faz parte deste Provider Refactor |

## Próximos passos

[Todo154: Provider Start independente e recomendação de plano de experiência na submissão](./steps/todo-154-start-plan-independent-provider.md): **implementado e revisado, Pro E2E aprovado**. Mantém os dois IDs, unifica nome e ícone de marca, dispensa conexão no Start e coexiste com planos pagos; não migra dados de seleção, acrescenta a recomendação de cota na submissão/criação para o mesmo modelo com raciocínio compatível e persiste de forma unificada o "não mostrar de novo". Ficaram definidos a inclusão de Subagent, a exclusão de execução imediata/Bot/background e o limite de notificação de invalidez do plano pago; detalhes na §8 deste item; antes de implementar, os fatos vão para research, e o comportamento final já foi sincronizado com a especificação oficial do Start, sem iniciar o Todo101.

[Todo117](./steps/todo-117-preserve-account-domain-on-provider-save.md)/[Todo118](./steps/todo-118-preserve-legacy-provider-enabled.md): a decisão mais recente está confirmada, aguardando implementação. O Provider de conta embutido perde a capacidade de desativação, uma conta existente com false deixa de valer e desativação de conta antiga não é migrada; o Provider de Key manual mantém liga/desliga. Conexão pública, direitos, credenciais e julgamento de executabilidade do modelo permanecem inalterados, e não se espera mais pela decisão sobre a origem da desativação embutida.

[Todo132: feedback de cor de fundo das opções de modelo e correção da edição do nome do fornecedor](./steps/todo-132-model-option-feedback-and-provider-name-edit.md): **a executar, solução confirmada**. As opções em bloco apenas reforçam a cor de fundo da seleção; texto/ícone e borda de cobertura não mudam; o campo de nome não salva por temporizador, Enter/perda de foco confirma, Esc descarta, e salvar outros campos não pode carregar um nome não confirmado. Os limites locais e a verificação já estão listados; nesta rodada fica só em disco.

[Todo131: posição da configuração inteligente na página de configurações de modelo e botão "Restaurar"](./steps/todo-131-model-settings-smart-config-placement-and-restore.md): **a executar, solução confirmada**. A configuração inteligente vai para o lado direito do contêiner do model ID e ganha "Restaurar" embaixo à esquerda; só o rascunho muda, o efeito vem após salvar, e um ID vazio pode ser usado, sendo desativado apenas durante o saving. Ligado aos Todo125/130, inclui layout responsivo, proteção assíncrona e a verificação R121; nesta rodada fica só em disco.

[Todo130: correção do limite de campos editáveis da configuração manual e do interruptor de configuração inteligente](./steps/todo-130-manual-model-config-editable-field-boundary.md): **a executar, solução confirmada**. O interruptor só fica desativado enquanto salva; o manual fixa apenas os campos editáveis, e o mapeamento interno/capabilities continuam resolvidos pelas regras atuais do sistema; corrigir schema, síntese e fallback de salvamento. Tratado como ainda não publicado oficialmente, a compatibilidade permanece leve; sem editor de campo oculto; nesta rodada fica só em disco.

[Todo129: adaptação da telemetria de Provider e correção da classificação de plano Team](./steps/todo-129-provider-telemetry-compatibility-and-team-classification.md): **a executar, direção confirmada**. O relatório não muda; do lado da telemetria, restaurar o melhor esforço dos IDs antigos; verificar evento a evento conforme a versão antiga, implementar diretamente o que for determinável e deixar evidência nos poucos casos irrecuperáveis sem bloquear o todo. Corrigir o reconhecimento de Team das duas casas, o bloqueio indevido de off-peak na home, o funil da BigModel e a etiqueta de sucesso; sem tocar na identidade real do Provider, requisições, armazenamento ou o parser antigo; nesta rodada fica só em disco.

[Todo128: contrato de startup do Provider e correção da atualização de elegibilidade off-peak](./steps/todo-128-provider-start-contract-and-offpeak-eligibility.md): **a executar, solução confirmada**. Unificar o startup para esperar apenas a prontidão e ler explicitamente o snapshot atual; corrigir a notificação, o refresh manual e a sobrescrita fora de ordem depois que a atualização de elegibilidade off-peak termina. Inclui evidência do Air, todos os pontos de consumo do valor de retorno e os requisitos de verificação; não expandir o refactor de casca do Todo11 nem alterar o Composer; nesta rodada fica só em disco.

[Todo127: publicação online da configuração Built-in e correção da cadeia de atualização](./steps/todo-127-builtin-online-release.md): **a executar, solução detalhada confirmada**. Já está em disco o download de 20 s/10 MB, a verificação de expiração a cada minuto e o download normal a cada hora, o alinhamento de Account e a recuperação dirigida pelo mesmo ponto de verificação, além da ordem de implementação e dos testes. As evidências da investigação ficam em arquivo separado; nesta rodada não se implementa código de produto.

[Todo113: atualização do catálogo de modelos recentes e da configuração inteligente](./steps/todo-113-new-model-catalog-refresh.md): **segunda rodada a executar**. Já estão listadas as mudanças de catálogo e de configuração por template, a limpeza de remoções e a verificação obrigatória do suporte agregado; os modelos determinados ainda exigem pesquisa aprofundada, e os detalhes incertos são conferidos na execução. O primeiro lote de resultados históricos é preservado e não entra na contagem de aceitação desta rodada.

[Todo126: exibição do selo visual de GLM, PDF do Flash e defaults de API Turbo do Coding Plan](./steps/todo-126-glm-flash-pdf-and-coding-plan-turbo-defaults.md): confirmado e em disco, aguardando implementação. Ajustar a declaração genérica de PDF do Flash e o valor padrão Turbo dos dois templates de API de plano; acrescentar as exceções de exibição que escondem o selo visual GLM-5.3 do Coding Plan na página de configurações e no menu de seleção de modelo, preservando a capacidade de imagem de ponte e o selo visual do Flash.

[Todo125: textos de ajuda e copy final da página de configurações de modelo](./steps/todo-125-model-settings-help-copy.md): decisão de produto concluída e em disco, aguardando implementação. Fixar o texto final em chinês, o ponto de interrogação no título e a interação entre plataformas; não polir por conta própria, não expandir as dicas e não mudar o comportamento de configuração.

[Todo114](./steps/todo-114-account-status-sync-and-key-retry.md) (antigo Todo105 upstream): mergeado e complementado com a sincronização do motivo de Account, a classificação unificada de falta de Key Z.ai/BigModel e a mudança da operação de falha ao obter plano pessoal para retry. Os 280 testes direcionados do upstream e os quatro grupos de componentes no browser passaram; a verificação restante da cadeia completa App/celular fica no Todo102, com as evidências no Todo114.

As decisões específicas de Schema antes do lançamento estão em [Todo104](./steps/todo-104-pre-release-schema-review.md) (antigo Todo99 do m2): o esquema central e a escolha padrão de merge são mantidos; a Session ganha modelSelection preservando o valor antigo, e as correções parciais de salvamento de Off-Peak/Wiki aguardam implementação. Em 6.19 foi apertado para os 13 itens correlatos que este Todo vai alterar, com reconhecimento. A migração dos campos originais do Markdown do Subagent é o compromisso de legibilidade já decidido no Todo97 e não é reaberta neste Todo. Em 2026-09-10 o usuário autorizou a implementação; o estado de conclusão segue o livro-razão de implementação.

M2/M3 já fizeram com que configuração, exibição, seleção e execução dos Providers comuns usem uniformemente as três camadas de Config Built-in → Account → Personal,
as Model Rules Built-in + Personal e o Registry em nível de processo. O estado de conclusão está em
[`steps/02-provider-config-and-registry-cleanup.md`](./steps/02-provider-config-and-registry-cleanup.md) e
[`steps/03-provider-architecture-cutover-implementation-log.md`](./steps/03-provider-architecture-cutover-implementation-log.md).

A arquitetura central e os Todos seguintes já concluídos formam a linha de base atual de fechamento de lançamento; o Todo 32 já concluiu o fechamento dos limites de Effective Provider e da página de configurações Team/Individual. Itens não concluídos, adiados e em rascunho como o Todo 11, 11A, 15, 19 e 22 estão reunidos em
[`design-v2/design.md`](./design-v2/design.md#11-尚未完成但不改变设计的工作), e o estado atual não deve mais ser inferido pelos números de fase antigos.

Este fechamento de lançamento não se expande para Remote Provisioning, ciclo de vida da seleção de modelo, Queue comum,
`modelContextBudget.strategy` ou refactor do produto de contas.

## Princípios de manutenção

```text
design-v2 最终系统如何工作，以及历史矛盾如何裁定
design    历史层次化设计与专题细节
steps     如何迁移，以及实际发生了什么
plan      已完成主体实现如何进入可发布状态
research  当前代码和协议事实
```

Conclusões estáveis vão para o design-v2; o processo de implementação e os desvios vão para steps; as evidências de fato vão para research. O material antigo não é mais reescrito silenciosamente para se passar por design final; os conflitos ficam registrados de forma unificada no documento de verificação do Design V2.

Durante a evolução da arquitetura de Provider, o design, os registros de implementação, os levantamentos e o material histórico ficam guardados de forma unificada neste Working Memory, sem cópia antecipada para os documentos oficiais de `docs`. Depois que a fase correspondente conclui implementação e verificação e forma fatos estáveis, aí sim se extrai do Working Memory o documento oficial voltado a quem mantém o sistema no longo prazo; o documento oficial descreve o sistema já implementado, e o Working Memory preserva o processo de evolução e a base das decisões.