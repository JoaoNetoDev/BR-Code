# Todo 97: Migração dos campos originais do Markdown de Subagent e revisão auditoria das leituras de campos antigos

> Atualização da atribuição de validação (2026-09-09): as pendências de teste deficitário/promoção manual remanescentes deste texto foram transferidas uniformemente para o [Todo102](todo-102-verification-debt-closeout.md), o que encerra o cronograma de validação independente deste texto; as evidências históricas são preservadas, e a transferência não significa que os testes passaram. A fronteira de migração única do Wiki já foi implementada e aceita, e todos os itens de desenvolvimento deste Todo foram encerrados.

> Status: escopo de desenvolvimento decidido como concluído; em 2026-09-09 foram complementadas a migração de gravação única do Wiki e a segunda revisão. As evidências de execução estão no [registro geral](../research/todo94-97-execution-and-review.md) e na [tabela de auditoria por armazenamento](../research/todo97-selection-storage-audit.md). Em §4/§5, os “fatos atuais / a executar” são o registro de abertura do trabalho, e os resultados mais recentes são os da tabela de auditoria e de §7/§8; a dívida de validação é assumida uniformemente pelo Todo102.
> Objetivo geral: o Markdown de Subagent legível pelo usuário mantém `model` e `thoughtLevel`, migrando nos campos originais a identidade antiga de Provider apenas para os arquivos do diretório de dados do usuário, sem modificar automaticamente arquivos de projeto e de plugin; ao mesmo tempo, auditar minuciosamente em toda a cadeia de migração de Provider / Model Selection a compatibilidade de formatos intermediários e as leituras em runtime de campos antigos.

## 1. Dois princípios obrigatórios e que exigem nova revisão

1. **Não dar compatibilidade a formatos intermediários que nunca foram publicados e que já foram substituídos por uma decisão posterior.** Só migramos a configuração antiga efetivamente publicada, sem adicionar migração inversa, leitura dupla, escrita dupla ou ramificação de prioridade para produtos de migração errados deste ciclo. O estado intermediário `modelSelection` do Markdown de Subagent não é convertido de volta para `model` / `thoughtLevel`, e seu caminho formal de leitura/gravação não é mantido. Arquivos intermediários no disco do usuário não são limpos por conta própria.
2. **Campos antigos servem apenas para a migração, e o uso formal após a migração não pode ler de novo campos antigos.** É proibido reler campos antigos para completar valores quando o novo campo está vazio, corrompido, com modelo não selecionável, com conta não logada, com Provider ausente ou com SSH desconectado. Manter dados antigos para rollback não equivale a permitir o uso em runtime. Arquivos genuinamente antigos recém-chegados podem reentrar por uma entrada de migração explícita, mas não se pode chamar de migração concluída a compatibilidade em memória feita a cada carregamento do mesmo arquivo.

Aqui, “campo antigo” é julgado pelo contrato, não pelo nome do campo: **o `model` / `thoughtLevel` do Markdown preservado explicitamente neste ciclo é o campo formal pós-migração**, e lê-los normalmente não viola o segundo princípio. O que foi aposentado é a antiga expressão de Provider dentro deles, além dos campos de outros armazenamentos que foram substituídos por campos novos. O `ModelSelection` estruturado interno/protocolar continua legítimo; não se pode apagar o tipo interno de todo o repositório só porque o Markdown não usa mais o campo de mesmo nome.

Os dois princípios precisam gerar uma tabela de auditoria por entrada de acesso, testes e evidências de segunda revisão. Não é permitido considerar concluído apenas escrevendo comentários, apenas mudando um decoder, ou apenas anunciando a conclusão com base em não encontrar um determinado nome de campo por busca.

## 2. Solução decidida para Subagent

