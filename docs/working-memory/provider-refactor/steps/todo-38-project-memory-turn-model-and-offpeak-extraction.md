# Todo 38: Fechamento da Atribuição de Modelo do Turn do Project Memory e da Extraction Off-Peak

> Status: concluído
>
> Data: 2026-08-28
>
> Origem: Review de seleção de modelo em background após o Provider Refactor
>
> Design relacionado: [`Atribuição de modelo e controle de Extraction de turno único do Project Memory`](../../../design/v2/project-memory-model-selection.md)

## 1. Contexto

O Project Memory atualmente contém três cadeias de modelo com finalidades e ciclos de vida distintos:

```text
当前 Turn 开始
      |
      +--> Semantic Recall
      |
      `--> Main Agent Loop
                 |
                 `--> Turn 成功后自动 Extraction

Dream
`--> 独立后台整理链路
```

Elas não podem compartilhar um conjunto vago de regras de seleção de modelo em background só porque todas pertencem à Memory:

- o serviço de Recall atende o Turn em execução;
- a Extraction é produzida por um Turn já concluído;
- o Dream precisará de refatoração independente no futuro e hoje não tem entrada de produto exposta.

O Provider Refactor já estabeleceu a semântica de congelamento do Active Model: uma vez que o Model é criado para um Turn, mudanças posteriores no Registry, no Personal Config ou na Session Selection não podem reescrever o fato do modelo daquele Turn. Recall e Extraction devem seguir o mesmo princípio, sem reler uma Session Selection mutável no início do trabalho assíncrono e sem buscar automaticamente no Registry outro modelo "mais barato" ou "mais adequado".

O Off-Peak usa Model com escopo de execution e material de acesso do período da requisição. Depois que seu Turn automático termina, ele não deve continuar derivando Project Memory Extraction, para que o material de execução pontual não seja consumido novamente por requisições de background fora do Turn principal.

## 2. Objetivos já decididos

### 2.1 Atribuição de modelo

```text
Turn admission
      |
      v
创建本轮 Active Model
      |
      +--> Main Agent Loop
      +--> Semantic Recall
      `--> 成功 Turn 产生的 Extraction Snapshot
```

1. O Semantic Recall usa o Active Model do Turn atual;
2. a Extraction usa o Active Model do Turn concluído que produziu aquele trabalho;
3. nenhuma das duas cadeias relê a Session Selection;
4. nenhuma das duas cadeias reinferem a capacidade do modelo por Provider ID, Model ID ou API Type;
5. atualizações de Registry e Config afetam apenas Models criados depois;
6. Snapshots que já entraram no Extraction Scheduler permanecem congelados;
7. o Dream não é ajustado nesta rodada; refatoração separada depois.

### 2.2 Extraction de turno único

Adiciona-se uma política explícita ao contexto de execução de turno único já existente no CLI/Core:

```ts
modelExecution: {
  selectionScope: "execution";
  memoryExtraction?: "skip";
}
```

Aqui "parâmetro de CLI" significa o parâmetro de execução que o App passa ao CLI/Core via Protocol, não um flag de linha de comando público voltado ao usuário final.

A semântica deste campo é fixa:

- afeta somente o Turn bem-sucedido que o carrega;
- não modifica `memory.extractionEnabled` da Session;
- não é gravado em Session Selection, histórico de mensagens nem Config persistente;
- não afeta Turns normais;
- não afeta chamadas de ferramentas de Memory em foreground;
- não muda o comportamento de Turns com falha ou cancelamento;
- hoje é passado explicitamente como `"skip"` pelo despacho Off-Peak.

Não se usa boolean, para evitar a ambiguidade de `false` significando "padrão", "permitido" ou "override desligado"; e não se adiciona um segundo switch de Memory em nível de Session.

### 2.3 Option da requisição de Recall

A identidade de modelo do Recall vem do Active Model do Turn atual, mas os parâmetros de uma única chamada podem ser sobrescritos de forma independente:

```text
Active Model
    |
    | 身份、Provider、Properties、访问绑定不变
    v
Recall Model Request
    ├─ 继承 Active Model 总输出预算
    `─ reasoningLevel = optionSpecs.reasoningLevel.values[0]
```

reasoning e max output são Options da chamada, não um motivo para selecionar outro modelo. A implementação precisa expressar isso pelo contrato unificado de Model, sem montar no código de negócio do Recall parâmetros de dialeto Anthropic, OpenAI ou OpenAI-compatible.

O Recall escolhe diretamente o primeiro item de `reasoningLevel.values` ordenado do Active Model da menor para a maior intensidade, como o `ModelRequest.options.reasoningLevel` atual, portanto não exige que o modelo suporte desligar Reasoning.

Se o Active Model não suporta saída estrita em JSON Schema:

```text
Active Model.supportsJsonSchemaOutput
        |
        +-- true  --> 允许运行 Semantic Recall
        `-- false --> 不运行 Selector，不自动换模型
```

