# Merge do branch de Provider para staging: 2026-09-12

## Objetivo e escopo

- Branch atual `provider-stabilization-20260911`, com `2fece1a06e` antes do merge; fonte fixada em `75021ca5b5` de `origin/staging` (8 commits novos).
- Um merge normal preserva o histórico dos dois lados, não recria os commits da fonte e não usa ours/theirs de arquivo inteiro; nenhum aplicativo nem configuração de Provider em produção é publicado.
- Todo133／141 permanecem em Draft; não se modificam de passagem a validação de segurança de requisição, a sincronização de contas, migrações de banco, modelos em execução ou o protocolo de recuperação do celular.

## Adjudicação da fonte e revisão bidirecional

| Fonte | Comportamento e tratamento | Interseção com este branch e conclusão |
| --- | --- | --- |
| `6de4b30fa6` | Anotações de Crashpad para arquivamento de crash e resumo de OOM do V8; mantido integralmente | Limite de diagnóstico do main, não altera o Provider nem o estado da sessão |
| `1a01204a8b` | Diff/highlight de código unificados no motor WASM; mantido integralmente | Worker e thread principal coerentes nas quatro entradas, sem modificar o editor de modelos |
| `c8b578f771` | Aviso a cada vez que a quantidade de anexos é excedida; mantido integralmente | Compartilha o Composer com a seleção padrão de compartilhamento, mas o escopo de anexos e os rascunhos de modelo/modo são independentes entre si |
| `ff0f3a5274` | Pacote de desenvolvimento do macOS preserva symlinks relativos e a impressão digital do cache de upgrade; mantido integralmente | Não altera pacotes oficiais, configuração de modelos nem diretórios de dados |
| `df72056924` | Log de validade das credenciais MCP oficiais deduplicado por bucket horário; mantido integralmente | Afeta apenas o diagnóstico, sem alterar autenticação, julgamento de entitlement ou validação de segurança de requisição de modelo |
| `75021ca5b5`、`eb71ba51c2`、`6121d8ba48` | Commits de merge da fonte; preserva o histórico real | As diferenças de arquivo seguem os grupos de funcionalidad acima, sem portar em duplicidade |

Não houve conflito explícito nem alteração do mesmo arquivo pelos dois lados; os 20 arquivos da fonte foram mantidos como estão no candidato. Verificação inversa: neste branch foram preservados o Header/validação de segurança, o editor de modelos, a marca visual de Start, o rascunho vazio de raciocínio, a seleção padrão da primeira vez que se compartilha e a mudança do catálogo em ociosidade. A cadeia de submissão de configuração de `SessionPane`／`ConversationComposer` e as context_refs de compartilhamento não foram reescritas por este merge.

## Complemento da superfície de impacto do MR (impact-only)

- O grafo de funcionalidades `codeSeeds` foi consultado de volta contra o diff completo do branch atual, lendo as arestas de um salto: atingiram capacidade de modelo, configurações de Provider, continuação de compartilhamento e os nós de model IO/histórico de raciocínio no mesmo arquivo de runner.
- must-inspect: página de configurações → edição de rascunho → configuração Personal; resultado do compartilhamento → rascunho de Composer independente → Submission existente; Builtin → Registry → View ocioso; Header do ambiente de execução → Model Adapter → validação de segurança de requisição.
- should-inspect: seletor de modelo compartilhado, validação de execução do Registry e saídas públicas comuns de modelo como título/teste de conexão. Herança de runtime, mensagens históricas, filas e Tickets não recebem caminhos alternativos novos.
- owner／ponto de queda: a edição fica temporariamente como rascunho de UI, mas o salvamento ainda vai para Personal; o compartilhamento apenas inicializa um rascunho independente no lado receptor, e o envio é quem submete; capacidades e modelos continuam publicados pelo Registry. A semântica de entrega do shared-host no celular e continuous/replayable no desktop não muda.
- Um arquivo atingido não é dependência de negócio: o runner apenas repassa defaultHeaders, e isso não autoriza afirmar mudança na recuperação do histórico de raciocínio / Model IO.
- Diferença de reconciliação: as regras visuais de AGENTS e os rascunhos de Todo133／141 são apenas documentação; os demais diffs são spec de acompanhamento das funcionalidades acima, i18n e testes unitários / fixtures de browser. Os logs de diagnóstico／Diff／anexo／empacotamento／MCP de staging são itens preservados desta consolidação e não constituem diferença adicional do MR em relação a staging.
- Este ambiente não tem Codegraph, e nenhuma consulta automática de callers/impact foi executada; foram usados seeds do grafo real, relações de um salto, leitura precisa das chamadas e testes, sem se passar por varredura automática completa.
- Deriva do grafo: os antigos nós/arestas de ContextChip e algumas descrições antigas de campos de provider ainda dependem de manutenção separada; este branch já atualizou os seeds reais da superfície de compartilhamento no Todo139. Este merge não Amplia a correção para o grafo inteiro.

## Verificação

- Testes unitários direcionados do candidato de merge: 12 arquivos, 126 casos aprovados, cobrindo todos os testes unitários da fonte e o rascunho/submissão do Composer, as referências de compartilhamento, o catálogo em ociosidade e o MCS.
- `pnpm typecheck`: aprovado.
- `pnpm lint`: aprovado, com 42 avisos preexistentes e 0 erros.
- `pnpm architecture:check --changed`: 0 violações antes e depois do merge; `git diff --check` aprovado.
- Logs: `/tmp/staging-merge-20260912-{unit,typecheck,lint}.log`.
- A validação das funcionalidades existentes segue as evidências reais de Todo134／135／137／138 e de `todos-136-139-140-review-20260912.md`, sem reescrever execuções históricas como se fossem uma nova rodada desta.
- Nesta rodada não foram executados Electron nativo, macOS/SSH/celular reais nem requisições de modelo em produção. A aceitação conjunta do Todo139 (compartilhamento público → SessionPane nativo → primeiro RPC) permanece pendente; a falha de baseline já existente no teste de faixa de valores do ox-alpha não foi ampliada nem declarada como tudo verde.

## Entrega

Conforme solicitado pelo usuário, este merge real foi commitado, enviado usando o workflow zcode-mr e teve o MR criado para staging; o MR não é combinado automaticamente e nenhuma configuração real de usuário é modificada.

## Achados do portão de push e fechamento dos testes

- O pre-push obrigatório com a suíte completa de testes unitários apresentou duas falhas. O teste de Responses do ox-alpha ainda exige um único disabled, em conflito com as duas faixas genéricas já decididas no Todo138 deste branch; apenas a asserção foi alinhada, com verificação adicional de que enabled é mapeado para high, sem modificar a configuração.
- O caso de sobrescrita in-place de Memory reproduz de forma estável neste sistema de arquivos: escritas adjacentes do mesmo inode e mesmo comprimento podem preservar o mesmo timestamp, e o fixture não garante uma mudança de versão de arquivo observável. O teste define o mtime inicial para um valor fixo e antigo antes da leitura, deixando a escrita in-place atualizar naturalmente; ainda assim verifica-se o IO real e a recusa do serviço, sem sleep e sem mockar o erro final.
- Os testes de Memory e a implementação de produção são idênticos a origin/staging. desta rodada apenas torna o preâmbulo do teste determinístico; a limitação de projeto pré-existente — mudanças de conteúdo com mesma identidade/length/timestamp podem não ser detectadas por stat — continua existindo, sem alegar correção e sem expandir para hash de conteúdo ou mecanismo de lock.
