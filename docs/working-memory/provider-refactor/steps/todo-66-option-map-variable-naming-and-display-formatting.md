# Todo 66: Consolidação da nomenclatura de variáveis e da formatação de exibição do Option Map

> Status: concluído
>
> Complemento de 2026-09-09: o Todo95 seguinte introduziu algumas regressões de formatação em linha única, corrigidas pelo [Todo98](todo-98-builtin-option-map-formatting-regression.md); a diretriz de escrita atual está em [Estilo de escrita do Option Map](../design/model/option-map-writing-style.md), e ternários simples permanecem na mesma linha. Os exemplos abaixo são registros históricos de implementação e não exigem restaurar os ramos duplicados que já foram simplificados.
>
> Data: 2026-09-02
>
> Pré-requisito: o Todo 54 já consolidou o mapeamento de Options de requisição no `map` do Option Spec; o Todo 60 já fixou a completude do Reasoning Option e os limites de edição na GUI. Este Todo apenas melhora a nomenclatura e a legibilidade das expressões Map, sem alterar a responsabilidade de Options, Model Config, Adapter ou parâmetros de requisição.

## 1. Objetivo

Concluir duas consolidações de pequeno escopo:

1. O Option Map deixa de usar a variável genérica de significado ambíguo `value` e passa a usar o nome oficial da Option à qual pertence;
2. As quebras de linha e a indentação do Built-in Option Map passam a priorizar a experiência de leitura na GUI da página de configurações, sem sacrificar a legibilidade para manter o conteúdo do arquivo de configuração em linha única.

```text
optionSpecs.<optionName>.map
              |
              v
表达式变量名 = <optionName>
              |
              v
编译为本次请求的 JSON Merge Patch
```

## 2. Nomenclatura de variáveis

Escrita atual:

```ts
value == "high"
  ? { "reasoning_effort": "high" }
  : { "reasoning_effort": "max" }
```

Escrita desejada:

```ts
reasoningLevel == "high"
  ? { "reasoning_effort": "high" }
  : { "reasoning_effort": "max" }
```

Correspondências concretas:

```text
optionSpecs.reasoningLevel.map
└─ 变量：reasoningLevel

optionSpecs.maxOutputTokens.map
└─ 变量：maxOutputTokens
```

Regras:

- O nome da variável é exatamente o nome oficial do campo da Option à qual pertence, com a mesma capitalização;
- Cada Map consome apenas o valor da sua própria Option e não expõe outras Options por baixo pano;
- A variável `value` é removida, sem manter alias, leitura compatível ou sintaxe dupla;
- Configurações não publicadas não recebem migrador;
- A saída do Map continua sendo o JSON Merge Patch usado pela requisição atual, com a mesma responsabilidade.

## 3. Formatação dos Map embutidos

O conteúdo de string dos Map embutidos deve priorizar a legibilidade na caixa de texto da página de configurações.

Condições complexas e objetos aninhados usam quebras de linha e indentação, por exemplo:

```ts
reasoningLevel == "low"
  ? {
      "thinking": {
        "type": "adaptive"
      },
      "output_config": {
        "effort": "low"
      }
    }
  : {
      "thinking": {
        "type": "adaptive"
      },
      "output_config": {
        "effort": "max"
      }
    }
```

Expressões simples podem permanecer em uma linha:

```ts
{ "max_tokens": maxOutputTokens }
```

Princípios de formatação:

- Usar indentação uniforme de dois espaços;
- Colocar em linhas separadas os ramos de condição complexos;
- Expandir objetos de múltiplos níveis, evitando uma linha muito longa na GUI;
- Não expandir mecanicamente Map simples;
- Permitir quebras de linha escapadas em `zcode-builtin.json`; a compactação do arquivo físico não é o objetivo;
- A GUI continua exibindo as quebras de linha e a indentação da string como são, sem criar um segundo resultado de formatação;
- O Personal Map não é reordenado automaticamente de forma obrigatória, evitando reescrever por acidente a entrada do usuário ao salvar.

## 4. Escopo de implementação

