# Revisão completa do M1

> Status: snapshot histórico de revisão; as conclusões da etapa atual estão em [`01-model-and-request.md`](./01-model-and-request.md)
>
> Data: 2026-08-13
>
> Objetivo da implementação: [`01-model-and-request.md`](./01-model-and-request.md)
>
> Design alvo: [`../design/model/model.md`](../design/model/model.md)
>
> Fatos da implementação: [`01-model-and-request-implementation-log.md`](./01-model-and-request-implementation-log.md)
>
> Decisões posteriores: Guide/"imediato" já foram determinados a valer dentro do Loop atual, ver [`../design/interaction/interaction.md`](../design/interaction/interaction.md). O corpo mantém o estado pendente no momento da revisão.
>
> Baseline da revisão: merge commit do M1 `84f12ba306`, `staging` mais recente `bfc91c54a9`

## Conclusão

O M1 já estabeleceu uma fronteira de chamada unificada `Model` / `ModelRequest`, e as requisições de modelo em produção do Agente principal, Compact, Subagent, Title, Goal, Memory, ferramentas de modelo, Git, generateText de workspace e Repo Wiki já entraram nessa cadeia. A varredura do código de produção não encontrou nenhum cliente de negócio que ainda contorne o Model e chame diretamente o SDK da OpenAI, da Anthropic ou de outro Provider.

Esta revisão não encontrou problemas P0. Aqui P0 significa um problema que deixaria as chamadas do modelo principal indisponíveis em uma grande amplitude de ambientes, causaria corrupção ou perda de dados, vazamento de credenciais, quebra de fronteira de segurança, ou derrubaria simultaneamente as principais entradas como Desktop, CLI e Remote. Não há evidência nesse sentido hoje.

O problema de maior prioridade é que a montagem de produção do Workflow Child não carrega um `modelFactory` formal. Ele ainda cria o Model pela fábrica de compatibilidade do Core, o que quebra a condição de conclusão "na execução formal o Model imutável é sempre obtido a partir do Model Factory". Essa é uma lacuna de fechamento de escopo bem delimitada, classificada como P1: pode fazer o Workflow ser afetado por atualizações do Registry dentro do mesmo Loop, mas não torna indisponível a cadeia principal do Agente comum nem o produto inteiro.

Portanto, o estado mais preciso do M1 é:

```text
Fronteira de chamada comum     concluída
Migração das entradas de chamada de produção  concluída
Ciclo de vida do Agente comum  concluída
Fechamento mecânico da montagem de produção  ainda há lacuna de Workflow
Saída das entradas de compatibilidade históricas  não concluída
```

Recomenda-se adicionar um M1.1 de ciclo curto para o fechamento, sem reabrir todo o M1 e sem misturar esses problemas ao design do Registry do M2.

## Escopo da revisão

Esta revisão girou em torno de quatro perguntas: os objetivos da etapa foram totalmente implementados, ainda há rotas paralela nas chamadas de modelo, a migração alterou a semântica das funcionalidades existentes, e a nova fronteira realmente impede que o design antigo continue se espalhando.

A verificação cobriu os pontos de construção do `AgentRuntime` de produção, os pontos de criação e chamada de `Model`, a validação de Model Properties e Options, a atualização dinâmica de Header, o comportamento do Guide dentro do Loop, a atribuição de Usage / Trace e o resultado da migração do Repo Wiki. As mudanças de CLI mescladas no `staging` mais recente concentram-se no contexto de apresentação do Desktop e não alteraram as conclusões sobre Model, Adapter ou a montagem de Workflow do M1.

## P1: o Workflow Child não entrou no Model Factory formal

A cadeia de montagem do Runtime comum já está definida:

```text
createZCodeApp
    |
    v
Runtime Model Factory
    |
    v
AgentRuntime
    |
    v
Loop detém um Model imutável
```

Já o Direct Expert Workflow e o Script Workflow Child injetam apenas `modelAdapter` no novo `AgentRuntime`:

