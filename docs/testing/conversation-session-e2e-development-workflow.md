# Fluxo de desenvolvimento E2E de Conversation Session

Este documento define o pipeline de desenvolvimento da conversation session, da "enumeração de cobertura" até o "E2E formal". O objetivo é que novos casos avançuem por etapas fixas, evitando modificar na hora da promoção o fixture de replay compartilhado e descobrir dados incompatíveis só depois de esperar várias vezes por E2E longos.

## Duas linhas de pipeline

### Geração de cobertura

A geração de cobertura responde "o que precisa ser testado":

1. Extrair as dimensões de estado da spec de funcionalidade, do case catalog existente e da coverage matrix.
2. Usar a skill `feature-boundary-planner` e a métrica formal-proof para auxiliar na enumeração das combinações.
3. Conversar com produto ou desenvolvedores para podar, confirmando quais combinações são accepted, undefined ou pruned.
4. Produzir ou atualizar `docs/conversation-session-case-catalog.md`, `docs/testing/conversation-session-e2e-coverage-matrix.md` e os documentos de decisão relacionados.

Esta camada só produz documentos e casos a cobrir; não gera E2E formais diretamente.

### Implantação do E2E

A implantação do E2E responde "como testar de forma estável":

1. Escrever ou gerar a spec `manual-review/pending` para os casos accepted.
2. Executar manual/capture, percorrendo automaticamente o caminho do usuário e deixando artefatos de UI, network, log e session.
3. Fazer review manual do comportamento do produto e confirmar a semântica do caso.
4. Organizar o fixture de replay do provider e o fixture de arquivos, formando o contrato formal de teste.
5. Mover a spec para `packages/desktop/test/e2e/conversation-session/`.
6. Rodar o replay default local.
7. Quando precisar entrar na Docker suite, rodar primeiro o `replay-isolated` de spec única e, após passar, registrar no Docker preset.
8. A regressão Docker rotina roda em lote por suite, reutilizando a mesma imagem, contêiner e entry point de build do WDIO.
9. O MR e a GitLab Web pipeline rodam, por job opcional manual, o replay default do diretório formal: o job compartilhado de macOS e o job de macOS dedicado são execução de instância única, e só o job do Windows usa quatro shards nativos GitLab/WDIO. As três entradas reutilizam globs direct-root como `ZCODE_E2E_SPEC=./test/e2e/conversation-session/*.test.ts`; esses globs não são recursivos e só coletam specs já promovidos ao diretório formal, não `manual-review/pending`.
10. A Docker CI só recebe suites já estabilizadas e automatizadas.

A entrada full do Desktop exclui candidatos de forma unificada por diretórios `manual-review` em qualquer nível, e não pode enumerar apenas os domínios conhecidos, senão novos diretórios de bots/settings/feedback seriam coletados indevidamente pela execução full de processo único. Spec explícita ou modo manual-review ainda pode rodar candidatos; o conjunto formal do processo único e o dos shards precisam ser consistentes, sem registrar candidatos sem ambiente de capture como falha de regressão formal.

## Contrato de inicialização compartilhado

### Manutenção do contrato de replay formal (2026-10-15)

A entrada e o Enter da TUI são executados separadamente: usa-se o protocolo de colagem do terminal e espera-se que o conteúdo desta entrada seja desenhado; não se pode tomar os novos quadros gerados pela animação como sinal de que a entrada foi concluída. A conclusão de um comando espera o seu recibo explícito; o desenho incremental do terminal pode emitir apenas o sufixo alterado do texto de placeholder, sem exigir que o placeholder completo reapareça.

O Provider permite mesclar mensagens de sistema adjacentes; o incoming reminder é validado no wire quanto ao texto completo, ao papel e à unicidade, sem exigir um system text block exclusivo. O wrapper de system-reminder do user continua exigindo um block completo e independente e tags pareadas.

O helper de criação de projeto aguarda apenas o rascunho vazio único do pane principal; o campo de entrada de conversas auxiliares pode coexistir e não conta para a decisão de troca do pane principal.

