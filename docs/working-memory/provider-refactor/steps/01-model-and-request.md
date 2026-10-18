# M1: implementação de Model e ModelRequest

> Status: concluído e mergeado em staging
>
> Data de conclusão: 2026-08-12
>
> MR: !2006

O design alvo está em [`../design/model/model.md`](../design/model/model.md). Este documento registra apenas o escopo de implementação do M1, os resultados reais e as questões remanescentes.

## Objetivo da implementação

O M1 unifica "como o modelo é chamado". Antes disso, o Agente principal, o Compact, o Repo Wiki e outras tarefas auxiliares liam separadamente a ref de model do Runtime, capability, provider options, API Key ou Adapter Registry, de modo que a identidade do modelo, os parâmetros da requisição e a atribuição de Usage podiam vir de estados diferentes.

O objetivo da fase é fazer todas as requisições de modelo em produção passarem pela mesma fronteira pública:

```text
Entradas existentes de Config / Registry / Runtime / Plan
                    |
                    | única entrada de montagem compatível
                    v
                  Model
                    |
                    v
              ModelRequest
                    |
                    v
          Provider Adapter existente
```

O M1 não refatora o Provider Registry final. As entradas antigas podem continuar existindo na entrada compatível única; os chamadores de negócio atrás do Model não podem entender o Runtime e o Registry antigos.

## Cortes de plano

```text
M1.1  Tipos públicos, Model Adapter Wrapper e testes unitários
M1.2  Agent Loop principal, Automatic Compact, Usage e Trace
M1.3  Child Agent, Title, verificador de Goal e Project Memory
M1.4  Git, workspace/generateText, WebFetch / WebSearch
M1.5  Repo Wiki
M1.6  Remover ModelPort, Runtime e leituras de Registry dos chamadores
```

O critério de conclusão da fase é calculado para o M1 inteiro. A implementação pode ser submetida em lotes, mas não se deve manter em paralelo um cliente de modelo antigo apenas porque parte dos chamadores já migrou.

## Resultados reais

O M1 convergiu todas as chamadas de modelo em produção conhecidas para `Model.generateText()` ou `Model.streamText()`, incluindo a cadeia de requisições de Provider independente que o Repo Wiki tinha.

O Agent Loop obtém o Model no início e mantém a referência durante a execução contínua. Step comum, Automatic Compact e Child Agent não decidem mais a identidade do modelo das requisições seguintes por meio de um Runtime mutável. Usage, Trace e atribuição de mensagens usam o Model real.

O ModelRequest público não carrega mais model, Provider connection nem provider options arbitrários. Properties, Option Specs e Options são tratados na entrada unificada; a conversão de reasoning específica de Provider continua a cargo do caminho de Adapter existente.

O M1 preservou `ModelDescriptor` conforme a estrutura de entradas da época. O novo design de Registry fornecerá dados de consulta estática via ProviderConfig e ModelConfig, sem alterar a fronteira de chamada de Model já concluída.

Os fatos completos da implementação e as decisões autônomas estão em [`01-model-and-request-implementation-log.md`](./01-model-and-request-implementation-log.md).

## Escopo estendido durante a implementação

Na migração do Repo Wiki foi confirmado que sua restauração por truncamento é política de negócio do Wiki e deve continuar acima do Model unificado. A injeção mínima de Model Adapter do app-server antigo também preservou uma fronteira de compatibilidade explícita.

A responsabilidade pelo orçamento de saída ficou mais clara durante a implementação: o Model valida estritamente a entrada do chamador; tarefas como Compact e Memory, se precisarem de um orçamento menor, calculam por conta própria, sem clamp silencioso dentro do Model.

Essas decisões não alteraram o objetivo do M1, mas extrapolam os detalhes da definição inicial de tipos; todas estão registradas no implementation log.

## Revisão após o merge

A revisão não encontrou P0 e confirmou que a fronteira principal Model e ModelRequest está estabelecida, mas identificou os seguintes itens de fechamento:

- O Workflow Child ainda não usa o Model Factory oficial.
- O estado desconhecido de algumas Properties pode ser endurecido como "não suportado".
- O comportamento de troca de modelo do Guide ainda não havia sido decidido na revisão; depois ficou definido como valendo a partir do próximo Model Step dentro do Loop atual.
- A atualização dinâmica do Header ainda obtém o objeto Provider completo novamente.
- A entrada compatível continua mais fácil de ser usada por código novo do que o objetivo final.

Evidências detalhadas e prioridades estão em [`01-model-and-request-review.md`](./01-model-and-request-review.md). Os problemas relacionados à origem do Model continuam sendo convergidos pelo design de Registry e ModelFactory do M2.

O alvo temporal de Guide/"imediato" está em [`../design/interaction/interaction.md`](../design/interaction/interaction.md); o "não decidido" da revisão permanece como fato histórico da época.

## Julgamento de conclusão

O M1 está concluído. A fronteira estável que ele entrega é:

```text
Chamada de modelo de negócio
└─ Model.generateText() / streamText()

Entrada de uma única chamada
└─ ModelRequest

Identidade do modelo na execução contínua
└─ Model imutável mantido pelo Agent Loop
```

O M2 substitui a origem da criação do Model, sem reverter esta cadeia pública de chamada.
