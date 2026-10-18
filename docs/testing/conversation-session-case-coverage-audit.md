# Auditoria de Cobertura de Cases de Sessão de Conversa

Objetivo: transformar a contagem de cases e o status de cobertura da área de sessão de "contagem
manual e verbal" em uma verificação mecânica repetível, evitando o erro de contagem "o WDIO passou
verde, mas ainda há cases não cobertos no catalog formalizado".

Documentos relacionados:

- Catalog do caminho principal: [conversation-session-case-catalog.md](../conversation-session-case-catalog.md)
- Matriz de cobertura do caminho principal: [conversation-session-e2e-coverage-matrix.md](./conversation-session-e2e-coverage-matrix.md)
- Catalog de falhas de ambiente externo: [conversation-session-environment-fault-catalog.md](./conversation-session-environment-fault-catalog.md)
- Matriz de cobertura de falhas de ambiente externo: [conversation-session-fault-e2e-coverage-matrix.md](./conversation-session-fault-e2e-coverage-matrix.md)
- Backlog de decisões pendentes: [conversation-session-decision-backlog.md](./conversation-session-decision-backlog.md)
- Roadmap E2E de decisões pendentes: [conversation-session-decision-e2e-roadmap.md](./conversation-session-decision-e2e-roadmap.md)
- Fila de review de decisões pendentes: [conversation-session-decision-review-queue.md](./conversation-session-decision-review-queue.md)
- Próximo lote de review de decisões pendentes: [conversation-session-next-decision-review.md](./conversation-session-next-decision-review.md)
- Template de resposta do próximo lote de decisões de produto: [conversation-session-next-decision-answer-template.md](./conversation-session-next-decision-answer-template.md)
- Rascunho de respostas de decisões de produto: [conversation-session-decision-answers.md](./conversation-session-decision-answers.md)
- Status das respostas de decisões de produto: [conversation-session-decision-answers-status.md](./conversation-session-decision-answers-status.md)
- Plano de backfill das decisões de produto: [conversation-session-decision-backfill-plan.md](./conversation-session-decision-backfill-plan.md)
- Quadro de status do workflow de decisões de produto: [conversation-session-decision-workflow-board.md](./conversation-session-decision-workflow-board.md)

## Definição mecânica

Script: `scripts/audit-conversation-session-case-coverage.mjs`

Limite de execução: esta auditoria é executada explicitamente ao planejar, promover e inventariar
cobertura de cases E2E; não é ligada ao `pnpm test` / `verify:pre-push` padrão. O motivo é que ela
valida o catalog, a matriz de cobertura, o roadmap e as estatísticas instantâneas do Markdown
gerado; esses arquivos são frequentemente atualizados em fases ao longo de uma mudança E2E, e
colocá-los em um teste unitário comum faria cada commit passar por um gate de estado intermediário
exigente demais.

Comandos:

```bash
node scripts/audit-conversation-session-case-coverage.mjs --check
```

Gate de conclusão:

```bash
node scripts/audit-conversation-session-case-coverage.mjs --check --require-complete
pnpm audit:conversation-session-complete
```

Um `--check` comum apenas prova que as estatísticas entre o catalog, a matriz de cobertura, o
backlog de decisões pendentes, a worksheet, o rascunho de respostas e o documento gerado são
consistentes; ele pode continuar passando na fase "ainda faltam decisões de produto". É
`--require-complete` que é o gate final de cobertura: enquanto houver product case
`undefined` / `decision-needed`, accepted case ausente, ou o decision roadmap ainda parado em
`blocked-by-product-decision`, o comando precisa falhar.

Markdown de fila gerado para review caso a caso pelo produto:

```bash
node scripts/audit-conversation-session-case-coverage.mjs --check --review-queue-md
```

Gerar apenas o próximo lote de review:

```bash
node scripts/audit-conversation-session-case-coverage.mjs --check --review-next-md
```