O Semantic Recall ainda não está exposto. Esta rodada implementa apenas a parte de baixo custo que não introduz um segundo conjunto de fatos de modelo; a degradação completa do índice padrão será tratada antes de expor o Recall de fato, sem expandir novas cadeias de montagem de Context para uma função fechada.

## 3. Cadeia de chamadas alvo

### 3.1 Política de Extraction do Off-Peak

```text
Desktop Off-Peak Host
        |
        | modelExecution.memoryExtraction = "skip"
        v
Protocol V4 Schema
        |
        v
Bootstrap Command Adapter
        |
        v
Core ModelExecutionContext
        |
        v
Turn 成功
        |
        +-- skip --> 不调度 Extraction
        `-- absent -> 按 Session Memory 配置调度
```

Cada camada deve passar esse campo adiante sem alteração. Não basta provar separadamente que o Protocol aceita e que o Core processa; falta a prova vertical da conversão dos DTOs intermediários.

### 3.2 Active Model da Extraction

```text
Main Loop 使用 Active Model
        |
        v
Turn 成功
        |
        | Active Model + 消息边界 + 工具/读取状态
        v
Extraction Snapshot
        |
        +--> running（最多一个）
        `--> latest pending（最多一个）
```

O Scheduler mantém a semântica limitada já existente e não ganha Model Registry, Model Snapshot DTO ou Selection de background. O Snapshot segura diretamente um Model imutável; se o Model passar a introduzir recursos que exigam liberação explícita, um ciclo de vida separado será projetado mais tarde — por enquanto não se antecipa contagem de referências nem protocolo de dispose.

### 3.3 Active Model do Recall

```text
Turn 创建 Active Model
        |
        +--> Main Loop
        `--> Recall Prefetch
                 |
                 +--> 能力检查
                 +--> 单次请求 Option
                 `--> Invocation Context / Telemetry
```

Invocation Context, Telemetry, renovação de Header e abort signal podem ser vinculados especificamente ao Recall, mas isso não pode servir para recriar ou reselecionar o Model.

## 4. Escopo de implementação

### 4.1 Spec e contrato

- atualizar o design de atribuição de modelo do Project Memory;
- adicionar `memoryExtraction?: "skip"` ao Schema estrito de `modelExecution` do Protocol V4;
- usar um campo com o mesmo nome e mesmo valor no `ModelExecutionContext` do Core;
- garantir que Protocol, Bootstrap e Core não criem um segundo Policy DTO com nome diferente;
- esclarecer que esse parâmetro não é Config persistente nem argumento de linha de comando comum de usuário.

### 4.2 Chamador do Off-Peak

- o despacho Off-Peak do Desktop passa explicitamente `memoryExtraction: "skip"`;
- primeira execução e continuações usam a mesma cadeia;
- requisições de modelo normais, Automation, start-now do usuário e entradas de fila não carregam o campo automaticamente;
- não inferir Off-Peak no Core a partir de Provider ID ou Model ID fixos.

### 4.3 Projeção do Bootstrap

- o Bootstrap projeta o `memoryExtraction` do payload do Protocol para o Core sem alteração;
- preserva o congelamento de `requestAuth` já existente e a montagem de `requestDependencies`;
- não deixa esse campo entrar em um Submission Intent persistível;
- a admission com escopo de execution continua exigindo Model Selection explícita e idle/start-now.

### 4.4 Extraction

- criar e fixar o Active Model ao criar o Turn;
- passar esse Model ao agendar a Extraction de um Turn bem-sucedido;
- o Extraction Snapshot guarda esse Model;
- na fase de execução, não chamar `runtime.getSessionModelSelection()` nem o Model Factory;
- `skip` envolve apenas a entrada de agendamento e não muda a semântica de Scheduler, Drain, Shutdown ou Session Residency;
- a telemetry da Extraction, `skipTranscript`, as permissões das ferramentas de Memory e o abort signal independente permanecem inalterados.

### 4.5 Recall

- o Recall Prefetch recebe o Active Model do Turn atual;
- deixa de criar um Model dedicado ao Recall via Session Selection;
- usa o `reasoningLevel: values[0]` no nível de requisição do mesmo Model para escolher o nível de reasoning mais baixo;
- o orçamento total de saída é herdado do Active Model, sem adivinhar no Core o fixed-thinking budget do provider;
- pula diretamente quando não há suporte a saída estritamente estruturada;
- não busca automaticamente um modelo substituto no Registry;
- não liga o switch de produto do Semantic Recall.

O nível mais baixo deve ser tomado diretamente de `values[0]` dos níveis públicos ordenados; não é permitido varrer nomes como `off`, `nothink` adivinhando a capacidade de desligamento, nem reler a Session Selection para preservar comportamento antigo.

### 4.6 Dream

- não modificar entrada, seleção de modelo, fila, Prompt, ferramentas ou persistência;
- se um helper compartilhado precisar de novos parâmetros, o Dream precisa manter o comportamento original;
- não usar este Todo para limpar ou refatorar o Dream.

