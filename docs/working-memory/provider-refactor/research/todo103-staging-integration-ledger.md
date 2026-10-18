# Todo103: ledger de integração de escopo fixo do staging

> Em execução. Baseline recovery `f0174b57f5c9157760879d17a5ebeeacf90bb85d`, staging `790884b1ce4b990583ab40625b5f283e2169eb36`; usando o SHA completo da origem JSON como base da verificação mecânica.
> Grupos, direção sugerida e evidência factual são registrados separadamente; "planejado para manter" não é "já mantido". Commits de origem com intenções diferentes são permitidos a serem decididos separadamente.

## 1. Origem e status

[Goal completo](../steps/todo-103-staging-safe-integration.md); [lista por commit/arquivo](todo103-staging-source-inventory.json).

Lista de origem: 193 commits não-merge, 60 commits merge, 941 caminhos com mudança líquida, 950 caminhos tocados historicamente ou em conflito.235 caminhos com dupla alteração = 107 conflitos explícitos＋128 caminhos com dupla alteração mesclados automaticamente. Caminhos sem mudança líquida ainda mantêm origem histórica; não se pode concluir irrelevância apenas porque HEAD não difere.

O workspace deste trabalho é um worktree independente. O diretório default projects é outro workspace, não usado para este objetivo. Nenhuma configuração real de usuário ou dado remoto de aplicação foi modificado.

## 2. Grupos funcionais e limites que precisam ser verificados

| ID  | Função / direção da origem                                            | Interseção com o refactor atual, base do tratamento                                                                                        | Status       |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| G01 | Instalador Windows, publicação em todas as plataformas e preflight     | Manter as correções de instalação; versão mantém 3.12.0, não regredir para 3.11.x; checar empacotamento CUA, capacidade server-side e o pacote acompanhante de artefatos baixados. A restauração existente de 85/m2 precisa provar equivalência | 16 origens decididas/implementadas; aceitação de execução Windows pendente, ver seções 17/18 |
| G02 | Help config, skills internas, portões de arquitetura do repositório     | Manter funcionalidades sem conflito; novos portões não podem esconder violações do refactor; não tratar criação de MR não solicitada como autorização automática de escrita externa | Decidido/retido em lote; evidências do portão ver §37 |
| G03 | Ciclo de vida CUA, remoção de canário, ícones de plugin                  | Reconectar pelos limites de serviço atuais; upgrade de producer só pode usar ferramenta atômica, sem editar SHA manualmente; fecho de recursos local / remote e de plugin | Reconectado/build e testes unitários; ver §25/38 |
| G04 | Disponibilidade de Subagent, cobertura de modelo por plugin             | Intenção da função de configurações de plugin mantida; protocolo / uso interno usa ModelSelection, seleção explícita reaproveita 99, herança implícita não muda; não escrever Markdown de plugin | Duas origens implementadas/revisadas; regressão final de integração pendente |
| G05 | Recuperação de tarefa apagada no Bot, erros de envio Feishu               | Bot vinculado à Session como única verdade, comandos públicos / resolução de seleção válida sem regredir; manter nova recuperação e dicas de erro | Implementado, revisado no grupo; ver §20 |
| G06 | Default global do Wiki, roteamento remote e sincronização de lane       | 94 limite de saída, 97 migração única, 99 fato do Worker sem regredir; não restaurar leitura formal do antigo Provider store / generationModel nem um segundo conjunto de sincronização de envio | Reconectado; Pro Wiki passou, ver §23/38 |
| G07 | OffPeakCreate/List na sessão, card de cauda de turno e edição           | Ticket vinculado não é remapeado entre contas; Session vinculada separada da escolha de execução ociosa deste ciclo; conferir cadeia completa de novo protocolo / evento / permissão / armazenamento | Reconectado; OP10 e despacho vinculado OP-CHAT-02 passaram, ver §41/42 |
| G08 | Isolamento de requisição, cancelamento, timeout e retry da verificação de segurança da versão oficial | Manter comportamento do desafio de segurança; não ressuscitar catálogo antigo de workspace, bypass de auto-recuperação; manter prompt preciso de teste de conexão e confirmação de aplicação do 99 | Reconectado; quatro cenários Pro passaram, ver §26/31/39 |
| G09 | OAuth expirado, stale401, isolamento de endpoints candidatos             | Resposta expirada não pode deslogar novo login; limites entre camadas de config / Account / OAuth não se sobrescrevem; erro não se passa por ausência de direito | Cinco origens decididas/implementadas/revisadas; Pro 2/2, ver seção 19 |
| G10 | Resposta de plano, tempo de resgate, entrada de compra e telemetria; remoção de fluxo de compra morto | Manter prompt de mudança de status do 93＋CTA manual, owned plans completo não iguala current; remover fluxo morto não pode apagar entrada em uso; nova telemetria adapta o fato de Account | Reconectado; Pro resgate/compra/responsivo passaram, ver §35/38 |
| G11 | Compartilhamento de conversa / Web share                                   | Manter função independente; checar novos contratos de Session / ModelSelection, limite de privacidade, recursos e dependências, versão; não iniciar outro Host de smartphone | Reconectado/revisado no grupo; publicação pública não executada, ver §31/41 |
| G12 | Feedback de negação de permissão, campos de roteamento, side chat / lembrete de fork | continuous/replayable, CommandInbox, execução congelada e isolamento de workspaceIdentity; proibir refluxo de campos antigos de modelo do protocolo para execução formal | Mantido/revisão de protocolo; Pro permissões 5/5, ver §41 |
| G13 | Subagent / usage / stop / telemetria de erros                            | Manter classificação, primeiro settlement, atribuição de erro de baixo nível; model id / provider id usam a estrutura atual; mascaramento e não-duplicação de reporte | 10 origens implementadas/revisadas; regressão final de integração pendente |
| G14 | Amostragem de memória, retenção de eventos de Session, liberação de subtask em background | Retenção limitada não pode quebrar recuperação replayable, histórico persistente, herança de Subagent e modelo congelado; log de alta frequência controlado | Mantido/revisão de ciclo de vida, ver §40 |
| G15 | Recuperação de browser / screenshot / viewport / DPI                      | Comportamento original mantido ou restauração provada; checar dependências de CUA e entrada de plugin; não mudar atribuição de execução por causa de screenshot | Mantido; Mac duas passaram/uma falha preexistente, ver §37/39 |
| G16 | Seleção de mention, links de arquivo, busca de plugin, menu de adicionar   | Preservar interação; preservar novo rascunho e semântica de envio do Composer, todas as entradas bilíngue / tema / compatibilidade com celular | Mantido/revisão de interseção de Submission; ver §31/37/39 |
| G17 | Armazenamento de remoteSessionId, log de scope, testes de MCP watchdog                  | path não é identity, settings tab não pode perder session remota; mudança de espera de teste precisa conferir ciclo de vida real | Implementado/revisão unitária, aceitação SSH real pendente de ambiente; ver seção 22 |
| G18 | Novo layout e regressão de workspace / sidebar / terminal / settings     | Separar apresentação de estado de negócio; manter configuração smart do modelo atual, tipografia de Map / isolamento de teclado; aceitação separada de celular e de cada OS | Reconectado; Pro layout/editor passaram, Windows pendente, ver §39 |