- Os Providers de equipe compartilham o Provider ID, e os itens do menu de modelos são agrupados pela identidade completa da conexão de equipe; o helper especializado recebe a connection key pela fixture e não pode continuar localizando a linha da equipe por `registry-provider:<id>`. O Composer em branco não salva uma troca de seleção não submetida; ao validar a seleção não submetida entre tarefas ou após reinício, mantém-se um rascunho de texto não vazio.

- Depois que o ícone de menção de Plugin passou a ser renderizado por variável CSS, lê-se a URL real de `--mention-image`; não se procura mais o `img` filho removido. O teste de avaliação da loja cria um rascunho independente, e os casos posteriores com cwd fixo precisam preparar de novo o projeto de fixture.

- Os artefatos do app de teste devem ser independentes do `out` compartilhado: usa-se copy-on-write (cópia normal quando o sistema de arquivos não suporta), nunca hard link. Quando o build de origem for sobrescrito no lugar pelo `tsc -b` ou quando um exemplar isolado for escrito pelo teste, os demais exemplares de replay precisam permanecer inalterados. Após a checagem de tipos, é preciso refazer o build E2E; não se pode reutilizar a entrada do Host sobrescrita pelo emit do TypeScript.

O caso especial I68 precisa fornecer explicitamente as quatro faixas de reasoning Option Spec e o mapeamento do protocolo de requisição; não se depende mais da complementação pelo Agent catalog descontinuado. O teste de herança do editor de modelos precisa remover a sobrescrita exata de `disabled` do replay genérico, manter a configuração recomendada atual e expandir explicitamente a área avançada a cada reabertura.

A lista `values` da reasoning Option Spec é ordenada de baixa para alta, e o último item é a faixa máxima padrão na troca ativa de modelo; a fixture de I20 fornece explicitamente as `off/low/high/max` que ela assere, sem seguir a antiga regra de colocar o valor padrão em primeiro. O teste de cobertura do profile somente-leitura do plugin oficial usa o `documents:visual-judge` atual, sem procurar mais o `document-skills:judge` descontinuado.

Depois de salvar um Subagent, fecha-se o formulário primeiro e só então a lista é atualizada de forma assíncrona. Para editar de novo, é preciso esperar a linha voltar a `role="button"`; não se pode apenas esperar a linha existir e clicar em uma linha que ainda está atualizando e sem o evento de edição vinculado.

Os casos formais de settings localizam a entrada por uma identidade estável: I23/I24 criam um Personal Provider a partir do BigModel Template e conferem a API Key e a hidratação de modelo pelo ID da nova instância, sem consultar o item de conexão de Family API Key descontinuado. O escopo de Subagent é selecionado por `data-plugin-scope-key`, entre `user` e a workspace key alvo; o nome de exibição contém informação de dispositivo, e não se pode determinar a identidade apenas pelo nome cru do projeto. O caso formal de MCP reutiliza a inicialização V4, preservando a negociação real do Agent e as asserções de wire.

A coleta de telemetry das tarefas em background é reiniciada por case no HTTP mock e no buffer do ARMS; não se pode reutilizar um cursor entre cases, senão cases intermediários sem asserção de telemetry também contariam para a asserção de contagem exata da seguinte.

A visibilidade da linha de tarefa em background usa o `checkVisibility` nativo do navegador. Os ancestrais com `display: contents` do V4 não têm sua própria caixa de layout, mas não ocultam os filhos; não se pode exigir que cada ancestral tenha um retângulo não nulo, sob pena de tomar controles running/stop visíveis como desaparecidos.

Os dados de preparação dos casos formais precisam satisfazer o contrato de produto atual; não se pode eliminar falhas reduzindo asserções, pulando o caso ou alterando a lógica de negócio:

