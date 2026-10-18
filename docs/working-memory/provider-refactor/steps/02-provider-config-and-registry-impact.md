# M2 Provider Config / Registry — Brief de Impacto

> Status: contrato histórico de implementação
>
> Escopo de aplicação: superfície de impacto, fronteiras e passagem de testes quando o primeiro slice de domínio puro do M2 foi iniciado
>
> Este documento preserva as evidências de planejamento da época, portanto "neste lote", "integração posterior" e os itens em aberto
> no texto não representam o estado atual do M2.
> O estado atual de implementação está em [`02-provider-config-and-registry.md`](./02-provider-config-and-registry.md), os itens
> de aposentadoria restantes em
> [`02-provider-config-and-registry-cleanup.md`](./02-provider-config-and-registry-cleanup.md) e o design atual em
> [`../design/registry/registry.md`](../design/registry/registry.md).

## Resumo da Feature

| Campo           | Valor                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| Intenção do desenvolvedor | Estabelecer o núcleo de domínio de Registry e de resolução de configuração de Provider reutilizável por Host, Worker, Prompt CLI e TUI |
| Capacidade      | Provider registry, model capabilities, model selection option source                                              |
| Camada de mudança | option-source, validation, persistence boundary                                                                   |
| Modo de operação | planning                                                                                                          |
| Seeds principais | `IModelProviderService`、`ModelProviderConfig`、`ModelConfigSelect`、Workspace Model Catalog、contrato `Model` do M1 |
| Fora de escopo  | Mudanças de UI, armazenamento físico de configuração, watcher, requisições de rede de conta, Submission, Adapter, migração de sincronização remota |

## Matriz de Superfície de UI

Este lote não integra UI. A tabela abaixo registra as fronteiras de consumo que devem ser mantidas na integração posterior.

| Cenário do usuário | Entrada de UI                                     | Implementação compartilhada                         | Owner de exibição/rascunho | Origem de padrão/herança             | Validação/portão                    | Ação de commit                   | Autoridade/persistência            | Limite de modo                     | Deve permanecer isolado de          |
| ----------------- | ------------------------------------------------- | --------------------------------------------------- | --------------------------- | ------------------------------------ | ----------------------------------- | -------------------------------- | -------------------------------- | ---------------------------------- | ------------------------------------ |
| Editar Provider   | Model Provider Settings                          | ProviderConfigResolver; futuro Settings Facade       | rascunho da página de configurações | Official + Personal + draft overlay | issues do Resolver                  | futuro save do Config Service    | Personal Provider Config          | Environment ao qual o Host pertence | estado de seleção de modelo, Agent Loop ativo |
| Selecionar modelo | Picker de Conversation/Automation/Subagent/Repo Wiki | Registry View; cada Surface organiza seus candidatos | draft de cada Surface       | regras próprias de padrão/herança de cada Surface | Registry só fornece modelos selecionáveis | fluxo de commit original de cada Surface | Selection owner de cada um        | Registry local/remote independentes | drafts e commit sink de outras Surfaces |
| Executar modelo    | Core Worker / Prompt CLI / TUI                   | Registry lookup; ModelFactory posterior              | Agent Loop                   | Submission/Session ModelSelection    | validação de Registry Selection     | create Model                      | Environment Registry do Worker   | Worker não depende do Renderer     | Host draft, App Recent, estado das páginas de configurações |

## Comportamento Compartilhado e Divergente

| Assunto               | Compartilhado entre surfaces                                    | Deliberadamente diferente                                        | Por que importa para esta mudança             |
| --------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------- |
| Origem de opções      | ProviderConfigResolver e Registry View                        | A página de configurações também precisa de itens inválidos e de valores Personal explícitos | O Registry não pode manter modelos indisponíveis em cinza só por causa das configurações |
| Validação             | Schema, overlay de três camadas e verificação de completude    | accessId, autorização, cota e erros de rede continuam tratados pela cadeia de execução | O Registry não responde por julgamento de permissão de conta |
| Efeito de commit      | Nenhum                                                         | O salvamento das configurações, a seleção de modelo e a execução do agente mantêm seus owners originais | A resolução compartilhada não pode unificar semânticas de produto diferentes |
| Persistência/recuperação | Tipos de Config e formato de serialização de Object comum     | Arquivo físico, serviço remoto, cache e watcher são decididos pelo Source Service | O pacote de domínio puro não possui IO |

## Relacionamentos da Feature

