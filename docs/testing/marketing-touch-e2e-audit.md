# Auditoria de integridade E2E da branch Marketing Touch

Data: 2026-09-12. Estado: auditoria, não conclusão de funcionalidade nem aceitação de cobertura de 95%.

## Resumo da Feature

| Campo         | Conteúdo                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------- |
| Intenção      | Verificar todas as mudanças da branch atual em relação ao staging, listando lacunas de E2E, asserçõesquebradas e a ordem de complementação |
| Branch de trabalho | `test/marketing-touch-e2e-coverage`, criada a partir das modificações locais atuais, sem push                     |
| Commit auditado | `d0028042fee3f2026a08f37365165a5255aa33ab`, incluindo commits locais de limpeza de recursos          |
| Baseline remoto comparado | `origin/staging` buscado nesta rodada: `7a01923f5824760937e09a8df85a85372bcdeb63`                   |
| Início do diff | merge-base `87d6a7b2fc32d088452334c4309f33b0f8b039b1`; diff de três pontos, 116 arquivos, +11406/-4250     |
| Capacidade    |entrega de marketing de marketing, mídia e ZIP, rich text, navegação/cópia/retirada, reporte e refresh de benefícios adjacentes                           |
| Camadas       | presentation / validation / commit-effect / recovery / cache                                    |
| Modo          | impact-only; apenas adiciona registros de auditoria, sem alterar código de negócio, asserções de teste ou casos promovidos automaticamente |
| Entrada principal | `MarketingTouchProvider` → Controller/Poller → Banner/Dialogs; serviços de Marketing/CloudContent |
| Fora do escopo desta rodada | implementação de servidor, retirada ou pagamento reais, produção de functionality de workspace de recursos externos, criação de tarefa/troca automática de modelo |

Conclusão: é preciso complementar e ajustar. Os **118/122 (96,72%)** do documento histórico são cobertura de Vitest focado da baseline antiga, não a cobertura E2E da branch atual, e não podem ser usados nesta aceitação. Os casos existentes têm um caminho principal que realmente passa, mas também há API antiga, asserçõesquebradas, poluição entre casos e caminhos de exceção ainda não executados.

## Matriz de superfície de UI

| Cenário          | Entrada de UI        | Implementação compartilhada                  | Owner de exibição               | Origem dos dados          | Portão                   | Ação de commit                        | Autoridade/persistência                     | Limite de modo                        | Isolamento obrigatório        |
| ----------------- | -------------------- | ------------------------------------------ | ------------------------------- | ------------------------- | ------------------------ | ------------------------------------- | ------------------------------------------ | ------------------------------------- | ---------------------------- |
| Banner            | WorkspaceSidebar     | MarketingBanner/VisualBody                 | Controller                      | GET banner                | recursos prontos, ready, pending | claim/open_url/navigate/copy/close | servidor de entrega e action; cache de recursos do host | Desktop/Web compartilhado; fallback de ZIP no Web | página de configurações, seleção de modelo da tarefa |
| Popup independente| Exibição automática do Shell | MarketingDialogs/CloudContentDialog         | Controller waitingPopup/dialog  | GET popup                 | página visível, sem outro modal | botões e três entradas de fechamento | servidor de entrega; estado da janela atual    | owner não recriado ao trocar de workspace | camada de validação de segurança, página de upgrade, popups existentes |
| Popup de resultado | Ação do Banner com sucesso | mesmo Dialog                        | Controller waitingResult        | success_popup do mesmoentrega | resultado prioritário, recursos prontos | novo action confirm; fechamento não repete cancel | claim é a autoridade de sucesso             | falha de refresh não inverte o sucesso    | outros Popup independentes    |
| Falha na retirada | claim no Banner/Popup | MarketingFailureDialog/Alert                | Controller error                | data.message              | não sucesso ou resultado incerto | 知道了/Esc/mascara clearError          | sem retentativa automática, sem reporte extra | componente compartilhado; tela estreita não é celular real | o Popup original deve ser restaurado |
| Configurações/loja de plugins | navigate             | páginas originais de configurações/loja    | associação de navegação + owner original | args e catálogo existente  | confirmação após o alvo assumir de fato | apenas navegação, sem salvar conexão/instalar plugin | serviço original de configurações/plugin | workspaceIdentity; sem criar outro runtime | fatos de task/modelo/conexão |
| Compra de upgrade  | navigate upgrade     | Provider/webview original de upgrade        | associação de navegação + container de compra | upgradeTarget atual      | dom-ready; recuperação em falha/cancelamento | abertura bem-sucedida é confirm, não pagamento bem-sucedido | fluxo de compra original | suportado no Desktop; falha explícita no Web | pedido/pagamento automático |