- Os cenários de arquivos, Hook e cold recovery de diretório fixo mantêm o cwd pela entrada de nova tarefa do projeto; a nova tarefa global continua validando um diretório independente, sem misturar as duas entradas.
- A preferência de modelo precisa ser declarada em `reasoningLevel.values` da fixture; o caso especial que verifica os parâmetros de pensamento da requisição também fornece um Option Map não vazio, enquanto o replay comum mantém o mapa vazio.
- `/plan` é a ação local `app-slash:plan`; a identidade de session formal só exige ser não vazia e não draft, sem depender do prefixo `sess_`.
- A seleção de Markdown entra na requisição por referência estruturada, verificando o caminho de origem e o corpo em `<conversation_quote>` e as referências históricas, sem mais exigir o wrapper antigo `# userselect`.
- A fixture de integração de Bot usa o contrato de reserva de criação de session do repositório do projeto; o ToolSearch coleta o corpo completo quando o evento de requisição real chega e continua arquivando o Model IO original do Adapter, sem tomar a contagem estatística de eventos em memória reduzida como o corpo da mensagem.
- Ao configurar o Provider na página de settings, primeiro tira-se o foco do campo de entrada e confere-se a gravação dos campos de conexão; só então se opera o menu de formato de API. Se o formato está selecionado, o critério é o `data-state=checked` do menu; o overlay Personal ausente pode herdar o formato de protocolo do Template, e não se pode pular a troca usando o valor default de um snapshot antigo.
- Após o fork, a identidade de session troca primeiro e a projeção de capacidades do modelo chega depois; espera-se o conjunto de capacidades alvo ficar pronto antes de asseverar a faixa e a requisição real, sem tomar o conjunto vazio do instante da troca como capacidade final.
- Quando um lote falha e um único cenário passa, verifica-se primeiro o limite estável dos owners de preparação, limpeza e navegação, sem aumentar tempos de espera fixos. Exceções reais de produto, como permissão, mantêm a asserção original e são listadas como bloqueio.

```text
requisitos de diretório e modelo do case → entrada do projeto / fixture de Provider → rascunho atual pronto
                                                   ↓
                               ação real do usuário → asserções de wire / persistência / UI
```

A preparação do Provider de replay `env` padrão escolhe `high`, e sua Personal Config precisa declarar simultaneamente as faixas de pensamento `high` / `max`; o caso especial da barra de ferramentas do Composer também precisa declarar essas duas faixas nos outros presets. Não se pode semear apenas `disabled` e deixar a barra de ferramentas selecionar uma opção inexistente; o replay comum continua usando o mapeamento de parâmetros vazio, sem injetar parâmetros de pensamento do modelo real na requisição.

O teste de regressão da entrada precisa usar o glob do diretório formal e reduzir o escopo de casos com exclude; rodar apenas o glob de nome de funcionalidade não prova o caminho de inicialização do CI. Este contrato envolve apenas a camada de inicialização do E2E e não modifica a implementação de produção.

As operações de projeto do `automations-create-manage` usam o `automation-project-select` atual e `role=option`. Conforme a [especificação de projeto virtual B18](../superpowers/specs/2026-09-09-virtual-project-design.md), os candidatos vêm dos projetos virtuais locais, sem usar mais o menu de rascunhos de session; a fixture isolada deve listar apenas `ZCodeProject`. Mantêm-se as asserções de criação, edição, pausa, retomada e exclusão, sem tomar a antiga entrada «não trabalhar em um projeto» como pré-condição do formulário atual.

Specs no diretório formal usam `prepareV4ConversationE2E` para levar o teste a um "rascunho vazio pronto para envio"; candidatos da fase de migração em `manual-review/pending` ainda podem usar `prepareConversationE2E`. Specs já promovidos não podem importar o legacy `helpers/conversation-session.js`: operações de pane/composer/timeline do V4 vêm de `v4-conversation.ts`, asserções de bloco de tool vêm de `conversation-session-tool.ts` e asserções de request do provider vêm de `conversation-session-network.ts`. Essa fronteira apenas converge a implementação da evidência formal e não altera as combinações de estado de produto do catalog.

Antes do merge da promoção formal também é preciso satisfazer simultaneamente dois contratos mecânicos: as operações de composer, message, queue, estado de execução e troca de task da spec só podem ler o helper do V4 / helpers especializados já separados; o `requests` do case manifest precisa espelhar item a item o `id` e o `metadata` completo na ordem de array do provider fixture case-local. Quando o fixture ajusta a ordem de matcher, o `kind`, o `timingPolicy` ou o `syntheticReason`, o manifest precisa ser sincronizado no mesmo commit, para não deixar dois contratos de replay divergirem. `pnpm audit:conversation-session-coverage` é o portão de admissão final; não se pode afrouxar a regra de formal admission para deixar helper legacy ou divergência de ledger entrar na direct-root suite.

