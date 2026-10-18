# Matriz de cobertura E2E de Model e Reasoning Effort do Subagent

Este documento registra o escopo de aceitação automatizada das coberturas de modelo embutidas `general-purpose` / `Explore`. A semântica de produto dessa funcionalidade está em [cobertura de modelo embutida do Subagent](../subagents-built-in-model-overrides.md).

## Abreviações

| Abreviação | Spec |
| --- | --- |
| `SB` | `packages/desktop/test/e2e/conversation-session/conversation-session-built-in-subagent-model-overrides.test.ts` |
| `SX` | `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-subagent-runtime-catalog-reasoning.test.ts` |
| `SL` | `packages/desktop/test/e2e/subagent-coding-plan-login-catalog-stale.test.ts` |
| `SM` | `packages/desktop/test/e2e/start-plan-manual-claim-experience.test.ts` |
| `SE` | `packages/desktop/test/e2e/settings/settings-subagent-create-edit-persistence.test.ts` |
| `SS` | `packages/services/test/subagentsService.test.ts` |
| `SU` | `packages/ui/test/subagentsSection.test.ts` |
| `TC` | `packages/ui/test/thoughtLevelCycleControlSelectionValue.test.ts` |
| `SC` | `apps/zcode-cli/packages/core/tests/subagent-explore.test.ts`、`apps/zcode-cli/packages/core/tests/subagent-profile.test.ts` |
| `BT` | `apps/zcode-cli/packages/bootstrap/tests/subagents.test.ts`、`apps/zcode-cli/packages/bootstrap/tests/runtime-config.test.ts` |
| `RM` | `apps/zcode-cli/packages/bootstrap/tests/runtime-model-metadata.test.ts` |

## Lista de cobertura

### Aceitação de continuação do G04-A do Todo103

- BSM-18/SE-03: mantém a seleção indisponível, mas o gatilho de edição mostra "选择模型"; não restaura candidatos antigos nem escreve no arquivo original. No Pro `desktop-e2e-20260909-143258-266`, SE-03 passou.
- Frescor dos candidatos: `useModelSelectionServiceView` público de leitura inicial/notificação/remontagem; não restaura a antiga re-verificação forçada por Family/store.
- Isolamento de membros Start/Individual/API Key do mesmo endpoint: `packages/provider/test/resolver.test.ts`;
  esse teste substitui o antigo teste de agregação do modelProviderServiceStorage, já removido, e não restaura sua antiga fonte de dados.

### Aceitação de continuação da cobertura de plugins do G04-B do Todo103

- SE-04 (a spec oficial já existe no staging `dbb3ec0ce8`, portanto é migração e não nova promoção): o judge é visível no cache oficial;
  ao selecionar o modelo inline, grava o `pluginAgentModelSelectionOverrides` completo e pega o nível mais alto, e depois muda para high para verificar que não está só repetindo o valor padrão;
  a linha do plugin continua sem acesso ao formulário de edição e os bytes do Markdown do plugin não mudam. No Pro `desktop-e2e-20260909-150213-807`,
  SE-02/04 passaram 2/2; ao mesmo tempo cobre a primeira entrada em cache totalmente novo, sem exigir que o usuário atualize manualmente.
- SU: controles compartilhados entre embutido e plugin; o plugin chama o salvamento estruturado pelo agentId estável; não usa os dois campos antigos.
- SS/BT: descoberta do padrão oficial sem registro de instalação, prioridade entre instalar/desabilitar/suprimir, ID estável, cobertura tanto do nome canônico quanto do alias,
  model-only sem herdar o effort original, limpeza voltando ao padrão do plugin e importação em cold load, todos verificados por teste com arquivos temporários reais.
- Não expandir para atualização a quente em execução nem para semântica remote/replayable; a entrada de seleção válida do Todo99 para profile existente permanece inalterada.
- PLM-LC-020: além da evidência de salvamento de UI do SE-04, acrescentar o ciclo completo de requisição de cold start do judge oficial; primary/max no pai, alternate/high no filho, evitando que herança errada ou queda para o nível padrão passem por engano. A fixture local e a evidência de requisição do novo case pending ficam guardadas à parte, e não se alega cobertura de celular ou de atualização a quente.

### Aceitação das novas decisões do Todo97 (2026-09-08)