## 3. Resumo do grafo de impacto

Modo: planning; no geral atravessa presentation / option-source / draft-default / validation / commit-effect / persistence / recovery, mas a verificação é reduzida por grupo funcional, sem gerar o produto cartesiano completo.

| Entrada do usuário              | Exibição / rascunho                     | Mecanismo compartilhado                    | Envio e ponto autoritativo                                   | Deve ser isolado                                                        |
| ------------------------------- | -------------------------------------- | ----------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Composer / Session existente    | rascunho local não enviado, projeção autoritativa da Session | Selection View, comandos V4             | Session salva após envio bem-sucedido; execução existente congelada | Não limpar a intenção persistente por refresh de menu; desktop continuous não mistura replay de celular |
| Configurações Account / Provider | página atual, estado da conta, rascunho de config pessoal | Facade de settings, Config/Account/Overlay | Transação de Config; operações de conta via serviço Account   | Exibição de página não substitui conexão real; não misturar visibility, entitled, current |
| Subagent / override de plugin    | rascunho da página de settings          | resolução pública de seleção, serviço Subagent | campo MD original do usuário ou override JSON interno; entrada de migração no load do Agent | MD de plugin/projeto não é reescrito automaticamente; precedência entre herança implícita e override interno |
| Wiki                            | rascunho de settings do Wiki / requisição atual | seleção pública, requisição ao Host alvo | arquivos do Wiki após migração única; fixar o modelo deste ciclo | Não mudar preferência da Session, não adicionar orçamento privado de saída |
| Automation / OffPeak            | config da tarefa e rascunho de edição   | serviço de tarefas, Ticket, escolha desta execução | config de tarefa normal; Ticket ocioso / Session vinculada cada um com seu estado | Vínculo do Ticket não muda; execução ociosa não pode mudar o modelo da Session |
| Bot                             | projeção da Session vinculada           | comandos de Session e mecanismo de seleção | a mesma Session; /model salva imediatamente é exceção já decidida | Não manter uma segunda cópia do modelo atual |
| Compartilhamento Web / controle remoto pelo celular | exibição de compartilhamento independente, projeção de remote no shared-host | protocolos próprios e identidade de anexo | serviço de compartilhamento; Session continua pertencendo ao Host/Agent existente | Não afundar o negócio de compartilhamento no relay, não iniciar outro Agent de controle remoto |

```text
配置 / Account事实 -> 完整解析快照 -> Host / Worker已有交付机制
                                       |
保存意图 / 当前草稿 --------------------+-> 公共有效选择
                                             |
                              新执行提交边界固定本次选择
                                             |
                                  Factory精确校验、执行
```

Permitido que o Worker use temporariamente o snapshot antigo completo; não permitido misturar fatos novos e velhos, alegar falsamente que foi aplicado, limpar indevidamente a intenção do usuário ou trocar de modelo às escondidas.

### Graduação de relação e origem

- must-inspect: G04/G05/G06/G07/G08/G09/G10/G12 compartilham ModelSelection / Account / protocolo / persistência a montante e a jusante; implementar após listar o caminho de chamada concreto de cada grupo.
- should-inspect: telemetria, usage, retenção de eventos e a nova fronteira de execução fixa em G13/G14; componentes compartilhados de UI e comportamento de settings após recuperação em G18.
- conditional: fechamento de OS, dependências e artefatos em G01/G03/G11/G15; validar pela plataforma / entrada de produto realmente alterada.
- invariant-only: as regras de Provider Built-in não tocadas não podem ser consideradas seguras para todos os consumidores só porque "o pacote central não mudou".
- evidence-only: teste unitário, compilação e alcançabilidade estática registram evidências separadamente; não representam equivalência de produto.

### Codegraph e deriva do grafo

As ferramentas atuais não fornecem codegraph. Usa-se o diff fixo do Git e referências precisas de código-fonte para rastrear; não se pode afirmar que a análise codegraph depth-2 foi concluída. Seeds relacionados: serviço de Subagent / bootstrap, entrada pública de ModelSelection, serviços de Wiki/OffPeak/Bot, SessionPane, snapshot de Account e runtime headers.