Gerar apenas um case específico ou os N primeiros da fila:

```bash
node scripts/audit-conversation-session-case-coverage.mjs --check --review-queue-md --review-case F09
node scripts/audit-conversation-session-case-coverage.mjs --check --review-queue-md --review-limit 3
```

Template de resposta para o produto preencher diretamente, usando por padrão o próximo lote de
review:

```bash
node scripts/audit-conversation-session-case-coverage.mjs --check --answer-template-md
node scripts/audit-conversation-session-case-coverage.mjs --check --answer-template-md --review-case F09
```

Verificar no rascunho de answers quais cases já estão preenchidos e quais ainda não têm resposta:

```bash
node scripts/audit-conversation-session-case-coverage.mjs --check --answers-status-md
```

Gerar o plano de backfill dos cases já preenchidos:

```bash
node scripts/audit-conversation-session-case-coverage.mjs --check --backfill-plan-md
node scripts/audit-conversation-session-case-coverage.mjs --check --backfill-patch-md
node scripts/audit-conversation-session-case-coverage.mjs --check --backfill-json
```

Pré-visualizar o plano de backfill com um rascunho temporário de answers:

```bash
node scripts/audit-conversation-session-case-coverage.mjs --check --answers-path /tmp/conversation-session-decision-answers.md --backfill-plan-md
node scripts/audit-conversation-session-case-coverage.mjs --check --answers-path /tmp/conversation-session-decision-answers.md --backfill-patch-md
node scripts/audit-conversation-session-case-coverage.mjs --check --answers-path /tmp/conversation-session-decision-answers.md --backfill-json
node scripts/audit-conversation-session-case-coverage.mjs --check --answers-path /tmp/conversation-session-decision-answers.md --require-backfill-clean
```

`--answers-path` substitui apenas a origem das respostas de produto lida nesta auditoria, sendo
adequado para simular a ação de backfill depois que um case é preenchido sem poluir o arquivo real
[conversation-session-decision-answers.md](./conversation-session-decision-answers.md).
`--backfill-plan-md`, `--backfill-patch-md` e `--backfill-json` exibem o mesmo plano de backfill sob
diferentes perspectivas: `--backfill-plan-md` expande por case, `--backfill-patch-md` expande por
arquivo e `--backfill-json` é consumido por automação posterior. O plano de backfill contém os cases
ready, a conclusão do produto, o source status, o roadmap status, o spec E2E sugerido e as quatro
ações de backfill. Cada case ready também traz um target preciso: `worksheetTargets` aponta para a
linha da pergunta de protocolo, `sourceTargets` aponta para as linhas de case do catalog / matriz de
cobertura, `roadmapTarget` aponta para a linha do decision E2E roadmap e `e2eTarget` aponta para o
spec sugerido; os targets carregam o `line` e o valor `current` atuais, funcionando como âncoras
antipASS para o patch automático posterior. Targets de tabela Markdown substituíveis também carregam
no JSON `expectedLine` e `replacementLine`: o primeiro é o conteúdo da linha inteira no arquivo
atual e o segundo é a prévia da linha inteira após inserir a conclusão do produto; o backfill
automático posterior deve comparar `expectedLine` antes de substituir, evitando sobrescrever
modificações concorrentes. `--backfill-json` também emite um `patchPlan` agregado por arquivo, que
concentra todas as linhas substituíveis em `files[].replacements` e os specs E2E a criar ou atualizar
em `files[].createOrUpdate`, facilitando backfill automático ou geração de diff; `--backfill-patch-md`
renderiza o mesmo `patchPlan` em uma tabela revisável manualmente. O arquivo answers real exige por
padrão backfill clean: assim que um case já tiver respostas preenchidas mas a worksheet / source
coverage ainda não tiver sido revertida, o `--check` falha; um `--answers-path` customizado apenas
simula por padrão e não dispara essa falha, a menos que `--require-backfill-clean` seja adicionado
explicitamente. Quando se usa um answers path customizado, o script não verifica se o Markdown
gerado no repositório está stale, pois os documentos gerados só seguem o arquivo answers canônico.