`prepareV4ConversationE2E` só é responsável por levar o teste ao "rascunho vazio pronto para envio", precisa ser idempotente e não pode tratar a própria inicialização como uma operação de produto "criar nova tarefa". Se, após o cold start ou a reativação do workspace, já valem `activeTaskId=null`, o pane do V4 com `data-session-id="draft"`, o estado idle e o composer visível, o rascunho é reutilizado diretamente após a configuração do provider; só se clica em nova tarefa quando ainda houver session existente vinculada, quando a página não for draft ou quando o composer não existir.

A preparação da fixture de diretório fixo também precisa confirmar que o cwd do owner de navegação é o diretório principal `ZCodeProject`, e isso precisa acontecer antes da inicialização do Provider. O rascunho vazio inicial nesse diretório pode ser reutilizado mesmo sem rótulo de projeto; não se pode repetir a criação para completar o rótulo, o que trocaria o owner de pré-aquecimento. A criação global segue a especificação de projeto virtual D3 e cria um diretório independente, e não pode ser usada para inicializar a fixture de diretório fixo; session existente, outro cwd ou rascunho não vazio devem voltar ao diretório da fixture pela entrada de nova tarefa da linha de projeto existente. `skipShellReady` preserva a semântica de workspace preparado pelo chamador e não força a escolha da fixture local. `startNewV4Draft` explícito continua clicando na entrada global de nova tarefa.

A preparação de acesso total dos casos de ferramenta reutiliza `switchV4Mode("yolo")` e confirma o retorno do comando pelo `data-mode` do composer V4 atual; não se pode consultar a antiga Select option nem agregar a configuração de outros workspaces para julgar a permissão atual.

A preparação de tamanho da janela reutiliza `setCurrentElectronRendererContentSize`, seleciona a janela pela URL atual do WebDriver, define o tamanho da área de conteúdo e confere o viewport do renderer pelo zoom factor real. Não se pode estimar a área de conteúdo subtraindo uma margem fixa do tamanho externo. Os casos responsivos de saída em background e de tarefa em background adotam 800px de altura de conteúdo, mantendo as quebras de largura existentes e as asserções de rolagem; sem depender de o monitor do host suportar janelas de 900/1000px de altura.

```text
workspace shell ready -> inspecionar rascunho do projeto de fixture
                              | vazio e idle -> reutilizar
                              | caso contrário -> nova tarefa no projeto
                              v
                         provider setup
                              v
                     reinspecionar rascunho -> selecionar modelo e nível de pensamento
```

`startNewTask` continua representando uma ação explícita do usuário dentro dos passos de teste: é preciso clicar de verdade na entrada de nova tarefa e esperar o mesmo conjunto de condições de draft, e isso não pode ser substituído pela inicialização idempotente. O helper compartilhado prioriza test id / pane / renderer store do V4 para composer, controles de envio/parada, mensagens e estado de execução, usando o legacy ChatView apenas como fallback de compatibilidade. Quando a inicialização ou a criação explícita falha, o helper deve carregar na mensagem de erro o estado do pane/store, se o composer existe e quais test ids estão visíveis, evitando que o before hook deixe só um timeout sem contexto do tipo "elemento não exibido". Quando o pane do V4 é draft, o helper precisa obter do TabStore da janela atual `workspaceKey = activeWorkspaceIdentity?.trim() || activeWorkspacePath` e ler exatamente esse bucket, proibindo adivinhar entre vários draft workspaces com `activeTaskId=null`; quando o pane já está vinculado a uma task, o Goal metadata e o `stopRequested` devem reutilizar a semântica de leitura optimistic/cache do snapshot do task store, sem forjar valor vazio. Esse contrato não adiciona combinações de estado de caso; ele segue os três limites já confirmados no catalog: TSL08 workspace draft, estado H de Goal e action I11 new-task.

