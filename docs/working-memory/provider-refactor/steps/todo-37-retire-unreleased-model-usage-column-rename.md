# Todo 37: desfazer a renomeação da coluna de banco de dados Model Usage não publicada

> Status: implementado
>
> Data: 2026-08-28
>
> Origem: review de compatibilidade de downgrade antes do lançamento do Provider Refactor

## 1. Contexto

O Provider Refactor já consolidou no domínio o nível de raciocínio, antes chamado de `variant` (ambíguo), para `reasoningLevel`. O commit
`8c55290f1f`, ao concluir a limpeza de nomes do domínio, também adicionou uma migration SQLite:

```sql
alter table model_usage rename column variant to reasoning_level;
```

Essa renomeação de coluna física não alterou o significado dos dados, a capacidade de consulta nem o comportamento do produto; apenas tornou o nome da coluna do
banco consistente com o novo campo do domínio. Porém, ela impede que bancos de dados que já executaram a nova migration
sejam gravados corretamente por versões antigas: a versão antiga continua gravando em `model_usage.variant`, então após um
downgrade apareceria erro de coluna inexistente.

Esta mudança ainda não foi oficialmente lançada e apenas um número muito pequeno de ambientes de desenvolvimento ou de avaliação executou essa migration. Não há necessidade de adicionar permanentemente
migration reversa, compatibilidade de duas colunas ou detecção de schema em runtime por causa de um ajuste de nomenclatura física não publicado.

## 2. Objetivo decidido

O banco de dados continua mantendo o nome de coluna físico existente, e o domínio continua usando o nome preciso já consolidado:

```text
ModelUsageRecord.reasoningLevel
              |
              | Mapeamento pelo Repository
              v
model_usage.variant
```

As decisões concretas são:

1. Remover a migration `0019_model_usage_reasoning_level`;
2. `model_usage` continua usando permanentemente a coluna `variant`, sem criar a coluna `reasoning_level`;
3. A nomenclatura `reasoningLevel`, já adotada no domínio, no protocolo e no Runtime, permanece inalterada;
4. O Usage Repository grava `reasoningLevel` na coluna `variant` do banco;
5. Não adicionar migration reversa no banco;
6. Não adicionar compatibilidade de duas colunas `variant/reasoning_level`, detecção de existência de coluna ou reparo automático na inicialização;
7. Os poucos ambientes que já executaram essa migration não publicada são reparados manualmente pelos mantenedores;
8. `0019_model_usage_reasoning_level` é mantido no histórico como ID de desenvolvimento revogado, e migrations oficiais posteriores não reutilizam esse ID.

## 3. Escopo de implementação

### 3.1 Desfazer a mudança física de schema

- Remover `0019_model_usage_reasoning_level` de `SQLITE_MIGRATIONS`;
- Bancos de dados novos continuam tendo `model_usage.variant` criado por `0010_usage_observability`;
- Atualizar os testes de ordem e idempotência das migrations, deixando de tratar `0019_model_usage_reasoning_level` como migration oficial;
- Verificar o SQL de produção, garantindo que não exista leitura nem escrita de `model_usage.reasoning_level`.

### 3.2 Preservar a semântica do domínio

- `ModelUsageRecord`, Runtime, Telemetry e os chamadores continuam usando `reasoningLevel`;
- O mapeamento de nomes é feito apenas na fronteira do Usage Repository em SQLite;
- Não reintroduzir o campo de domínio `variant`, nem voltar a misturar identidade de modelo e nível de raciocínio em um único conceito.

### 3.3 Reparo manual dos ambientes afetados

O reparo manual não é uma migration do repo e não é executado automaticamente na inicialização do app. Antes de operar é obrigatório sair do ZCode e fazer backup do arquivo SQLite correspondente:

```sql
BEGIN IMMEDIATE;
ALTER TABLE model_usage RENAME COLUMN reasoning_level TO variant;
DELETE FROM schema_migration
WHERE id = '0019_model_usage_reasoning_level';
COMMIT;
```

Executar apenas em bancos já confirmados como contendo `reasoning_level` e com o registro `0019_model_usage_reasoning_level`. Ambientes oficiais
ou de desenvolvimento não afetados não devem executar esse SQL.

## 4. Fora de escopo explicitamente

- Não publicar a migration reversa `reasoning_level -> variant`;
- Não compatibilizar as duas colunas físicas ao mesmo tempo no Repository;
- Não ler `pragma_table_info` na inicialização e adivinhar a forma do banco;
- Não remover nem recriar a tabela `model_usage`;
- Não alterar o significado dos dados de usage existentes nem a política de retenção;
- Não aproveitar para ajustar outras tabelas, colunas ou migrations do Session Store;
- Não reverter a nomenclatura de domínio `reasoningLevel` já concluída pelo Provider Refactor.

## 5. Plano de testes

1. Atualizar primeiro o teste que falha, depois alterar o código de produção;
2. Criar um Session Store SQLite novo e afirmar que a lista de migrations termina na migration oficial atual, sem a `0019` revogada;
3. Usar `pragma_table_info(model_usage)` para afirmar que `variant` existe e `reasoning_level` não;
4. Gravar um `ModelUsageRecord` com `reasoningLevel` e afirmar que o valor cai corretamente em `variant`;
5. Cobrir o upsert do mesmo usage record e confirmar que a atualização de conflito ainda escreve na coluna correta;
6. Rodar os testes unitários direcionados de Session Store e Usage Query de adapters;
7. Rodar o typecheck dos packages relacionados;
8. Ao final, executar `pnpm typecheck`, `pnpm lint` e `git diff --check` da raiz.

## 6. Critérios de conclusão

- O branch em relação a `origin/staging` não contém mais nenhuma mudança de tabela ou coluna SQLite;
- Bancos de dados novos e bancos existentes não afetados continuam usando `model_usage.variant`;
- O código de domínio continua expressando apenas `reasoningLevel`;
- O downgrade para versões antigas deixa de falhar ao gravar por causa da renomeação de `model_usage.variant` feita neste branch;
- Não existe no repo migração reversa automática, compatibilidade de duas colunas nem adivinhação de schema em runtime;
- Os passos de reparo manual para ambientes afetados foram confirmados por ensaio em um banco temporário, mas não entram na cadeia oficial de migrations.

## 7. Registro de implementação

- `0019_model_usage_reasoning_level` foi removida da cadeia oficial de migrations, e bancos novos continuam tendo
  `model_usage.variant` criado por `0010_usage_observability`;
- O Usage Repository mapeia o campo de domínio `reasoningLevel` para a coluna física `variant` na única fronteira de persistência, sem reverter o contrato do domínio;
- Os testes do Session Store fixaram a lista de migrations e a estrutura real das tabelas, cobrindo primeira gravação e upsert do mesmo ID;
- O código de produção foi auditado: não há `model_usage.reasoning_level`, compatibilidade de duas colunas, detecção de schema nem reparo reverso automático;
- O SQL de reparo manual da seção 3.3 foi ensaiado em um banco SQLite temporário, confirmando que os valores de usage originais são preservados e que o registro `0019` é removido.