- O formato formal do Markdown de usuário/projeto continua sendo `model` e `thoughtLevel`; criar, editar, salvar, leitura pelo Host e carregamento pelo Agent precisam ser coerentes, e não é permitido salvar e depois gerar `modelSelection`.
- **A migração automática no local se limita ao diretório de dados do usuário `<data>/agents/`**. O `.zcode/agents/` do projeto, arquivos accompanying de plugin e todas as outras origens não são migrados automaticamente nem escritos de volta; isso não cancela a funcionalidade já existente de o usuário editar e salvar ativamente a configuração do projeto.
- Seguir o [Todo 96](todo-96-selection-offline-migration-and-resolution-consolidation.md) para a conversão determinística da identidade antiga: o BigModel / Z.ai Coding Plan antigo migra para Individual do mesmo domínio; não se consulta a conexão atual, o login, os benefícios, o Registry, a View nem as capacidades do modelo. Individual é apenas o destino da migração e não significa que o usuário usava historicamente um plano pessoal, nem troca a conexão.
- O model ID e a faixa de pensamento preservam a intenção original; o governar os aliases de faixa pertence ao Todo 95 e não é reescrito junto. A seleção herdada continua herdada, sem adivinhar um modelo por causa da migração de identidade.
- Depois de decodificar corretamente a string antiga real, apenas a identidade de Provider é alterada; a codificação antiga `provider/model` e `custom:...` é coberta, garantindo um round-trip do model ID sem perdas, e não é permitido fazer substituição global no corpo do texto.
- A migração automática no local altera somente os valores relevantes do frontmatter, preservando corpo, comentários, campos desconhecidos e formatação não relacionada; não se pode fazer a migração reconstruindo o Markdown inteiro com o serializer existente.
- Perfis internos, interfaces de serviço e o protocolo App–Agent continuam usando o `ModelSelection` estruturado. As overrides de `agents-state.json` dos Explore / general-purpose embutidos continuam usando os campos estruturados atuais, sem voltar ao antigo JSON de double map por causa da exigência de legibilidade do Markdown.
- A obtenção da seleção válida na execução explícita de Subagent é responsabilidade do Todo 96; este item não substitui isso por resolução em runtime da ID antiga preservada, nem usa a passagem na página de Settings para fingir a aprovação de backend. A estratégia já aceita de herança de seleção corrompida não é ampliada por este item para virar outro round de design de tratamento de erro.

```text
用户数据目录里的真正旧 Markdown
        |
        v
明确迁移入口：离线转换旧 Provider 值
        |
        v
原文件 model / thoughtLevel（正式格式）
        |
        v
正式读取 -> 内部 ModelSelection -> 有效选择解析 / 执行
                         不再回读旧身份或中间格式补值
```

## 3. Fronteira de escrita de arquivo: decidida, apenas diretório do usuário

Fechamento da implementação: a transformação de texto puro e o codec dos campos formais são compartilhados, e a migração do diretório do usuário, que é Node-only, é reutilizada pela inicialização do Host/Agent; um reader comum não converte Provider. A migração preserva o modo e os demais bytes do arquivo original, reutiliza o file lock e compara o texto original antes de escrever; links simbólicos e arquivos somente leitura não têm permissão alterada nem são seguidos para fora do escopo, e uma falha não converte a memória para fingir conclusão. Identidades antigas fora do escopo continuam sendo aceitas pelas validações existentes como seleção explicitamente não vinculável.

O usuário deixou claro: alterar apenas os arquivos do diretório do usuário e não tocar em mais nada. Não é preciso desenhar um plano de migração automática para projeto, plugin ou fontes somente leitura.

- A migração do diretório do usuário é concluída na fase de inicialização/migração da configuração de usuário já existente, com o carregamento formal em seguida; reutiliza-se a fronteira de inicialização atual, sem criar um agendador à parte nem estender o momento de carregamento por causa de outras origens.
- A migração automática não pode varrer diretórios de projeto ou de plugin para escrever de volta, não cria cópias-sombra, não altera permissões e não desabilita plugins automaticamente. O contrato de leitura compartilhado continua unificado, mas não se mantém um desvio permanente de compatibilidade de identidade para arquivos antigos fora do escopo; uma identidade antiga não migrada não tem garantia de funcionar, e a validação já estabelecida vale, sem rebind silencioso.
- Se o parsing do arquivo original, a escrita ou a edição concorrente pelo usuário falharem, não se pode declarar a migração concluída nem sobrescrever conteúdo novo. Usam-se as capacidades existentes de IO assíncrono e de proteção transacional/de concorrência, sem introduzir espera por temporizador para resolver problemas de sincronia.
- Carregar de novo um arquivo já migrado não deve chamar de novo a conversão de identidade antiga; arquivos genuinamente antigos adicionados depois ainda podem ser migrados. Não se pode apenas definir uma flag global de “migrado” e deixar de fora arquivos adicionados depois.