## Contrato de dados

O capture artifact é evidência, não o contrato final de teste. O E2E formal usa fixture case-local para expressar o contrato estável.

Diretórios recomendados:

```text
packages/desktop/test/e2e/fixtures/upstream/common.json
packages/desktop/test/e2e/fixtures/upstream/conversation-session/<case-name>.json
packages/desktop/test/e2e/fixtures/fs/conversation-session/<case-name>/
packages/desktop/test/e2e/fixtures/cases/conversation-session/<case-name>.json
```

- `upstream/common.json`: respostas auxiliares realmente reutilizadas entre casos, como a geração de título.
- `upstream/conversation-session/<case-name>.json`: dados de replay do provider exclusivos de uma spec.
- `fixtures/fs/...`: entradas reais de sistema de arquivos necessárias ao caso.
- `fixtures/cases/...`: case manifest, registrando spec, provider fixture, fixture de arquivos, origem das requests e política de temporização.

### Contrato de caminhos de runtime multiplataforma

`.e2e-home` é o diretório de usuário isolado do Desktop E2E e não deve espalhar arquivos de caso no `/tmp` do sistema. Arquivos criados, lidos, modificados ou aguardados pela spec em runtime vão uniformemente para `.zcode-e2e/<case>` sob o workspace `ZCodeProject` onde o Agent realmente executa:

```text
.e2e-home/ZCodeProject/               cwd do workspace do Agent
└── .zcode-e2e/<case>/                arquivos de runtime pertencentes ao caso
```

- Operações de arquivo em Node usam o caminho absoluto nativo gerado pelo helper compartilhado.
- Os caminhos absolutos das ferramentas Read/Write/Edit/Glob/Grep no fixture do provider usam `{{e2eRuntimeRoot}}/<case>/...`; o replay server expande as variáveis antes do casamento de requests.
- Comandos Bash usam caminho POSIX relativo ao workspace `.zcode-e2e/<case>/...`, proibindo depender de `/tmp`, da conversão implícita de drive do Windows para mount do Git Bash ou do diretório TEMP do usuário.
- O `fileFixtures[].path` do case manifest usa caminho relativo ao workspace.

```text
spec native path ─────────────┐
fixture absolute tool path ───┼─> ZCodeProject/.zcode-e2e/<case>/file
Bash relative path ───────────┘
```

Esse contrato garante que, em macOS, Linux e Windows com Git Bash, o Node/spec, a execução de ferramentas e o shell barrier apontem para o mesmo arquivo. Ao adicionar ou modificar um E2E de conversation, além do fixture contract check é obrigatório passar também por uma auditoria de `/tmp` cru.

O `spec` no case manifest e no provider fixture case-local representa uniformemente o **canonical formal target**, sempre escrito como `./test/e2e/conversation-session/<case>.test.ts`. Não é o caminho físico do arquivo atual na fase pending; o caminho atual é expresso pela coverage matrix e pelo `--spec` passado ao comando. Assim o contrato de fixture permanece estável do pending ao formal, e a promoção apenas move a spec, sem precisar reescrever ou sobrescrever o conteúdo de fixture já organizado manualmente.

```text
manual-review/pending/<case>.test.ts   arquivo atual aguardando review
                 │ o fixture check lê o arquivo atual e o contrato de fixture canônico
                 ▼
fixture JSON: spec=conversation-session/<case>.test.ts
                 │ human review + promotion
                 ▼
conversation-session/<case>.test.ts   o canonical formal target passa a ser o arquivo atual
```

Casos puramente de UI que só validam input, menu, seleção por teclado etc. e não enviam prompt podem escrever explicitamente `noProviderRequests: true` no manifest e manter `requests: []`; nesse caso o provider fixture case-local pode ficar vazio, para expressar "não há contrato de provider" e não uma lacuna de preenchimento.

A fase de migração ainda permite carregar o legacy `provider-basic.json` / `provider-conversation-tool-cross-product.json`, mas novos casos não devem continuar acrescentando respostas dedicadas ao pool compartilhado legacy.