| Rank           | De                     | Aresta semântica           | Para                          | Condição                 | Por que inspecionar                            | Evidência                                                             |
| -------------- | ---------------------- | -------------------------- | ----------------------------- | ------------------------ | ---------------------------------------------- | ---------------------------------------------------------------------- |
| must-inspect   | Provider Config        | resolves-through           | ProviderConfigResolver        | Todas as entradas        | Evitar que Host e Worker implementem overlays e filtros próprios | Working Memory registry design; `packages/services/src/model-provider` |
| must-inspect   | ProviderConfigResolver | publishes-valid-view-to   | ProviderRegistry              | Fatos estáticos completos e seleção permitida | O Registry contém apenas candidatos vinculáveis | `design/registry/registry.md`                                          |
| should-inspect | ProviderRegistry       | options-from               | Cada surface de seleção de modelo | Integração de UI posterior | Fonte de candidatos compartilhada, mas draft/commit separados | feature graph `capability.model-selection`                             |
| conditional    | ProviderRegistry       | creates-model-through      | ModelFactory                  | A partir de M2.4         | Este lote não cria Model de execução           | `design/registry/model-creation.md`                                    |
| invariant-only | Atualização do Registry| must-not-mutate            | Model já criado / Loop ativo | Todos os processos      | Nova configuração só afeta Models criados depois | `design/registry/runtime.md`                                           |
| invariant-only | Pacote de domínio Provider | must-not-own             | runtime de arquivo/rede/conta | Todos os modos          | Manter o núcleo de domínio sem IO e testável isoladamente | Limites do M2 confirmadas pelo usuário                                  |

## Owners de Estado e Sinks de Commit

| Estado/fato                     | Owner de rascunho/exibição | Owner autoritativo                 | Comando/serviço de commit   | Persistência/cache                  | Evidência                          |
| ------------------------------- | --------------------------- | --------------------------------- | --------------------------- | ----------------------------------- | --------------------------------- |
| Object de Config Official/Personal | Source Service            | Config Source do Environment dono | Config Service posterior    | config v2 atual / serviço de administração; refinado no M5 | M2 design                         |
| Access de Account Provider      | Account Service            | Source da conta/cota atual        | cadeia de atualização da conta | cache próprio do Source            | M2 design; grafo de entitlement do plano |
| Resolução efetiva do Provider   | Valor de retorno do Resolver | Fato derivado reconstruível      | Nenhum                      | Não persistido                       | M2 design                         |
| Registry View / index           | Registry no processo       | Instância atual do Registry       | `replace()`                 | Apenas em memória                    | M2 runtime design                 |
| Draft / Selection de Surface    | Cada Surface de produto    | Respectivo owner de estado        | command/service originais   | Respectiva persistência             | arestas de surface do feature graph |

## Invariantes que Devem Ser Preservados

| Invariante                                                                                             | Surfaces/modos                | Prova necessária         | Evidência               |
| ----------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------- | ----------------------- |
| A chave Official preserva a ordem Official; a chave somente Personal é acrescentada na ordem Personal      | Config, Settings, Registry    | Teste unitário de overlay | configuration design    |
| O ConfigOverlay aninhado sobrescreve recursivamente, campos comuns são substituídos por inteiro e a entrada não é modificada | Todos os consumidores           | Teste unitário            | configuration design    |
| O Account Source só produz a terceira camada de ProviderConfig para o kind account; o API Provider não tem essa camada | Host/Worker/CLI/TUI          | Teste unitário do Resolver| registry design         |
| O Registry só publica modelos completos, habilitados e estaticamente selecionáveis                     | Seleção e execução de modelo  | Testes de Resolver/Registry | Conclusão de produto já confirmada |
| A substituição de View pelo Registry não altera a View/Model antiga que o chamador já possui              | Loop ativo                    | Teste de snapshot imutável | runtime design         |
| O código deste lote não lê nem escreve arquivos, não envia requisições de rede e não depende de UI/Services/SDK | Todos os processos            | Revisão de dependências de pacote | Limite de pacote de domínio puro confirmado pelo usuário |

## Evidências do Codegraph

O ambiente atual não possui uma ferramenta de codegraph chamável; conforme a convenção da skill, o retorno foi aos seeds declarados no
grafo de funcionalidades e à verificação direta de chamadores com `rg`, com profundidade limitada a 2.