Cláusulas antigas do grafo (fila accepted de Renderer/Host, runtime defaultModelRef, Subagent aguardando decisão de protocolo) estão atrás do CommandInbox, ModelSelection e Todo99 atuais; servem apenas como pistas de busca, não para sobrepor a decisão mais recente. Depois que cada grupo confirmar as novas relações estáveis de produto, atualizar o nó de grafo correspondente; não reescrever o grafo em massa por causa desta revisão geral.

## 4. Riscos iniciais confirmados (status de implementação atualizado item a item)

| ID      | Origem                         | Evidência / conflito atual                                                                                                                | Direção de tratamento                                          | Implementação / Verificação      |
| ------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------ |
| I103-01 | dbb3ec0ce8 / G04               | No merge-tree somente leitura, subagents-types.ts passa automaticamente, mas adiciona interface de override de plugin referenciando AgentProfileModel indefinido; ainda traz model/thoughtLevel | Reconectar a função de override de plugin pela interface estruturada atual; não restaurar tipos antigos para a compilação passar | Implementado/verificado, seções 13, 14, 16 |
| I103-02 | 32f6cb43eb / G10               | O staging remove o antigo componente de purchase nativo, há modificação local, gerando modify/delete                                            | Rastrear pela entrada em uso; manter comportamento válido não é restaurar um arquivo inteiro já descontinuado | Pendente de verificação          |
| I103-03 | 8423f78274 / G06               | O upstream adiciona push de lane de registry antigo, enquanto o atual já tem entrega completa de fato pelo 99                                       | Verificar cobertura / lacunas equivalentes da lane de Wiki remoto, supplementing apenas o comportamento ausente | Pendente de verificação |
| I103-04 | 84c4fcfc1d, 89817f5be2 / G01   | O upstream publica a versão 3.11.x, o atual está explicitamente em 3.12.0                                                                    | Manter 3.12.0; reter as demais correções de publicação de plataforma arquivo a arquivo | Versão verificada; registro histórico de publicação mantido, seção 18 |
| I103-05 | 79413e33cb / G13               | A spec do upstream exige "sem cause aninhado, manter o comportamento original", mas a implementação usa o próprio Error único como cause; precisa de teste local para confirmar | Preservar a intenção de atribuição de baixo nível, ao mesmo tempo corrigir o cenário sem aninhamento conforme a spec do upstream, sem transportar cegamente o novo bug | Corrigido e verificado (G13-A)   |

## 5. Modelo de registro por item e regras de verificação

Cada item anexa: SHA de origem / intent / current / conflict / decision + base da spec / resultado de implementação e commit / comando de teste e resultado / revisão reversa / ainda pendente.

O status no JSON só pode virar concluído quando o fragmento correspondente da origem tiver um destino explícito em todas as partes. Quando um arquivo for alterado por vários grupos ao mesmo tempo, as evidências dos grupos não podem se substituir. Commits merge precisam checar o próprio diff manual de resolução; não podem ser todos marcados como "sem conteúdo".

Cada grupo escreve no código, antes dos testes, a spec / catálogo / matriz do domínio atual. Os testes distinguem primeiro entre "comportamento correto do upstream" e "implementação errada que regrediu para a arquitetura antiga". Erros-chave não são repassados ao 102 para contornar este Goal; falhas históricas e novas regressões são separadas.

## 6. Registro de progresso

- 2026-09-09: confirmada branch de integração limpa; SHA fixado e então executado merge-tree somente leitura, sem entrar em estado de merge.
- 2026-09-09: lista de origem recalculada, estatísticas iniciais de interseção menores corrigidas, rota de investigação de 18 grupos estabelecida; todas as origens ainda aguardam decisão em nível de comportamento, sem se passar por 193 funcionalidades novas.
- 2026-09-09: desta vez apenas planejamento e registro; em seguida, primeiro completar testes e implementação por grupo funcional independente, e por fim executar o merge real e a revisão geral.

## 7. G13-A: causa raiz de erro de streaming (implementado, revisado)

Origem: `79413e33cb`; os seis arquivos de origem foram tratados. Os outros nove commits de G13 continuam pendentes de verificação; este subgrupo não substitui o grupo inteiro.

### Intenção, estado atual e decisão

- upstream: erro de término de stream não engole a causa de rede de baixo nível; OTel acrescenta `error.cause.type/code/message` mascarado, erros da mesma origem são registrados apenas no primeiro span.
- current: após o refactor já existe mascaramento geral e reivindicação por WeakSet, mas TerminalStreamChunkError não tem cause, o mascarador só segue o cause padrão; a causa encapsulada não é exportada.
- decision: preservar toda a intenção de comportamento, integrar localmente à implementação atual; manter `model-execution.js` e o `statusContext.providerId/modelId` achatado, não ressuscitar Registry antigo / referência de Model aninhada.
- I103-05 já executou a função de origem do upstream para confirmar: `new Error("plain")` retorna um cause duplicado de si mesmo, conflitando com o item 3 da spec do upstream. A implementação usa o critério "pelo menos dois objetos de erro distintos" e não copia essa falha; o limite de oito níveis, a proteção contra ciclo e a prioridade cause → adapterError → error permanecem.
- Uma cadeia de wrapper de item único não precisa de fila breadth-first, basta ler o loop limitado existente; nenhum novo retry, status ou lógica de seleção de Provider foi introduzido.

### Evidências de teste e execução

