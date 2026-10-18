# 05 Aposentadoria do ModelRef

> Estado: concluído
>
> Limites confirmados: o `ModelSelection` guarda a intenção de escolha já aceita e não pode, em termos gerais,
> ser reconstruído ao contrário a partir de um `Model.options` que contém defaults; não se cria um helper
> unificado de comparação de Selection/Target, e cada consumidor compara explicitamente conforme a semântica do
> seu próprio negócio; nesta rodada o Telemetry só passa por desacoplamento de tipo, sem refatorar o design
> geral dele.
>
> Data: 2026-08-24
>
> Roteiro geral: [`todo-00-model-abstraction-unification-roadmap.md`](./todo-00-model-abstraction-unification-roadmap.md)
>
> Tarefas prévias concluídas: [`todo-01-core-model-adapter-boundary-cleanup.md`](./todo-01-core-model-adapter-boundary-cleanup.md)
>
> Relacionadas, mas sem bloquear esta tarefa: [`todo-04-core-model-connection-port-retirement.md`](./todo-04-core-model-connection-port-retirement.md)

## 0. O que foi efetivamente entregue

- O `ModelSelection` foi fechado em `@zcode/shared`, como o único contrato estrito de intenção de escolha
  entre processos;
- A execução atual passou a segurar `Model` de forma unificada, e Core, Compact, Memory, Subagent e Adapter não
  recebem mais o `ModelRef` público;
- `ModelRef`, `ZCodeModelRef`, a identidade de reasoning via `variant`, os helpers de parse/format/equality e os
  aliases públicos equivalentes foram removidos;
- Result, Stream, Session persistence e Telemetry passam a guardar Selection ou campos explícitos de
  provider/model conforme a semântica de cada um, sem compartilhar mais um pseudo-objeto de identidade;
- Bot, TUI, Protocol, CLI admission, hydration de histórico e codec SQLite passaram a usar o `ModelSelection`
  padrão; somente campos históricos explicitamente publicados são lidos nas fronteiras de migration/codec, e a
  escrita atual não produz mais a forma antiga.

## 1. Objetivo da tarefa

Remover o antigo `ModelRef`, que acumulava ao mesmo tempo Selection, identidade de execução, variant de
reasoning, atribuição de requisição e atribuição de resultado. Cada ponto de chamada passa a usar a abstração já
existente conforme a semântica real, ou a remover campos redundantes, sem criar um novo `ModelIdentity`
genérico.

```text
当前 ModelRef
├─ providerId
├─ modelId
└─ variant?
   |
   +--> runtime selection
   +--> adapter resolution
   +--> request / result / stream event
   +--> session event / persistence
   `--> network status / telemetry

目标