Casos formais puramente de composer, native picker ou outros que não disparam request de provider podem manter o provider fixture case-local vazio, mas precisam declarar explicitamente `"providerRequestPolicy": "none"` no manifest e manter `"requests": []`. Esses casos ainda precisam rodar `e2e:fixture:check` e o replay local; a declaração significa apenas que o contrato estável daquela spec é "não gera request de modelo", e não uma dispensa da verificação formal.

## Classificação de requests

Na gravação é possível capturar tudo; ao converter para fixture, apenas as requests necessárias entram no contrato.

| Categoria  | Significado                                                                                   | Tratamento                                                                             |
| ---------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `main`     | requests das quais as asserções centrais do caso dependem, como edit rerun, compact summary, goal verifier | vão para o fixture case-local                                              |
| `common`   | requests auxiliares estavelmente necessárias a múltiplos casos, como geração de título       | vão para o common fixture                                                               |
| `ignore`   | requests que aparecem na captura mas não pertencem ao contrato de teste                       | não entram no fixture case-local; se necessário, são explicadas no manifest             |
| `synthetic`| temporizações/falhas instáveis ou impossíveis de construir na captura real, como stream lento, stream interrompido, 429 | vão para o fixture case-local, com `syntheticReason` escrito             |

Ferramentas podem sugerir a categoria automaticamente com base em marker, path, conteúdo de prompt e ordem das requests, mas a semântica de produto é revisada pelo desenvolvedor.

## SSE Timing

Casos diferentes usam estratégias de replay diferentes, evitando que todos os testes fiquem lentos por causa de stream lento e evitando que um case de performance perca o valor por ser reproduzido com body de uma só vez.

| Estratégia           | Cenário aplicável                                                                     |
| -------------------- | -------------------------------------------------------------------------------------- |
| `fast-text`          | asserções funcionais comuns; basta retorno rápido                                     |
| `controlled-stream`  | casos de stop, queue, interrupted, que precisam de janela de streaming estável        |
| `recorded-stream`    | casos de performance, renderização de Markdown e ritmo de streaming; precisam preservar `responseEvents` / `responseChunkTimeline` reais |
| `fault-stream`       | injeção de falhas como stream interrompido, pacote parcial, socket destroy             |

controlled/fault stream sintéticos precisam explicar o motivo. Exemplo típico: o modelo real é rápido demais e não cobre a stop window de forma estável.

O capture artifact de replay pertence ao ciclo de vida da request: o `pending` de início de request, o estado final de resposta normal e estados finais fail-closed como variável de fixture ausente só podem retornar ao handler depois que o artifact correspondente for gravado. Quando a retentativa de substituição atômica falha de vez, a rejeição precisa entrar no catch unificado de handler do replay server; mesmo com a resposta 500 já encerrada, não se pode deixar a Promise de escrita de diagnóstico como rejeição não tratada em fire-and-forget. Esse caminho de erro usa um artifact writer injetável para teste focado, evitando depender da temporização de disputa de lock de arquivo no Windows. A inicialização do replay server segue o mesmo ciclo de vida: se a primeira escrita de artifact após o sucesso do `listen` falhar, o fluxo de inicialização precisa primeiro aguardar o fechamento do HTTP listener e o encerramento da fila de escrita de artifacts corrente, e só então relançar o erro de escrita original; não se pode deixar uma inicialização de fixture falha deixar porta ou server em background.

## Admissão para promoção

Antes de um caso sair de `manual-review/pending` para o caminho formal, é preciso satisfazer ao menos:

1. O catalog/matrix correspondente já tem semântica accepted.
2. O artifact manual/capture foi revisado, ou o motivo sintético já foi explicado no manifest.
3. O provider fixture case-local e o fixture de arquivos estão prontos.
4. `e2e:fixture:check` passou.
5. O replay default local passou.
6. O caminho na documentação foi atualizado de pending para a spec formal.

Quando o caso pending já tem fixture case-local, é possível verificar o contrato antes da promoção; o verificador lê o marker na spec pending e exige que o `spec` dos dois JSONs de fixture aponte para o canonical formal target:

```bash
pnpm --filter @zcode/desktop e2e:fixture:check -- \
  --spec ./test/e2e/conversation-session/manual-review/pending/<case>.test.ts
```

O manual-review pending isola o modo automaticamente conforme o caso já tenha fixture case-local: usa replay quando há fixture e live/capture quando falta. Para sobrepor temporariamente o conjunto de fixtures ainda se pode passar explicitamente o caminho do fixture; essa variável também troca o provider transport para replay, mas preserva o limite de execução de spec pending de `ZCODE_E2E_MANUAL_REVIEW=1`, evitando tomar evidência de replay por captura real de provider:

```bash
E2E_PROVIDER_REPLAY_FIXTURE_PATH=packages/desktop/test/e2e/fixtures/upstream/common.json,packages/desktop/test/e2e/fixtures/upstream/conversation-session/<case>.json \
  pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec \
  './test/e2e/conversation-session/manual-review/pending/<case>.test.ts'
```

Se a semântica de produto do caso for realmente não disparar request de provider, o manifest precisa declarar isso explicitamente com `providerRequestPolicy: "none"`; caso contrário, um fixture case-local vazio não pode ser promovido.

Antes de entrar no Docker preset, ainda é preciso:

1. O `replay-isolated` em Docker passou.
2. O caminho do artifact foi gravado no registro de execução ou na descrição do PR.
3. Specs sob `manual-review/pending` não entram diretamente no Docker preset.
4. Usar `e2e:docker:admit` para sincronizar o Docker preset e o documento de admissão.

## Entradas por skill

Este documento é a instância de implantação do domínio de conversation session; o processo genérico fica por conta de duas skills:

- `.agents/skills/feature-boundary-planner`: produz o documento de casos a cobrir a partir de mudanças de funcionalidade, matrix, formal-proof e diálogos de poda.
- `.agents/skills/e2e-case-lifecycle`: processo de estabilização da spec manual-review, capture/replay fixture, promotion, Docker admission e CI.

## Processo ferramentas

Para casos pending já confirmados no review, a ferramenta de promotion faz a promoção mecânica:

```bash
pnpm --filter @zcode/desktop e2e:promote -- --spec ./test/e2e/conversation-session/manual-review/pending/<case>.test.ts --reviewed --apply
```

A ferramenta de promotion só faz scaffolding mecânico:

1. Move a spec de `manual-review/pending` para o diretório formal `conversation-session/`.
2. Corrige imports relativos de helper comuns.
3. Gera, quando não existem, o case manifest vazio e o case-local provider fixture vazio; fixture existente mantém o conteúdo, e seu `spec` já precisa ser o canonical formal target.
4. Atualiza na coverage matrix o caminho pending daquela spec para o caminho formal.
5. Executa `pnpm audit:conversation-session-coverage` na mesma transação de arquivo; o resultado da promoção só é mantido se o audit passar.
6. Em caso de falha do audit ou exceção na execução, restaura o snapshot pré-promoção de spec, fixture, manifest e coverage matrix e sai com código 1, proibindo deixar um estado parcial de formal admission.
7. Imprime os comandos seguintes de fixture check, replay case-local, replay default e Docker admission.

A ferramenta de promotion não decide sozinha a semântica de produto nem toma o capture artifact diretamente como contrato. Como `--apply` executa o audit formal dentro da transação de promoção, o desenvolvedor precisa ter preenchido `fixtures` / `requests` antes, na fase pending, a partir do review manual e da classificação de requests, e fazer com que o `spec` do manifest e do provider fixture aponte para o canonical formal target; a promoção não é concluída se o audit falhar. Depois da promoção, rodar:

```bash
pnpm --filter @zcode/desktop e2e:fixture:check -- --spec ./test/e2e/conversation-session/<case>.test.ts

E2E_PROVIDER_REPLAY_FIXTURE_PATH=packages/desktop/test/e2e/fixtures/upstream/common.json,packages/desktop/test/e2e/fixtures/upstream/conversation-session/<case>.json \
  pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/<case>.test.ts'

pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/<case>.test.ts'
```