Gera o quadro de status do workflow que liga answer draft / worksheet / source coverage / roadmap:

```bash
node scripts/audit-conversation-session-case-coverage.mjs --check --workflow-board-md
```

## Limite mecânico da admissão formal V4

As estatísticas históricas de cobertura `A-J` respondem "quais evidências de automação os product
cases já tiveram"; a admissão formal V4 responde "se os specs do diretório formal padrão atual
possuem contratos completos e reproduzíveis de forma independente". As duas estatísticas são
independentes: um spec aprovado na admission não promove automaticamente o status de cobertura para
`covered`, e evidências legacy pending também não entram na contagem de admissão formal atual.

O inspector reutilizável está em
`scripts/lib/conversation-session-formal-admission.mjs`. Ele envia ao gate formal apenas os specs
direct-root de `packages/desktop/test/e2e/conversation-session/*.test.ts`; `manual-review/**` é
contado recursivamente como pending, mas seus legacy helpers não fazem o gate formal falhar:

```text
conversation-session/*.test.ts
        |
        v
legacy + manifest + provider/file path + request ledger audit
        |
        +--> admitted ----------> formalAdmission.formal.admitted
        |
        +--> rejected ----------> --check nonzero + exact file/reason

conversation-session/manual-review/**/*.test.ts
        |
        +--> pending inventory --> nao entra em admitted/rejected
```

Cada spec formal direct-root deve atender a:

1. Na AST do TypeScript não pode aparecer um `ImportDeclaration` apontando exatamente para
   `helpers/conversation-session.js`, nem uma `CallExpression` cujo callee seja o identifier
   `prepareConversationE2E`. Imports antigos em strings de documentação não geram falso positivo,
   mas calls reais dentro de template expression ainda são encontrados; wrappers transparentes como
   parenthesized, non-null, `as`, type assertion e `satisfies` são desembrulhados recursivamente
   antes. A auditoria não proíbe genericamente todos os `TID_CHAT_*`; o V4 ainda pode reutilizar test
   ids válidos de tool/history/toolbar/summary.
2. O case manifest e a provider fixture local do case existem; o manifest é versão 1, e `caseName`
   e `spec` devem apontar exatamente de volta para o spec formal atual.
3. O manifest precisa declarar a provider fixture local do case. O path do provider precisa ser um
   caminho relativo sem traversal, com contenção na fixture root do desktop DeepSeek; fixtures de
   arquivo estáticos também precisam estar contidos na fixture root do desktop, e caminhos absolutos
   ou com `..` são recusados diretamente. Para caminhos já existentes também é comparada a
   `realpath` de root e candidate, portanto um symlink dentro da root não pode escapar para fora;
   caminhos inexistentes continuam sendo reportados como missing. O file descriptor em tempo de
   execução só é isento da verificação de existência quando fornece simultaneamente `path` não vazio,
   `description`, e `source` pertencente a `created-by-spec` / `created-by-helper` /
   `created-by-provider-tool`.
4. `providerRequestPolicy: "none"` só pode vir acompanhado de `requests` vazio; requisições com
   source/kind `synthetic` no manifest ou na provider fixture precisam ter `syntheticReason` não
   vazio. O inverso também vale: quando a fixture local do case e as requests estão ambas vazias,
   a policy `none` precisa ser declarada explicitamente — não é permitido tratar uma lacuna de
   contrato como UI pura.
5. A provider fixture precisa ser versão 1 + array `fixtures`; cada item precisa ter `id` não vazio e
   `match` / `response` / `metadata` como object, e metadata precisa declarar completamente a
   kind/source/timing policy.