1. Primeiro registrar G13-A01–04 em `docs/trace/model-attempt-error-diagnostics.md`, depois completar os testes; antes de modificar código de produção, 7 das 38 casos falharam como esperado, provando respectivamente o cause encapsulado, o mascaramento aninhado / reconhecimento de wrapper e a lacuna de atributos do exporter.
2. Executar a função de mascaramento em memória com o código fixo do staging; erros comuns produzem saída com cause duplicado; nenhuma configuração real de usuário foi reescrita ou executada.
3. Após a implementação, no workspace da CLI rodar o pacote inteiro de telemetry＋runner-retry＋failure-classifier: 137/137 passaram.
4. A regressão ampliada de streaming revelou uma omissão de teste preexistente no baseline recovery fixo: `openai-compatible-stream-usage-wire.test.ts:63` ainda instancia o removido `AiSdkModelRegistry`, enquanto os outros dois testes já usam `TestProviderConfigFixture`. O texto original do baseline foi verificado, apenas o ponto de entrada omitido passou a usar o mesmo fixture, preservando as três asserções de partial text / normalized other / raw max_tokens.
5. Execução final na mesma rodada de 14 arquivos, 151/151: pacote inteiro de telemetry, runner-retry, failure-classifier, runner-debug-failed-stream, openai-compatible-stream-usage-wire, offpeak-retry. InMemorySpanExporter real validou o mascaramento da causa raiz, o registro apenas no primeiro span e a ausência de novo cause em erros comuns; não apenas verificação de string de código-fonte.
6. `pnpm typecheck` da raiz passou; `tsc --noEmit` de adapters / telemetry da CLI passou; `pnpm lint` da raiz com 39 warnings preexistentes, 0 error. O ignore da raiz não inclui a CLI; foi usado o binário oxlint real da raiz no cwd da CLI para checar os 7 arquivos TS modificados, 0 warning / 0 error; não se pode tratar o "0 files" anterior como lint da CLI aprovado.
7. O Node Linux atual é 24.19.0, o CLI fixado em 24.14.0 gera engine warning; este subgrupo é lógica de diagnóstico sem efeito colateral de plataforma, a construção Pro / aceitação geral final seguem o plano original, sem alegar validação no Pro.

### Revisão bidirecional

- staging → resultado: nos seis arquivos de origem, cause encapsulado, campos profundos, reivindicação inicial, mascaramento, testes, spec têm destino; seus testes originais usavam o formato antigo de estado de modelo, foram alterados para verificar diretamente a identidade real de wrapper AdapterError, sem restaurar a interface antiga.
- refactor → resultado: Registry, Account, Selection, payload de requisição, teto de retry, faixa de desligamento ou campos persistidos não foram alterados. O ramo especial TerminalStreamChunkError de runner-stream continua lançando o adapterError original, o texto de erro ao usuário e o ponto de entrada de decisão de retry permanecem; as regressões relacionadas de streaming / ocioso passaram.
- Este subgrupo não tem nova interação de App, não adiciona E2E de UI; os comportamentos de Banner / completion dos outros G13 ainda precisam ser testados separadamente.
- O grafo apenas acrescenta 2 seeds precisos e um link de spec ao nó data-observability existente; os novos seeds são resolvíveis. Os IDs dos 336 nós do grafo são únicos; foram encontradas 4 arestas pendentes preexistentes, comparadas uma a uma com o baseline recovery fixo e idênticas (não novas deste trabalho), não se pode alegar integridade total do grafo como todo verde. O grupo de governança G02 registrará isso separadamente depois, não amplia para correção neste subgrupo.

Commit de implementação: esta seção é submetida junto com `fix(telemetry): integrate staging stream error cause diagnostics`; o Goal completo continua em execução, sem merge final nem retorno ao recovery ainda.

## 8. Auditoria de merge-resolution do próprio staging

Em 2026-09-09, para cada um dos 60 merges da lista de origem foi executado individualmente `git show --format= --remerge-diff <sha>` (Git 2.43.0), não apenas olhando títulos de merge ou mudanças acumuladas em relação ao primeiro pai. 58 não têm diff de remerge independente; suas funcionalidades continuam sendo revisadas com o grupo de origem, o que não indica que essas funcionalidades tenham passado.

| merge        | Conteúdo tratado independentemente                                                                                                             | Decisão e atribuição                                                                                 | Seguimento           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | -------------- |
| `5ded50a096` | CHANGELOG mesclou 3.11.2 e removeu registro pacman duplicado; package/lock escolheu 3.11.2; testes de runtime-asset mantêm ao mesmo tempo o aviso de Helper ausente e a asserção de regex do caminho de Helper | G01: 3.12.0 atual tem prioridade; preservar a intenção histórica de changelog e as asserções de empacotamento significativas, sem restaurar versão antiga nem perder nenhuma asserção | Validado junto com G01 |
| `a1026cad35` | Os testes de UnifiedBrowserView mantêm dois comentários: habilitar o menu não escreve aria-disabled=false; após clicar o menu fecha, é preciso reabrir para inspecionar o DevTools | G15: comentários e intenção de teste mantidos; não é novo estado de produto nem implementação de Provider | Validado junto com o grupo de browser |

O JSON de origem já registrou o resultado da auditoria de cada merge, caminhos adicionais e atribuição de grupo. Não foram encontrados novos fragmentos funcionais além das diferenças independentes acima, mas o merge real final ainda precisa checar o resultado; a auditoria de remerge não substitui a aceitação funcional.

## 9. G13-B: diagnóstico da origem de parada (implementado, revisado)