```text
HTTP GET(seq) -> schema -> autorização/download/verificação de recursos -> candidato atual do Controller
                                           +-> Banner -> snapshot de ação/anti-duplo clique
                                           +-> waitingPopup -> portão de modal -> Dialog
ação -> verificação de segurança/capacidade do host -> resultado explícito -> confirm ou dica de erro
fechamento -> fechamento da instância atual -> cancel (exceto o fechamento do popup de resultado)
conta/idioma/desinstalação -> geração antiga inválida -> resposta atrasada não pode restaurar a UI nem reportar com novas credenciais
próximoentrega com o mesmo ID -> ainda cabe ao servidor decidir se exibe, sem blacklist local de histórico
```

## Comportamento compartilhado e divergente

| Ponto de atenção | Compartilhado                          | Divergência intencional                                 | Requisito de auditoria                          |
| ---------------- | -------------------------------------- | ------------------------------------------------------- | ----------------------------------------------- |
| UI               | VisualBody, renderização segura de texto, Button | Banner 96px, ignora theme do botão; Dialog suporta theme | não usar Hero de sucesso no lugar da aceitação do Banner de vídeo/estilo |
| Origem de dados  | Marketing GET DTO                      | success_popup é fixo como snapshot da operação        | o refresh do saldo após a retirada não pode sobrescrever os dados de resultado |
| Defaults         | locale/theme fornecidos pelo App       | Banner com format vazio é válido, no Popup não é válido |(parse)독립 de mistura deentrega válido/inválido        |
| Validação        | autorização do host, resumo, descompressão segura | bundle Web não acessa loopback do Desktop | recursos com falha e fallback entre plataformas precisam disparar de verdade |
| Efeitos colaterais | pending por operação, confirm/cancel   | copy é preservado; navigate fecha; close do resultado não reporta cancel | cada ação asserida pelo critério real de sucesso |
| Recuperação      | generation/liberação de lease          | falha de rede mantém o conteúdo por pouco tempo, resposta vazia remove | não contar como cobertura apenas a execução banal do Happy Path |

## Relacionamentos da Feature

| Nível            | Origem → destino                                                           | Semântica/condição                        | Motivo e evidência                                                    |
| ---------------- | -------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------- |
| must-inspect     | Root/Sidebar → MarketingTouchProvider                                     | owner único por janela                    | diff de Root e WorkspaceSidebar nesta branch                          |
| must-inspect     | Provider → Controller/Poller → Service                                    | identity, query, report                   | a implementação atual tem geração e refresh por evento; precisa validar sequência, serialização e resposta atrasada |
| must-inspect     | Service → AssetRegistry → BundleCache → iframe                            | autorização, download, lease, handshake    | ZIP de sucesso já tem E2E; as exceções são principalmente unitárias |
| must-inspect     | navigate → SettingsPage/ModelProviderSection/PluginStorePage/Upgrade       | confirmação do alvo, não basta o dispatch | a localização de modelo no E2E existente realmente falha            |
| should-inspect   | claim → refresh de benefícios/conta                                      | melhor esforço, mas o refresh precisa realmente executar | o Provider ainda acessa um modelProviderService inexistente          |
| invariant-only   | shared-host/remote/task runtime                                           | reusa a entrada de serviço, sem adicionar Agent | diff de registro em remoteServiceAccess e services/node; sem evidência de execução multiplataforma |
| evidence-only    | Unit/documentos antigos de coverage/fixture de recursos                    | explica o caminho, não substitui E2E      | os 96,72% antigos têm métrica diferente da atual                      |

## State Owners e Commit Sinks

| Estado        | Owner de exibição          | Owner autoritativo       | Ponto de commit                             | Persistência/cache                     | Evidência                                  |
| ------------- | -------------------------- | ------------------------ | ------------------------------------------ | -------------------------------------- | ------------------------------------------ |
| Elegibilidade deentrega | candidato atual do Controller | servidor            | GET /marketing/touch                        | não grava conjunto de dedup de histórico | marketingTouchController.ts                 |
| seq            | sem owner de UI            | contador de módulo do processo de serviço | atribuído antes do GET real             | não persiste                           | marketingTouchService.ts                    |
| Ação atual     | Controller.pending/phase   | resultado do claim ou da capacidade do host | Provider.execute                  | fixa candidate/scope                   | MarketingTouchProvider.tsx                  |
| Reporte        | scope da operação atual    | action do servidor        | Service.report                              | sem retentativa automática              | Controller + marketingTouchService.ts       |
| Recursos       | estado ready do iframe      | autorização de publicação e hash | readPublishedMedia/prepare/release      | cache do host-instance + lease          | cloudContentService/contentBundleCache      |
| Navegação      | associação marketingNavigation | sinal de conclusão da página de destino | finishMarketingNavigation          | estado original da página de configurações, sem nova config de modelo | marketingNavigation/Settings/PluginStore |

## Auditoria caso a caso dos casos atuais