## 4. Fatos atuais, fronteira de impacto e sementes de código

Este item é um planning de feature-boundary-planner, com camadas principais em persistence / validation / commit-effect. Não há ferramenta de codegraph; o que segue vem de leituras direcionadas e de reprodução anterior em memória, e não reivindica uma auditoria de todo o repositório.

| Nível / cenário | Entrada e implementação compartilhada | Intenção original e ponto de envio | Fato atual / o que precisa ser checado |
| --- | --- | --- | --- |
| must-inspect: formulários de Settings de usuário/projeto | SubagentsSection → subagentsService → subagentMarkdown | Rascunho do formulário; Save explícito grava cada Markdown | O serializer atual grava `modelSelection`; precisa unificar nos campos originais formais, e o save não reintroduz o estado intermediário |
| must-inspect: leitura pelo Host | `packages/services/src/subagents/subagentMarkdown.ts`, `subagentModelSelection.ts` | O arquivo é autoritativo; retorna a selection interna | Hoje há dois caminhos de leitura conforme exista modelSelection; é preciso remover o ramo de formato intermediário e definir com clareza a fronteira entre migração e leitura formal |
| must-inspect: cold start do Agent | bootstrap `subagents.ts`, `subagent-legacy-selection.ts`, `app/create-app.ts`; core `profile-model-selection.ts` | Markdown → perfil interno | Hoje cada importação de identidade antiga só muda a memória e não grava o Markdown; é preciso chegar à segunda leitura após o restart, sem testar só o resultado de uma única vez |
| must-inspect: overrides embutidas | state importer / prepareRuntimeState do subagentsService, state reader do bootstrap | `agents-state.json` | O formato não regride; auditar minuciosamente que o double map antigo só é lido na entrada de migração e que o reader formal só lê os campos atuais |
| invariant-only: arquivos fora de escopo, como projeto/plugin | agent discovery e profile loader de projeto/plugin | Seu próprio arquivo original | A migração automática não escreve, e não se adiciona estado intermediário nem compatibilidade de longa duração com identidade antiga; o Save ativo do usuário é separado da migração automática |
| must-inspect: todas as entradas de uso de Selection | Session, Automation, Bot, Wiki, Recent/Default/Draft do Todo 96 | O armazenamento e o momento de save próprios de cada área | Investigar compatibilidade com estados intermediários do mesmo tipo, retorno a valores antigos com novo valor vazio, conversão em memória repetida e destruição da intenção original por falha de ambiente; não é só verificar Subagent |
| invariant-only: execução real / remoto | Início do child de Subagent, resolução válida no Host alvo e validação final do Registry | A seleção concreta congelada nesta execução | Não contorna a validação final e não altera requisição em andamento; não usa configuração local para consertar o remoto e não adiciona sincronização antes do envio |
| invariant-only: tempo ocioso | Migration / Ticket do Off-Peak | O tíquete existente e a seleção de execução fixa | Entra na auditoria de fatos de leitura antiga; não pode aplicar mecanicamente a migração Individual nem mudar o vínculo do Ticket, e conflitos vão para uma decisão à parte |

O que é compartilhado é a decodificação de identidade, a Selection interna e a resolução de candidatos; o que não é compartilhado é o efeito de gravação: o Save de Subagent não equivale à admissão de envio do Composer, o JSON embutido não equivale ao Markdown, e plugin também não equivale ao arquivo do usuário. O comportamento de execução da sessão principal e das tarefas agendadas não é refatorado por conta própria neste item.

É preciso preservar o continuous do desktop / replayable do celular, o shared-host, o isolamento por workspaceIdentity e as permissões do sistema de arquivos alvo; os arquivos remotos são tratados pelo ambiente de execução dono deles e não podem ser escritos de volta pelo mesmo caminho local. Esta mudança não altera layout, tema, internacionalização nem a cadeia de recuperação de mensagens.