| Seed                                           | Consulta                    | Chamadores diretos / caminho principal                | Profundidade | Interpretação                                                |
| ---------------------------------------------- | --------------------------- | ----------------------------------------------------- | ----------- | ------------------------------------------------------------- |
| `IModelProviderService`                        | declarations / callers     | Settings, hook de seleção de modelo, snapshot do registry do Host | 2     | O serviço atual mistura configuração, Registry e projeção de runtime; o novo pacote de domínio entra gradualmente |
| `ModelProviderConfig`                          | references                 | schema compartilhado, storage do services, projeção do protocol | 2     | A estrutura de cópia completa atual é entrada de migração e não se torna diretamente o novo tipo de Overlay |
| `ModelConfigSelect` / `buildModelSelectGroups` | graph seeds + references   | Conversation, Automation, Subagent, Repo Wiki         | 2     | A origem de candidatos pode ser compartilhada; draft/commit devem ficar separados |
| `Model` do M1                                  | declarations / references  | Core, Bootstrap, wrapper de Adapter                   | 2     | M2-A não altera o contrato de execução; o ModelFactory só entra em M2.4 |

## Candidatos de Drift do Grafo

| Candidato                | Evidência no código vivo            | Relação ausente/obsoleta no grafo            | Seguimento proposto                                         |
| ----------------------- | ----------------------------------- | ------------------------------------------- | ---------------------------------------------------------- |
| Pacote de domínio Provider puro | `packages/provider` adicionado neste lote | `capability.provider-registry` ainda não tem esse code seed | Após o código ficar pronto, adicionar o package seed aos nós existentes de capability/service |

## Delta do Grafo

| Status    | Nó/aresta                                                                  | Razão semântica                                | Evidência       | Ação                                    |
| --------- | ------------------------------------------------------------------------- | ---------------------------------------------- | -------------- | ----------------------------------------- |
| confirmed | `capability.provider-registry` ganha o seed `packages/provider/src/index.ts` | O novo pacote hospeda o núcleo de domínio compartilhado de Config/Resolver/Registry | Confirmado pelo usuário e pela implementação | Atualizar o graph seed após a implementação, sem criar nova surface de produto |

## Perguntas em Aberto

| Pergunta                                  | Respostas candidatas                          | Diferença de escopo                                                                 | Owner             |
| ---------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------- |
| Schema estático final de `reasoningMapping` | Manter a estrutura compatível atual / trocar por estrutura oficial após o tópico do Adapter | Não bloqueia Properties, Option Specs, Resolver e Registry; bloqueia a integração completa do ModelFactory em M2.4 | Design posterior do Adapter |
| Estratégia de publicação quando o Source falha | Manter last-known-good / publicar resultado parcial | Pertence à montagem do Source com o Registry Service, não a este lote de Registry puro | Implementação posterior do M2 |

## Passagem do Planejamento

| Item             | Destino                            | Status     |
| ---------------- | ---------------------------------- | ---------- |
| Atualização do spec | `02-provider-config-and-registry.md` | complete   |
| Catálogo de casos | Casos aceitos abaixo deste documento | complete   |
| Matriz de cobertura | Testes unitários do pacote de domínio puro | complete   |
| Backlog de decisões | Itens em aberto dos steps do M2 | complete   |
| Passagem de E2E    | Nenhuma mudança de UI/protocolo      | not-needed |

## Log de Esclarecimentos

| Rodada | Pergunta                       | Resposta do usuário                                              | Fronteira fixada             | Seguimento necessário |
| ------ | ------------------------------ | ---------------------------------------------------------------- | ---------------------------- | --------------------- |
| 1      | Onde fica o código compartilhado | Criar um pacote de domínio puro                                | Implementação compartilhada para Host/Worker/CLI/TUI | não |
| 2      | Forma de JSON e de runtime      | Object comum de JSON/RPC; após o parse, classe ConfigOverlay + Map ordenado | Fronteira serialização/runtime | não |
| 3      | Override de Account Personal    | Sem restrição especial na camada de domínio; a página de configurações não deve oferecer interações parciais | O Resolver não codifica política de UI em hardcode | não |
| 4      | O Registry é sem IO            | Sim; o Source Service responde pelo IO e o Registry mantém a View em memória | Propriedade de IO | não |

## Decisões de Fronteira

| Fronteira             | Decisão                                  | Inclui                                             | Exclui / poda                                          | Origem      |
| --------------------- | ---------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------ | ----------- |
| M2-A                  | Config + Resolver + Registry em memória  | schema, overlay, order, filter, issues, index, event | storage, watcher, account request, UI, ModelFactory | user/design |
| Disponibilidade do Registry | Só inclui modelos com configuração completa e habilitados | complete, enabled, Provider Config de três camadas | Se o accessId autoriza, saúde de rede, cota, token instantâneo | user/design |
| Propriedade da View  | O Registry substitui atomicamente uma View imutável | Novas consultas usam a nova View                       | Modificar a View antiga / o Model ativo                | user/design |