## 5. Plano de testes

Defende-se testes primeiro.

### 5.1 Protocol

- `memoryExtraction: "skip"` passa pelo Schema estrito;
- outras strings, booleanos e campos extras são rejeitados;
- `modelExecution` continua exigindo `modelSelection` explícito.

### 5.2 Bootstrap

- o payload com escopo de execution preserva `memoryExtraction: "skip"` após a conversão;
- `requestAuth`, Subagent Policy e Selection não são afetados;
- adicionar uma asserção vertical de payload do Protocol → `SendInputOptions` do Core, evitando perda de campo na projeção intermediária.

### 5.3 Core — Extraction

- um Turn bem-sucedido com skip não cria nem agenda Extraction;
- o próximo Turn normal ainda faz Extraction normalmente, provando que não é uma modificação de nível de Session;
- a Extraction de um Turn normal reutiliza o Model que concluiu aquele Turn;
- a Selection com escopo de execution não volta ao modelo padrão da Session durante a Extraction;
- atualizações do Registry afetam apenas Models criados depois;
- Turns failed/cancelled mantêm o comportamento de não agendar;
- a semântica limitada running + latest pending do Scheduler não muda.

### 5.4 Recall

- o Recall usa a mesma identidade de Model e os mesmos fatos congelados do Main Loop;
- o orçamento total de saída herda o Active Model, sem adivinhança de fixed-thinking budget no Core;
- o reasoning usa diretamente `values[0]` dos níveis públicos ordenados;
- sem suporte a JSON Schema estrito, nenhuma requisição de Selector é enviada;
- nenhum outro Model é criado ou selecionado implicitamente;
- o ramo desligado por padrão não gera requisições de modelo extras.

### 5.5 Regressão e verificação mecânica

1. testes direcionados de Protocol;
2. testes direcionados de Bootstrap V4 Command;
3. testes direcionados de Core Memory Recall, Extraction e Model Lifecycle;
4. typecheck do package do CLI;
5. `pnpm typecheck` da raiz;
6. `pnpm lint` da raiz;
7. verificação de formatação dos arquivos modificados e `git diff --check`.

## 6. Fora de escopo explícito

- não adicionar flag público de CLI;
- não adicionar Memory Policy de nível de Session;
- não gravar em Config o material de acesso do período de requisição do Off-Peak;
- não adicionar Model Selection exclusivo de Memory;
- não adicionar um segundo Registry ou DTO de capability de Model;
- não selecionar automaticamente modelo barato, modelo oculto ou outro Provider;
- não inferir comportamento de Memory por Provider ID, Model ID, API Type ou regex de string;
- não expor o Semantic Recall;
- não refatorar o Dream;
- não mudar a semântica de fila normal, retomada, desktop continuous ou mobile replayable.

## 7. Critérios de conclusão

- a cadeia real Host → Protocol → Bootstrap → Core do Off-Peak consegue pular a Extraction automática;
- o Turn normal continua rodando Extraction conforme a Config de Memory da Session;
- o skip não é persistido nem contamina o Turn seguinte;
- a Extraction sempre usa o Active Model do Turn que produziu o trabalho;
- o Recall sempre usa o Active Model do Turn atual, sem troca implícita de Provider/Model;
- as Options da requisição de Recall valem pelo contrato unificado de Model, sem hardcode de dialeto de Provider;
- o Dream não tem mudança de comportamento;
- Protocol, Bootstrap e Core têm testes diretos e a conversão vertical não tem mais lacunas sem cobertura;
- testes direcionados, typecheck, lint, formatação e verificação de diff passam;
- ao final, acrescentar o registro de implementação e fazer commit em Conventional Commit.

## 8. Registro de implementação (2026-08-28)

- O Host Off-Peak passa explicitamente `modelExecution.memoryExtraction: "skip"` pelo Protocol V4, e o Bootstrap o projeta sem alteração para o Core;
- o Core só pula a Extraction em Turns bem-sucedidos que carregam esse campo; Turns normais e Turns seguintes não são afetados;
- o Extraction Snapshot segura diretamente o Active Model imutável que concluiu o Turn, e a fase de execução não relê mais a Session Selection;
- o Recall Prefetch usa diretamente o Active Model do Turn atual e não envia requisição de Selector quando não há suporte a saída estritamente estruturada;
- a Requisição de Recall usa diretamente `values[0]` dos níveis públicos ordenados do Active Model como `reasoningLevel` e depois resolve os parâmetros de protocolo com o `reasoningMapping` normal; o estado de binding do Active Model não muda;
- foram adicionados testes de Protocol, de projeção vertical do Bootstrap, de Extraction/Recall do Core, de fronteira de requisição de Model e de mapeamento de protocolo do Adapter;
- O Dream não foi modificado e o switch de produto do Semantic Recall não foi ligado.