Drift do grafo: o invariant atual de subagents ainda registra a implementação antiga “não grava Markdown”; este plano apenas adiciona referências e não mente dizendo que a troca já aconteceu. Depois da aceitação da implementação, o grafo e o `docs/subagents-built-in-model-overrides.md` são sincronizados, e cada item em que a especificação antiga conflita com o código é registrado, em vez de se alterar a especificação diretamente conforme o código atual.

## 5. Nova investigação: tabelas de processo obrigatórias

Registrar as colunas abaixo para cada formato persistente; um mesmo “nome de campo atual” não significa pertencer ao mesmo formato. O escopo é o refactor de Provider / Model Selection deste ciclo, sem se expandir para refazer todas as migrações de dados do repositório.

| Entrada / arquivo ou tabela | Formato antigo publicado | Formato atual formal | Ramo intermediário não publicado | Entrada de migração e gatilho | Evidência de escrita concluída | O reader formal / runtime relê valores antigos | O save reescreve formato antigo/intermediário | Tratamento / teste / segunda revisão |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Markdown de Subagent do diretório do usuário | Amostras a verificar | model / thoughtLevel, com valor novo de Provider | modelSelection (compatibilidade a remover com certeza) | Fase de inicialização/migração da configuração de usuário já existente | A implementar | A conferir cadeia por cadeia | Existe hoje | A executar |
| Markdown de Subagent de projeto/plugin | Arquivo original preservado | Leitura oficial usa model / thoughtLevel | modelSelection (sem adicionar compatibilidade) | Excluído da migração automática | Verificar que não há escrita automática | Entra na auditoria de leitura, sem novo desvio de identidade antiga | Save explícito de projeto separado da migração automática | A validar |
| JSON de estado de Subagent embutido | Double map antigo a verificar | builtInModelSelectionOverrides | Identificado pela origem publicada | prepareRuntimeState existente | A reverificar | A reverificar | A reverificar | A executar |
| Session / Recent / Draft | Cada armazenamento antigo real | Cada armazenamento formal | A listar item a item | Em confronto com o Todo 96 | A registrar | A registrar | A registrar | A executar |
| Automation / Bot / Wiki | Cada armazenamento antigo real | Cada armazenamento formal | A listar item a item | Em confronto com o Todo 96 | A registrar | A registrar | A registrar | A executar |
| Provider config / Account connection | Cada formato antigo realmente publicado | Cada configuração formal | Conferir os campos substituídos neste ciclo | Cada entrada de migração já existente | A registrar | A registrar | A registrar | Conflito com novo design fica em coluna própria, sem refazer junto |
| Off-Peak | Registro de tarefa antigo existente | Formato de tarefa atual | A verificar | Fronteira dedicada já existente | A registrar | A registrar | A registrar | Auditoria, sem mudar o contrato do tíquete |

O rastreamento precisa cobrir pelo menos: migração, leitura formal, exibição na página de Settings, execução real, save e restart. Não basta buscar por nomenclatura `legacy`; o foco está em `new ?? old`, fallback quando o novo valor é inválido, parser de leitura dupla, resolver via RPC, nova importação a cada carregamento, e em testes que travam um comportamento antigo de runtime como se estivesse correto.

Toda lacuna encontrada precisa ser classificada: violação clara de um princípio já decidido e corrigível diretamente; conflito com outra fronteira já decidida que precisa de discussão; ou algo que permanece apenas nos dados de migração/rollback e não precisa ser removido. Código mantido por causa de campos antigos reservados à migração pode existir, mas precisa vir com a prova do limite de chamada e de zero chamadas no caminho formal. Correções entre Todos devem apontar para o item específico, sem criar duas implementações paralelas.

## 6. Aceitação e ordem de execução

Dimensões: formato genuinamente antigo / formato atual / estado intermediário não publicado; usuário / projeto / JSON embutido / plugin somente leitura; primeira migração / restart / save explícito; escrita normal / falha / edição concorrente; online / offline. Cobrir apenas as combinações que mudam a semântica, sem abrir o produto cartesiano completo.