```text
Agent Runtime pai
    |
    +-- Subagent comum
    |      └─ herda ou obtém o Model Factory formal
    |
    +-- Direct Expert Workflow Child
    |      └─ modelAdapter -> Core Compatibility Model
    |
    └-- Script Workflow Child
           └─ modelAdapter -> Core Compatibility Model
```

O código correspondente está em:

- `apps/zcode-cli/packages/bootstrap/src/app/workflow-facade.ts`
- `apps/zcode-cli/packages/bootstrap/src/app/script-workflow-child-runtime.ts`
- `apps/zcode-cli/packages/core/src/runtime/methods/runtime-model.ts`

O Model de compatibilidade ainda satisfaz a interface de superfície de `Model.generateText()` / `streamText()`, de modo que a varredura usual de chamadas de modelo não o identifica como rota paralela; a diferença ocorre na formação do Model. O caminho de compatibilidade usa defaults permissivos e volta a consultar o Registry mutável no momento da chamada do Adapter. Enquanto `providerId/modelId` não mudarem, atualizações de API Key, Endpoint ou do objeto físico do Provider podem afetar o Loop de Workflow em execução.

Isso é inconsistente com o objetivo de ciclo de vida do M1:

```text
Esperado
Início do Loop -> cria Model A -> todos os Steps usam A -> fim do Loop

Risco atual do Workflow
Início do Loop -> Compatibility Model
          -> Step 1 consulta o Registry A
          -> Registry é atualizado
          -> Step 2 consulta o Registry B
```

É preciso fazer com que as duas classes de Workflow Child obtenham explicitamente o Model Factory formal. Os testes devem cobrir que, quando o Registry muda durante a execução do Child Loop, a identidade do modelo, a conexão e as Options vinculadas permanecem estáveis; e que, quando o Child escolhe explicitamente outro modelo, um novo Model é criado a partir da fábrica formal.

## P1: o "desconhecido" de Property pode ser interpretado como "não suportado"

O M1 fez o Model validar de forma unificada imagem, PDF, Tool Call e Structured Output antes de a requisição ser enviada. Essa fronteira em si é válida, mas o resultado atual da mesclagem do Catalog usa booleanos para expressar capacidade, e alguns fatos desconhecidos são preenchidos com `false`. Uma vez que esse valor entra nas Model Properties, a requisição é rejeitada de forma dura.

```text
O Catalog não tem um fato explícito
        |
        v
A mesclagem preenche false
        |
        v
Model Property = false
        |
        v
A requisição é rejeitada antes do Adapter
```

O cenário de maior risco é o de modelos personalizados que não estão no Catalog, mas que de fato suportam imagem ou PDF. O caminho antigo podia entregar a requisição ao Provider; o novo caminho pode rejeitá-la antecipadamente com base no default `false`. O Structured Output tem o mesmo problema de modelagem; o Memory Selector que de fato envia JSON Schema está no ramo de Semantic Recall, desligado por padrão, portanto não é um P0 em produção neste momento, mas precisa ser tratado antes de ligar esse ramo.

O default de Tool Call é hoje `true` e não sofre a mesma regressão de default; quando configurado explicitamente como `false`, rejeitar a requisição de ferramenta do Coding Agent está de acordo com a semântica declarada.

Aqui não é adequado simplesmente remover a validação unificada. É preciso confirmar, para cada Property, a fonte do fato e a estratégia para o estado desconhecido: quais capacidades são pré-requisito rígido para entrar no Registry, quais podem continuar sendo tentadas na ausência de fatos, e quais precisam de expressão em três estados. Antes de concluir essa decisão, não se deve continuar adicionando novos campos de validação rígida.

## P2: a semântica de modelo do Guide já mudou, mas a semântica de produto ainda não foi decidida

O M1 fixou o Model do Agent Loop. O Guide, por outro lado, insere inline uma entrada do usuário dentro do Loop atual, sem abrir um novo Loop. Quando o usuário seleciona o modelo B antes de enviar o Guide, a Session Selection pode ser atualizada para B, mas o Loop atual ainda detém A:

```text
Início do Turn, vinculado ao Model A
        |
        v
O usuário seleciona o Model B no Composer
        |
        v
Guide é inserido inline no Turn atual
        |
        +-- o Turn atual continua usando A
        |
        └-- o próximo Turn novo usa B
```

Isso está de acordo com a regra do M1 de que "a identidade do modelo é estável dentro de um Loop", mas pode não corresponder à expectativa de produto de Guide/"imediato". Se o produto por fim exigir que o Guide troque o modelo imediatamente, é preciso definir isso como uma fronteira explícita de troca de Model dentro do Loop atual, atualizando ao mesmo tempo a Selection, o Model, o Usage da execução atual e a mensagem de "modelo trocado". Essa decisão pertence ao tópico Submission / Guide; o M1 não deve resolver isso restaurando a leitura do modelo default da sessão a cada Step.

Trata-se hoje de uma diferença de comportamento local e previsível, não um P0.

## P2: a atualização dinâmica de Header ainda recupera o objeto Provider completo

Providers como Start Plan precisam atualizar Headers de uso único antes de cada requisição física. O Adapter atual, após a atualização, resolve novamente o mesmo `providerId/modelId` a partir do Registry e verifica apenas se a identidade do modelo não mudou:

```text
Model A já vinculado
    |
    v
Atualiza o Header de uso único
    |
    v
Resolve novamente providerId/modelId
    |
    +-- identidade igual: aceita o novo Resolved Model
    └-- identidade diferente: reporta erro
```

Isso preserva o comportamento atual do Plan, mas o escopo da atualização é maior do que apenas "atualizar o material de autenticação dinâmico". Endpoint, API Key ou a instância do Provider do mesmo modelo também podem entrar no Loop atual por causa de atualizações do Registry. Isso dá continuidade ao comportamento do antigo caminho do Plan e não é uma regressão ampla introduzida pelo M1; ainda assim, na arquitetura alvo, enfraquece a imutabilidade do Model.

Na próxima refatoração de Builtin Provider / Adapter, a atualização do material de autenticação dinâmico deve ser separada da resolução completa de Model/Connection. Não é adequado mudar o protocolo de autenticação do Plan como efeito colateral nesta etapa.

## P2: a entrada de compatibilidade continua fácil demais de alcançar

O Core hoje aceita `modelFactory` ou `modelAdapter`; quando falta a Factory, entra automaticamente no Model de compatibilidade. Esse design garante que testes antigos e chamadas embarcadas continuem rodando, e ao mesmo tempo torna impossível que o sistema de tipos ou uma verificação de startup detecte omissões de montagem na produção de Workflow.

Além disso, ainda há capacidades do Core que usam a existência de `modelAdapter` como critério de disponibilidade, e o `AgentRuntimeDeps` ainda mantém campos de migração como `modelConnectionPort`, limites de Runtime e Provider Options. Como o Runtime formal atual possui Adapter e Factory ao mesmo tempo, esses resíduos não causaram falhas funcionais na cadeia principal; eles atrapalham, porém, a construção de um Runtime que dependa apenas da origem do Model depois do M2.

O M1.1 deve separar a montagem de produção da montagem de compatibilidade: um Runtime de produção executável precisa fornecer o Model Factory formal; Runtimes realmente state-only e objetos de compatibilidade de teste usam um caminho de construção com nome explícito. Por quanto tempo manter a entrada de compatibilidade pode ser decidido separadamente, mas ela não pode mais ser acionada implicitamente pela falta de um campo opcional.

## Partes confirmadas como não produzindo rotas paralelas

O Repo Wiki já removeu seu próprio cliente de Provider e usa o Model dentro da CLI por meio de `workspace/generateText`. A recuperação por truncamento continua sendo uma política de negócio do Repo Wiki, e o Model retorna apenas `finishReason` e Usage. A falha explícita quando o app-server antigo não tem `finishReason` é um limite de compatibilidade já confirmado, não uma regressão nova encontrada nesta revisão.

O Agente principal, o Subagent comum, o Compact Automatic / Micro / Reactive, o Title, o Goal verifier, o Project Memory, o WebFetch / WebSearch, a Git Commit Message e o generateText de workspace iniciam suas requisições através do Model. Os parâmetros de reasoning específicos de cada Provider continuam sendo convertidos pelo caminho do Adapter e não foram reexpostos aos chamadores de negócio.

