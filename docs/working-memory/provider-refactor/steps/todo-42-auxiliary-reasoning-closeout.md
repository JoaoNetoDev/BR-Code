# Todo 42: Encerramento da Semântica de Reasoning e Orçamento de Saída dos Modelos Auxiliares

> Status: concluído
>
> Data: 2026-08-28
>
> Origem: Review após a conclusão do Bugfix 08
>
> Anterior: [`Bugfix 08: chamadas de modelo auxiliar usam uniformemente a menor faixa de Reasoning`](./bugfix-08-auxiliary-model-lowest-reasoning.md)

## 1. Contexto

O Bugfix 08 já mudou Session Title, Goal Title, Git Commit Message e Memory Recall de "adivinhar que o Reasoning está desligado" para
usar o primeiro item das faixas de Reasoning expostas pelo Model atual. Essa direção já foi confirmada, mas o Review após a conclusão ainda encontrou três resíduos:

1. O upstream de Git Commit Message ainda declara `maxOutputTokens: 256`, mas o downstream o ignora ativamente porque a menor faixa de Reasoning pode exigir um orçamento de geração;
2. A Telemetry do Adapter ainda varre strings como `disabled`, `off`, `nothink`, `none`, adivinhando se a faixa representa desligamento;
3. Falta uma prova direta de comportamento quando o modelo não tem nenhuma Reasoning Option Spec.

Esses resíduos não alteram a cadeia principal já confirmada de "menor faixa exposta", mas deixam parâmetros inválidos, semântica implícita de nomes e lacunas de teste, e precisam ser fechados separadamente.

## 2. Semântica Decidida

### 2.1 Reasoning em chamadas auxiliares

```text
Model.optionSpecs.reasoningLevel
        |
        +-- 存在 --> 使用 values[0]
        |
        `-- 不存在 -> 不合成、不发送 reasoningLevel