| Caso | Preparação e ação | Asserções e evidências | Status |
| --- | --- | --- | --- |
| SA97-01 | Duas codificações de string antigas reais no diretório do usuário, migrar e carregar após restart | Apenas o valor de Provider muda, modelo/faixa preservados; o segundo carregamento não chama de novo a conversão de identidade antiga | accepted, aguardando teste unitário/integração de arquivo |
| SA97-02 | Migrar a mesma seleção antiga sem login, com Provider vazio e com SSH desconectado | Saída consistente, sem consulta a conta/rede/candidatos; a intenção original não é esvaziada | accepted, integração com SM96 |
| SA97-03 | Arquivo com string de mesmo nome no corpo, comentários, campos YAML desconhecidos e quebras de linha diferentes | A diferença precisa do arquivo fica só no valor do campo alvo; a migração é idempotente e não reconstrói o arquivo inteiro | accepted, aguardando teste de arquivo |
| SA97-04 | Criar/editar agent de usuário e de projeto na página de Settings, salvar e fazer cold start | Só grava model / thoughtLevel formais; Host/Agent decodificam de forma coerente; o child real consome a selection interna correspondente | accepted, aguardando integração de serviço/Agent e E2E Pro |
| SA97-05 | modelSelection de Markdown em estado intermediário | Sem compatibilidade dedicada, migração inversa ou ramo de leitura prioritária; o save não volta a produzir esse campo; nem os testes exigem restaurar esse formato | accepted, aguardando teste negativo e revisão de referências |
| SA97-06 | Outros armazenamentos já com o campo atual, com o campo antigo em conflito; valor atual vazio/inutilizável | O caminho formal não chama o reader antigo nem revive a intenção antiga; preserva o tratamento de limpeza/corrupção já decidido para cada área | accepted, teste por entrada |
| SA97-07 | Migração do diretório do usuário com edição simultânea pelo usuário, ou falha de escrita, e depois novo carregamento | Não sobrescreve conteúdo concorrente, não marca falsa conclusão e não desvia para o caminho de execução por campo antigo ao contornar a migração; segue o tratamento de falha de migração existente, sem ampliar o design de produto por causa de permissão de escrita | accepted, aguardando teste de arquivo |
| SA97-08 | Migrar o double map antigo do JSON embutido, reiniciar e salvar a nova override | O reader formal lê apenas os campos novos e a atomicidade da override se mantém; não volta ao formato antigo por causa do Markdown | accepted, aguardando integração |
| SA97-09 | Arquivos antigos coexistindo de usuário, projeto e plugin, executando a migração de inicialização | Só o arquivo do diretório do usuário muda, e os bytes dos arquivos de projeto e plugin ficam intactos; não cria arquivo-sombra, não altera permissões e não cria caminho de execução compatível para identidade antiga fora de escopo | accepted, aguardando integração de arquivo |
| SA97-10 | Cada entrada da tabela de auditoria: migração concluída e depois leitura/execução/save/restart | O campo antigo é usado só na migração, sem compatibilidade de estado intermediário; anexa posição da implementação, comando de teste, resultado e conclusão da segunda revisão | accepted, é oportão de conclusão |

1. Complementar a base de publicação real e as cadeias de chamada da tabela de auditoria, e conectar à fase de migração já existente dentro do escopo de diretório do usuário decidido em §3; sem extensão para reescrita automática de projeto ou plugin.
2. Sincronizar a cláusula antiga “Markdown não é reescrito automaticamente” do Todo 96 e marcar este item como nova decisão; o acesso efetivo da execução via effectiveSelection continua sendo feito pelo Todo 96.
3. Escrever primeiro os testes de transformação pura/arquivo e depois mudar a leitura/gravação unificada e a fronteira de migração; remover ramos de formato intermediário desnecessários e conferir as referências reais antes de limpar exports.
4. Tratar as lacunas claras conforme a tabela de auditoria. Registros antigos irrecuperáveis mantêm a fronteira de não migrado já estabelecida e não têm valores adivinhados; não se pode fingir migração bem-sucedida preservando uma leitura antiga de fallback.
5. Completar as evidências de save em Settings e de cold start do child, usando fixture isolada e sem mexer nos dados reais de colegas. Na implementação, seguir as instruções de Agent/Design/E2E, rodar `pnpm typecheck`, `pnpm lint`, os testes unitários relacionados e o E2E no MacBook Pro; registrar o que não foi executado.
6. Fazer a segunda revisão de cada entrada “antes da migração -> escrita concluída -> leitura formal após restart”, salvando testes, diferenças e rastro de decisões. Sem aceitar os dois princípios e a tabela, este Todo não pode ser marcado como concluído.