As duas specs de marketing estão em `packages/desktop/test/e2e/ui-shell/manual-review/pending/`. A de delivery tem 16 `it`, a de entitlement tem 1. Vários case ID escritos em um único título não equivalem a vários testes independentes.

| Escopo           | setup/action/assertion existentes                                                              | Faltando ou ajustando                                                                                                                                    | Prioridade |
| ---------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Popup inicial    | MTC-01: Popup independente por padrão → botão de fechar conteúdo → cancel exatamente uma vez | validar separadamente o X do canto superior direito, o Esc e a máscara; hoje apenas se checa o estilo do X, sem clicar no X para verificar o reporte                                             | P0        |
| Retirada no Banner | MTC-03: HTTP/PNG/ZIP reais, success na verificação de segurança, claim pendente → loading → success/confirm | duplo clique rápido, cancel/error na verificação de segurança, não logado, timeout de submissão, falha/indeterminação explícita; não substituir a contagem de submissão de duplo clique por asserção de estilo disabled | P0        |
| Refresh após claim | Popup de success visível                                                                    | é preciso asserir que o refresh real de conta/benefícios foi chamado e que a projeção foi atualizada; injetar também falha de refresh e confirmar que não inverte o claim                                    | P0        |
| Reentrega do mesmo ID | espera normal de 30s após sucesso e após fechamento; depois contagem de fechamento; reentrega do Popup independente |entrega contínuo do mesmo ID não empilha; GET antigo/recurso lento concluído não pode ressuscitar conteúdo fechado                                                                                       | P0        |
| Polling          | espera normal de 30s, aceleração com online                                                | recuperação de hidden, coalescência de requests lentos concorrentes, backoff de falha, remoção por array vazio, expiração de dez minutos, reconstrução de identidade/idioma; os 600s de produção não podem ser substituídos pelos 30s de teste | P0/P1    |
| seq/cabeçalhos   | unitário do serviço tem primeira/concorrente/falha/anônima                                 | o fixture registra apenas o pathname e perde query/headers; adicionar um razão sanitizado de method/seq/existência de cabeçalho, validando início em 0, crescimento mesmo em falha e que POST não ocupa sequência                    | P0        |
| Confiabilidade do reporte | sucesso, fechamento de conteúdo, múltiplos confirm/cancel de cópia                        | anônimo, 500 de reporte/desconexão sem bloquear a UI e sem retentativa, troca de conta sem pegar novo token, X/Esc/máscara do resultado sem cancel repetido                                            | P0        |
| Cópia            | MTA-01 texto original/quebra de linha/literal HTML, cópia repetida, sem SVG, preservado; MTA-06 falha de permissão | teste de falha contaminado pelos casos anteriores; duplo clique com copy pending, resultado incerto após 10s, conta antiga atrasada, não preencher input/criar tarefa por engano                                 | P1        |
| Navegação em Settings | MTA-02 aparência; MTA-03 todas as 14 seções                                              | seção padrão/última usada, reuso do alvo existente, sem criar nova tab de configurações; sem efeito colateral deve ler a estrutura de conexão real atual                                                | P0/P1    |
| Localização do provedor | MTA-05 provedor especificado e provedor ausente                                                | usa o builtin:bigmodel antigo, incompatível com o contrato de navegação atual; a leitura do snapshot de conexão em campos já removidos pode passar de forma falsa (undefined contra undefined); adicionar family/account/custom atuais, carregando e caminho inexistente | P0        |
| Loja de plugins   | homepage, detalhe do primeiro item do catálogo, erro sem reporte quando inexistente           | o catálogo precisa de conteúdo fixo local ao case; mesmo em dois sucessos conferir o campaign confirm a cada vez; sem mudança em configuração/instalação/tarefa; mesmo caminho com workspaceIdentity diferente não pode confirmar errado | P1        |
| Página de upgrade | MTA-07 webview visível, confirm uma vez, fechamento não acrescenta                        | não pode confirmar antes do ready; recuperar o Popup original em falha de carregamento/fechamento antecipado/timeout; sem suporte no Web; manter a regressão da entrada de upgrade comum original                                          | P0/P1    |
| Banner ZIP        | MTC-BUNDLE ready, dados/tema, 96px/94px, pointer-events, copy/close, contador de downloads sem aumento | depende de baixar o ZIP antes e de entrar em Settings antes; devem se preparar sozinhos. Complementar com cache frio/cache quente do mesmo SHA/SHA diferente/liberação de lease; downloads sem aumento não provam sozinhos que não houve reextração | P0        |
| Segurança ZIP/Hero | ZIP normal/invertido/replay                                        | hash errado, não autorizado/redirecionado, entry ausente, caminho malicioso/tamanho acima do limite, ready/error/timeout/mensagem falsificada; rede/fallback/lease devem passar pelo fluxo real do host                                                 | P0/P1    |
| Dialog de falha   | MTC-FAIL tradução do serviço e fallback em branco, sem título/X visível, Info, tema/358px, 知道了 sem reporte | restaurar o Popup original após falha de retirada dentro do Popup; Esc/máscara sem retentativa; code ausente, número/string, HTML malicioso em texto puro; rolagem de texto longo e retorno de foco                                                                 | P0/P1    |
| Rich text        | MTC-RICH title HTML/description Markdown/botão; MTC-HTML prioridade de class/style e outline | links/tabelas/código em Markdown, HTML/URL/style seguros, título/botão inline e sem interação aninhada; class desconhecido preservado não significa que qualquer Tailwind vale                                                                 | P1        |
| Mídia            | Banner MP4 ready/play/loop/muted/96px                                                   | controls do Hero em vídeo, pausa em hidden/reduced-motion, fallback de falha de decodificação, imagem dark; Lottie pertence ao ramo de componente compartilhado, mas o DTO de Marketing não a envia, então é um limite inalcançável listado à parte                                    | P1        |
| Visual/acessibilidade | raio de canto CSS/hit-test, saveScreenshot; tema claro e escuro alterando class localmente e contêiner de 358px | raio de canto da camada de composição nativa da janela com revisão manual; viewport real, Tab/Enter/Escape/foco, troca real de locale; largura local não conta como aceitação de celular/Web                              | P1        |
| Benefícios e conexão | entitlement um case longo faz seed de claim por HTTP direto e depois valida saldo/Start/Individual/Subagent | 5 erros de tipo de API antiga; seed/reset independentes; não é evidência de refresh pós-Banner; usar structured selection atual e separar cenários de falha para localizar                                                                 | P0        |
| Lógica de aposentadoria | a entrada antiga de preview não existe mais, sem request a /billing/preview              | a spec oficial original foi removida e o novo pending é excluído por padrão; a regressão oficial não pode sumir silenciosamente no CI. Após confirmação manual, promover pelo fluxo de promotion                                                                               | P0        |
| Registro e saída | alterações em services/node, RemoteServiceAccess, dispose de cache                    | limpeza de recursos ao sair do App/Host dispose; suporte e fallback em remote/Web; sem bloqueio de histórico entre janelas; rodar em uma única janela não prova multiplataforma                                        | P1        |
| Build/fixture    | bundle/tsup/wdio/mock generator e lockfile também mudaram                             | listar separadamente como build/teste de contrato, sem contar na taxa de código E2E de negócio; gerar fixtures de ZIP/HTML não equivale à aceitação do pacote de recursos externo oficial                                                     | P1        |

