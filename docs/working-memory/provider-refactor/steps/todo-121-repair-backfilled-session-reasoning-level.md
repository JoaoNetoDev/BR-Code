# Todo121: recuperar o nível de raciocínio omitido ao escolher a Session durante o backfill da 0020

> Status: em 2026-09-11 foi implementada a migração adicional 0022; a verificação direcionada do runner oficial / Reader de armazenamento e o review local passaram, e a revisão final de entrega do lote permanece pendente. Retoma a lacuna de migração de dados do [Todo109](./todo-109-database-migration-consolidation-and-rollback-readability.md), sem modificar o banco de dados real de usuários.

## Problema e objetivo

A 0020, quando não havia entrada `runtime/model_selection`, pegava o último candidato pela ordem das mensagens. Mensagens antigas de usuário podem ter `model.variant = max`, enquanto as mensagens de assistant seguintes têm apenas a identidade do modelo. Com isso, o novo `modelSelection` da mensagem de usuário preserva o nível, mas a escolha de Session que o backfill gravou fica sem options; como a versão nova só lê a nova escolha da Session, após a restauração o nível fica vazio.

Executando o SQL existente da 0020, o resultado acima já foi reproduzido tanto para modelos customizados quanto para o Coding Plan GLM. As estatísticas de "140 recuperáveis" fornecidas pela outra parte representam apenas a máquina dela, não foram verificadas de forma independente e não são tomadas como escopo total de impacto nem como quantidade de aceitação.

Objetivo: acrescentar uma migração oficial que recupere apenas os níveis de fato omitidos. Sessões que já executaram a 0020 e continuaram em uso, ou que salvaram uma escolha, são simplesmente puladas; não se busca salvar todo o estado histórico, nem se introduz restituição histórica complexa ou defesas desnecessárias.

## Solução final

### 1. Uma migração adicional cobre os dois tipos de usuário

O conteúdo e o checksum da 0020 e da 0021 não mudam; não se reexecuta nem se altera o ledger para contornar a validação. O número mais recente no banco de sessions é 0021; confirme o mais recente ocupado antes de implementar e então acrescente o próximo número, sem reservar 0022 de antemão.

```text
Nunca executou a 0020
  → A 0020 faz o backfill das entradas, preservando o tempo histórico das mensagens
  → O ledger registra o tempo de execução T
  → 0021
  → Nova migração de correção

Já executou a 0020
  → Pula as migrações já executadas, preservando o tempo de execução original T
  → Nova migração de correção
```

Leia `schema_migration.time_applied` da `0020_provider_model_selection` como T. O runner existente executa em sequência dentro da mesma transação de startup e registra após a execução, então o primeiro upgrade também pode usar esse tempo diretamente, sem precisar de dois fluxos de correção.

### 2. Pular primeiro as sessões mexidas depois da migração

A sessão inteira é pulada se qualquer uma destas condições valer:

- `session.time_updated > T`: grava de mensagens/conteúdo normais atualiza o tempo de atividade da sessão.
- `time_updated > T` da entrada de escolha alvo: salvar a escolha isoladamente usa `touchSession: false` e não atualiza o tempo da sessão, então a entrada de escolha precisa ser consultada à parte.

Esse é um filtro conservador que reaproveita os tempos de escrita existentes; não se constrói uma auditoria completa de operações, nem se rastreia qualquer modificação externa ou restauração de histórico. Pular algumas sessões a mais porque outra operação atualizou o tempo é aceitável. A 0021 apenas normaliza identidades e não atualiza esses tempos, portanto não se deve interpretá-la como atividade posterior do usuário.

### 3. Para sessões que não foram mexidas de novo, recuperar somente sob estas condições