6. O ledger do manifest precisa cobrir completamente os request ids da fixture local do case, manter
   a mesma ordem de array e casar exatamente, item a item, `kind`, `source`, `timingPolicy` e
   `syntheticReason`. Requests comuns extras só são permitidos a partir do canônico
   `upstream/common.json` e com `metadata.kind=common` na fixture; outras fixtures de provider/other-case
   não podem se passar por common, e request ids duplicados no manifest também são recusados.

Os testes focados do inspector usam diretórios temporários reais e parsing real de JSON/arquivos:

```bash
node --test scripts/test/conversation-session-formal-admission*.test.mjs
```

`conversation-session-formal-admission-audit.test.mjs` faz spawn da CLI de audit real, validando a
saída em JSON/texto, o error exato e o exit nonzero. Ele substitui apenas a synthetic root do
inspector por meio da variável de ambiente controlada `ZCODE_CONVERSATION_SESSION_FORMAL_ADMISSION_ROOT`;
essa variável só está disponível quando o subprocesso herda o `NODE_TEST_CONTEXT` do Node test runner,
e definir apenas `NODE_ENV=test` faz o script sair com um erro test-only. O catalog, a matriz de
cobertura e todas as outras roots de docs continuam lendo o repositório real, e o diretório formal
real não é modificado.

`--json` emite o inventory completo sob `formalAdmission`. Os campos de estatística estáveis ficam
em `formalAdmission.counts`:

```json
{
  "formalAdmitted": 29,
  "formalRejected": 0,
  "pending": 92,
  "missingManifest": 0,
  "missingFixture": 0,
  "legacyHarness": 89,
  "legacyHarnessFormal": 0,
  "legacyHarnessPending": 89
}
```

Os itens recusados ficam em `formalAdmission.formal.rejected[]`. Cada item contém o `specPath`
relativo ao repo, o `caseName` e `reasons[]`; o schema de cada reason é
`{ code, message, specPath, subjectPath }`. Portanto o `--check` falha com um reason code estável e o
caminho exato de spec/manifest/fixture, em vez de apenas entregar números agregados.

O `--check` falha nestas situações:

- Um spec formal direct-root é recusado pelo admission inspector, incluindo legacy helper, manifest /
  fixture local do case ausentes ou com identidade errada, path declarado inexistente, violação de
  provider policy / synthetic reason, ou request id / ordem / metadata do manifest não totalmente
  iguais aos da fixture local do case.

- Um case do caminho principal `A-J` está ausente ou sobrando entre o catalog e a matriz de cobertura.
- Um case `accepted` no catalog não tem status de cobertura na matriz de cobertura.
- Um case `undefined` no catalog foi escrito incorretamente como não-`undefined` na matriz de
  cobertura.
- Um case `covered` / `failing` / `partial` na matriz de cobertura não tem abreviatura de automação, ou
  a abreviatura não está definida na tabela de abreviaturas de teste.
- O arquivo de spec da tabela de abreviaturas de teste não existe, ou não declara nenhum `it(...)` / `test(...)`.
- O arquivo de spec referenciado contém `describe.skip`, `it.skip`, `test.skip`, `describe.only`,
  `it.only` ou `test.only`.
- Um case `undefined` recebeu abreviatura de automação, fazendo parecer que já existem asserções
  estáveis.
- A tabela "estatísticas atuais" da matriz de cobertura está inconsistente com a tabela de
  cases real.
- A tabela "estatísticas atuais" do catalog de falhas de ambiente está inconsistente com a tabela de faults real.
- A matriz de cobertura de faults está faltando ou sobrando em relação às linhas de product fault do
  catalog de falhas de ambiente.
- Um fault case `covered` / `failing` / `partial` na matriz de cobertura de faults não tem abreviatura
  de automação, ou a abreviatura não está definida na tabela de abreviaturas de teste de faults.
- Um fault case `decision-needed` na matriz de cobertura de faults recebeu abreviatura de automação,
  fazendo parecer que já existem asserções estáveis.