1. Modificar o ambiente de compilação do Option Map para que o nome da variável venha do nome da Option à qual ela pertence;
2. Atualizar o Schema, os tipos e as descrições do Design atual que ainda escrevem a variável como `value`;
3. Trocar todas as referências a `value` no Built-in Config pelo nome da Option correspondente;
4. Reorganizar as quebras de linha e a indentação dos Reasoning Map mais longos do Built-in;
5. Manter o Max Output Map simples como uma linha única compacta;
6. Atualizar os testes de placeholder/value da GUI, provando que o formato é preservado na caixa de texto;
7. Remover as constantes, os fixtures de teste e as mensagens de erro que existiam apenas para atender ao nome antigo `value`.

## 5. Limites de teste

Esta rodada não faz um teste de equivalência completa, executando cada Map embutido antes e depois da migração e comparando campo a campo. A substituição de variáveis e a formatação são modificações determinísticas, e não se cria um quadro de prova de migração de alto custo de manutenção.

Mantém-se apenas a evidência necessária:

- O compilador aceita o nome da Option à qual pertence;
- O compilador rejeita o antigo `value`;
- `reasoningLevel` e `maxOutputTokens` têm, cada um, um Map representativo com teste de compilação e de Patch da requisição;
- O Built-in Config passa nas verificações do Schema oficial e de compilação de Map;
- A página de configurações preserva as quebras de linha e a indentação dos Map embutidos;
- A formatação original do Personal Map não é reescrita automaticamente na leitura ou no salvamento;
- `pnpm typecheck`, `pnpm lint`, os testes unitários relacionados e `git diff --check` passam.

## 6. Não-alvos

- Não alterar a estrutura de campos do Option Spec;
- Não alterar a ordem dos níveis de Reasoning;
- Não alterar a semântica de limite de capacidade de `maxOutputTokens.max`;
- Não adicionar DSL de Map, Formatter Service ou protocolo de expressões versionado;
- Não permitir que um Option Map leia outras Options;
- Não reprojetar o diálogo de configurações de Model;
- Não adicionar camada de compatibilidade para a sintaxe `value`, que nunca foi publicada.

## 7. Critérios de conclusão

- O código oficial, o Built-in Config, os testes e o Design atual não usam mais a variável genérica `value` do Option Map;
- O Map de `reasoningLevel` usa `reasoningLevel`, e o de `maxOutputTokens` usa `maxOutputTokens`;
- Os Map complexos do Builtin têm quebras de linha e indentação claras na GUI;
- Map simples continuam concisos, e o Personal Map não é reordenado automaticamente;
- Não há novos ramos de compatibilidade, uma segunda expressão de Map nem instalações de equivalência total excessivas.

## 8. Registro de implementação e aceitação

- O compilador agora injeta um único nome de variável conforme a Option à qual pertence e inclui o nome da variável na chave de cache de compilação; a mesma expressão não pode contornar, pelo cache, a fronteira de variáveis de outra Option.
- O Schema, a validação de integridade, o Built-in Config, os fixtures de teste de CLI/Service/UI e o Design atual foram unificados em `reasoningLevel` / `maxOutputTokens`; o antigo `value` só permanece nos testes de rejeição e nos registros históricos.
- Os Reasoning Map complexos do Builtin passaram a usar o formato de múltiplas linhas com dois espaços, e o Max Output Map simples permanece em uma linha; o Personal Map não ganhou nenhuma etapa de formatação.
- As asserções do Provider Node que antes travavam espaços em branco de linha única foram alteradas para validar as variáveis e o conteúdo do mapeamento, evitando tratar a formatação de exibição como contrato de runtime.

Resultados da verificação:

- `@zcode/model-option-map`: 26 tests passed; typecheck passed.
- `@zcode/provider`: 167 tests passed; typecheck passed.
- `@zcode/provider-node`: 47 tests passed; typecheck passed.
- Adaptador de CLI, testes direcionados: 54 tests passed.
- Bootstrap Registry/Model da CLI, direcionados: 83 tests passed.
- UI, Services e Server, direcionados: 144 tests passed; casos complementares de exibição de config padrão na UI: 11 tests passed.
- `git diff --check` passed.