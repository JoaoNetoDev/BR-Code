# Impact Brief de Referência de Plugin na Conversa

> Data da varredura: 2026-08-05
> Modo: implementation-handoff
> Fonte de verdade do produto: [plugin-reference-mention.md](./plugin-reference-mention.md)

## Resumo da Feature

| Campo | Valor |
| --- | --- |
| Intenção do desenvolvedor | Verificar a referência de Plugin item a item conforme a exigência, do Composer e da entrada de teste da loja de Plugins até provider, persistência, recuperação e os limites de remote/mobile, preenchendo as lacunas |
| Capacidade | `capability.plugin-reference` |
| Camada de mudança | option-source / validation / commit-effect / persistence / recovery |
| Modo de operação | implementation-handoff |
| Seeds principais | `MentionPlugin`、`PluginStoreDetailView`、`PluginsSection`、`usePluginReferenceCatalog`、`plugins/referenceCatalog`、`injectPluginReferenceReminderFromTurn`、`sendConversationCommandV4` |
| Fora de escopo | Capacidades de Plugin App/Connector; criar um runtime de Agent separado para remote/mobile |

## Matriz de Superfície de UI

| Cenário do usuário | Entrada de UI | Implementação compartilhada | Dono de exibição/rascunho | Fonte de padrão/herança | Validação/bloqueio | Ação de commit | Autoridade/persistência | Limite de modo | Deve permanecer isolado de |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Novo rascunho referenciando um Plugin | Primeiro grupo `@` do Composer | `MentionPlugin` + `usePluginsMentionProvider` | Composer Lexical | catalog atual do workspace | enabled; itens em conflito visíveis e não selecionáveis; estado vazio quando o RPC não está pronto | Insere `[@Label](plugin://stable-id)` | texto user canônico; authority=`workspace` |portador canônico compartilhado por desktop/mobile | Não habilitar/instalar/conectar Plugin, não gravar selection state |
| Testar um Plugin já instalado no topo da página de detalhes da loja | Botão principal 「Try now」 | `PluginStoreDetailView` + `PluginsSection` + Root `onCreateTask` | Root draft + composer V4 | stable ID e nome de exibição em locale do item de detalhe atual | Instalado; disabled ainda pré-preenche, mas o Agent falha fechado conforme as regras existentes de `disabled_in_session`; falha fechada quando não há workspace | Nova tarefa padrão, apenas pré-preenche `canonical`, não envia | persistência do root draft + inserção única no composer | desktop continuous reseta o workbench; mobile/remote ainda cai no workspace shared-host de destino | Não criar outro runtime de Agent, não manter uma segunda cópia do Plugin selection state |
| Testar um Plugin já instalado pelo prompt de exemplo na página de detalhes da loja | Cápsula de prompt de exemplo | Igual ao 「Try now」 do topo | Root draft + composer V4 | stable ID, nome de exibição em locale, listing example prompt | Igual à entrada do topo | Nova tarefa padrão, pré-preenche `canonical + espaço + prompt`, não envia | Igual à entrada do topo | Igual à entrada do topo | Não bifurcar a semântica de canonical nem de runtime |
| Clicar no prompt de um Plugin não instalado na página de detalhes da loja | Mesma cápsula | `handleInstall` existente | Plugin management store | Item de detalhe atual | Não instalado | Apenas instala/restaura, permanece na página de detalhes | persistência de plugin install existente | local/remote usam o serviço existente de gestão de Plugins | Não criar rascunho, não enviar, não tratar a referência como ordem de instalação |
| Session existente referenciando um Plugin | Primeiro grupo `@` do Composer | Igual acima | Composer Lexical + taskId atual | catalog congelado na criação da Session | missing session gera erro de protocolo, sem fallback para o workspace | Insere o mesmo link canônico | authority=`session` | local/remote passam pelo service do workspace de destino | Não carregar dinamicamente Plugins adicionados depois ao workspace |
| Trocar workspace/session/remote attachment | Reabertura do picker / troca de task / reconexão remote | `usePluginReferenceCatalog` | estado de hook com escopo de request | `workspaceIdentity?.trim() || workspacePath` + sessionId + remoteSessionId | Limpa no primeiro frame do novo escopo; seq/cancel descarta resultados atrasados | Apenas requisição de leitura do catalog | service do host de destino | remote waiting/disconnect falha fechado | Não mostrar itens da authority anterior, não ler o Plugin store local |
| Envio e consumo pelo modelo | Send / retry / edit / fim da fila no início do turno | conversation command + injetor de reminder de runtime | `displayInput` canônico | catalog da Session de destino + inventário live do turno | parser estrito; visibilidade de tools; permission inalterada | Anexa um system reminder só para o modelo | session store append-only notice | desktop continuous / mobile replayable compartilham o início do Agent turn | Não expandir prompt a partir do comando, não modificar o texto user canônico |
| Exibição histórica e recuperação | Transcript / cold resume / fork | parser de markdown de menção + fronteira preguiçosa de ícone de Session + cópia de mensagem do hydrator/fork | projeção do transcript | user já persistido + notice model-only; apenas as linhas de usuário com Plugins visíveis leem o catalog congelado da Session | Ramo de renderização isolado para `plugin://`; só stable ID válido associa a um ícone HTTPS confiável; caso contrário fallback para Cable; model-only não entra na UI | Nenhuma escrita extra; requisições idênticas do catalog de Session só são deduplicadas na fase in-flight por workspaceKey + remoteSessionId + sessionId + geração de restart do runtime, liberadas após settle | Ordem e texto originais das mensagens | cold/hot/provider com prefixo consistente; após restart do runtime aguardar a nova projeção `live` antes de consultar de novo; linhas sem Plugin não montam o catalog hook | Não recalcular o reminder histórico pelo catalog do workspace atual, não injetar o mapa de ícones em rowContext de alta frequência |