- SA97-04: na criação e edição de usuário/projeto do SE só se grava `model` / `thoughtLevel`, e o JSON interno de cobertura continua estruturado; no Pro `desktop-e2e-20260908172422561-p96860-3f1d8f499a4468d5`, os três itens de SE e os quatro itens oficiais SB/I20 passaram. O SB já está no diretório oficial, portanto o estado pending da tabela histórica abaixo não se aplica mais ao SB; isso não promove nenhuma outra spec candidata.
- SA97-01/03/07/09: teste de arquivo compartilhado e integração de inicialização Host/Agent cobrem migração no lugar do diretório de usuário, preservação dos bytes originais, concorrência e falha de escrita; projeto/plugin não são reescritos e não há mais conversão de profile inteiro em memória para ID.
- SA97-05/06/08: remover os ramos intermediários de `modelSelection` do Markdown; os dois mapas antigos do JSON embutido são migrados em disco antes da leitura oficial; o novo campo JSON vazio não relê o valor antigo.
- A afirmação histórica do I20 abaixo de que "Markdown customizado preserva o thoughtLevel antigo conflitante" foi substituída pelo Todo97: `thoughtLevel` já é um campo oficial, e não se fabricam mais amostras de compatibilidade de estados intermediários não publicados. A nova aceitação usa apenas identidades de Provider realmente publicadas.

| ID | Estado | Automação | Asserções |
| --- | --- | --- | --- |
| BSM-01 | covered | SS、SU | Settings/service consegue salvar a built-in model override de `general-purpose` / `Explore` e limpar voltando ao padrão |
| BSM-02 | covered | SU | O subagent embutido só mostra o controle de modelo, sem liberar edit, delete, enabled switch nem edição de prompt/tools |
| BSM-03 | covered | BT、SC | O bootstrap lê o estado de subagent existente e injeta as built-in overrides no runtime config e no built-in profile |
| BSM-04 | partial | SC、SB | O core já provou que o child de `general-purpose` usa o modelo sobrescrito; o SB de desktop continua em manual-review/pending e não conta para o gate de E2E padrão |
| BSM-05 | partial | SC、SB | O core já provou que o child de `Explore` usa o modelo sobrescrito; o SB de desktop continua em manual-review/pending e não conta para o gate de E2E padrão |
| BSM-06 | covered | SC | Os allowed tools do `Explore` são calculados com o child model efetivo final; o ramo de capacidade WebSearch nativa é coberto pela fake connection do core |
| BSM-07 | partial | SB | A spec candidata cobre a reexibição em cold start, o modelo principal da continuation pai e o ramo de tools do Explore; só conta como cobertura E2E padrão depois de promovida de manual-review/pending |
| BSM-08 | partial | SC、SB | O schema `Agent` visível ao provider não declara `model`; quando versões antigas passam `model` adicional, o runtime descarta o campo e o child continua usando o modelo do profile atual; o SB de desktop continua em manual-review/pending |
| BSM-09 | covered | SS、SU、SB | Markdown customizado e estado builtin conseguem salvar, reexibir e apagar `thoughtLevel`; builtin model / effort são gravados como combinação completa em uma única escrita de service |
| BSM-10 | covered | SU、SB、SX | Modelos diferentes exibem seus próprios níveis de reasoning; trocar de modelo limpa o effort explicitamente, e a atualização do catalog não limpa; SU usa um modelo concreto sem reasoning para cobrir a ocultação do seletor em builtin/custom, e SX cobre o Claude em que o App metadata falta mas o runtime catalog é analisável |
| BSM-11 | covered | SU、SC、RM、SB | Effort histórico inválido mostra erro e impede o salvamento; o runtime rejeita estritamente níveis inválidos, sem mapeamento automático |
| BSM-12 | covered | SC、BT、RM、SB | O modelo concreto do profile usa as provider options de reasoning padrão do modelo alvo ou as explícitas; inherit continua herdando as options do pai |
| BSM-13 | partial | SB | A spec candidata já editou builtin/custom effort em janela real, conferiu JSON/Markdown e validou o efeito real via child request visível ao provider; ainda precisa ser promovida de manual-review/pending e entrar no gate de E2E padrão |
| BSM-14 | partial | SU、SX | Quando o runtime catalog dá explicitamente níveis não vazios/vazios para o modelo alvo, suporte/não suporte são mantidos; quando o campo de modelo alvo ou de capacidade falta, há fallback imediato para o App metadata, sem esperar o status do workspace; o metadata ainda não pronto na primeira vez mostra loading e valores históricos inválidos exibem o valor original. SX cobre o Claude sem App metadata mas analisável pelo runtime, e ainda precisa ser promovida de manual-review/pending |
| BSM-15 | covered | SU、SS、SE、TC | Quando builtin/custom ainda não tem effort explícito, o Select continua com o padrão efetivo como estado realmente selecionado; confirmar de novo esse nível com mouse ou teclado materializa e persiste |
| BSM-16 | covered | SE | Settings cobre as duas entradas de edição de builtin, além da criação e edição de custom de usuário/workspace; cada salvamento valida o caminho final de escopo e o frontmatter/corpo completos, e após renomear o arquivo antigo não existe mais |
| BSM-17 | covered | SE | Ao escolher só um modelo de reasoning sem mexer no controle de effort, o controle mostra o nível padrão do catalog, mas o estado builtin não ganha chave thought-level e o Markdown customizado não ganha `thoughtLevel` |
| BSM-18 | covered | SE | Depois de salvar no Custom o modelo A com effort, remove-se A das configurações de fornecedor do modelo; ao reabrir a página de edição o gatilho do modelo mostra "选择模型", o dropdown não contém A, o effort fica oculto, o salvamento desabilitado e o Markdown original permanece inalterado |
| BSM-19 | covered | SU、SL | Após o login BigModel bem-sucedido, entra-se direto nas configurações de Subagent: o effort do Coding Plan é primeiro liberado do gate de UI pelo App metadata; a divergência entre membros de modelo do App/runtime dispara ao mesmo tempo a reconciliação sob demanda do workspace alvo, mantendo `includeWorkspaceState=false`, e só então o `workspace/readState` preenche finalmente o catálogo de runtime com `high` / `max`. SU e o SL oficial passam automaticamente |
| BSM-20 | covered | SU、SL、SM | Quando Start, Individual e Team pertencem ao mesmo modo OAuth, os Subagents escolhem a conexão pelo `modelProviderFamilySelectedKeys` mais recente. Depois que o SM realmente resgata o Start e o Builtin fica ligado ao modelo do Start, ao voltar para Individual o gatilho do modelo mostra "选择模型" e o menu só exibe candidatos da nova conexão; o SL cobre a troca de Individual para Team com modelo e reasoning já existentes continuando disponíveis; o SU cobre a reconstrução agrupada de Start → Individual → Team. A cadeia inteira não depende de re-verificação forçada do catalog remoto. |