- Origem: `8e3e10df4d`, `ee30f2ad33`. Ao investigar parada acidental, distingue botão e Esc; a segunda corrige o problema da primeira usar info comum causando silêncio em produção, as duas são mantidas em conjunto.
- O código atual já tem `canStop`, focused/readOnly, Esc cedendo a popups e `expectedForegroundExecutionId` contra parada acidental. Só acrescenta o diagnóstico da origem, sem restaurar outros fluxos antigos de Provider no SessionPane, sem alterar o protocolo de comandos, o estado persistente da Session ou o momento de sincronização remota.
- Primeiro escrever `docs/monitoring/session-stop-source-diagnostics.md`, depois completar dois testes falhando: no código original tanto o caminho de envio quanto o de pulo não tinham log de lifecycle. Após a implementação, cobrir ainda o ramo de Esc e reforçar a asserção do ramo Logger de produção "não encaminha info comum".
- Rodar o arquivo inteiro de testes de troca de modelo/parada do SessionPane e o Logger: 55/55 passaram. As asserções originais de envio remoto direto e de não chamar updateProviderRegistry continuam passando. typecheck da raiz passou; lint da raiz com 39 warnings preexistentes, 0 error.
- Revisão bidirecional: todos os logs de origem do upstream, os dois parâmetros de origem e o warning de falha de envio foram conectados; o conteúdo dos comandos e as proteções de lifecycle foram mantidos como estão, sem introduzir nova fila ou reparse. O log de lifecycle só prova a tentativa de envio, não se passa por parada efetuada.
- Nenhum novo comportamento de interação; os E2E existentes de parada / fila permanecem inalterados, a integração final ainda exige regressão em lote, sem registrar testes locais de componente como aprovação em Pro / celular.

## 10. G13-C: detalhes estruturados de erro de baixo nível (reconectado pelo contrato de privacidade atual)

- Origem: `e690365f2e`, `a5f4687368`. A primeira extrai o erro não-wrapper mais profundo, a segunda completa lacunas de passagem em evento, projeção / Schema V4 e conversão de UI.
- Manter: Core seleciona message/detail do mesmo frame de baixo nível; 12 níveis e proteção contra ciclo; passagem completa TurnErrorPayload → ProductProjection → lastError schema → SessionPane / normalizeZCodeUiError; reporte de diagnóstico de message. Campo ausente permanece omitido, sem alterar classificação de erro, texto, retry, verificação de segurança, feedback ou seleção válida de modelo.
- Diferença de decisão explícita: o `docs/monitoring/conversation-telemetry-v4.md` vigente proíbe explicitamente subir detail completo, URL, cabeçalhos de autenticação, corpo de resposta. O novo `error_detail_text` do upstream sobe qualquer detail de baixo nível como é, em conflito com isso, portanto esse campo de reporte não é restaurado; o campo interno é mantido. A nova telemetria de message mantém o limite de 500 caracteres e devolve uma mensagem fixa de mascaramento para credenciais detectadas, URL e HTML. Esta verificação não afirma saber identificar qualquer texto de privacidade; o produtor de erro deve continuar cumprindo o contrato original.
- Spec: `docs/chat-error-detail-telemetry.md`. Primeiro introduzir os testes do upstream e testes do caminho de wrapper; antes das mudanças de produção, 10 da UI falharam e 3 da CLI falharam, localizando as posições originalmente ausentes. A revisão de privacidade acrescentou ainda a asserção "não subir detail"; a implementação original de forwarding falhou 4, e então removeu-se o reporte que não deveria ser restaurado.
- Verificação: Core turn-errors + Bootstrap ProductProjection 188/188; protocolo compartilhado, Schema, UI Banner / normalization / stop / Logger somam 225/225. O novo teste de Schema teve na primeira rodada um fixture sem o type obrigatório, corrigido o fixture depois passou, não atribuído a erro de produto.
- Verificação de tipo: typecheck da raiz passou; contracts/core/bootstrap da CLI passaram. O Bootstrap na primeira rodada usou tipos antigos de dist de contracts com campo faltante, após executar build de contracts a reverificação passou, sem recorrer a asserções de tipo. lint da raiz com 39 warnings preexistentes, 0 error; 5 arquivos relevantes da CLI com 2 warnings preexistentes de escape não usado, 0 error.
- Revisão bidirecional: os 13 arquivos de código/teste da origem e a spec têm destino (incluindo a exclusão explícita do reporte de detail original); desta vez é apenas a passagem de um campo opcional de uma projeção de erro já existente, sem nova fonte de estado, retry ou queda do modelo de execução. O Schema realmente mantém os novos campos e rejeita tipos errados, não apenas uma mudança de interface TS.
- Localmente não houve envio real ao ARMS nem alteração de dados de usuário. A regressão do Banner de erro desktop da integração final ainda precisa ser concluída; não se pode substituir a validação entre processos por componentes e Schema aprovados.

## 11. G13-D: estatísticas de Subagent em background e identidade de wake independente (implementado, revisado)

Origem: `e45f22f213`, `f25fe79f5a`, `253f01d496`, 
`c726bc27e3`, `805b943fc9`. Essas cinco iterações são vistas como um comportamento final único, sem sobrepor a implementação inicial às correções posteriores como dois conjuntos de estatísticas.

### Decisão e integração

- Manter step de uso zero por item para ferramentas child; o primeiro terminal/stopped acrescenta um resumo de Agent uma única vez, contando apenas o usage já confirmado anteriormente,
  sem preencher retroativamente o turno pai já encerrado, sem novo child completion, sem esperar usage tardio, sem introduzir timer/outbox.
- Após stopped, as ferramentas já iniciadas e as esperas de permissão são mantidas até as ferramentas drenarem ou o child terminal; ferramentas novas tardias não reabrem a estatística.
- A composição do completion main é determinada pelo resultado realmente consumido neste turno, cobrindo active-loop e wake independente; Bash não conta como Subagent.
  Lotes independentes só subdividem message_source quando todo o lote é da mesma origem; origens mistas/ausentes não são adivinhadas pela primeira.