## Comportamento Compartilhado e Divergente

| Preocupação | Compartilhado entre superfícies | Deliberadamente diferente | Por que importa para esta mudança |
| --- | --- | --- | --- |
| UI/componente | `@`, 「Try now」 do topo e prompt de exemplo submetem todos o mesmo link canônico `plugin://stable-id` | `@` passa por Picker/chip; a entrada do topo apenas pré-preenche a menção; a entrada de exemplo pré-preenche também o listing prompt; `#` ainda abre apenas a conversa, `$`/símulo monetário ainda abre apenas Skills | A nova entrada não pode desativar a capacidade de candidatos antigos nem bifurcar a semântica do Agent |
| Fonte de opções | Todas fornecidas por `plugins/referenceCatalog` do workspace de destino | Rascunho usa a authority do workspace, tarefa existente usa a authority da session | Evita hot load em Session existente ou vazamento entre workspaces |
| Padrão/herança | Nenhuma seleção implícita de Plugin | Itens em conflito permanecem visíveis, mas não selecionáveis | Falhar fechado mantendo a diagnosticabilidade |
| Validação | stable ID, identifier e live capability com validação estrita unificada | MCP exige ainda connected e ao menos uma tool visível ao provider; Subagent exige declaração frozen, live profile e proveniência Plugin-root | Um hint de capability não pode contornar a visibilidade de tools nem vazar conteúdo de profile |
| Efeito de commit | Submete apenas texto Markdown canônico | 「Try now」 do topo não anexa texto; a entrada de exemplo pré-preenche também o listing prompt; o runtime só acrescenta o system reminder no lado do Agent | A UI não carrega autorização nem escolha de capability de runtime; testar não envia automaticamente |
| Persistência/recuperação | user text e reminder são ambos append-only | User visível, reminder model-only | Garante prefixo consistente em sessão quente/cold resume/fork |

## Relações da Feature

