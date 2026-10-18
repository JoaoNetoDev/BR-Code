# Plano de Classificação Readonly do Bash

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: use superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** Tornar a classificação de permissão readonly do Bash no ZCode conservadora e mantê-la independente da persistência de cwd.

**Arquitetura:** Continuar usando `unbash` para análise de AST e então aplicar uma camada de segurança conservadora sobre comandos simples analisados, redirecionamentos, atribuições e argv. A classificação readonly do Bash pode conceder permissão de plan mode e segurança de concorrência, mas não deve decidir se uma chamada Bash bem-sucedida persiste o cwd.

**Stack tecnológico:** TypeScript, Vitest, `unbash`, serviço de permissões `@zcode/core`, handler da ferramenta Bash.

## Restrições Globais

- Use o contrato readonly abaixo como linha de base.
- Não reabilitar ferramentas dedicadas `Glob`/`Grep` para contornar este bug.
- Não afrouxar o plan mode globalmente; somente comandos Bash seguros de leitura/busca/listagem podem se tornar readonly em runtime.
- A classificação readonly em runtime e a persistência de cwd são preocupações independentes.
- Bash em foreground na thread principal persiste o cwd bem-sucedido dentro do workspace e redefine o cwd fora do workspace para a raiz do workspace, seguindo a política de cwd existente.
- Escopo de subagent/fora da thread principal não deve persistir cwd.
- Nenhum commit automático. A instrução anterior do usuário `不要自动提交` continua valendo.

## Contrato Readonly

- A classificação readonly do Bash analisa o comando e então executa um classificador readonly conservador sobre a AST.
- O classificador rejeita ASTs complexas demais, subshell/instruções compostas, atribuições bare inseguras, expansão de variável não citada, caminhos UNC inseguros, redirecionamentos inseguros, variáveis de ambiente inseguras e combinações inseguras de git/cd antes de verificar os nomes dos comandos.
- As verificações de argv por comando removem wrappers seguros como `command`, `builtin` e `noglob`.
- Um comando é readonly se todo comando simples analisado for seguro pela política direta de argv ou pela regex/política do texto do comando.
- Comandos seguros de leitura/listagem/busca incluem ferramentas comuns como `cat`, `head`, `tail`, `wc`, `stat`, `strings`, `file`, `grep`, `egrep`, `fgrep`, `rg`, `find`, `ls`, `tree`, `du`, `diff`, `pwd`, `whoami`, e comandos triviais como `echo`, `printf`, `true` e `false`.
- `find` é seguro somente quando opções de escrita/execução como `-delete`, `-exec`, `-execdir`, `-ok`, `-okdir`, `-fprint`, `-fprint0`, `-fls`, `-fprintf` e `-files0-from` estão ausentes.
- A permissão automática readonly para git é protegida: `cd/pushd/popd` combinado com git exige verificações de permissão em vez de permissão automática readonly.
- Redirecionamentos não são todos inseguros: redirecionamentos de entrada e merges de fd podem ser seguros, saída para `/dev/null` é segura, mas redirecionamentos regulares de saída, `/dev/tcp`, `/dev/udp` e leituras de Windows/UNC são inseguros.
- A persistência de cwd é controlada pelo contexto de execução (thread principal vs. escopo de subagent); ela não é derivada da classificação readonly.

## Tarefas

### Tarefa 1: Superfície do Parser

- [x] Estender `apps/zcode-cli/packages/core/src/tool/handlers/bash-command-parser.ts` para que cada `BashCommandInvocation` exponha redirecionamentos normalizados e nomes de atribuição, não apenas flags booleanas.
- [x] Manter a detecção de palavra dinâmica conservadora para substituição de comando, substituição de processo, expansão de parâmetro, expansão aritmética, expansão de chaves e glob estendido.
- [x] Preservar a rejeição de erro de parse e de nó não suportado.

### Tarefa 2: Política de Segurança Readonly

- [x] Atualizar a política readonly do Bash com conjuntos de comandos conservadores, tabelas de flags seguras, remoção de wrappers, validação de redirecionamentos, validação de atribuição de ambiente e guardas de `find`/git.
- [x] Manter `apps/zcode-cli/packages/core/src/tool/handlers/bash-readonly-policy.ts` como o pequeno entrypoint público.
- [x] Dividir os internos da política por responsabilidade:
  - `bash-readonly-policy-types.ts`: tipos compartilhados da política.
  - `bash-readonly-policy-flags.ts`: tabelas de flags/valores seguros.
  - `bash-readonly-policy-callbacks.ts`: callbacks de argumentos perigosos por comando.
  - `bash-readonly-policy-commands.ts`: mapas de política de comandos e allowlists.
  - `bash-readonly-policy-argv.ts`: avaliação de argv, redirecionamento, ambiente, wrapper e git.
- [x] Manter todos os padrões conhecidos capazes de escrita negados no plan mode.
- [x] Manter comentários em chinês onde eles explicam a intenção de correção de bug.

### Tarefa 3: Semântica de Runtime

- [x] Atualizar `apps/zcode-cli/packages/core/src/tool/handlers/bash-semantics.ts` para que `isRuntimeReadOnlyBashCommand()` verifique todos os comandos simples analisados usando a política readonly.
- [x] Fazer `isBashReadOnlyCommand()` e a segurança de concorrência compartilharem o mesmo contrato de segurança.
- [x] Remover qualquer comportamento de cwd que dependa da classificação readonly.

### Tarefa 4: Persistência de Cwd no Handler

- [x] Atualizar `apps/zcode-cli/packages/core/src/tool/handlers/bash.ts` para que o Bash bem-sucedido em foreground na thread principal sempre chame `decideBashCwdPolicy(...)`, inclusive para comandos classificados como readonly.
- [x] Preservar a proteção existente de subagent/fora da thread principal via `runtimeScope`.

### Tarefa 5: Testes e Verificação

- [x] Adicionar testes falhando em `apps/zcode-cli/packages/core/tests/bash-permission.test.ts` para comandos seguros de leitura/busca/listagem, redirecionamentos seguros, remoção de wrappers, casos negados de dinâmico/atribuição/escrita, `cd && git` negado e redirecionamentos de escrita negados.
- [x] Adicionar testes falhando em `apps/zcode-cli/packages/core/tests/bash-handler.test.ts` provando que a classificação readonly não suprime a persistência de cwd da thread principal.
- [x] Executar primeiro os arquivos Vitest focados.
- [x] Executar `pnpm --filter @zcode/core typecheck`.
- [x] Executar `pnpm lint` na raiz; registrar falhas não relacionadas, se houver.

## Notas de Verificação

- `pnpm --filter @zcode/core exec vitest run tests/bash-permission.test.ts tests/bash-handler.test.ts` passou.
- `pnpm --filter @zcode/core typecheck` passou.
- `oxfmt --check` nos arquivos Bash tocados e neste plano passou.
- `pnpm lint` passou apenas com os warnings existentes.
- `pnpm typecheck` ainda falha em `packages/desktop/test/e2e/reporting/e2e-ui-coverage.ts` porque os pacotes Istanbul existentes não têm declarações locais e vários parâmetros de callback são `any` implícito.