- O arquivo de spec da matriz de cobertura de faults não existe, não declara nenhum
  `it(...)` / `test(...)`, ou contém skip/only.
- A tabela "estatísticas atuais" da matriz de cobertura de faults está inconsistente com a tabela de cobertura de
  faults real.
- Os aliases `C01-C03` não correspondem aos undefined cases do caminho principal `F09/G11/G12`.
- O decision backlog não lista por completo todos os product cases `undefined` / `decision-needed`
  atuais, ou ainda mantém cases que não estão mais pendentes de decisão.
- A tabela "estatísticas atuais" do decision backlog está inconsistente com o agrupamento real dos cases
  pendentes de decisão.
- O decision E2E roadmap não lista por completo todos os cases ainda não `covered`, mantém cases já
  `covered` ou desconhecidos, tem status fora do conjunto permitido, ou falta spec / fixture / face
  de observação sugerida.
- O status do decision E2E roadmap é inconsistente com o status da matriz de cobertura do caminho
  principal / de faults, por exemplo a cobertura ainda `decision-needed` mas o roadmap escrito como
  `ready-to-write`, ou a cobertura já `missing` mas o roadmap ainda `blocked-by-product-decision`.
- A tabela "estatísticas atuais" do decision E2E roadmap está inconsistente com a tabela de cases real do
  roadmap.
- As três decision worksheets não cobrem por completo todos os cases pendentes de decisão atuais, ou
  ainda mantêm cases que não estão mais pendentes de decisão.
- As três decision worksheets não listam por completo as 49 perguntas de protocolo dos 40 cases
  pendentes de decisão atuais, o status das perguntas de protocolo não é `answered` / `unanswered`, ou
  a tabela "estatísticas atuais" está inconsistente com as perguntas de protocolo reais.
- As perguntas de protocolo não têm `需要确认`, `候选答案摘要/验证关键词` ou `回写目标`, fazendo com
  que a review queue só possa entregar números, sem entrar direto na confirmação do produto.
- Uma pergunta de protocolo tem `Status=answered`, mas `产品结论` ainda está vazio / `TBD` /
  `待确认` / `待产品确认`.
- Uma pergunta de protocolo tem `Status=unanswered`, mas já tem `产品结论` não-placeholder, deixando a
  conclusão do produto inconsistente com o status.
- O número de question do decision answer draft não existe, ou o mesmo question aparece várias vezes.
- O decision answer draft precisa reservar linhas de preenchimento para pelo menos as 49 perguntas de
  protocolo atuais; placeholder sem conclusão é contado como `placeholder-only`, e só a falta real de
  placeholder entra em `missing`.
- No decision answer draft canônico, um case já está completamente preenchido, mas a decision
  worksheet / source coverage ainda não foi revertida; isso bloqueia o erro de contagem "o produto já
  respondeu, mas o status de cobertura continua parado em blocked". Um `--answers-path` customizado só
  ativa o mesmo gate com `--require-backfill-clean` explícito.
- Na decision worksheet, um case já está todo `answered`, mas o catalog / matriz de cobertura de
  origem ainda está em `undefined` / `decision-needed`. Isso indica que a conclusão do produto já
  entrou na worksheet, mas o backfill dos fatos de origem não foi concluído.
- O conjunto de cases do decision readiness é inconsistente com o decision backlog. Um case só entra
  como ready quando todas as suas perguntas de protocolo estão `answered` e há uma `产品结论`
  explícita; caso contrário permanece blocked.
- A decision review queue ordena os cases blocked atuais por lote de backlog e, na saída `--json`,
  inclui o texto da pergunta, as respostas candidatas/keywords de verificação e o alvo de backfill
  para cada question unanswered. Não se trata de uma conclusão de produto, apenas de tornar
  repetíveis tanto a ordem das próximas perguntas quanto o conteúdo do review.