```

- `values` é ordenado do menor para o maior pela força semântica;
- O primeiro item pode ser `off`, `nothink`, `low` ou outra faixa exposta;
- Runtime e Adapter não inferem "habilitado" ou "desabilitado" a partir do nome da faixa;
- Requisições normais continuam usando a escolha explícita do usuário ou o `default` do Model Config.

### 2.2 Orçamento de saída em chamadas auxiliares

```text
辅助调用
├─ Reasoning：最低公开档位
└─ Max Output：继承当前 Model 的有效预算
```

Não se promete mais que o orçamento total de geração de Recall ou Git Commit Message fique abaixo de 256. A menor faixa exposta de alguns modelos ainda exige Reasoning, e um 256 fixo
pode ser insuficiente para compor uma requisição válida, portanto nesta rodada aceitamos que a chamada auxiliar herde o orçamento de saída válido do Model atual.

O upstream não pode continuar declarando um limite de 256 Tokens que o downstream necessariamente ignora; interfaces, constantes, testes e documentação precisam expressar a mesma semântica real.

### 2.3 Telemetry

A Telemetry registra apenas a `reasoningLevel` pública realmente escolhida na requisição. Não varre nomes de faixas nem infere um estado unificado enabled/disabled.
Se no futuro for realmente necessária uma semântica de liga/desliga entre Providers, ela deve ser expressa por um fato explícito de Config, sem restaurar a adivinhação por strings.

## 3. Objetivos

1. Remover da cadeia de Git Commit Message o parâmetro de 256 Tokens já inválido, as constantes, a lógica de ignore especial e as asserções antigas correspondentes;
2. Manter o Workspace Generate Text genérico processando, conforme seu contrato formal, o orçamento realmente fornecido pelo chamador, sem reservar parâmetros falsos para Git Commit Message;
3. Remover `resolveReasoningDisabledMappingKey` e todas as suas exportações, referências e testes;
4. Remover a inferência de nomes `disabled`, `off`, `nothink`, `none` da Telemetry do Adapter, registrando apenas a faixa exata da requisição;
5. Limpar a formulação de design de que "mapping de desligamento oculto é consumido por chamadas auxiliares"; o Reasoning Mapping só é lido de forma precisa conforme a faixa pública realmente escolhida;
6. Provar que, sem Reasoning Option Spec, Title, Git Commit Message e Recall não sintetizam faixa e não alteram o Active Model;
7. Manter inalteradas a Model Selection, o congelamento do Active Model, o Account/Personal Overlay e a semântica de fila e persistência.

## 4. Fora de Escopo

- Não restaurar o limite fixo de 256 Tokens para chamadas auxiliares;
- Não adicionar Reasoning Policy, Resolver, DTO, Factory Input ou Option específica de requisição;
- Não inferir Reasoning por Provider, Model ID, API Type ou nome do modelo;
- Não alterar os parâmetros de modelo da conversa normal, Compact, Subagent, Repo Wiki ou Dream;
- Não habilitar Semantic Recall nem alterar a decisão existente de Off-Peak pulando Extraction.

## 5. Objetivos de Teste

- Git Commit Message não envia mais a falsa restrição de 256 Tokens já inválida e herda o orçamento válido do Model;
- O Workspace Generate Text genérico continua tratando `maxOutputTokens` conforme o contrato formal quando o chamador realmente o fornece;
- Com Reasoning Spec, as quatro categorias de chamada auxiliar continuam usando `values[0]`;
- Sem Reasoning Spec, Title, Git Commit Message e Recall não geram `reasoningLevel`;
- Active Model e Session Selection permanecem inalterados após todas as chamadas auxiliares;
- As Provider Options do Adapter são produzidas apenas pelo `reasoningMapping[reasoningLevel]` exato;
- A Telemetry não julga mais enabled/disabled por apelidos de string;
- O teste de integridade da ordem dos values de Reasoning do Built-in continua passando;
- Os testes relevantes de Contracts, Adapters, Core, Services e Provider, além do typecheck e do lint raiz, passam.

## 6. Critérios de Conclusão

- Não existe `resolveReasoningDisabledMappingKey` no código de produção nem no Design atual;
- Não existe contrato falso de "upstream passa 256, downstream ignora" na cadeia de Git Commit Message;
- As três categorias de chamada auxiliar sem Reasoning Spec têm evidência de regressão direta;
- As chamadas auxiliares expressam apenas dois fatos reais: a menor faixa pública de Reasoning e o orçamento de saída herdado do Model atual;
- O registro de implementação do Bugfix 08 está consistente com o código final e não marca mais resíduos ou drift de comportamento como concluídos.

## 7. Registro de Implementação

- O Service de Git Commit Message não declara mais `maxOutputTokens: 256` fixo; o Workspace Generate Text genérico removeu o
  caso especial de querySource, executa normalmente quando o chamador fornece explicitamente um orçamento e, quando não fornecido, deixa o fato do orçamento a cargo das Options válidas do Model atual;
- `resolveReasoningDisabledMappingKey` foi removido, e as Provider Options do Adapter leem apenas
  `reasoningMapping[reasoningLevel]`; a Telemetry registra apenas a faixa realmente solicitada e não sintetiza mais enabled/disabled;
- O Test Model Factory ganhou a capacidade de testar "sem Reasoning Spec", e a cadeia compartilhada de Session/Goal Title, Git Commit Message
  e Memory Recall provam que não sintetizam Reasoning e que Active Model/Selection não são modificados;
- 93 testes direcionados de Services, Core e Adapters passaram; o total de Provider, 151, passou; o typecheck raiz e os typechecks de CLI
  Contracts/Adapters/Core passaram; o lint raiz ficou com 0 erros (mantendo 33 warnings preexistentes e não relacionados a esta mudança);
- No total do Core, 2109 testes passaram, e as falhas restantes vêm de fixtures de conformance de caminho absoluto, CUA, limites de I/O/módulo e
  baselines de stream-recovery já existentes; no total dos Adapters, 1370 testes passaram, com a única falha sendo um teste de limpeza de grupo de processos não relacionado a esta mudança e reproduzido separadamente.