| Rank | De | Aresta semântica | Para | Condição | Por que inspecionar | Evidência |
| --- | --- | --- | --- | --- | --- | --- |
| must-inspect | plugin reference | renders-in | Composer Plugin surface | Plugin → file → session → whiteboard | Ordenação de entradas, bloqueio de seleção e inserção canônica | `MentionPlugin.tsx`, testes de UI focados |
| must-inspect | plugin reference | renders-in | Plugin Store try surface | instalado e com example prompt; elegibilidade de runtime de disabled inalterada | Construção canônica, novo rascunho padrão, sem envio automático | `PluginStoreDetailView.tsx`、`PluginsSection.tsx`、testes de new-task do Root |
| must-inspect | plugin reference | served-by | catalog service | mudança de request identity limpa primeiro e rejeita stale | Isolamento de authority | `usePluginReferenceCatalog.ts`、teste de protocolo |
| must-inspect | plugin reference | served-by | reminder injector | analisa apenas `displayInput`, interseção pela visibilidade final de tools | Evita expansão de permissão por template e falso aviso de MCP | testes de core runtime |
| must-inspect | reminder injector | persists-to | model-only history | anexado depois do user, nunca reescrito de volta | cache de prefixo do provider | testes de hydrator/provider projection |
| should-inspect | plugin reference | depends-on | workspace identity | identity usa workspaceKey, o caminho continua usado para IO | Isolamento de remote com o mesmo caminho | testes de hook/service |
| invariant-only | plugin reference | constrained-by | web remote replayable | host trusted connection decide clientMode | Não deixa o renderer forjar a fronteira de entrega | testes de connection-scope |
| evidence-only | plugin reference | covered-by | PLG01–PLG17 | catalog + matrix sincronizados | Verificação item a item | docs de conversa + testes |

## Donos de Estado e Destinos de Commit

| Estado/fato | Dono de rascunho/exibição | Dono autoritativo | Comando/service de commit | Persistência/cache | Evidência |
| --- | --- | --- | --- | --- | --- |
| Catalog do picker | React hook | catalog de workspace Agent / Session runtime | `getPluginReferenceCatalog` | apenas escopo de request, sem reaproveitamento entre identities | testes de hook/protocol |
| Link canônico de Plugin | Composer Lexical | mensagem user da conversa | `sendConversationCommandV4` / turn input | user message do session store | UI + Desktop E2E |
| Rascunho de teste da loja | Plugin detail Try now / example prompt | Root workspace action + root draft do V4 | `onCreateTask({ initialPrompt })` | root draft isolado por workspace identity; preenchimento único no composer | focados + Desktop E2E |
| Capabilities live de Plugin | Sem owner de UI | registry de Skill/MCP/Subagent do Agent runtime | injetor no início do turno | não persistidas isoladamente; fixadas no reminder na geração | testes de core runtime |
| Reminder histórico | Oculto na UI | session event store | `persistSyntheticUserNoticeForSession` | notice model-only append-only | testes de hydrator |
| Modo de entrega mobile | renderer não confiável | connection scope do host | trusted carrier | apenas metadados da cadeia de chamada, fora do texto canônico | testes de escopo de service |

## Invariantes a Preservar

| Invariante | Superfícies/modos | Prova necessária | Evidência |
| --- | --- | --- | --- |
| Plugin é apenas um hint de capability | Todas | Não dispara install/connect/OAuth, não altera permission | reminder/testes de core + template fixo |
| Texto canônico é o único portador | Composer、queue、retry/edit、mobile | Sem selection state, texto faz ida e volta literal | testes de UI/command scope/runtime |
| Histórico append-only e ponto de quebra de cache estáveis | hot/cold/fork/compact | Ordem user → reminder → assistant consistente | provider projection + testes de hydrator |
| Authority de workspace/session/remote não se cruza | local/SSH/WSL/Docker/mobile | Limpeza no primeiro frame, descarte de atrasados, repasse de identity/remoteSession | testes de hook/service |
| desktop continuous e mobile replayable não se contaminam | desktop/mobile | O valor true do host decide clientMode, host compartilhado não cria runtime | testes de connection-scope |
| Capacidade de candidatos antigos preservada | `@`、`#`、`$`、`/`、action menu | Mudanças na entrada principal `@`/`/` não removem painéis antigos | composer routing focado + E2E formal |
| Teste na loja apenas pré-preenche, não envia | Plugin detail、desktop/mobile/remote；installed enabled/disabled | Entrada do topo contém só canonical, entrada de exemplo contém canonical+prompt, provider sem nova requisição; disabled não muda o comportamento do rascunho | focados + E2E Desktop formal + PLG12/PLG15 |