## Invariantes que devem ser preservados

| Invariante                                        | Escopo          | Prova obrigatória                          | Situação atual                    |
| ------------------------------------------------- | --------------- | ------------------------------------------ | -------------------------------- |
| O servidor decide a exibição, o mesmo ID pode ser reentregue | Banner/Popup | reentregar o mesmo ID, operar e reportar    | caminho principal passa de verdade |
| Só há confirm com sucesso explícito, request de escrita não tem retentativa automática | todas as ações | ledger + falha/timeout + UI  | existe no caminho normal; lacuna de exceção entre processos |
| Navegação não troca conexão/modelo, não instala plugin nem cria tarefa | Settings/Market | campos reais persistidos atuais e ledger de comandos | asserções de campo antigo correm risco de não provar nada |
| Recurso é verificado antes; resultado atrasado não restaura a UI antiga | Media/ZIP | recurso lento/morto controlável + Host/DOM | principalmente unitário, E2E incompleto |
| Desktop continuous e celular replayable não se espalham | remote/task | regressão representativa de shared-host/rota de identidade | multiplataforma não rodou, não inventar aprovação |
| Isolamento de case, falha não polui o case seguinte | todo o E2E | execução isolada e combinada idênticas | poluição contínua já observada nesta rodada |

## Evidência de codegraph

Não há ferramenta de codegraph disponível, então a varredura de impacto por índice não foi executada nesta rodada. Foram usados `git diff`, busca precisa de símbolos/chamadores e leitura de código por trecho; não é prova de grafo de chamadas completo.

| seed                       | Consulta alternativa | Caminhos confirmados                                     | Profundidade | Limitação                             |
| -------------------------- | -------------------- | -------------------------------------------------------- | ------------ | ------------------------------------- |
| MarketingTouchProvider     | diff + rg + código    | Root/Sidebar → Provider → Controller/serviço             | 2            | não enumerou todos os ambientes de execução |
| prepareMarketingHero       | rg + código           | Provider → resources → CloudContentService → cache      | 3            | não percorreu todos os ramos de segurança com falha em E2E |
| requestMarketingNavigation | diff + código          | Provider → configurações/loja/upgrade → finish         | 2            | a migração atual do provider bloqueia parte dos destinos |
| disposeServiceResources    | diff                  | liberação do serviço do Host → CloudContent.dispose    | 2            | precisa de validação do comportamento de saída |