未来选择意图 ----------------> ModelSelection
当前执行 --------------------> Model
调用方已知当前 Model 的结果 ---> 删除重复 model 字段
需要继续执行的持久化状态 -----> ModelSelection
现有观测 --------------------> 在产生点从 Model 取 providerId/modelId
legacy input -----------------> importer 边界一次转换
```

## 2. Por que não manter o ModelRef

Hoje o `variant` na prática duplica `ModelSelection.options.reasoningLevel`, e tanto `formatModelRef()` quanto
`modelRefsEqual()` ignoram o `variant`. Isso mostra que ele não é uma identidade estrita nem uma seleção
completa.

A varredura estática mostra que `ModelRef` ainda aparece em cerca de 50 arquivos de produção que não são de
teste, cobrindo Contracts, Core, Bootstrap, Adapter, Session event, persistence e telemetry. Não é possível
substituí-lo globalmente por outra interface equivalente; é preciso responder, consumidor por consumidor, se é
escolha futura, objeto atual, fato histórico ou simplesmente redundância.

## 3. Decisões centrais

### 3.1 Não criar ModelIdentity nesta rodada

- A execução atual dentro do processo usa `Model` diretamente;
- O estado que precisa recriar o modelo depois usa `ModelSelection`;
- Quando o resultado é naturalmente pertencente ao Model que o chamou, remove-se a identidade duplicada;
- O ponto de produção da observação pode ler providerId/modelId de forma plana a partir do Model, mantendo o
  payload atual;
- Só quando, no futuro, vários domínios independentes precisarem repetidamente do mesmo valor de identidade
  serializável e sem options é que se prova e projeta uma Identity separada.

### 3.2 Reasoning sai da Identity

`variant` sai:

- A escolha do usuário/produto entra em `ModelSelection.options.reasoningLevel`;
- O valor de execução já vinculado entra em `Model.options.reasoningLevel`;
- O parâmetro de wire do Provider é produzido pelo `reasoningMapping` do Model Config;
- Se o Telemetry atual registra o valor de requisição/mapeamento, ele continua no seu campo de observação de
  requisição, sem voltar para a identity.

### 3.3 Não fabricar um tipo de domínio por causa de serialização

Quando um evento realmente precisa de `providerId/modelId`, é possível manter dois campos explícitos no schema
desse evento. Só se salva um `ModelSelection` completo quando o evento expressa "a execução deve continuar
conforme esta escolha". Não se introduz um ModelIdentity cross-domain só para economizar dois campos.

### 3.4 Selection não é derivado de volta a partir do Model efetivo

`Model.options` é um valor de execução já vinculado e pode conter defaults preenchidos pelo ModelFactory a
partir das Option Specs atuais; `ModelSelection.options` expressa apenas a intenção de escolha que o chamador
aceitou explicitamente e se prepara para persistir. O sistema precisa guardar a Selection original e não pode
usar `modelSelectionFromModel()` como projeção inversa genérica, senão o default atual é fixado indevidamente como
escolha explícita do usuário e impede que Models criados depois herdem novos defaults de Config.

Quando consumidores como Parent, Child e Compact precisam herdar a escolha futura, eles leem a Selection
autoritativa; quando realmente precisam continuar usando o valor de execução já vinculado, passam o Model atual
diretamente ou tratam isso explicitamente na fronteira de execução local, sem virar uma conversão genérica de
Model para Selection.

### 3.5 Contrato único de Selection, sem unificar a semântica de comparação

`@zcode/shared` passa a ser dono do único Schema estrito de `ModelSelection` e do tipo entre processos:

```ts
{
  providerId: string;
  modelId: string;
  options?: {
    reasoningLevel?: string;
    maxOutputTokens?: number;
  };
}
```

Mas a camada pública não oferece `sameModelSelection()`, `sameModelTarget()` nem um helper de equality genérico
configurável. Se duas escolhas são iguais é um julgamento de domínio do próprio consumidor e precisa ser
expresso explicitamente no ponto de chamada e travado por testes:

- Ao julgar mudança de seleção completa, comparar `providerId`, `modelId` e todas as options explícitas
  atualmente existentes, ou seja `reasoningLevel` e `maxOutputTokens`, sendo que reasoning diferente precisa ser
  julgado como diferente;
- Ao julgar o alvo físico do modelo, a pertenência ao catálogo ou a compatibilidade entre modelos, comparar
  somente `providerId` e `modelId`, ignorando options;
- Depois da migração de judgments antigos de `providerId/modelId/variant`, nos consumidores que antes tratavam o
  variant como mudança, comparar correspondentemente `options.reasoningLevel`;
- Não promover nenhuma função de comparação local a uma abstração pública de "identidade", nem fazer comparação
  por meio de string formatada.

O `modelRefsEqual()` público atual compara apenas `providerId/modelId` e já não tem referência estática; ele deve
sair junto com o `ModelRef`, e não ser mantido com outro nome.

## 4. Classificação da migração dos consumidores

### 4.1 Selection e Runtime

Migrados para `ModelSelection`:

- Seleção padrão/atual da Session;
- Intenção de execução futura em Submission, Guide e itens de Queue;
- Profile/override de Subagent;
- Seleção de tarefas de modelo independentes;
- Qualquer entrada que precise recriar um Model via Registry/ModelFactory.

Remover strings de model nuas e o fallback de defaultProvider. Consumidores que precisam julgar mudança completa
de Selection têm de comparar explicitamente a semântica real das options, sem reutilizar o
`formatModelRef/modelRefsEqual` que ignora reasoning e sem passar a usar um novo helper público de comparação.

### 4.2 Execução atual no Core

Migrados para `Model`:

- Agent Loop, Compact, Memory, Title e verificação de objetivo;
- Validação de ferramentas e requisição;
- Execução atual do child de Subagent;
- Os pontos de produção da persistência de mensagem que precisam saber quem de fato executou.

Quando um helper do Core só precisa de providerId/modelId, ele lê diretamente do Model e não cria DTO de
identidade.

### 4.3 Adapter

- `createModel()` recebe providerId/modelId explícitos e os fatos estáticos de execução;
- Runner/transform/error helpers que precisam apenas do ID do modelo recebem um escalar explícito ou um objeto
  privado do Adapter já vinculado;
- Não aceita `ModelRef | string`;
- Remover `parseModelRef()` do Adapter, o default provider e o ramo de variant;
- O `model: ModelRef` duplicado em request/result é removido quando o chamador interno já detém um Model.

Um helper privado do Adapter receber dois escalares não equivale a criar um novo tipo de identidade de negócio.

### 4.4 Result e Stream Event

Julgamento campo a campo:

- O Result de `Model.generateText()` é unicamente pertencente ao Model que o chamou, e o `model` duplicado é
  removido por padrão;
- O mesmo vale para os eventos de `Model.streamText()`, sem repetir identity em cada chunk por padrão;
- Se um agregador realmente mistura streams de vários Models concorrentes, a origem é guardada na fronteira de
  agregação, sem contaminar todos os eventos de Model;
- Usage, finish reason, content e error mantêm a semântica atual.

### 4.5 Session Event e persistência

Classificados pela finalidade do evento:

1. Expressa mudança de escolha: guardar `ModelSelection`, incluindo as options válidas;
2. Expressa a origem real de uma mensagem de assistente: manter providerId/modelId explícitos no schema da
   mensagem (se o produto precisa exibir/auditar);
3. O chamador ou o evento pai já determina unicamente a origem: remover o campo duplicado;
4. Dados históricos legados: só converter na hydration/importer para as formas atuais acima.

Não se pode trocar todo `modelRef` por `modelSelection` sem critério, porque isso persistiria options de requisição
como se fossem "identidade de modelo"; nem se pode remover tudo sem critério, porque isso perderia escolhas
necessárias entre reinícios e a proveniência das mensagens.

### 4.6 Network Status e Telemetry

Este Todo não refatora o Telemetry. O tratamento se limita a:

- O Adapter preencher os providerId/modelId já existentes no ponto de produção dos eventos atuais, a partir do
  Model atual/da execução já vinculada;
- Se o schema atual precisar manter temporariamente um objeto `model` equivalente, ele pode ser definido antes como
  uma estrutura de campo local desse schema de observação, sem continuar exportando/reusando `ModelRef` a partir
  do Core;
- Não criar camadas de Context, Observation ou Identity;
- Não alterar a quantidade de eventos, o sampling, a privacidade, a persistência nem o canal de envio.

Este é um limite temporário e proposital: o `ModelRef` público pode sair, e o design geral do Telemetry é tratado
depois em separado.

### 4.7 Fronteira de legados do Protocol

Se um protocolo já publicado ou um arquivo histórico usar `modelRef`/string:

- O schema estrito continua reconhecendo a versão legacy necessária;
- Importer/hydrator converte imediatamente para ModelSelection ou para o campo atual explícito daquele evento;
- Novas escritas, novos comandos e objetos de domínio não produzem mais ModelRef;
- O código de compatibilidade fica concentrado na fronteira de versão e tem uma condição de remoção, sem leitura
  dupla generalizada em Core/Adapter.

### 4.8 Pontos de risco específicos confirmados

Na implementação, os dois pontos abaixo precisam ser tratados com testes primeiro, e não migrados mecanicamente
como estão:

1. `createInheritedSubagentModelFactory()` hoje só reutiliza o Model pai por `providerId/modelId`. Se a Selection
   alvo tiver options diferentes, isso reutiliza incorretamente um Model pai já vinculado. A semântica alvo é:
   ao herdar o fato de execução atual, passar o Model pai diretamente; havendo uma Selection nova explícita, deixar
   o ModelFactory criar ou vincular, sem decidir a reutilização só porque o ID alvo é igual.
2. O custom provider recovery do `SessionPane` hoje compara apenas `modelId`. O mesmo modelId pode existir em
   Providers diferentes, então é preciso conferir `providerId/modelId` juntos antes de confirmar que a
   restauração teve sucesso.

## 5. Testes primeiro

### 5.1 Selection

1. Round-trip completo de providerId/modelId/reasoningLevel/maxOutputTokens;
2. Consumidores que julgam mudança completa de Selection não ignoram options, e reasoning/max output diferentes
   são julgados como mudança conforme a semântica de negócio já existente;
3. Override de Queue/Guide/Subagent usa a Selection que cada um salvou;
4. modelId nu não é resolvido por default provider;
5. Criação pelo Registry/ModelFactory recebe apenas ModelSelection/entrada explícita;
6. Consumidores de catálogo e de compatibilidade que só se importam com o alvo do modelo continuam ignorando
   options e não confundem mudança de reasoning com troca de modelo.

### 5.2 Execução e resultado

1. Resultado de generate/stream continua sendo atribuído corretamente após remover o campo model;
2. Chamadas concorrentes ou aninhadas não misturam streams por causa da remoção da identity de chunk;
3. Compact/Memory/Subagent usam o Model real;
4. O reasoning level vai de Selection -> Model.options -> mapping sem passar por variant;
5. Erros e Usage preservam a observação existente do providerId/modelId real.

### 5.3 Session/histórico

1. Evento de mudança de escolha guarda o ModelSelection completo;
2. A proveniência da mensagem de assistente é restaurada conforme o schema de produto atual;
3. ModelRef/string legados são restaurados em uma única fronteira de importer;
4. As novas escritas não produzem `variant` nem `modelRef`;
5. hydrate -> continue não muda o Selection da Session;
6. desktop continuous e mobile replayable obtêm a mesma projeção a partir do mesmo fato histórico, sem mudar a
   semântica de restauração de cada um.

### 5.4 Zeragem mecânica

- Os Contracts públicos não exportam mais `ModelRef`;
- Não há `variant` como identidade de reasoning no código de produção;
- `parseModelRef`, `formatModelRef` e `modelRefsEqual` foram removidos;
- As interfaces públicas de Adapter/Core não têm `ModelRef | string`;
- Literais legados só existem em importer/schema/test fixture explícitos;
- Não foi criado `ModelIdentity`, alias equivalente nem helper público de igualdade de Selection/Target.

## 6. Ordem de implementação

### Step A: montar a lista de consumidores

Tomando como base os cerca de 50 arquivos de produção atuais, marcar cada referência como:

- selection;
- active execution;
- redundant result/event;
- persisted provenance;
- telemetry/status;
- legacy importer.

A lista precisa ter uma forma alvo arquivo por arquivo; não é permitido fazer codemod direto.

### Step B: migrar primeiro a seleção e o Adapter

- Runtime/Bootstrap passam a usar ModelSelection de forma unificada;
- O tipo de Selection entre processos e o Schema estrito são fechados em `@zcode/shared`, removendo as definições
  públicas equivalentes de cada pacote;
- A interface do Adapter passa a receber entrada já resolvida de forma explícita;
- variant migra para options;
- Remover a resolução de string/default provider;
- Migrar as comparações conforme a semântica original de cada consumidor, corrigindo antes o problema de reuso
  no Subagent e a comparação incompleta de Provider no custom recovery.

### Step C: migrar Result/Event

- O Result/Event novo do Model se desliga dos aliases de tipo antigos;
- Remover os campos model duplicados que o chamador já conhece;
- Definir um schema local preciso para provenance/selection que realmente atravessa fronteiras.

### Step D: migrar persistência e importer de legados

- Atualizar o Protocol/schema estrito;
- Concentrar a conversão de legados;
- Validar hydration do histórico, continuação de execução e projeção de replay.

### Step E: remover os tipos públicos e validar

- Remover ModelRef, variant e os helpers de parse/format/equality;
- Rodar os testes unitários de Contracts, Core, Bootstrap e Adapter;
- Rodar as regressões representativas de session hydration/replay;
- Rodar `pnpm typecheck`, `pnpm lint`, `pnpm fmt:check`;
- Conventional Commit independente.

## 7. Definição de conclusão

O sistema usa `ModelSelection` para expressar escolha futura e `Model` para expressar execução atual.
Result/Event não carregam de novo uma identidade que o chamador já conhece; escolhas e provenance que precisam
ser persistidos usam seus schemas precisos; o Telemetry recebe só a adaptação mínima de tipo. O `ModelRef`
público, o `variant` e os tipos substitutos equivalentes saem; não existe helper unificado de igualdade de
modelo no sistema, e cada consumidor expressa e testa explicitamente os seus próprios campos de comparação.