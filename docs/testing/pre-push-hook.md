# Pre-push Hook

O repositório agora assume o `pre-push` do Git por meio do Husky.

- Após instalar as dependências, o script raiz `pnpm prepare` é executado e completa automaticamente a instalação do Husky.
- O `pre-push` executa `pnpm run verify:pre-push`.
- O `pnpm test` raiz agora roda apenas testes unitários e não toma mais `packages/desktop/test/e2e` do desktop por casos de Vitest.
- Correção de bug: o glob de exclusão de E2E no script de testes unitários precisa estar entre aspas; sem isso o shell expande `packages/desktop/test/e2e/**/*.test.ts` em uma lista real de arquivos antes da hora, fazendo o Vitest tratar arquivos extras como filters e ao mesmo tempo excluí-los, o que resulta em `No test files found` e bloqueia o push.
- `verify:pre-push` executa em sequência lint, verificação de arquitetura e os testes unitários afetados no escopo do push; a falha de lint, da verificação de arquitetura, dos testes selecionados ou do próprio script bloqueia o push.

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

### Objetivo e entradas

O `pnpm test:unit:affected` usa o changed/related oficial do Vitest e a análise de dependências de módulos do Vite. A entrada fina cuida apenas do baseline do Git, da verificação do workspace de push, do salto para a suíte completa e da explicação do resultado; não mantém grafo de dependências próprio, grafo de consumidores do baseline, filtro de origem nem seleção de testes em Node.

| Entrada                                        | Escopo de seleção oficial                                                                             |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm test:unit:affected`                     | `changed: true`, incluindo arquivos já staged, não staged e não rastreados                            |
| `pnpm test:unit:affected --base <commit>`     | `changed: <SHA>`, incluindo os commits posteriores ao ponto de partida da tarefa e as mudanças não commitadas atuais |
| `pnpm test:unit:affected --scope push`        | Baseline explícito tem prioridade; por padrão usa o remote SHA do hook, e no primeiro push usa o merge-base entre HEAD e origin/staging |
| `pnpm test:unit:affected --files <files...>`  | related oficial, para entradas de arquivos explícicas como o lint-staged                                |
| As entradas acima com `--dry-run` / `--dry-run --json` | Prévia dos arquivos de teste selecionados oficialmente; o JSON contém apenas a lista de testes |

A tarefa registra uma vez o HEAD SHA no início; usa esse ponto de partida no fim. Todas as mudanças não commitadas já existentes antes do início são incluídas; não se salva nem se subtrai o patch inicial. O changed oficial usa a comparação de três pontos do Git e os arquivos não commitados atuais; as mudanças trazidas por um merge participam normalmente da seleção, sem filtro de origem nem operação extra de diferença líquida.

O push exige que não existam mudanças staged, não staged nem não rastreadas (ignorando os arquivos já ignorados pelo Git). Quando não está limpo, sai com código diferente de zero, sem stash automático nem criação de checkout, garantindo que o que é executado é exatamente a versão que será enviada. Um ref de hook que não seja de deleção precisa apontar para o HEAD atual; múltiplos refs chamam a seleção oficial com seus próprios baselines e depois combinam as especificações exatas de teste. Refs de deleção não precisam de teste. No modo de push manual, quando não há entrada do hook, usa-se o upstream; sem upstream válido, usa-se o merge-base com origin/staging. Saída com código diferente de zero em: nenhum baseline utilizável, remote SHA necessário inválido e alvo diferente do HEAD. O baseline explícito tem prioridade sobre o remote SHA do hook; quando não há baseline explícito, o baseline de branch novo usa apenas origin/staging, sem adivinhar outros branches.

A prioridade de baseline em todos os modos é `--base` → `ZCODE_AFFECTED_TEST_BASE` → `ZCODE_PRE_PUSH_BASE` → baseline padrão do cenário. `ZCODE_AFFECTED_TEST_BASE=<ref> git push` entrega ao changed do Vitest o SHA resolvido do branch, tag ou commit indicado; nomes de branch como staging não ficam escritos no código. Mesmo com baseline indicado, o push ainda exige workspace limpo e alvo não-deleção igual ao HEAD. Baseline explícito inválido gera erro, sem recuo para o remote SHA.

Por padrão, quando o workspace não tem baseline explícito, o upstream não é lido. `--files` / `--files-manifest` usam o related oficial e não se combinam com `--base` nem com push.

### Seleção e execução

```text
Cenário e baseline → Verificação do workspace de push → Seleção oficial do Vitest → Comparação com a especificação completa da suíte UT raiz
                                                     ├─ 0: explicar, exit 0
                                                     ├─ parcial: executar a mesma lista de especificações
                                                     └─ completa: explicar o motivo, pular UT, exit 0