## Candidatos a Graph Drift

| Item                            | Evidência atual                          | Relação obsoleta                              | Seguimento                                        |
| ------------------------------- | ---------------------------------------- | -------------------------------------------- | ------------------------------------------------- |
| start-plan-manual-claim surface | Banner/ResultDialog antigos removidos     | o graph ainda referencia arquivos antigos e caminho de guide | substituir pela surface de Marketing, sem restaurar seleção automática de modelo |
| cloud-content-preview           | entrada de preview do App removida        | o graph ainda referencia componente de preview/mock antigo | remover a relação da entrada aposentada            |
| nós de evidência de teste       | nova spec está em pending                 | E2E oficial antigo/unitário do Banner antigo | atualizar para a evidência atual, indicando pending |
| relação de capacidade de marketing | cadeia de confirmação atual Settings/Market/Upgrade | não descreve por completo o novo destino e a recuperação de falha | complementar a relação, sem tratar seleção de UI como conexão persistida |

## Graph Delta

Nesta rodada apenas proposed: adicionar/corrigir as arestas de Marketing Banner, Popup independente, Dialog de resultado/falha, lease de recursos, confirmação de destino de navegação e reporte; remover as arestas aposentadas de preview/guide automático. A base é o diff/código atual e os limites de navigate/copy_text já determinados pelo usuário. Esta rodada não altera o feature graph.

## Métrica de 95% e ordem de implementação

1. O denominador é congelado nas linhas de código-fonte de negócio executáveis adicionadas/modificadas entre merge-base e o HEAD auditado, incluindo UI, shared schema, services e registro do client. Arquivos excluídos entram em regressão à parte e não contam no denominador de linhas novas. Testes, documentação, dados de tradução, tipos/declaração puros, scripts de build e pacotes de recursos externos são reportados separadamente.
2. Coletar apenas dados de Renderer/Host/Main/CLI de E2E real do App; não misturar Vitest. Funções/ramos por domínio são listados separadamente e não se pode combinar statement ID de instrumentações diferentes.
3. Instrumentação ausente, source map ausente ou dados de processo ausentes são marcados como unknown, sem contar como cobertos nem ser removidos em silêncio do denominador. Código inalcançável na entrada de Marketing, como o Lottie compartilhado, deve ser listado explicitamente, sem injetar execução da função de negócio dentro do teste só para chegar a 95%.
4. Primeiro corrigir API antiga e fixture/reset local ao case, depois complementar os P0 e realmente executar; só quando setup/action/assertion de cada caso se sustenta é que se registra cobertura de comportamento junto com cobertura de execução. Uma linha coberta atravessada por um teste que falha também não equivale a aceitação da funcionalidade.
5. A partir das linhas/funções/ramos não cobertos, complementar os P1 em sentido inverso. Sugerem-se limiares de linha do diff ≥95%, função do diff ≥95% e ramo do diff ≥95%; confirmar primeiro o denominador e os limites inalcançáveis e listar separadamente o que não atingiu, sem reportar apenas o maior deles.
6. Reexecutar de forma isolada e combinada várias vezes, revisar os screenshots e então promover conforme a skill, seguindo para o CI oficial. Não remover ramos de segurança, restaurar semântica antiga de produto nem afrouxar asserções de negócio para passar.

A implementação precisa atualizar primeiro o case catalog/coverage matrix, depois escrever os testes que falham e então alterar a implementação; nesta rodada nada foi implementado. Os erros de tipo conhecidos são problemas da branch candidata atual e não devem ser descartados como "erros preexistentes não relacionados a esta funcionalidade".

## Questões em aberto

| Questão                      | Tratamento possível                                          | Diferença de escopo                                       | Decisor     |
| ---------------------------- | ----------------------------------------------------------- | --------------------------------------------------------- | ----------- |
| Implementar direto após a auditoria | auditar a lista primeiro / aprovar a complementação P0/P1 e as correções de produto necessárias | a segunda opção altera testes e produto, e esta rodada só audita | usuário    |
| Limiar final de 95%          | atingir em linhas/funções/ramos, ou especificar explicitamente uma métrica | deve ser fixado antes da implementação, sem encolher o denominador depois | usuário/equipe |
| Multiplataforma real          | CI Windows/Linux + via Web/celular, ou listar explicitamente como pendente de aceitação | não se pode substituir por layout estreito no macOS       | equipe      |

## Handoff de planejamento

impact-only; nesta rodada não se modifica spec de produto/testes nem promotion automática. Plano seguinte: primeiro protocolo/isolamento/bloqueios de API, depois comportamento e relatório de P0, depois P1 e validação de plataforma e, por fim, aceitação manual/promoção.

