# Registro de impacto de implementação do Todo87

## Feature Summary

Intenção: restaurar a experiência de mesmo modelo após a troca de conta D02, preservando a
fronteira entre seleção original e seleção de execução após o refactor. Capacidade,
veredito e podas estão no Todo87; o estado atual é implementation-handoff. As camadas
alteradas são option-source, validation, recovery e commit-effect; o schema não muda.
Sementes: ModelSelectionFacade, useDraftConfigControl, dispatchCronRun. Exclusões:
sincronização antes do envio, troca de ticket de off-peak entre contas, reinterpretação de
requisições de histórico/já fixadas.

## UI Surface Matrix

| Cenário/entrada | Implementação compartilhada | Owner da intenção original / inicialização | Portões, commit e fronteira de persistência | Isolamento |
| --- | --- | --- | --- | --- |
| Composer / SessionPane | Selection Service com entrada + hook público | draft de scope; Session só faz seed na primeira vez, novos drafts continuam usando Recent/Configured Default | derivado da View; o valor válido só é adotado quando accepted, e edição durante o ACK não sobrescreve | workspaceIdentity, Session; continuous/replayable inalterado |
| Edição de tarefa agendada / AutomationEditView | a mesma Service/hook | seleção original do formulário; o modo existente de seguir o Workspace é preservado | só a mudança salva explicitamente altera a configuração de longo prazo; o run é resolvido e fixado antes do primeiro dispatch em background | formulário e run não se escrevem mutuamente |
| Bot / Wiki | a mesma Service | cada domínio tem sua própria seleção | resolvida ao preparar uma nova execução; execuções já fixadas são excetuadas | não altera a intenção do chat comum |
| Subagent explícito | mantém a validação de Agent atual | seleção explícita de Profile | nesta rodada não conecta a conta correspondente; o usuário já decidiu que a integração do protocolo vem em um design separado | modelo não especificado continua herdando do Parent |
| Lista/execução de off-peak | validação somente leitura da identidade original | seleção original da tarefa + Ticket já reivindicado | a verificação de execução em estado não terminal é preservada; a leitura não limpa o repositório | não troca Provider/Ticket entre Z.AI/BigModel |

## Shared And Divergent Behavior

O que é comum é a origem dos candidatos, o casamento por ID, o esvaziamento da seleção inválida
e o isolamento de geração entre entrada/Host; o que difere é a fronteira de commit e
persistência de cada domínio. A UI não compartilha o effectiveSelection de um consumidor; os
menus comuns continuam filtrando hidden, e o off-peak só usa o Provider hidden original no
caminho restrito. Inicializar uma seleção totalmente nova não equivale a corrigir uma
intenção já existente.

## Feature Relationships

| Nível | Relação | Condição e evidência |
| --- | --- | --- |
| must-inspect | Account/Config → Registry Snapshot → Facade → Service/hook → Composer | estado de conta do mesmo snapshot; `providerRuntime.ts`, `facades.ts` |
| must-inspect | scheduler → Host → fixação do run → dispatch | passou a ser resolvido e fixado no primeiro dispatch do Host; scheduler/manual claim não congela antecipadamente, e runs existentes não são reassociados |
| must-inspect | OffPeak list/get/sync → repairLegacyModelSelections | a nova seleção apenas deriva diagnóstico e não é mais a leitura que dispara invalidate; a migração da estrutura realmente antiga permanece |
| should-inspect | preparação de Bot/Wiki → Service | não modifica apenas o controle de settings |
| conditional | override de Subagent explícito | sem override herda do Parent e não sofre recálculo pela conta atual |

## State Owners And Commit Sinks

| Estado | Owner autoritativo | Fronteira de escrita |
| --- | --- | --- |
| Account/Registry | snapshot applied do Host alvo | refresh da origem, sem persistência pelo chamador |
| Intenção original do Composer | draft de scope do Renderer | edição do usuário; callback accepted que casa com a intenção original; promoção pelo Root |
| Seleção efetiva | leitura/consumidor único | não é persistida diretamente nem transmitida como seleção global |
| Run agendado | AutomationRepo | fixado na primeira vez; retry de run existente não reassocia |
| Active Model/Submission | CLI / esta submissão | depois de fixado, só é validado pelo Registry, sem troca silenciosa de modelo |

## Must-Preserve Invariants

Não se adiciona migração de persistência; intenção original vazia não recebe valor padrão
padrão; falha temporária não é disfarçada de vazio; sem adivinhação por nome de Provider; não
se introduz sincronização antes do envio; cada ponta ainda compartilha o Host e o delivery
profile não muda. A verificação corresponde a SR87-01～14; os resultados reais estão
registrados na tabela de auditoria do Todo85, e E2E não executado não conta como aprovado.

## Codegraph Evidence

A ferramenta codegraph não estava disponível nesta rodada; foi usado rg/read ao longo das
sementes acima rastreando 1 a 2 saltos. Os chamadores diretos da Service são o hook de UI, o
Bot e a automação do Host; todas as escritas de seleção original do Composer são
centralizadas por useDraftConfigControl. Esta tabela não se passa por resultado de consulta
ao grafo.

## Graph Drift Candidates / Graph Delta

A seleção efetiva unificada já está marcada no Feature Graph com a implementação e as
sementes de código exatas; Composer, Automation, Bot e Wiki integrados, Off-Peak somente
leitura protegida; Subagent explícito excluído por decisão do usuário. Com o codegraph
indisponível, foram verificados o YAML e as sementes de arquivo/símbolo, sem alegar que a
consulta ao índice foi concluída.

## Unresolved Questions

O Subagent explícito foi confirmado como carente do fato de conta do Host; o usuário decidiu
manter a validação original nesta rodada e fazer a integração depois, separadamente. Não se
estende o protocolo nem se faz um comportamento de correspondência automática apenas na
página de settings.

## Planning Handoff

Spec: selection-state.md recebeu o contrato de implementação; catalog/coverage: SR87 foi
atualizado conforme as evidências reais; E2E já rodou no Air, e os novos candidatos permanecem
pending à espera de promoção manual; decisões, commits e relatório estão na tabela de
auditoria do Todo85. Nem todas as fronteiras precisam de uma permutação completa no Electron.

## Limite de geração e de preenchimento do Wiki (2026-09-07)

A nova geração (incluindo a nova rodada disparada por task_complete) resolve no início a
seleção original das configurações de geração e fixa a configuração desta rodada; as
requisições de página seguintes reutilizam essa configuração. As páginas de falha que
preenchem o mesmo Wiki continuam usando a seleção histórica de geração, sem se reassociarem
à conta atual. A leitura/exibição não modifica o Wiki, o chat nem o Recent. O ModelClient
fornece separadamente a resolução da configuração de nova geração e a leitura da
configuração já fixada; ambos compartilham a leitura no Host alvo e a projeção de
configuração, sem criar uma nova regra de casamento de contas.