Usage, Trace e a persistência de mensagens já usam a atribuição ao Model efetivamente executado. A varredura atual não encontrou nenhum caminho de produção que, após a requisição terminar, volte a ler o Composer ou o modelo default mutável da sessão para registrar Usage.

## Julgamento de P0 e limites de confiança

Hoje não há P0 confirmado. Todos os problemas encontrados têm escopo bem definido: a montagem de Workflow afeta apenas o Workflow Child; o default de Property afeta sobretudo alguns modelos multimodais personalizados e o Semantic Recall que está desligado por padrão; o Guide afeta apenas a entrada inline do Turn atual; o risco de Header dinâmico existe apenas nos Providers que precisam atualizar material de autenticação antes da requisição.

Isso não é "já foi provado que não existe nenhum P0". A base do julgamento vem da varredura estática das chamadas de produção, da inspeção das cadeias de construção, dos registros de testes completos e direcionados antes e depois da integração do M1, e da revisão incremental do `staging` mais recente. Neste ambiente, alguns testes não puderam ser reexecutados por falta de espaço em disco, e o repositório também tem falhas preexistentes sem relação com Provider; portanto ainda é preciso aumentar a confiança com testes direcionados de Workflow e de modelos multimodais personalizados.

Se a severidade for ordenada pelas evidências atuais:

| Nível | Conclusão | Impacto |
| --- | --- | --- |
| P0 | Não encontrado | Nenhuma evidência de indisponibilidade em larga escala, corrupção de dados ou incidente de segurança |
| P1 | O Workflow Child não usa a Factory formal | Pode misturar conexão ou configuração atualizada dentro do mesmo Workflow Loop |
| P1 | Property desconhecida é endurecida como `false` | Pode rejeitar modelos personalizados de imagem/PDF que na verdade funcionam |
| P2 | O Guide continua usando o Model do Loop atual | Semântica de produto não decidida, com impacto local na interação |
| P2 | A atualização de Header dinâmico recupera o Provider completo | Risco herdado, afeta a imutabilidade de Providers de Plan especiais |
| P2 | Entrada de compatibilidade e dependências antigas ainda acessíveis na montagem de produção | Fechamento incompleto, aumenta o risco da migração posterior |

## Ordem sugerida para o fechamento do M1.1

O primeiro passo é corrigir a montagem do Model Factory formal no Workflow Child e estabelecer testes de ciclo de vida. Esta é a única lacuna estrutural já confirmada como presente na produção.

O segundo passo é definir item a item a estratégia de estado desconhecido das Properties, priorizando a validação de modelos personalizados de imagem/PDF; o Semantic Recall permanece desligado até que a estratégia de Structured Output tenha cobertura de testes.

O terceiro passo é transformar a exigência de Model Factory do Runtime de produção em uma restrição mecânica, deixando a fábrica de compatibilidade apenas para cenários de compatibilidade explícitos. Em seguida, remover do Core os resíduos que usam a existência do Adapter antigo para julgar a capacidade de modelo.

Guide e Header dinâmico de Plan ficam para os tópicos Submission e Builtin Provider, respectivamente. Eles precisam de semântica explícita de produto/protocolo e não devem ser misturados ao fechamento do Workflow.

Condição de conclusão do M1.1:

- Todo `AgentRuntime` de produção que execute requisições de modelo obtém explicitamente o Model Factory formal.
- O Workflow Child continua usando os fatos e a conexão do Model no momento da criação, mesmo durante atualizações do Registry.
- Imagem, PDF e Structured Output de modelos personalizados não são julgados como "não suportados" por falta de fatos.
- As condições de entrada do Model de compatibilidade ficam explicitamente visíveis no código, com testes provando que a montagem formal não cai nesse caminho.
- A semântica pendente de Guide e Header dinâmico continua reservada aos tópicos posteriores correspondentes, sem alterar comportamento por meio de fallbacks temporários.