## Evidência de execução desta rodada

### Portões estáticos e problemas localizáveis

| Verificação                                    | Resultado desta rodada                                       |
| ---------------------------------------------- | ------------------------------------------------------------ |
| workspace freshness                           | passou; o novo branch de teste não tem upstream              |
| `pnpm typecheck`                              | falhou, 9 erros, detalhes na tabela abaixo                    |
| `pnpm --filter @zcode/desktop typecheck:e2e`  | falhou, 5 erros de API antiga no E2E de entitlement           |
| `pnpm lint`                                   | 0 errors / 45 warnings; nenhum código foi alterado para remover warnings existentes |
| `pnpm architecture:check --changed`           | 0 violations                                                  |

| Posição                                                       | Causa e verificação complementar                                                                                                                        | Evidência de atribuição no código                                                                 |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| MarketingTouchProvider.tsx:275、278                            | IServiceAccessor não tem modelProviderService; a chamada de refresh pós-sucesso ainda usa a API antiga. O caso atual de retirada só assere o popup de sucesso, sem validar a execução do refresh | `git blame`: `fe04f4ba330`; arquivo novo nesta branch                        |
| Root.tsx:3、357                                                | o import de RefreshCw foi removido, mas a UI de retentativa de falha de carregamento ainda o referencia. A inicialização normal não dispara esse ramo de erro; deve-se complementar com regressão por injeção de falha | `a19b8c64f11` removeu o import; visível no diff da baseline                      |
| ModelProviderSection.tsx:1121                                  | a nova correspondência de navegação lê item.provider.id; o ProviderSettingsFormProvider atual é providerId. Não basta trocar o selector do teste para mascarar o defeito no caminho de provider custom | `646cba8528f`; novo effect nesta branch                                     |
| marketing-touch-entitlement.test.ts:94、100、131、163、164     | as enumerações bigmodelCodingPlan/bigmodel e modelProviderFamilyModes/SelectedKeys não existem mais                                                            | spec de migração nova nesta branch; reproduzido no typecheck atual, sem especular responsabilidade pela migração |
| marketing-touch-delivery.test.ts:35–42、393                    | a verificação de ausência de efeito colateral na conexão lê dois campos já removidos. Hoje deve-se usar providerFamilyConnectionSelections e primeiro asserir que existe uma seleção inicial válida                                     | leitura de plain JSON contorna a checagem de TS; fato de código, não se pode afirmar que a asserção foi de fato alcançada nesta rodada e passou |

Nenhuma correção desses problemas é implementada nesta rodada; eles precisam ser tratados ao complementar os testes, e não liberados como erros não relacionados.

### E2E real

Todas as execuções usaram fixture isolado, sem retirar planos reais e sem executar pagamento. A primeira construção usou `ZCODE_E2E_COVERAGE=1` e as execuções seguintes reutilizaram a mesma construção de cobertura.

| Run ID (em `packages/desktop/.e2e-artifacts/`) | Escopo                                          | Resultado        | Interpretação                                                                                                     |
| ------------------------------------------------ | ----------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| `desktop-e2e-20260911-170338-218`                | delivery + entitlement completos, 17 casos     | 9 passaram / 8 falharam | MTA-05 falhou primeiro; os 6 delivery seguintes foram contaminados por popup antigo; entitlement reportou “模型供应商设置没有 BigModel 导航项: missing” |
| `desktop-e2e-20260911-171040-787`                | com pré-requisitos necessários, pulando a localização de modelo, 9 casos | 4 passaram / 5 falharam | MTA-06 passou isolado, o que prova que a falha da primeira rodada era contaminação; MTA-07 ainda aguardou timeout do contador de eventos (35s) e os 4 seguintes sofreram obstrução residual |
| `desktop-e2e-20260911-171255-869`                | com pré-requisitos, pulando localização de modelo e página de upgrade, 7 casos | 7/7 passaram     | ZIP Banner, Dialog de falha, Markdown/HTML e Banner MP4 podem passar; não é aprovação do conjunto todo                |

Após a deduplicação das três rodadas: dos 17 testes existentes, 14 passaram pelo menos uma vez e 3 continuam sem passar (localização de modelo, confirmação de upgrade, conexão de entitlement). **14/17 é resultado de execução de casos, não cobertura de código.** Não se substitui a aprovação de estabilidade do conjunto pela passagem isolada, e as três rodadas não alteraram testes nem código de produto. O log da terceira rodada é `/tmp/zcode-marketing-e2e-audit-assets.log`.

Escopo exato da falha do caso da página de upgrade: a asserção de exibição do container já passou, mas o número esperado de eventos de action não foi atingido em 35s. Ainda não se provou que a causa raiz seja webview ready, timing do fixture ou a lógica de confirmação do produto; não pode ser atribuída diretamente a problema de pagamento/rede do servidor. Deve-se construir fixture controlável para ready/falha/timeout e manter logs correlacionados de request.

