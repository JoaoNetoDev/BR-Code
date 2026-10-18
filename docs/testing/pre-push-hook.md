# Pre-push Hook

O repositório agora assume o `pre-push` do Git por meio do Husky.

- Após instalar as dependências, o script raiz `pnpm prepare` é executado e completa automaticamente a instalação do Husky.
- O `pre-push` executa `pnpm run verify:pre-push`.
- O `pnpm test` raiz agora roda apenas testes unitários e não toma mais `packages/desktop/test/e2e` do desktop por casos de Vitest.
- Correção de bug: o glob de exclusão de E2E no script de testes unitários precisa estar entre aspas; sem isso o shell expande `packages/desktop/test/e2e/**/*.test.ts` em uma lista real de arquivos antes da hora, fazendo o Vitest tratar arquivos extras como filters e ao mesmo tempo excluí-los, o que resulta em `No test files found` e bloqueia o push.
- `verify:pre-push` executa primeiro `pnpm lint` e depois a entrada de testes unitários afetados pelo branch atual; qualquer etapa que falhe bloqueia o push diretamente.

Dessa forma, problemas óbvios são barrados por verificações estáticas mais rápidas antes de o código ser enviado ao remoto, problemas de teste unitário são barrados localmente, e `pnpm test:e2e` permanece como entrada independente para o E2E do desktop.

## Ambiente de desenvolvimento e ferramentas de gerenciamento de versão

O pre-push usa diretamente o pnpm / Node do `PATH` atual e não força dependência de mise. Embora o `mise exec` externo a esse hook pudesse selecionar uma versão específica, ele obrigava desenvolvedores que já tivessem preparado o ambiente com nvm ou outra ferramenta a instalar o mise, falhando antes mesmo de as verificações começarem.

```text
O desenvolvedor prepara Node / pnpm (mise, nvm ou outro método)
    → O Git hook preserva a informação do push ref e limpa o Git local env
    → pnpm run verify:pre-push
    → lint / verificação de arquitetura / testes unitários afetados
```

- O repositório é responsável por declarar as versões de ferramentas e por executar as verificações; o ambiente pessoal é responsável por fazer com que um Node / pnpm adequado seja encontrável pelo Git.
- O mise continua sendo uma porta de desenvolvimento opcional; `mise.toml`, `mise-run.mjs` e a proteção existente de PATH de subprocessos permanecem inalterados.
- Se um cliente Git gráfico não encontrar Node / pnpm, ele pode inicializar seu próprio ambiente de gerenciamento de versões no `~/.config/husky/init.sh` pessoal; veja a [documentação oficial do Husky](https://typicode.github.io/husky/how-to.html#node-version-managers-and-guis).
- A falta de um comando ou a falha de uma verificação continua bloqueando o push; o hook não instala ferramentas automaticamente nem pula verificações silenciosamente.
- Esta rodada apenas remove a dependência do hook em relação ao mise; não adiciona verificação de versão nem altera os requisitos de versão existentes de desenvolvimento, CLI/SEA ou CI.

## Testes unitários afetados

A entrada de testes unitários do pre-push é `pnpm run test:unit:affected`, que por padrão valida as mudanças adicionadas por este push, em vez de comparar sempre com `origin/main`. Ordem de escolha do base:

- Quando `ZCODE_PRE_PUSH_BASE` / `ZCODE_AFFECTED_TEST_BASE` são definidos explicitamente, usa-se o merge-base entre esse base e `HEAD`, o que facilita uma autoverificação manual do escopo de um MR.
- Quando o hook Git `pre-push` passa dados pelo stdin, prioriza-se o `remote_sha..local_sha` contido neles. Isso corresponde ao incremento do branch remoto de rastreamento atual até o alvo deste push, adequado ao push do dia a dia.
- Sem stdin do hook, usa-se `@{upstream}..HEAD` do branch atual, adequado à execução manual de `pnpm run test:unit:affected`.
- Apenas em branch novo ou sem upstream é que se recorre a branches padrão como `origin/HEAD`, `origin/main`, `origin/master`, `main`, `master`, calculando o escopo com merge-base.

A execução concreta acontece em duas camadas:

- `scripts/run-affected-unit-tests.mjs` é responsável por calcular o base, identificar cenários de fallback para a suíte completa e pular mudanças não relacionadas.
- `lint-staged.config.mjs` é responsável por agrupar os arquivos alterados no branch conforme passado em `lint-staged --diff "<base>..<head>"`, e invocar `vitest related --run` conforme a recomendação oficial do Vitest.
- O `lint-staged` foi projetado para pre-commit e faz `git add` automaticamente nos arquivos casados quando a tarefa termina. O caminho principal do pre-push define um `GIT_INDEX_FILE` temporário para ele, evitando que o processo de verificação modifique o index real.
- A tarefa do `lint-staged` inicia o Vitest por meio de `scripts/run-lint-staged-vitest.mjs` e limpa o Git local env antes de iniciar. A razão é que um `GIT_INDEX_FILE` temporário ou variáveis de ambiente de Git hook contaminariam os repositórios Git temporários criados nos testes unitários.

Regras de seleção:

- Quando só mudam documentos, recursos não JS/TS ou arquivos de E2E do desktop, os testes unitários do Vitest não são executados.
- Ao alterar arquivos fonte comuns de JS/TS/JSON, a lista de arquivos é passada via `lint-staged` para `vitest related --run`, que localiza e executa os arquivos de teste afetados. Aqui os changed files não são "apenas os arquivos de teste alterados", e sim a entrada para a análise de relações de import estático do Vitest; por isso, alterar um arquivo fonte faz com que arquivos de teste não alterados que o referenciem sejam executados.
- Ao alterar diretamente `packages/*/test/**/*.test.ts`, os arquivos são agrupados pelo `lint-staged` e esses arquivos de teste são executados diretamente.
- Em cada callback de agrupamento, os arquivos de teste alterados são combinados em um comando `vitest run`, e os fontes relacionados são combinados em um comando `vitest related --run`. Não se divide mais em lotes por arquivo de teste individual ou a cada 8 fontes, evitando iniciar o Vitest repetidamente e reexecutar testes relacionados entre lotes. Esse ajuste revoga a estratégia de lotes de `96fa6b1783` e `9f4a831d8d` sem reduzir o escopo de seleção de testes; a lista de arquivos continua passando por manifest, preservando a proteção para nomes de arquivo especiais do Windows.
- Ao alterar o ambiente de execução dos testes, dependências ou a configuração de TypeScript/Vitest, há fallback para o `pnpm run test:unit` completo. Esses arquivos incluem `package.json`, `pnpm-lock.yaml`, `vitest.config.*`, `vitest.setup.*`, `tsconfig*.json`, `.husky/pre-push`, `lint-staged.config.mjs` e o próprio script de affected tests.
- Ao excluir arquivos de código JS/TS/JSON, há fallback para o `pnpm run test:unit` completo. A razão é que o arquivo excluído não pode mais servir de entrada para o `vitest related`, mas os testes que dependem dele ainda precisam expor quebras de importação ou comportamento ausente.

Essa entrada cobre apenas o escopo de testes unitários do Vitest raiz, ou seja, `packages/*/test/**/*.test.ts`; ela não substitui os testes Turbo/Vitest próprios do `apps/zcode-cli` nem o E2E do desktop.