1. O tipo da entrada é `runtime/model_selection`, e o ID é o padrão `sessionId:runtime-model-selection`.
2. O data da entrada não tem o `providerId`, `modelId` e `thoughtLevel` antigos achatados; o novo `modelSelection` tem identidade válida de Provider/Model e o membro `options` não existe. Options já existentes (inclusive objeto vazio, null explícito ou outro valor) e escolha explicitamente vazia não são sobrescritos.
3. Pela convenção de ordem da 0020 (`sequence desc, time_created desc, rowid desc`), pega a **última** mensagem com role=user da mesma Session; primeiro seleciona a última e só então verifica se `modelSelection.options.reasoningLevel` dela é uma string não vazia. Não se pode filtrar primeiro as mensagens que têm nível e passar por cima de uma escolha vazia mais recente.
4. Lê diretamente da nova `modelSelection` dessa mensagem de usuário a identidade e o nível. A 0020 já converteu o antigo `model.variant`, e não se adiciona fallback para campos antigos.
5. Depois de normalizar a identidade da mensagem de usuário pelas regras de migração congelada existentes, a recuperação só acontece se ela for igual à identidade da entrada: isso inclui a renomeação de Provider e a regra de maiúsculas do GLM oficial limitada pela 0021; não se ignora maiúsculas globalmente para qualquer Provider/modelo, e não se consulta conta, entitlement, catálogo em tempo real ou Registry.

Atendendo às condições, apenas se acrescenta `data.modelSelection.options.reasoningLevel`, preservando o valor de nível registrado naquela mensagem de usuário, sem usar este item para batizar semântica nova. Modelo diferente, última mensagem de usuário sem nível, dados ruins e demais casos fora das condições são simplesmente pulados.

Não se faz inferência de parentID, não se reconstrói histórico de Guide/fork/troca de modelo, não se busca nível em mensagens anteriores, não se reexecuta a expressão de candidatos da 0020 para perícia histórica e não se adiciona leitura de campos antigos em runtime.

### 4. Limites de dados e implementação

- Só se modifica o `session_entry.data` alvo do banco de sessions nas posições acima; não se altera identidade de modelo, outras options, campos antigos, mensagens históricas, corpo de texto, tasks nem nenhum tempo de atividade.
- Reutiliza o migration runner, a transação e o ledger de startup existentes. Uma correção bem-sucedida é registrada apenas uma vez; um novo startup não reexecuta.
- As regras de conversão ficam congeladas na fronteira da migração e não podem referenciar implementações de Resolver/diretório que mudem com a versão; o SQL é mantido simples e o framework de migrações não é ampliado.
- A restauração normal de Session, o Registry e a UI não mudam. Herda o princípio máximo do Todo109: rollback ou upgrade após rollback pode deixar a escolha de modelo inválida, mas a sessão/task precisa abrir, sem reportar erro por falta do campo novo.
- Escrever testes antes de implementar; não operar o banco de dados real de usuários e não tratar falha de validação de checksum antigo como algo ignorável.

## Aceitação e review

- [ ] Primeiro upgrade: um user real em formato antigo com max, um assistant sem variant e sem entrada de escolha; após rodar 0020/0021/a nova migração em sequência, max é restaurado; cobrindo modelo customizado e Coding Plan GLM.
- [ ] 0020 já executada: preserva o tempo original do ledger, e sessões com backfill que não foram reutilizadas podem ser corrigidas; confirmar que não é uma reexecução da 0020.
- [ ] Mensagem nova/atualização de sessão após a migração, e apenas salvar escolha sem atualizar o tempo da Session: cada um dos dois casos é pulado; cobrindo reseleção posterior sem nível, limpeza explícita e criação de nova sessão.
- [ ] Identidade antiga do Provider e maiúsculas do GLM oficial correspondem pelas regras congeladas; Provider/modelo diferentes não aproveitam o nível, e modelos de terceiros não têm normalização arbitrária de maiúsculas.
- [ ] Última mensagem de usuário sem nível ou com escolha explicitamente vazia: mesmo que um user anterior tenha max, não há recuperação; options existentes, entrada de escolha antiga achatada, JSON/identidade inválidos não são alterados nem bloqueiam a leitura do conteúdo.
- [ ] Só completa o campo alvo: valor antigo, mensagens, corpo de texto e todos os tempos de atividade são afirmados um a um como inalterados; novo startup não reexecuta, o checksum não muda e uma transação falha não deixa correção parcial.
- [ ] Verificar que o Reader oficial de armazenamento / a restauração a frio da Session lê o nível recuperado; checar rollback e reupgrade pelo padrão do Todo109 quanto à legibilidade do conteúdo e ausência de erro por campo faltante, sem tomar sucesso de gravação em disco como passagem da cadeia de restauração.
- [ ] Executar em lote os testes relevantes, typecheck, lint e o review completo; não repetir regressão total para cada item pequeno. Conferir os dois tipos de usuário, o escopo de skip, as abstrações de Selection/Provider e todas as entradas antes de fechar.

