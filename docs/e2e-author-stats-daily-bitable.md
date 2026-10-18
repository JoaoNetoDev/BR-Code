# Relatório diário de estatísticas de autores de E2E no Feishu

## Objetivo e critério de medição

Esta functionality grava todos os dias, em uma tabela multidimensional do Feishu, as estatísticas de autoria de E2E do desktop, para que a equipe acompanhe snapshots diários e tendências. A fonte das estatísticas é fixa:

```bash
node .agents/skills/e2e-author-stats/scripts/count-e2e-authors.mjs --json
```

O escopo padrão é `all`: `packages/desktop/test/e2e/**/*.test.ts` já rastreados, incluindo
`conversation-session/manual-review/pending`. Cada declaração `it(...)` / `test(...)` conta como um item,
inclusive `.skip`; o autor é o autor Git do arquivo spec onde o item foi inicialmente adicionado, não o autor da última modificação desse caso.

É possível mudar para apenas E2E formal de desktop via `E2E_AUTHOR_STATS_SCOPE=formal`. As estatísticas devem ser executadas em um workspace com histórico Git
completo; clones rasos quebram a atribuição de autoria inicial.

## Estrutura da tabela no Feishu

Por padrão, o script cria ou reaproveita a tabela `E2E 作者统计` na Base apontada por `LARK_E2E_BITABLE_TOKEN`. Os campos são:

| Campo | Tipo | Significado |
| --- | --- | --- |
| 统计键 (chave de estatística) | Texto | `统计日期/范围/作者` (data/escopo/autor), usado para atualização idempotente |
| 统计日期 (data da estatística) | Texto | data em `Asia/Shanghai` |
| 范围 (escopo) | Texto | `all` ou `formal` |
| 作者 (autor) | Texto | nome do autor Git |
| 用例数 (número de casos) | Número | quantidade de casos do autor |
| 总用例 (total de casos) | Número | total de casos no escopo atual |
| 可运行用例 (casos executáveis) | Número | quantidade de casos não pulados |
| 跳过用例 (casos pulados) | Número | quantidade de casos pulados |
| Spec 文件数 (número de arquivos spec) | Número | quantidade de arquivos spec que participaram da estatística |
| 提交 SHA (SHA do commit) | Texto | commit Git usado na estatística |
| 作者归属口径 (critério de atribuição de autoria) | Texto | explicação de atribuição devolvida pelo script de estatísticas |

Cada autor ocupa uma linha por dia. Executar novamente com o mesmo `统计日期 + 范围 + 作者` atualiza a linha existente e não gera snapshots duplicados.

## Configuração e execução

O script é `scripts/ci/push-e2e-author-stats-to-bitable.mjs` e precisa das seguintes variáveis de ambiente:

```text
LARK_E2E_APP_ID
LARK_E2E_APP_SECRET
LARK_E2E_BITABLE_TOKEN
```

`LARK_E2E_AUTHOR_STATS_TABLE_ID` é opcional; quando ausente, a tabela é procurada pelo nome e, se não existir, é criada. Não reutilize
`LARK_E2E_TABLE_ID`: ele pertence à tabela de métricas de resultados de execução, não à tabela de estatísticas de autoria.

O aplicativo Feishu precisa ter permissão de gerenciamento de documentos na Base de destino e as permissões de leitura, escrita, criação de tabela e criação de campo de tabela multidimensional. As chaves só podem ficar no
keychain do sistema ou em um Secret do CI; é proibido enviá-las ao repositório, à documentação ou ao prompt de tarefas automatizadas.

A validação local não escreve no Feishu:

```bash
E2E_AUTHOR_STATS_DRY_RUN=1 node scripts/ci/push-e2e-author-stats-to-bitable.mjs
```

A execução oficial cria a tabela automaticamente, preenche campos ausentes e cria ou atualiza em lote as linhas dos autores do dia.

## Tarefa agendada local

A tarefa agendada do Agent local lê as três variáveis acima do Keychain do macOS e então executa o script de relatório. A tarefa em si não contém chaves; a tarefa
diária deve apenas executar o relatório, sem modificar código e sem criar commits. Por padrão usa o horário de execução diária da manhã em `Asia/Shanghai`; mudar a frequência ou
desativar a tarefa deve ser feito pela interface de gerenciamento de tarefas agendadas do Agent utilizado.

Se a tarefa falhar, verifique primeiro: se o aplicativo Feishu já foi adicionado como aplicativo de documentos da Base, se as permissões do aplicativo foram publicadas, se a entrada do Keychain
existe e se o ambiente de execução consegue resolver `open.feishu.cn`.