# Issue tracker: Markdown local

Issues de projeto usam arquivos Markdown locais. O usuário já exigiu explicitamente que não sejam criadas Issues no repositório remoto; o alvo só muda para publicação online mediante um pedido explícito posterior. O remote Git indica apenas a localização do repositório de código e não deve ser usado para inferir onde as Issues são publicadas.

## Arquivos e status

- Uma spec completa já existente em `docs/` pode servir diretamente como Issue local, mantendo o caminho original e sem duplicar o corpo em um segundo arquivo.
- Novas Issues independentes ficam em `docs/issues/<feature-slug>/<NN>-<slug>.md`, um arquivo por tarefa; numa mesma funcionalidade, a numeração é sequencial a partir de `01`. Subtarefas de implementação de uma spec existente fazem link para essa spec.
- Abaixo do título do arquivo usa-se uma linha `Status:` para registrar o status. Specs implementáveis diretamente usam `Status: ready-for-agent`; os demais estados de triagem seguem `needs-triage`, `needs-info`, `ready-for-human`, `wontfix`; ao iniciar e ao concluir a tarefa, são atualizados para `in-progress` e `done`, respectivamente.
- Associações e dependências usam links Markdown locais; registros de discussão são adicionados conforme a necessidade ao final do arquivo, na seção `## Comments`, sem necessidade de copiar o texto inteiro da sessão atual para o repositório.

## Mapeamento de operações de skill

- "publish to the issue tracker": grava ou atualiza o arquivo local da Issue, aplica o `Status:` correspondente e retorna o link do arquivo.
- "fetch the relevant ticket": lê o Markdown correspondente ao arquivo informado pelo usuário ou ao número local da Issue.
- "apply ready-for-agent label": grava `Status: ready-for-agent`, sem criar label remoto.
- O workflow de Issue não chama as APIs de criação ou atualização do GitHub/GitLab. O workflow de MR continua seguindo as regras de MR já existentes no projeto; os dois são independentes.

## Issue atual

- [Telemetria de TTFT em fases para mensagens locais no desktop](../monitoring/ttft-stage-telemetry.md)