## Pontos de partida da investigação

- `apps/zcode-cli/packages/adapters/src/storage/session-store/migrations/0020-provider-model-selection.ts`
- `apps/zcode-cli/packages/adapters/src/storage/session-store/migrations/0021-official-glm-selection.ts`
- `apps/zcode-cli/packages/adapters/src/storage/session-store/migration-runner.ts`
- `apps/zcode-cli/packages/adapters/src/storage/session-store/repositories/session-entries.ts`
- `apps/zcode-cli/packages/adapters/src/storage/session-store/repositories/messages.ts`
- `apps/zcode-cli/packages/bootstrap/src/app/session-store.ts`
- `apps/zcode-cli/packages/adapters/tests/provider-database-migration.test.ts`

A sonda em memória existente só prova o problema e a direção do filtro: entram os casos de primeira execução/já migrado sem uso posterior; são pulados mensagem posterior, reseleção posterior, modelo diferente, nível já existente, última user sem nível e user com escolha explicitamente vazia. Isso não é a implementação oficial da correção nem evidência de regressão completa.

## Implementação e review desta rodada

- Confirmado que o número mais recente ainda é 0021; foi acrescentado `0022_backfilled_session_reasoning`, sem alterar o SQL de 0020/0021, o checksum ou os tempos de atividade, e sem adicionar tabelas/colunas.
- Acrescentados 19 casos reais com SQLite temporário / runner de startup, que falhavam antes da correção; depois da correção, em lote com a migração de banco completo original e a migração do GLM oficial, **3 arquivos / 29 testes passaram**. Inclui três identidades de primeira execução, já migrado sem uso posterior, atividade/reseleção posterior, options vazia/null, entrada antiga achatada, incompatibilidade/maiúsculas de terceiro, última user vazia/sem nível, JSON ruim, identidade ruim/entrada não padrão, rollback e retry de falha inteira, e não reexecução no restart.
- O Reader oficial de armazenamento lê o nível acrescentado além do título/mensagens originais da sessão; mensagens, Session, ledger antigo e tempos da entrada de escolha permanecem inalterados item a item. A regressão da migração de banco completo original continua verificando que a leitura do histórico permanece possível em rollback e reupgrade com campo novo ausente. Não se operou o banco real de usuários e não se afirma aceitação completa em desktop/celular reais.
- Revisão do SQL: seleciona primeiro a última user e só então verifica o nível, sem passar por cima de uma escolha vazia mais recente; referencia apenas os campos novos dela; tabela de identidades congelada em confronto com 0020/0021, sem dependência de Registry em tempo real ou de conta; options existentes não são sobrescritos e não se tenta corrigir sessões que continuaram em uso.
- Typecheck da raiz, typecheck do Adapter e o gate de arquitetura passaram; o lint isolado do novo arquivo 0022 passou, mas o lint completo do Adapter está bloqueado por vários erros max-lines já existentes e não pode ser considerado todo verde. A regressão final em lote e o registro de entrega estão em [ledger de execução](./provider-stabilization-20260911-execution.md).