- O review queue, next review, answer template, answers status, backfill plan e workflow board gerados
  pelo script estão inconsistentes com a saída atual do script, ou os arquivos estão ausentes. Isso
  evita que, depois de atualizar a definição dos cases, os documentos enviados ao produto para review
  continuem em uma versão antiga.
- Com `--require-complete` ativo, se os product cases mesclados e deduplicados ainda tiverem pendências
  de decisão de produto / automação, ou se algum accepted case não tiver cobertura estável, o comando
  falha. Este gate é usado para a aceitação final e não pode ser substituído pela aprovação de um
  `--check` comum.

## Baseline atual

Esta não é a definição de conclusão de produto, apenas uma linha de base para impedir a deriva das
estatísticas:

| Métrica | Valor atual |
| --- | ---: |
| Cases do caminho principal A-J | 163 |
| accepted do caminho principal | 163 |
| undefined do caminho principal | 0 |
| covered do caminho principal | 113 |
| Abreviações de automação | 93 |
| Specs referenciados pela matriz de cobertura | 62 |
| Specs com declarações de teste | 93 |
| Spec referenciado com skip/only | 0 |
| Novos product cases de falha externa | 37 |
| Aliases de falha externa | 3 |
| Infra cases de falha externa | 4 |
| Linhas da matriz de cobertura de Faults | 40 |
| covered na matriz de cobertura de Faults | 0 |
| decision-needed na matriz de cobertura de Faults | 37 |
| missing accepted na matriz de cobertura de Faults | 3 |
| Linhas do backlog pendente de decisão | 37 |
| Linhas do roadmap E2E pendente de decisão | 87 |
| Linhas esperadas do roadmap E2E pendente de decisão | 87 |
| blocked-by-product-decision no roadmap E2E pendente de decisão | 37 |
| ready-to-write no roadmap E2E pendente de decisão | 29 |
| implemented no roadmap E2E pendente de decisão | 21 |
| Linhas cobertas pela decision worksheet | 37 |
| Total de perguntas de protocolo | 37 |
| Perguntas de protocolo answered | 0 |
| Perguntas de protocolo unanswered | 37 |
| Linhas do answer draft | 37 |
| answered no answer draft | 0 |
| Placeholder pendente no answer draft | 37 |
| Linhas de question ausentes no answer draft | 0 |
| Cases ready-to-backfill no answer draft | 0 |
| Cases placeholder-only no answer draft | 37 |
| Cases partial no answer draft | 0 |
| Cases missing no answer draft | 0 |
| Cases draft-ready do workflow de backfill | 0 |
| Cases worksheet-ready do workflow de backfill | 0 |
| Cases source-backfill-needed do workflow de backfill | 0 |
| Cases no decision workflow board | 37 |
| Cases ready de decisão | 0 |
| Cases blocked de decisão | 37 |
| Cases da review queue | 37 |
| Próximos da review queue | N01, N02, N03 |
| Docs Markdown gerados | 6 |
| Markdown gerado stale | 0 |
| Markdown gerado ausente | 0 |
| Perguntas de protocolo Compact P0 | 0 |
| Perguntas de protocolo Network/SSE | 16 |
| Perguntas de protocolo Recovery/Isolation | 21 |
| Product cases após mesclagem e deduplicação | 200 |
| Cobertos após mesclagem e deduplicação | 113 |
| Ainda pendentes de decisão de produto / automação após mesclagem e deduplicação | 87 |
| Completion gate required | no |
| Completion gate coverage complete | no |
| Completion gate covered | 113/200 |
| Completion gate decision-needed | 37 |

Ao adicionar nova semântica de produto no futuro, ela precisa entrar primeiro no catalog e só então
esta auditoria reporta a nova lacuna; depois que o E2E correspondente ou a decisão de produto for
completado, a matriz de cobertura é atualizada. Enquanto um case qualquer não puder receber asserções
estáveis, ele precisa também aparecer no decision backlog, para facilitar o review do produto e a
poda.