## Evidências do Codegraph

| Seed | Query | Callers diretos / caminho-chave | Profundidade | Interpretação |
| --- | --- | --- | --- | --- |
| `MentionPlugin` | callers/rg | Session composer → mention providers → panel/chip | 2 | O agrupamento de UI e o bloqueio de teclado por teclado compartilham o mesmo ponto de chegada |
| `PluginStoreDetailView` / `handleUsePrompt` | callers/rg | Settings → Plugin detail Try now / example prompt → Root onCreateTask → root draft | 3 | As duas entradas da loja compartilham o segundo superfície de commit canônico, não um segundo conjunto de runtime |
| `usePluginReferenceCatalog` | callers/rg | plugins provider → workspace services → plugin management | 3 | O escopo de request é a fronteira de UI da authority do catalog |
| `injectPluginReferenceReminderFromTurn` | callers/rg | `executeTurn` → displayInput → runtime inventory → persistence | 2 | Análise canônica, interseção live e persistência pertencem ao início do turno |
| `sendConversationCommandV4` | callers/rg | renderer/adapter → connection facade → base service → CLI V4 command | 3 | Fronteira de entrega do trusted mode mobile e do payload canônico |
| `plugin_reference` | affected tests/rg | source descriptor、provider projection、hydrator、spec Desktop formal | 3 | O ciclo de vida já tem evidência de determinismo entre camadas |

## Candidatas de Drift do Grafo

| Candidata | Evidência no código vivo | Relação de grafo ausente/desatualizada | Follow-up proposto |
| --- | --- | --- | --- |
| Plugin Store try surface | A página de detalhes já tem example prompt, mas o feature graph só registra a superfície do Composer | Falta a segunda superfície de commit canônica e a relação de novo rascunho padrão | Adicionar `surface.plugin-store-example-prompt-try` e a aresta associada |

## Delta do Grafo

| Status | Nó/aresta | Razão semântica | Evidência | Ação |
| --- | --- | --- | --- | --- |
| confirmed | plugin reference → catalog service | O estado do catalog deve falhar fechado por request identity | testes de regressão de hook | Condição da aresta atualizada |
| confirmed | plugin reference → reminder service | A fonte da análise é o displayInput canônico, e o MCP se baseia na visibility final do provider | testes de regressão de runtime | Condição da aresta atualizada |
| confirmed | plugin reference → web remote replayable | O command mode vem do trusted carrier do host | testes de regressão de connection-scope | Condição da aresta atualizada |
| confirmed | plugin reference → Plugin Store try | A página de detalhes reutiliza o builder canônico e o Root para nova tarefa padrão, sem envio automático | focados + Desktop E2E | Novo nó/aresta de superfície |

## Questões em Aberto

| Questão | Respostas candidatas | Diferença de escopo | Responsável |
| --- | --- | --- | --- |
| none | Toda a semântica de produto PLG01–PLG17 já está confirmada | Nenhuma | — |

## Handoff de Planejamento

| Item | Destino | Status |
| --- | --- | --- |
| Atualização da spec | `docs/plugin-reference-mention.md` | complete |
| Catálogo de casos | `docs/conversation-session-case-catalog.md` PLG | complete |
| Matriz de cobertura | `docs/testing/conversation-session-e2e-coverage-matrix.md` PLG | complete |
| Plugin Store try | A cápsula de prompt de exemplo reutiliza a referência canônica e o Root para nova tarefa padrão | complete |
| Handoff E2E | `conversation-session-plugin-reference.test.ts` e `conversation-session-plugin-reference-subagent.test.ts` formais + `conversation-session-plugin-store-try-states.test.ts` pendente | ready |