O graph delta deste ciclo apenas adiciona referências deste plano em model-selection / subagents. Não há nova superfície de UI nem novo owner de negócio; os fatos e invariantes são atualizados depois da implementação. Handoff de E2E: usar fixture de arquivo isolado com amostras reais de campos antigos; afirmar separadamente o artefato salvo e a seleção real do child, sem substituir a evidência de gravação/execução por apenas um print do formulário e sem depender de sleep temporizado.

## 7. Implementação, aceitação e segunda revisão (2026-09-08)

| Caso | Resultado atual |
| --- | --- |
| SA97-01/02/03 | A transformação pura e a integração de arquivo passaram; as duas codificações antigas têm migração offline fixa, com BOM/CRLF/comentários/corpo preservados; idempotência no restart, e arquivos antigos adicionados depois ainda podem ser importados |
| SA97-04 | Codec formal de Host/Agent coerente; três verificações de criação/edição em disco no Pro SE mais o cold start de child do I20, 4 itens aprovados |
| SA97-05 | O modelSelection de estado intermediário não tem ramo de leitura/migração inversa; o serializer formal não produz mais esse campo, e o teste negativo passou |
| SA97-06/08 | O map JSON atual vazio/ruim/sem faixa não relê o double map antigo; a inicialização do Host/Agent independente importa e grava antes, e o map antigo fica só para rollback; o I20 validou child/high a partir do JSON antigo |
| SA97-07 | Passaram os testes de inicialização concorrente, retry de falha de escrita, edição externa antes da escrita e limpeza de arquivo temporário; não se reivindica a capacidade de travar todas as janelas de competição de editores externos que não respeitam o file lock da aplicação |
| SA97-09 | Com três arquivos CRLF de mesmo conteúdo em usuário/projeto/plugin, chamando cada loader duas vezes seguidas, apenas a identidade de Provider do arquivo do usuário muda, e os arquivos de projeto/plugin e suas identidades antigas explícitas ficam intactos; há também testes de arquivo para link simbólico e arquivo somente leitura sem escrita. Nenhum alias em memória foi adicionado para identidades não migradas |
| SA97-10 | A auditoria de todo o escopo foi registrada em tabela; encontrou-se que o codec comum de Session relia o thoughtLevel antigo, que foi movido para uma importação unidirecional em SQLite e aprovado em 23 testes. A fronteira restante do Wiki foi concluída em §8; o Off-Peak mantém a exceção dedicada já decidida |

- Regressão ampliada: raiz com 61 arquivos/900 casos e Agent com 17 arquivos/201 casos aprovados; em seguida foi adicionado e corrigido um caso vermelho de conflito de codificação de Provider `custom:`, e o Subagent compartilhado passou com 3 arquivos/25 casos.
- Typecheck/lint da raiz e typecheck do bootstrap do Agent aprovados; lint com 41 avisos/0 erros, e os avisos de estoque e a limpeza pendente de 94 itens ficaram registrados separadamente.
- A segunda revisão removeu o helper antigo de conversão de perfil inteiro em memória e o parser duplicado do Host; o reader comum não consulta a conexão atual nem faz fallback de histórico. O ModelSelection do protocolo interno, a seleção congelada em execução, a validação final do Registry, continuous/replayable e a fronteira do Workspace alvo permanecem inalterados.
- Sincronizar as sementes do grafo de subagents e os fatos invariantes; o código detalhado, a base de publicação, as exceções e as evidências de execução estão na tabela de auditoria. A resolução local do Worker na execução explícita de Subagent foi depois concluída pelo Todo99 e não é mais listada como protocolo pendente de decisão.

## 8. Contrato de execução da fronteira restante do Wiki (2026-09-09)