## Podagem

### Complemento de dados antigos aceito pelo Todo 88

- Selecionar ativamente um novo modelo usa o nível mais alto desse modelo; níveis históricos ausentes ou inválidos não são preenchidos automaticamente. As formulações antigas em BSM-10/15/17 de que "trocar limpa" e "só mostra o padrão, sem salvar" são substituídas por isso; o I20 verifica a persistência real do nível mais alto após a troca ativa e depois verifica o resultado da requisição com high manual.
- Depois do salvamento na página de configurações do I20 e antes do cold start, a cobertura embutida da fixture isolada é alterada para os antigos `builtInModelOverrides` / `builtInThoughtLevelOverrides` já publicados. O cold start tem de importar pelo Host, sem modificar as configurações de novo, e os pedidos reais dos três children continuam usando o modelo especificado e o nível high; o pedido do pai permanece em max.
- O Markdown customizado grava apenas os campos oficiais `model` / `thoughtLevel: high`, sem injetar estados intermediários não publicados; o arquivo fica igual antes e depois do cold start e o pedido real do child continua em high.
- Não cobrir a aplicação imediata em agente já iniciado após salvamento quente nas Settings; o agente de desktop atual é inicializado bem no começo da janela, o comportamento de salvamento quente é coberto por teste unitário de service/UI e a eficácia no runtime é coberta pela cadeia de cold start.
- Não cobrir isolamento multi-session, remote `/remote`, mobile replayable, queue, stop, edit/fork, compact ou combinações de concorrência em background.
- Não adicionar cobertura em nível de workspace; o `Explore` sem cobertura herda por padrão o modelo principal e não volta a usar lite por padrão.
- Não adicionar parâmetros de model/effort na chamada da ferramenta `Agent` em nível de chamada, nem cobrir combinações de hot update, multi-session ou estados remote/mobile.
- Não migrar nem reescrever o `Agent.model` já existente em transcripts históricos; apenas se garante que ele não participe mais da escolha de modelo de um novo child runtime.
- A paridade do runtime-catalog do Claude já confirmada adota a matriz completa e repetida, sem usar o `I20` de DeepSeek existente como cobertura representativa; o loading inicial do catalog usa um teste de UI controlado e nenhum switch de teste de produção é adicionado para o E2E.
- O E2E de CRUD das Settings não envia prompt nem verifica cold start de child, provider request ou model-io; esses comportamentos continuam com SB/SX, evitando que uma regressão de salvamento de UI se expanda para CLI/runtime.
- O SL é um gate de regressão de duas fases entre o snapshot de provider do App após o login e o runtime catalog contínuo de workspace do desktop: o App metadata garante que o controle fique imediatamente disponível e a reconciliação em background garante que o runtime catalog fique finalmente consistente; quando o runtime já tem uma declaração explícita de capacidade, ela continua prevalecendo. Remote workspace, `/remote` replayable do celular, task queue e provider request são podados.