A evidência bruta é o `summary.md`, o `test-results.ndjson`, o `coverage/` e os runtime logs de cada run. Os logs de texto do CLI estão em `/tmp/zcode-marketing-e2e-audit.log` e `/tmp/zcode-marketing-e2e-audit-isolated.log`; os logs de tipo, lint e arquitetura estão em `/tmp/zcode-marketing-audit-{typecheck,e2e-types,lint,architecture}.log`. Esses artefatos locais não foram adicionados ao Git e não estão incluídos nos dados públicos do relatório.

Comando de reexecução:

```sh
ZCODE_E2E_COVERAGE=1 ZCODE_E2E_MANUAL_REVIEW=1 \
pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts \
  --spec './test/e2e/ui-shell/manual-review/pending/marketing-touch-delivery.test.ts' \
  --spec './test/e2e/ui-shell/manual-review/pending/marketing-touch-entitlement.test.ts'
```

### Integridade da cobertura

Na primeira rodada o report do Renderer está completo; os reports de Main/Host/CLI estão completos, com missing process=0. Isso só prova que os processos esperados foram coletados, não que todo o mapeamento de código-fonte é suficientemente preciso.

| Escopo do diff na 1ª rodada | Linhas             | Funções             | Ramos             | Limitação de uso                                                              |
| --------------------------- | ------------------ | ------------------- | ----------------- | ----------------------------------------------------------------------------- |
| Renderer já mapeado         | 583/896 = 65.07%   | 148/223 = 66.37%    | 479/883 = 54.25%  | inclui código atravessado por casos que falharam; não equivale a esses comportamentos aprovados |
| Mapeamento bruto do Host    | 969/1068 = 90.73%  | 37/39 = 94.87%      | 94/175 = 53.71%   | o mapeamento V8 por linha inclui linhas em branco/tipos, e não serve como denominador uniforme de linhas executáveis |
| Mapeamento bruto do Main    | 1041/1068 = 97.47% | 0/0                 | 0/0               | alguns arquivos de serviço têm hit em blocos inteiros sem função/ramo; proibido usar para completar lacuna do Host |

Por exemplo, contentBundleCache.ts tem hit em todas as 318 linhas de código-fonte no report do Main, mas registra 0 funções e 0 ramos; só o Host tem 16 registros de função e 79 de ramo. Um OR simples por linha entre domínios diferentes produziria um percentual de cadeia completo inflado, que este relatório não adota. É preciso validar primeiro o mapeamento de origem e a posse do domínio de execução e depois unificar a baseline de linhas executáveis.

Além disso, o novo manualClaimFailureMessage.ts já não tem chamador em produção e também não entrou no artefato de instrumentação do Renderer; usando o mesmo parser TypeScript/JSX Istanbul se obtêm 16 linhas executáveis, 1 função e 16 ramos, todos sem evidência de execução E2E. Não se pode remover em silêncio do denominador só porque o arquivo não foi empacotado. A falta de mapeamento em accessor.ts, services/index.ts e cloudContentDialogTypes.ts foi verificada com parser como 0 statement executável (tipos/re-exports), e não deve ser confundida com essa função de negócio legada.

Os 36 linhas já mapeados do runtime Lottie tiveram 0 hit na primeira rodada e o protocolo de Marketing não tem entrada deentrega de Lottie; deve-se primeiro decidir a entrada de regressão do componente compartilhado ou confirmar o escopo de aposentadoria, sem chamar função interna diretamente pelo teste para completar número. CSS e o HTML/JS dentro do ZIP não estão na métrica atual de instrumentação TS/JS e ficam por conta da renderização e da aceitação de recursos independentes.

No momento não é possível dar uma conclusão confiável de “E2E de todos os ramos ≥95%”. Além de adicionar testes, os pré-requisitos para atingir a meta incluem corrigir o isolamento dos testes, a API antiga, o escopo de código legado inalcançável e a métrica de cobertura entre domínios.

### Resultado combinado do Renderer nas três rodadas com a mesma construção

As duas últimas rodadas usaram `ZCODE_E2E_SKIP_BUILD=1 ZCODE_E2E_SKIP_AGENT_BUILD=1`, mantendo o mesmo código-fonte e a mesma instrumentação da primeira rodada. Só se aplicou merge Istanbul ao `coverage/coverage-final.json` do Renderer dessas três rodadas; não se misturou Host/Main nem incorporatei resultados de unitários.

Método de cálculo: `git diff --unified=0 <merge-base> d0028042fe -- <file>` extrai as linhas alteradas do lado novo e a interseção é feita com `getLineCoverage()`; funções são selecionadas pela linha de declaração inicial, ramos pelo branchMap.line (ou loc.start.line) estarem no diff, preservando a contagem de cada saída de ramo. Portanto os números de função/ramo são métricas de nós do diff, e não “qualquer linha alterada da função traz a função inteira”. Campos removidos ou JSX/imports sem statement próprio ainda exigem regressão de comportamento e não podem ser dispensados por métrica 0/0.