- Esta seção substitui a exceção do Todo96 para o Wiki de “ler campo antigo fazendo só conversão em memória, sem escrever arquivo”. Um `wiki.json` / `draft.json` genuinamente antigo, no primeiro carregamento, entra por uma entrada de migração explícita, e a leitura formal posterior ao sucesso da gravação só consome `modelSelection`.
- A migração só reconhece `generationModel` e `generationOptions.thoughtLevel` já publicados. A existência do campo novo (inclusive null, valor ruim ou o estado intermediário não publicado com ID antiga) já é autoritativa, sem converter a identidade do campo novo e sem completar valor a partir do campo antigo; quando não há seleção antiga importável, registra-se null como já processado e não se adivinha um modelo padrão.
- A importação offline reutiliza a migração de identidade de Provider existente, sem consultar conta, conexão, Registry ou View. Apenas os campos da seleção antiga são removidos, preservando o corpo da página, a árvore de diretórios, os metadados e as options não relacionadas; os arquivos de task ou de página de rascunho não são reescritos.
- A decisão de migrar é tomada relendo dentro do file lock assíncrono existente, e a escrita é atômica; a escrita normal e a remoção do arquivo alvo usam o mesmo lock. Uma falha de migração preserva o arquivo original e lança erro, permitindo retry no próximo carregamento normal; um arquivo já migrado não é reescrito ao ser lido de novo. Não se adiciona agendador de migração em background nem protocolo de sincronização.
- A leitura formal continua validando a nova seleção pelo schema atual. Indisponibilidade de rede/Provider não pode esvaziar a seleção migrada, e a geração real continua usando a resolução comum de seleção válida, sem rebind na execução fixa nem na recuperação.

```text
旧文件预读 → 发现旧字段 → 文件锁内重新读取 → 离线导入 → 原子落盘
                              ↑                         ↓
                         与保存/删除同锁          正式 reader 只读新字段
```

- SA97-W01: um Wiki/Draft genuinamente antigo é gravado já na primeira leitura e o resultado é idempotente após reconstruir o Storage; SA97-W02: campo novo vazio/ruim/identidade intermediária não sofre fallback, e campos desconhecidos e corpo são preservados; SA97-W03: falha de escrita pode ser reexecutada, e migração/save/remoção concorrentes não sobrescrevem nem ressuscitam; SA97-W04: cold start de Wiki antigo no Pro com leitura, retorno de modelo/faixa, troca de página preservando o corpo, estabilidade do arquivo após a migração e remoção voltando ao vazio.

### Resultados de aceitação e segunda revisão

- 10 arquivos / 146 testes unitários relacionados a Wiki aprovados (incluindo 11 novos testes de migração de arquivo); typecheck e lint de todo o repositório aprovados (39 avisos de estoque, 0 erros), e a verificação de diff passou. A asserção “ler a estrutura genuinamente antiga não escreve em disco” do teste de Authority existente foi atualizada para a decisão mais recente, e as outras asserções de que a leitura do formato atual não escreve em disco foram preservadas.
- SA97-W01/02/03: testes de arquivo independentes cobrem a migração offline de Wiki/Draft e a idempotência no restart, a preservação de modelo/faixa desconhecidos, o não fallback diante de campo novo vazio/ruim/intermediário, o retry de falha de escrita atômica, a escrita única sob leitura concorrente, a re-verificação dentro do lock após a pré-leitura com save/remoção, e a necessidade de esperar o mesmo lock ao remover durante uma escrita de migração.
- SA97-W04: Pro `desktop-e2e-20260909-122856-891` 1/1 aprovado: após sair da aplicação, foi injetado um Wiki genuinamente antigo, o cold start retornou modelo/high, o arquivo já estava migrado na primeira leitura com a estrutura do corpo intacta, os bytes do arquivo ficaram estáveis depois da troca de página e a remoção voltou ao vazio. Nenhum serviço de modelo foi solicitado.
- Correção na segunda revisão: manter opções desconhecidas em disco não pode restaurar o `maxOutputTokens` de runtime que o Todo94 já revogou. O reader formal continua removendo essa opção obsoleta; a seleção válida atual, o congelamento da geração, a recuperação em background e a autoridade do limite de saída não foram alterados.
- As modificações de produção ficaram restritas a `repoWikiStorage.ts`; não foi introduzida dependência de Account/Provider, migrador temporizado, mudança de protocolo nem uma segunda autoridade de seleção. O lock atômico coordena apenas processos da aplicação que respeitam esse lock, e não se reivindica proteção contra escrita arbitrária de um editor externo. Desktop continuous e celular replayable reutilizam o Storage do Host dono, sem mudar o fluxo de mensagens nem o workspaceIdentity.