- Wake independente e comandos normais reutilizam UUID v7; o messageId sintético persistido mantém sua finalidade, não é usado para se passar por ID de entrada.
- O `ModelNetworkStatus.providerId/modelId` achatado atual, ModelFactory, ModelSelection, resolução válida do 99, 
  livro-razão persistente de comandos e execuções congeladas são mantidos. Conectado pelos hunks concretos dos cinco commits de origem, sem cobrir arquivos inteiros de Core/SessionPane.
- foreground e background compartilham o step builder, usando respectivamente o estado de estatísticas do turno pai e do child destacado; 
  `dep:refs` lista apenas três referências de teste, complementadas por um rg preciso que encontrou o import/chamada do supervisor, completando a verificação da renomeação.
  Não se trata subnotificação de ferramenta estática como "sem chamadores".
- O schema só acrescenta campos opcionais de origem sem corpo. O replayable do celular não preenche telemetria histórica, os fatos live continuam sendo consumidos pelo attachment desktop continuous confiável já existente; nenhuma sincronização nova de remote/Host/Account.

### Verificações executadas e novas descobertas

1. A spec foi atualizada primeiro em modelo/atribuição de uso, origem de automation e Tool Change Chain; a identidade de modelo aninhado antigo da spec do upstream foi trocada pelos campos achatados atuais, o limite de consumo do active-loop foi esclarecido, artefatos históricos não se passam por aprovação deste branch.
2. Testes primeiro: da UI/shared 143 casos 34 falharam; da CLI 279 casos 12 falharam. O novo teste de cancelamento de inicialização passou a usar o fixture `createTestAgentRuntime` atual, sem restaurar as dependências antigas de Runtime construídas diretamente pelo upstream.
3. Após a implementação, UI/shared inicialmente 144/144, depois de ampliar a regressão de attachment/diagnóstico de erros 251/251; 
   CLI 278/279. A única falha é o `Core admission ACK 不等待 TurnStarted projection；旧 revision retry/file rewind 只 stale` preexistente: esperava stale, na verdade executionFailed; falha igual antes das mudanças de produção.
   Isso é roteado para G12 continuar a investigação, não se pode registrar o conjunto de testes CLI como totalmente verde.
4. typecheck da raiz, typecheck de contracts/core/bootstrap da CLI passaram (construindo contracts antes); lint da raiz com 39 warnings preexistentes, 0 error; após a modificação final de E2E, typecheck/lint da raiz foram reexecutados com o mesmo resultado.
   A CLI também usou `oxlint --no-ignore` em 17 arquivos modificados: 42 warnings preexistentes, 0 error, sem tomar o ignore da raiz sobre a CLI como aprovação.
5. Descoberta a contradição interna da origem I103-06: a asserção BG26 de e45 diz que falha em background "não tem Agent step", mas 805 depois já estabelece que sem usage também há settlement. Corrigiu-se o E2E para exatamente um Agent failed, 0 usage request confirmado, 0 token,
   preservando o erro de provider e "não produz child completion"; não se deletou o caso de falha.
6. O Pro usou a cópia de código-fonte isolada existente `/Users/dev/zcode-todo99-e2e.1lO3PN`, não o checkout diário; 
   sincronizou-se o código deste branch de integração e reconstruiu Electron/Agent. Essa cópia não tem .git, o unknown de build-meta não serve como evidência de versão.
   Usou-se strict case-local replay, Node24.14.0 / Electron41.0.3 / Chrome146.0.7680.80.
7. A primeira execução `desktop-e2e-20260909-141601-940` passou 3/4. BG13 esperando notificação falhou, os logs de runtime registram claramente
   que o child Bash estava em modo build em um novo rascunho, atingindo `mode.build.highRisk` aguardando aprovação.
   I103-07: a suíte define Full Access apenas uma vez no before, o novo rascunho reseta o modo; não é notificação perdida.
   O teste passou a escolher Full Access explicitamente após cada criação de rascunho, sem modificar as regras de permissão do produto e sem pular o teste de permissão.
8. Corrigido o pré-requisito, `desktop-e2e-20260909-142100-814` passou nos cinco casos: notificação de Bash em background, ferramenta child em foreground, 
   composição mista no mesmo turno BG45, isolamento do child em background BG13, isolamento de identidade de mensagens principais seguintes BG18.
   `desktop-e2e-20260909-142145-836` passou 1/1 em BG26 de rate limit / settlement sem usage. Seis casos-chave distintos passaram no total.
9. `desktop-e2e-20260909-142254-924` reexecutou BG13/BG18, 2/2 passaram, e salvou a evidência HTTP final em
   cópia isolada do Pro `.e2e-artifacts/todo103-g13D-final-http/{BG13,BG18}-token-identity.capture.raw.json`.
   Ambos os casos foram child Bash com 0 token, resumo de Agent com 2 requisições/284 token, atribuído à mensagem de launch original; o wake independente usou um UUID v7 diferente.
   captureStages confirmado como eventReport=http-final, armsRenderer=renderer-pre-ipc, armsFinal=main-send-custom.
   O envio final foi capturado pelo teste, sem enviar ao serviço ARMS real; não são submetidos arquivos de capture com identificadores reais de máquina/conta.

### Revisão bidirecional

- As estatísticas finais, identidade, classificação de origem e testes/spec das cinco origens foram mantidos; sem sobreposição da implementação inicial.
- Comparado ao normalizer / supervisor / messageTelemetry / telemetry schema final do staging fixo, a única diferença relevante é o
  normalizer usar a identidade de Model achatada atual; nenhum Model aninhado antigo, Registry antigo ou bypass de Account foi restaurado.