| Métrica       | Denominador do diff já executado/mapeado | Cobertura     | Para atingir 95% só com o denominador já mapeado ainda faltam |
| ------------- | --------------------------------------- | ------------- | ---------------------------------------------------------------- |
| Linhas        | 653/896                                  | **72.88%**    | 199 linhas                                                       |
| Funções       | 164/223                                  | **73.54%**    | 48 funções                                                       |
| Saídas de ramo | 546/883                                 | **61.83%**    | 293 saídas                                                      |

Essas são evidências de limite superior de cobertura de execução, incluindo código atravessado por fluxos que falharam; não significam que as asserções correspondentes passaram e não cobrem as 16 linhas da função legada de texto de falha que não foi empacotada. Incluindo esse arquivo com zero hit no denominador, linhas/funções/ramos passam a 653/912, 164/224 e 546/899, o que só piora os números. A quantidade de lacunas na tabela também não é a quantidade de casos novos e não há promessa de que um número fixo de testes basta para atingir a meta.

Script de cálculo e dados temporários detalhados: `/tmp/zcode-marketing-diff-coverage.cjs` e `/tmp/zcode-marketing-diff-coverage-union.json`. A evidência persistida bruta está nos JSONs de coverage dos três runs; o script apenas lê Git/coverage e não chamou função de produto. A soma por linha entre domínios do JSON temporário não passou pela revisão de métrica descrita acima e **não pode ser usada como percentual de aceitação**; este relatório usa apenas o resultado de domínio único `domains.renderer`.

Resultado de mapeamento por arquivo (prefixo de caminho `packages/ui/src/`; 0/0 significa que não há o nó de diff correspondente, não que a funcionalidade esteja dispensada):

| Arquivo                                                      | Linhas   | Funções | Saídas de ramo |
| ------------------------------------------------------------- | -------- | ------- | -------------- |
| `Root.tsx`                                                   | 0/0      | 0/0    | 0/0           |
| `SettingsPage.tsx`                                           | 8/9      | 3/3    | 8/10          |
| `WorkspaceSidebar.tsx`                                       | 1/1      | 1/1    | 0/0           |
| `components/cloud-content-dialog/CloudContentDialog.tsx`     | 42/48    | 12/15  | 52/71         |
| `components/cloud-content-dialog/CloudDialogDescription.tsx` | 25/39    | 6/9    | 34/58         |
| `components/cloud-content-dialog/CloudDialogHero.tsx`        | 59/72    | 23/26  | 37/63         |
| `components/cloud-content-dialog/CloudDialogMediaHero.tsx`   | 12/70    | 4/21   | 12/59         |
| `components/cloud-content-dialog/cloudDescriptionStyle.ts`   | 34/38    | 4/5    | 40/62         |
| `components/cloud-content-dialog/cloudLottieRuntime.ts`      | 0/36     | 0/3    | 0/43          |
| `components/cloud-content-dialog/useCloudHeroEnvironment.ts` | 14/14    | 5/6    | 3/7           |
| `components/marketing-touch/MarketingBanner.tsx`             | 6/6      | 3/3    | 20/24         |
| `components/marketing-touch/MarketingDialogs.tsx`            | 22/25    | 8/10   | 27/28         |
| `components/marketing-touch/MarketingFailureDialog.tsx`      | 1/2      | 1/2    | 0/2           |
| `components/marketing-touch/MarketingTouchProvider.tsx`      | 136/158  | 33/38  | 92/122        |
| `components/marketing-touch/marketingPopupAdapter.ts`        | 12/13    | 3/4    | 21/24         |
| `components/marketing-touch/marketingResources.ts`           | 52/78    | 13/19  | 22/59         |
| `components/marketing-touch/marketingTouchController.ts`     | 125/158  | 19/22  | 108/150       |
| `components/marketing-touch/marketingTouchPoller.ts`         | 21/32    | 6/9    | 11/20         |
| `lib/marketingNavigation.ts`                                 | 30/31    | 7/10   | 8/12          |
| `settings/CodingPlanEmbeddedWebviewDialog.tsx`               | 3/5      | 0/0    | 0/0           |
| `settings/CodingPlanUpgradeDialog.tsx`                       | 0/0      | 1/1    | 0/0           |
| `settings/CodingPlanUpgradeDialogProvider.tsx`               | 19/23    | 4/8    | 7/16          |
| `settings/ModelProviderSection.tsx`                          | 13/18    | 4/4    | 15/20         |
| `settings/PluginStorePage.tsx`                               | 18/20    | 4/4    | 29/33         |