```

- A granularidade é o arquivo de teste; depois de selecionado o arquivo, todos os cases dentro dele são executados. Os projetos incluídos na configuração raiz formam toda a suíte UT raiz, excluindo o E2E do desktop e sem incluir os testes independentes do CLI; os testes nativos de Node em `scripts` são executados à parte com `node --test`, sem associação automática.
- A seleção usa o `getRelevantTestSpecifications` público; o `globTestSpecifications` fornece a lista completa. A prévia apenas converte módulos, sem collect/import de testes; a execução usa a mesma instância do Vitest e a mesma lista exata de especificações, evitando que o casamento por substring de nome de arquivo do CLI amplie o escopo.
- O `forceRerunTriggers` oficial mantém a configuração padrão e complementa com o padrão de arquivos de configuração `**/{vitest,vite}.config.*` (o glob padrão atual, com terminação `/**`, não casa com alguns arquivos de configuração), e adiciona o `vitest.setup.ts` comum. Motivo: a análise oficial de dependências de módulos não inclui os setupFiles; mudanças no setup comum precisam contar como impacto de suíte completa, com a entrada explicando e pulando o UT, saindo com sucesso.
- Suíte completa significa selecionar a suíte inteira (identificando as especificações por project/pool/path), e não um limiar qualquer de quantidade. Muitos testes realmente relacionados que não cobrem a suíte completa rodam normalmente. Mesmo em dry-run / JSON, selecionar a suíte inteira e não vazia resulta em explicação e saída com sucesso, sem bloquear o push por causa disso.
- Sem testes selecionados, explicar e sair com código 0; isso não significa que todas as mudanças foram verificadas. As limitações do reconhecimento oficial de dependências valem como sempre, sem compensar com leitura literal de arquivos, dependências de tipo ou baseline de arquivos deletados.
- A precisão da seleção vem de um grafo de módulos preciso, não de regras de seleção: a seleção oficial é o fecho transitivo em nível de arquivo, e um `export *` via barrel repassa a mudança de um módulo para todos os testes que importam o barrel. Por isso, módulos de constantes com alto fan-in passam apenas pelo subpath e não entram no barrel raiz. As constantes de `packages/shared/src/test-ids.ts` só são importadas de `@zcode/shared/test-ids`, e o entrypoint raiz deixa de fazer re-export; importar essas constantes pelo entrypoint raiz é rejeitado pelo typecheck; a família de workflows `test-ids-workflow.ts` continua exportada pelo entrypoint raiz e não se enquadra nesta regra. Motivo: o entrypoint raiz agrega mais de 100 `export *`, e alterar test-ids chegou a selecionar 1379/2638 testes, dos quais cerca de 50 referenciam test-ids diretamente.
- Falha de teste sai com código 1; erros de Git, de argumentos, de baseline, do Vitest e workspace sujo saem com código 2; o salto da suíte completa sai com código 0 e não significa que os testes passaram. Nunca há recuo automático para a suíte completa, nem nova execução completa, nem engolimento silencioso de exceções do seletor. `pnpm test` / `pnpm test:unit` permanecem como entradas explícitas de suíte completa.
- A saída informa a quantidade selecionada e o baseline; no salto da suíte completa, explica que o oficial selecionou a suíte inteira e lista os arquivos alterados do related oficial. O dry-run lista as especificações exatas, e o JSON contém runner/project/pool/path, sem inventar reasons de associação por arquivo.
- As operações de Git/arquivo são assíncronas; mantêm-se a limpeza do hook local env e o manifest JSON do lint-staged, e no Windows os nomes de arquivo não são expandidos pelo shell. Não se modifica o workspace nem o index.

O salto da suíte completa vale para o workspace, para o fim da tarefa, para o push e para as entradas de arquivos explícitas. As falhas de lint, arquitetura, workspace sujo, baseline e dos testes parciais reais do push continuam bloqueando o envio; pular a suíte completa libera apenas o item de affected UT e não significa que os testes passaram.

### Aceitação de regressão

Verificar com repositórios Git temporários, Vitest real e a entrada de linha de comando: a seleção parcial é consistente entre prévia e execução, arquivos não selecionados não são executados, tarefa atravessando commit e WIP antigo, testes novos, salto da suíte completa por mudança de configuração e de setup comum, salto da suíte completa por dependência compartilhada, push git real bem-sucedido após o salto da suíte completa, saída com sucesso quando não há associação, falha de teste, baseline inválido, push em branch novo e existente, bloqueio por workspace sujo e por push fora do HEAD, múltiplos refs e ref de deleção, merge de integração participando normalmente da seleção, e isolamento do manifest do lint-staged e do Git local env. A fixture remove o ambiente externo de push/baseline antes de injetar os parâmetros deste cenário, para que o SHA do repositório real não contamine o repositório temporário.

### Temporização e testes com subprocessos reais

- O algoritmo de temporização é verificado com relógio controlado e eventos de dados quanto à ordem; a fiação real de IO mantém cobertura de integração separada, sem contar o enfileiramento do start de processo na janela curta de um teste algorítmico.
- O teste de encerramento de subprocesso real espera primeiro o evento ready emitido pela fixture depois de registrar o handler de saída, e só então começa a medir o tempo de encerramento; um sleep fixo não prova que o subprocesso está pronto.
- Testes de integração que precisam iniciar um Node independente, exibir a árvore de processos de serviço ou usar dependências nativas dentro de uma janela curta vão para o grupo `fork-isolated` do `vitest.config.ts`. Esse grupo roda em série por arquivo depois dos testes comuns; preserva os processos reais, as asserções originais e os valores de timeout, sem pular casos.
- Os testes de integração de shell de CI para a seleção de origem do frontend de remote control iniciam Git, Bash e Node em sequência, entram no grupo serial acima e preservam a seleção de origem real, a fiação de build, a verificação de limpeza e o timeout original de 30 segundos.
- Os testes de integração de escuta nativa de arquivos também validam a entrega real de eventos no grupo serial; a deduplicação de notificações e a ordem dos eventos são verificadas separadamente com eventos de watcher controlados, para não prender as asserções de lógica ao agendamento de eventos do sistema. O estado do Gen UI cobre escrita externa, evento de arquivo repetido, ACK de escrita com o mesmo valor, e o recebimento de notificação ainda depois de ler o estado mais recente.
- A conclusão normal afirma simultaneamente o código de saída, `timedOut: false` e `aborted: false`. Cancelamento ou deadline não podem tratar uma saída por sinal como sucesso; as asserções de limpeza de recursos devem confirmar que apenas os recursos criados nesta execução foram removidos.

```text
unit comum (eventos/relógio controlados) → fork-isolated (processos reais, série por arquivo)
                                     └─ conclusão normal / cancelamento / deadline → conferir estado e limpeza de recursos
```

### Ambiente de testes nativos do CLI

O affected seleciona apenas o UT do Vitest raiz, e os testes Node de ferramentas são executados à parte, sem substituir o `pnpm --filter zcode-cli test` nativo do CLI. Os testes de sincronização CUA do CLI usam o `ZCODE_CUA_REPO` explicitamente passado para localizar o checkout do producer, e a task de test do Turbo o inclui na chave de cache e o repassa aos testes; não se registra caminho absoluto local e não se altera o pin do producer. `VITEST_MAX_WORKERS` também é repassado e participa da chave de cache, de modo que a verificação completa com recursos limitados pode limitar explicitamente o paralelismo de uma suíte, sem recorrer a aumento de timeout para mascarar falha de asserção.

A entrada completa do CLI constrói o `@zcode/model-option-map` do workspace raiz via pretest, garantindo que os testes do SEA leiam os recursos de runtime mesmo a partir de um checkout limpo; não se pode depender de um dist construído manualmente antes.