- Não altera o modelo de execução pai/filho fixo, a resolução explícita do 99, a herança implícita, as regras de permissão ou o livro-razão persistente do CommandInbox; 
  o primeiro settlement do Agent em background, a prevenção de duplicação, o usage tardio e os limites de cancelamento são cobertos por teste unitário, e a cadeia real entre processos pelo E2E acima.
- A falha preexistente de stale-revision de G12 ainda precisa ser esclarecida; não se atribui a este grupo nem se declara antecipadamente verde toda a regressão final de protocolo.

Este subgrupo é submetido com `fix(telemetry): preserve subagent usage and wake attribution`. As outras cinco origens de G13 foram tratadas por A/B/C; os outros grupos funcionais do Goal todo, 
o merge real, a revisão geral bidirecional e a verificação final-chave continuam incompletos.

## 12. G04-A: disponibilidade de candidatos de Subagent (implementado, revisado)

- Origem `5161e0914f`, os 7 arquivos de origem têm todos destino; o override de plugin `dbb3ec0ce8` continua tratado à parte.
- Preservar o editor de modelo inválido mostrando "Selecionar modelo", sem completar candidatos, sem limpar rascunho, sem escrever o arquivo original.
  A UI da origem usava snapshot/Family de Provider já removidos, foi trocada pela Selection View atual; só o gatilho foi ajustado, os limites de leitura/escrita não.
- A intenção do upstream de entrar em Subagents com refresh explícito já está coberta equivalentemente pela primeira leitura + subscription do hook público. Acrescentados testes de unmount/remount e de eventos Start→Individual→Team, provando que ao reentrar lê o snapshot atual, que na montagem a notificação atualiza, sem reintroduzir forcefully refresh.
- O Storage do upstream deduplicava por endpoint, causando lista embaralhada entre Start/Individual; o atual constrói Account Overlay por Provider ID.
  Não se restaura modelProviderServiceStorage removido nem os testes antigos; acrescentada regressão real AccountResolver→ProviderResolver:
  mesmo endpoint, mesmo nome de modelo e modelos exclusivos de cada um permanecem isolados, Individual não-current não entra no Registry, a API não é afetada.
- Testes primeiro: UI/shared hook/provider, de 59 casos apenas a nova asserção de texto falhou; os testes dos dois mecanismos equivalentes passaram direto.
  Após a correção, o pacote inteiro do Account resolver ficou 71/71. A asserção de que quando não ready a intenção original não é considerada inválida foi mantida.
- Cópia isolada do Pro: reconstrução do Desktop (este grupo não alterou o Agent, reutiliza o Agent reconstruído do grupo anterior), strict replay
  `desktop-e2e-20260909-143258-266` SE-03 1/1 passou. Após deletar realmente um membro, verificou-se o texto Selecionar modelo, a ausência do membro antigo no menu, reasoning oculto, salvar desabilitado e bytes do Markdown completamente inalterados.
- typecheck da raiz (incluindo E2E) passou, lint com 39 warnings preexistentes/0 error; checagem de diff passou.
- Revisão bidirecional: UI/service/spec/testes da origem têm todos destino; não foram restaurados fonte dupla metadata/catalog, Family selected key, 
  push de Registry, tipos antigos de Provider ou migração de escrita em disco. A escolha ativa do modelo principal com a maior faixa e a resolução explícita de execução do 99 permanecem.
- Commit: `fix(subagents): preserve unavailable selection without misleading labels`; G04-B e a integração final continuam incompletos.

## 13. G04-B1: armazenamento de override de plugin e fiação de startup (camada base concluída; commits de origem ainda incompletos)

- Cobre a parte de armazenamento de override / carregamento do Agent do commit de origem `dbb3ec0ce8`; a descoberta de cache oficial, a UI inline e o refresh da loja do mesmo commit ainda esperam B2/B3,
  sem marcar antecipadamente a origem ou o arquivo inteiro como revisado. O contrato atual completo foi escrito na seção G04-B da spec de Subagent.
- Preservar identidade estável do plugin, override do grupo inteiro model/faixa, consistência entre nome canônico e alias de nome cru, default apenas do Markdown do plugin, diretório de upgrade sem afetar chaves.
- O antigo `AgentProfileModel` e a escrita em map duplo, conflitantes com as abstrações vigentes, não são restaurados: novas escritas usam `pluginAgentModelSelectionOverrides`,
  Service/RPC passam `{agentId, modelSelection?}`, e o reader Host/Agent formal reutiliza a análise estruturada estrita.
- O map duplo de plugin do staging de origem é convertido pela fronteira de importação do armazenamento compartilhado existente (não é leitura compatível em runtime, nem compatibilidade com campos intermediários de Markdown não publicado); 
  reutiliza as regras existentes de identidade de Provider offline, file lock/escrita atômica, sem novo sistema de migração, consulta de conta ou dependência de Registry.
  Map formal existente é autoritativo: vazio/corrompido não faz releitura, model-only não preenche faixas antigas, IDs formais antigos não continuam sendo adivinhados para migração.
- O Agent reutiliza o resultado de state já concluído de `loadZCodeAgentProfiles`, injetando o plugin loader no ponto de montagem create-app; sem nova IO síncrona.
  Plugin profile continua entregue à resolução válida explícita do 99; ModelFactory, herança implícita e execução ociosa fixa não foram modificados.
- Primeiro testes falhando: em shared+Host 5 de 39 falharam, em Agent 1 de 9 falhou; após a implementação e ampliação para shared/Host/store 6 arquivos 59/59,
  Agent profile/bootstrap/runtime-config 3 arquivos 57/57. Os testes de Host usam arquivos temporários reais com salvamento concorrente dos estados Builtin/Plugin/disabled, 
  limpar/trocar de modelo, nome canônico/alias e proteção dos bytes originais do Markdown; os testes de Agent leem do disco realmente após importar e verificam as duas entradas de profile e o isolamento entre plugins.