O primeiro comando de replay carrega explicitamente apenas o common + fixture case-local, para provar que o caso formal não depende do fallback dedicado do legacy `provider-basic.json`.

Antes de entrar na Docker suite, rodar primeiro a prova de contêiner sem rede de spec única:

```bash
E2E_SPEC=./test/e2e/conversation-session/<case>.test.ts \
  pnpm run test:e2e:container
```

Depois de passar, registrar em `conversation-session-verified`:

```bash
pnpm --filter @zcode/desktop e2e:docker:admit -- \
  --spec ./test/e2e/conversation-session/<case>.test.ts \
  --verified \
  --artifact packages/desktop/.e2e-artifacts/<run-id> \
  --apply

pnpm run test:e2e:container:conversation
```

`e2e:docker:admit` só faz registro mecânico: atualiza o preset `conversation-session-verified` em `scripts/test-desktop-e2e-container.sh` e sincroniza `docs/testing/conversation-session-docker-automation-plan.md`. Ele não substitui a prova Docker de spec única nem permite que specs de `manual-review/pending` entrem direto na suite.

Depois de entrar na suite, a regressão rotina não faz mais build/run de Docker por caso. O `conversation-session-verified` passa várias specs para uma mesma execução do WDIO, reutilizando o custo de imagem Docker, subida de contêiner, build do app desktop e build do agent server. A execução Docker de spec única fica reservada para prova de admissão e localização de falha; casos de capture real, fault-stream, sensíveis a performance/tempo, que poluem configuração global ou que dependem de estado especial de rede/sistema de arquivos devem ser separados em preset próprio ou execução em contêiner próprio.

## MVP atual

A primeira fase faz apenas a infraestrutura da linha de implantação de E2E:

1. WDIO suporta carregar automaticamente o provider fixture case-local.
2. `conversation-session-edit` migra como exemplo o fixture dedicado legacy.
3. `conversation-session-running-actions` como segundo exemplo, cobrindo a combinação de tool call somente leitura genérico, final response case-local e controlled slow stream.
4. Disponibilizar o comando de verificação de segundos `e2e:fixture:check`, que verifica o JSON shape, o manifest, o id do fixture e a cobertura de marker da spec.
5. Disponibilizar o scaffolding de promoção `e2e:promote`, reduzindo as operações repetidas de mover spec, corrigir import e criar manifest.
6. Disponibilizar o scaffolding de admissão Docker `e2e:docker:admit`, reduzindo as operações repetidas de manter preset e documento de admissão.

Depois se complementa o capture-to-fixture, convertendo automaticamente o capture artifact em rascunhos main/common/ignore/synthetic aguardando review.

### Restrições atuais de interface e build dos casos formais

- A caixa de entrada principal do I68 usa o menu de modelos combinado e o slider de pensamento; as configurações de Subagent continuam usando o controle de faixas separado. Ambos os lugares verificam o conjunto real de faixas e os parâmetros da requisição.
- O CTP-02B verifica o rótulo Team dentro do menu do avatar; o lote da página de settings fecha a camada de settings remanescente da preparação anterior antes de cada preparação.
- O MP-UI-06 segue o Todo141: exibe por padrão ID, contexto e saída máxima, com a configuração avançada colapsada por padrão; depois do clique para expandir, verifica as caixas de capacidade, a edição de raciocínio e o salvamento.
- Os controles de modelo do I24 usam a codificação `custom:` compartilhada; não se trata o valor de provider/model do protocolo como valor de interface, nem se contorna a asserção de hidratação automática escolhendo o modelo manualmente.
- O CLH-02 injeta falha em toda a escrita do `setting.json` do Host alvo, evitando que a falha única padrão seja consumida pela escrita de inicialização.
- O build pai compartilhado pelos shards não inclui a origem de mock de páginas dinâmicas do subprocesso. O child com mock de página web precisa ser reconstruído depois de alocar a porta; o lock de build compartilhado é retido do build à cópia dos artefatos isolados. Um child comum sem mock pode reutilizar o build pai.

```text
child aloca a porta do mock → obtém o lock de build → compila a origem correspondente → copia os artefatos isolados → libera o lock → replay
```