## Casos Aceitos

| Case ID          | Setup                                        | Ação                   | Asserções                                                    | Camadas de evidência | Status E2E |
| ---------------- | -------------------------------------------- | ---------------------- | ------------------------------------------------------------ | -------------------- | ---------- |
| M2A-OVERLAY-01   | Official `[A,B,C]`，Personal `[Y,C',X,A']`   | overlay                | Resultado `[A',B,C',Y,X]`; entrada inalterada                | unit                 | not-needed |
| M2A-OVERLAY-02   | Properties aninhadas + arrays/Record comuns  | overlay                | Config aninhado herdado campo a campo; array/Record substituído por inteiro | unit | not-needed |
| M2A-MODEL-01     | Múltiplas regras de regex em Official/Personal | resolve model        | Correspondência pela string inteira; a regra posterior sobrescreve a anterior | unit | not-needed |
| M2A-ACCESS-01    | API e Account Provider presentes ao mesmo tempo | overlay de Config da conta | Só completa accessId/models do Account Provider; a API fica inalterada | unit | not-needed |
| M2A-VALID-01     | Provider/model incompleto, desabilitado e completo | resolve               | A Registry View só contém itens completos e habilitados; os problemas ficam no resultado do Resolver | unit | not-needed |
| M2A-REGISTRY-01  | Registry já detém a v1                        | replace v2             | revision/event são atualizados; o snapshot antigo da v1 permanece inalterado | unit | not-needed |
| M2A-SELECTION-01 | provider/model presente ou ausente            | validate               | Retorna resultado de sucesso/erro estável                   | unit                 | not-needed |
| M2B-SOURCE-01    | Config/Account Source têm snapshot atual     | service start          | Assina antes de ler; publica um Registry Snapshot completo  | unit                 | not-needed |
| M2B-REFRESH-01   | Source atualiza de v1 para v2 durante a leitura da v1 | source invalidation | Descarta a geração obsoleta e publica apenas a v2            | unit                 | not-needed |
| M2B-REFRESH-02   | Nenhuma das revisions de Source mudou        | invalidation repetida  | Não reconstrói a View nem aumenta a revision do Registry    | unit                 | not-needed |
| M2B-FAILURE-01   | v1 publicada, próxima leitura de Source falha | source invalidation    | A v1 continua disponível; o erro de atualização é reportado; um sucesso posterior recupera até a v2 | unit | not-needed |
| M2C-SETTINGS-01  | Official, Personal, itens inválidos e Account filtrados | project settings | Retorna valor Personal explícito, valor efetivo, problemas e marcador de ordem ajustável | unit | not-needed |
| M2C-SELECTION-01 | Settings ainda contém itens não publicáveis  | project selection      | A Selection View só contém Provider/Model publicados pelo Registry | unit | not-needed |
| M2D-CONFIG-01    | Source Official ou Personal é atualizado     | config source event    | O Config Service notifica o Registry para ler os dois snapshots mais recentes | unit | not-needed |
| M2D-CONFIG-02    | Settings salva, exclui ou reordena a config Personal | repository update | Só a camada Personal é alterada, dentro da fronteira atômica do Repository | unit | not-needed |
| M2D-CONFIG-03    | Salva Provider/Model ID exatos com metacaracteres de regex | settings model save | Regras exatas são escapadas; nenhum outro ID é correspondido por acidente | unit | not-needed |
| M2E-MIGRATE-01   | Novo arquivo de Config Personal inexistente, configuração antiga presente | repository read    | Importação unidirecional, validação e escrita atômica em arquivo com o schemaVersion atual | unit/integration | not-needed |
| M2E-MIGRATE-02   | Config Personal em um schemaVersion antigo suportado | repository read      | Migra nível a nível a partir das versões adjacentes e grava a versão mais recente | unit | not-needed |
| M2E-MIGRATE-03   | Versão do arquivo acima do range suportado pelo programa atual | repository read | Retorna erro sem sobrescrever o arquivo original           | unit                 | not-needed |
| M2E-MIGRATE-04   | Falha ao converter a configuração antiga ou ao gravar atomicamente o novo arquivo | repository read | Retorna erro e mantém o arquivo antigo; não publica Snapshot meio migrado | integration | not-needed |

## Notas de Passagem de E2E

- Fixture de Provider: not-needed
- Fixture de sistema de arquivos: not-needed
- Estratégia de temporização: testes unitários síncronos de domínio puro
- Preset de Docker: not-needed
- Riscos de revisão: a cadeia de produção ainda não está integrada; a integração posterior exige refazer o impact scan de Host/Worker/remoto