- typecheck da raiz passou, contratos/core/bootstrap da CLI passaram em tipo (construindo contracts antes); lint da raiz com 39 warnings preexistentes, 0 error; 
  três arquivos modificados da CLI com 2 warnings preexistentes de tipo não usado/0 error (BuiltInSubagentName, AgentRuntimeDeps já existiam).
- Este commit conecta apenas a capacidade base, ainda não abre novas operações de UI; B3 precisa complementar com requisição real de Settings/cold start, não pode substituir por teste unitário desta seção.
- Commit: `feat(subagents): adapt plugin model overrides to selection state`. O merge final e a entrega no branch de recuperação ainda não foram feitos.

## 14. G04-B2/B3 UI: descoberta de cache oficial e override inline de plugin (concluído; requisição a frio e refresh da loja ainda pendentes)

- Continua tratando `dbb3ec0ce8`, sem marcar esta origem como concluída antecipadamente. A lista default de habilitação das três classes de recursos de Settings foi unificada no
  contrato de mercado compartilhado; a varredura Node-only foi para a entrada Node compartilhada, evitando nova importação entre domínios da implementação concreta do serviço Plugins.
  Preservar a habilitação default atual de computer-use (a lista de quatro itens do upstream omite este item), acrescentando comparação item a item com a definition da CLI.
- O cache só complementa identidades oficiais sem registro de instalação; false explícito e suppressed têm prioridade, registro de instalação tem prioridade e não é revivido pelo cache.
  Versão numérica 0.1.10 tem prioridade sobre 0.1.9; não lê backup/diretórios temporários; manifest.name divergente com versão maior faz fallback.
  Os testes iniciais de descoberta default e de consistência da lista falharam; após o patch passaram. O novo amostra installed+enabled+suppressed falhou primeiro,
  provando que a checagem de supressão não pode ficar só na ramo de cache; depois de corrigir passou.
- Plugins e builtins compartilham o controle inline existente, o Selection completo é salvo por agentId estável; a escolha ativa de modelo pega a maior faixa, alteração manual de effort salva atomicamente; os demais campos do plugin são somente leitura. Preservar o rollback de falha de salvamento do controle original e a fronteira de não reverter quando o refresh pós-sucesso falha.
  Os textos nos dois idiomas são migrados junto, sem restaurar escritas antigas de model/thoughtLevel nem fonte dupla de metadados de Provider.
- I103-08: no Pro `desktop-e2e-20260909-145438-372` a primeira execução de SE-04 falhou, localizada no `settingsUserOnly` atual que corta pluginAgents diretamente. Alterado para retornar uma projeção de recurso somente leitura independente, agents continuam sendo apenas usuário/builtin.
  O novo teste falhou primeiro, após a correção verificou-se que não lê project profile, não adiciona alias de runtime, os bytes do Markdown do projeto ficam inalterados.
- I103-09: a segunda `desktop-e2e-20260909-145849-535` ainda falhou. Os logs reais mostram que a lista de arquivos terminou em 14:59:05.435, e o seed de plugin da CLI só terminou em 14:59:05.718, sem refresh da lista depois.
  A página do usuário também pulava a inicialização de inventory existente quando não tinha targetWorkspace. Reutilizado esse ponto de entrada, usando um workspace local disponível
  como contexto de chamada e escopo user explícito; ao completar, os recursos são atualizados. A primeira leitura de usuário/builtin não espera, sem novo polling, timeout ou
  sincronização de Account. Após o Promise, apenas páginas ativas consomem; desmontagem e callback tardio falharam primeiro e depois passaram.
- Desktop reconstruído no Pro, Agent reutilizando a versão já reconstruída neste ciclo; `desktop-e2e-20260909-150213-807`
  SE-02/04 2/2 passaram: após seed novo, na primeira aparição da página judge, grupo inteiro de modelos/maior faixa/high explícito gravados em disco, sem escrita de map antigo, 
  linha de plugin não editável, bytes do arquivo judge inalterados. Não se contornou o defeito de cold start afrouxando timeout ou pré-populando cache já pronto.
- Host/Skills/Commands/UI finais 4 arquivos 111/111; dois arquivos da CLI 58/59, onde a nova comparação da lista default e todos os testes de carregamento de Subagent de plugin passaram. A única falha é a asserção preexistente de seed CUA em Electron empacotado: a constante de teste é caminho 0.5.13 e o wrapper atual é 0.5.14, e antes da modificação a asserção/constante já eram assim. Rotear para G03 reverificar o contrato atômico de producer,
  sem editar a versão CUA à mão neste grupo nem registrar o pacote inteiro da CLI como passou.
- typecheck da raiz passou (incluindo E2E), lint com 39 warnings preexistentes/0 error; limpou-se a reformatação sem relação do formatter em Skills/Commands,
  mantendo apenas a diferença de importação/remoção da lista default; checagem de diff passou.
- Revisão bidirecional: descoberta de cache, entrada da página do usuário, bilíngue, controles responsivos compartilhados e origem de persistência foram migrados; não se escreve Markdown de plugin/projeto,
  não se muda resolução do 99/Factory/herança implícita, armazenamento de escopo user ou fluxo de mensagens desktop/phone.
  O fechamento de requisição de provider no cold start do plugin, o refresh automático da loja e a revisão da última rodada da origem continuam pendentes; não se pode declarar G04 concluído com isto.

Commit: `feat(subagents): expose official plugin model overrides in settings`.