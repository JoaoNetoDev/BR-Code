# Todo 68: Active Model como fonte única do Context de execução

> Transferência de atribuição de verificação (2026-09-09): a dívida residual de teste/falha/promoção manual deste documento foi transferida para [Todo102](todo-102-verification-debt-closeout.md), que fecha o agendamento de verificação independente deste documento; as evidências históricas são preservadas, e a transferência não significa que os testes passaram.

> Estado: implementação e verificação concluídas (2026-09-03; commit nesta rodada de fechamento)
>
> Origem: regressão em que, após trocar na prática por um modelo de mesmo nome, o modelo só percebia o novo Provider no turno seguinte

## 1. Problema e causa raiz

A requisição oficial já usa o Active Model criado pelo `ModelSelection` do turno corrente, mas o prefixo do
Context ainda deriva separadamente um `currentModel` e as dicas de ferramentas relacionadas ao modelo a partir
do Session Selection. As duas cadeias têm timings de aplicação diferentes:

```text
本轮 Submission Selection
          |
          +---------------------------> Active Model -> 正式请求
          |
          `-- 尚未写入 Session Selection

旧 Session Selection -> Context 前缀 -> 模型看到的“Current model”
```

O Turn só aplica o Submission Selection depois da inicialização assíncrona do Context e do SessionStart Hook;
nesse momento `activeTurn` já existe, e a proteção de atualização antiga proíbe reescrever o Context do Turn
corrente. O resultado é que a requisição do Adapter usa o Model novo, enquanto a descrição de ambiente dentro
da requisição ainda escreve o Model do turno anterior — se manifestando como a troca de modelo sempre atrasada
em um passo.

A mesma divisão também afeta:

- o Guide trocando de Model em um limite legítimo de model-step dentro do mesmo Turn;
- o Off-Peak Model de escopo de execução, que não modifica o Session Selection;
- o Subagent, que ao herdar o Active Model pai ainda monta o child Selection a partir do Session Selection do
  pai;
- as dicas de ferramentas projetadas por modelo no Context, que não usam o Model held pela requisição oficial.

## 2. Princípio de unificação

`ModelSelection` é a intenção de Session/Submission de "qual Model criar daqui em frente", e pode ser
persistido; não é o fato do modelo que está sendo executado.

Cada passo de modelo cria e detém apenas um Active Model imutável. O Context desse passo, a projeção de
ferramentas, o orçamento, o Adapter e a requisição real leem diretamente esse mesmo Model:

```text
Session / Submission ModelSelection
                 |
                 v
             ModelFactory
                 |
                 v
        immutable Active Model
          |        |        |
          v        v        v
       Context    Tools    Request
```

- Não criar Context Model Snapshot, Execution Model Binding, Provider Snapshot nem capability DTO;
- Não persistir o Active Model; atualizações do Registry só afetam Models criados depois;
- Mudança do Session Selection em um Turn ativo afeta apenas o próximo Model criado;
- `contextSourceSnapshot` continua guardando cwd, plataforma, Shell, Git e Instructions e outras Context
  Sources legítimas, mas não guarda nem deriva o modelo de execução;
- A cópia defensiva do Session Selection não tem relação com este bug; os métodos externos usam
  `getSessionModelSelection()` / `setSessionModelSelection()` deixando explícito que se trata da escolha de
  sessão de Turns futuros, evitando que seja lido como o Active Model atual.

## 3. Design de implementação

### 3.1 Turn admission

Turn comum, Compact e Off-Peak de escopo de execução congelam o Selection antes da primeira espera assíncrona e
criam o Active Model do turno apenas uma vez. Depois:

1. A inicialização/reconstrução do Context recebe explicitamente esse Model;
2. O SessionStart Hook lê a identidade de Provider/Model desse Model;
3. A escrita do Session Selection da Submission e a publicação de eventos reutilizam o Model já criado, sem
   criar outro;
4. Regular Loop, Memory Recall, Compact, projeção de ferramentas e requisição continuam usando o mesmo objeto.

Comandos que não enviam requisição de modelo, como Rewind, não devem exigir um Model executável extra só para
reconstruir histórico.

### 3.2 Prefixo do Context

Remover a semântica `refreshContextModelSnapshot`, que sincroniza o Session Selection com o Context. Manter a
capacidade genérica de reconstrução do prefixo do Context, usada para mudanças reais de Context Source como
idioma, estilo de saída, Shell e Rewind; ao reconstruir, se o passo for um passo de modelo, o Active Model
desse passo precisa ser passado explicitamente.

O Context Builder só pode gerar a partir de um Model explícito:

- a descrição de Provider/Model no prompt final (sem passar pelos campos de ambiente);
- projeções relacionadas ao modelo como `guidanceToolNames`.

Ele não pode chamar `getSessionModelSelection()` para adivinhar qual modelo está sendo executado.

### 3.3 Model step do Guide

A troca de modelo pelo Guide cria um novo Active Model. Antes da próxima requisição, reprojetar o prefixo do
Context com esse Model e substituir ao mesmo tempo o prefixo request-local do Turn corrente; os trechos já
submetidos de usuário, assistente, ferramentas e lembretes permanecem inalterados. Se o Session Selection é
atualizado continua valendo a semântica já existente do Guide.

### 3.4 Subagent

Quando o Subagent herda o Model pai, o child Selection, a identidade de modelo no child prompt e o child
ModelFactory derivam todos do Active Model pai realmente passado, sem mais misturar com o Session Selection do
pai. Profile/override explícito continuam criando o próprio Model.

## 4. Testes primeiro

Adicionar primeiro testes de regressão que falham na implementação antiga:

1. Troca de modelo comum e explícita: a requisição usa o Model novo e o Context já mostra o mesmo Provider/Model;
2. Off-Peak de escopo de execução: Context e requisição usam o Model temporário, e o Session Selection não muda;
3. Modificação externa do Session Selection depois que o Turn já começou: o Active Model atual e o Context não
   mudam;
4. Troca de modelo pelo Guide: Context, ferramentas e requisição mudam juntos para o Model do Guide no próximo
   model step;
5. SessionStart Hook: já recebe na primeira rodada o Model escolhido no admission;
6. Herança do Subagent: mesmo que o Session Selection do pai difira do Active Model do pai, o child herda
   integralmente o Active Model;
7. Mudanças posteriores no Registry/Selection afetam apenas Models criados depois.

## 5. Critérios de conclusão

- Não existe mais no código nenhum caminho que derive o Context Model de execução atual a partir do Session
  Selection;
- O Context, as ferramentas e a requisição do Adapter de um model step usam o mesmo Active Model;
- A troca comum de modelo, o Guide, o Off-Peak e o Subagent não apresentam mais dessincronização ou mistura de
  identidade de modelo;
- Não é introduzida uma segunda fonte de verdade de modelo, sincronização de estado extra nem fallback por
  timeout;
- Testes direcionados, a suíte completa de testes unitários do Core, o `pnpm typecheck` e o `pnpm lint` da raiz
  passam;
- Atualizar o Registry Runtime Design e o Feature Graph, e registrar o resultado final da implementação.

## 6. Implementação da cadeia principal já concluída

- O Turn cria um único Active Model conforme o Selection do admission antes da primeira espera assíncrona; a
  inicialização do Context, a reconstrução do prefixo do Context, o SessionStart Hook, a aplicação do estado da
  Submission e a requisição oficial reutilizam o mesmo objeto.
- `setSessionModelSelection()` só atualiza a intenção de escolha de Models futuros e não sincroniza mais o
  Session Selection com o Context; o antigo `refreshContextModelSnapshot` foi removido.
- A Context Source não guarda mais o modelo de execução; `currentModel` e as dicas de ferramentas relacionadas
  ao modelo são gerados apenas a partir do Active Model passado explicitamente no model step corrente.
- O Off-Peak de escopo de execução usa seu próprio Model e seu próprio Context, sem reescrever o Session
  Selection; o Guide atualiza Model e Context request-local no model step seguinte; o Subagent deriva o child
  Selection do Active Model pai realmente herdado e reutiliza esse mesmo Model.
- Foi removida a atualização redundante de Built-in Tool ao trocar o Session Selection; a visibilidade das
  ferramentas continua sendo decidida no momento da requisição por `getTools(activeModel)`.

Resultados da verificação:

- Suíte completa de testes unitários do Core: `2207 passed / 36 skipped / 2 todo`;
- typecheck de `@zcode/core`: passou;
- `pnpm typecheck` da raiz: passou;
- `pnpm lint` da raiz: passou (apenas os warnings já existentes no repositório);
- Verificação de formatação dos arquivos alterados nesta rodada e `git diff --check`: passaram;
- O `pnpm fmt:check` de todo o repositório continua bloqueado pelo HTML inválido do Electron fiddle já existente
  e pela falha de leitura de `apps/zcode-cli/tests/gb2312.js`; esta rodada não alterou esses arquivos de linha
  de base.

## 7. Escopo final de fechamento após o Review

Esta rodada continua escrevendo no Todo 68, sem criar um Todo duplicado. Todos os itens abaixo vêm da mesma
causa raiz: a intenção de escolha futura da Session, a intenção de entrada corrente da Submission e o fato de
execução do Active Model já misturados.

### 7.1 Limite final entre os três tipos de fato

```text
Session Model Selection
├─ 表示会话后续执行的持久选择意图
├─ 可以变化、持久化和恢复
├─ 不描述当前正在执行的模型
└─ App 仅在已有 Session 缺少 Composer Draft 时用于一次初始化

App Composer Draft（Todo 71）
             |
             | 用户提交时一次性冻结，不在 admission 回读 Session 补值
             v
Submission Model Selection
├─ 表示这一条已提交输入选中的 Provider / Model / Reasoning
├─ 排队期间保持冻结
└─ 在开始 model step 时交给 ModelFactory
             |
             v
immutable Active Model
├─ 当前 model step 唯一执行事实
├─ Context 模型说明与模型相关工具投影
├─ Adapter、模型属性和请求 Option
└─ 不持久化；Registry 更新不改变已经创建的对象
```

O caminho de Draft acima descreve apenas o App. CLI, Bot, automação, ociosidade e outras entradas continuam
gerando a entrada de execução completa pelo seu próprio contrato; não se pode forçar o Draft do App nem
sobrescrever uma Submission já congelada. A atualização de estado após o admission da Session não sobrescreve
para trás o Draft que o usuário está editando.

Os antigos `getModelSelection()` / `setModelSelection()` do Runtime liam e escreviam apenas o fato de Session,
e o nome de fato levava quem chamava a acreditar que aquilo representava o modelo em execução. Nesta rodada eles
passaram uniformemente a `getSessionModelSelection()` / `setSessionModelSelection()`. A cópia dentro dos métodos
serve apenas para impedir que o chamador modifique depois o mesmo objeto JavaScript; ela não cria um novo fato
de negócio nem participa da sincronização do Active Model ou do Context.

### 7.2 Remover a entrada inversa de `EnvInfo.currentModel`

O `ContextSourceSnapshot.envInfo` atual ainda usa um tipo genérico com `currentModel` opcional, então existe no
Builder a seguinte semântica de ponte:

```text
Context Source envInfo.currentModel
              |
              v
          先忽略/删除
              |
              v
再从 Active Model 生成 currentModel
```

Embora isso evite que o valor antigo entre de fato na requisição, ainda sobrou uma segunda entrada enganosa. O
fechamento final deve ficar:

```text
Context Source Snapshot
└─ cwd / platform / shell / OS / Git 等环境事实

Active Model
└─ Provider / Model 身份
          |
          v
Context 渲染阶段直接生成模型说明
```

- Requisição, snapshot e dados persistidos da Context Source não recebem nem guardam mais `currentModel`;
- Remover do Builder a ponte que primeiro descarta `_ignoredCurrentModel` e o `delete currentModel` antes de
  persistir;
- O Subagent não grava mais manualmente o child Selection dentro de `envInfo`;
- A descrição de modelo do Agente principal e do Subagent ainda pode aparecer no prompt final, mas sua entrada
  só pode ser o Active Model daquele model step, e nunca um resultado de sondagem de ambiente ou o Session
  Selection;
- Não apagar por engano, no Protocol, campos de mesmo nome usados apenas para exibição antiga na UI ou para
  serialização de compatibilidade e que não pertencem à Context Source; esses campos precisam ser julgados
  pelo uso real de cada um.

### 7.3 Construir o Context da primeira rodada apenas uma vez

O caminho antigo inicializava o Context Builder no primeiro Turn e logo em seguida reconstruía o Prefix para o
mesmo Active Model:

```text
首次 Turn
  -> ensureContextInitialized(activeModel)
  -> 创建 Builder、加载 Source / Skills / Memory、初始化消息历史
  -> rebuildContextPrefix(activeModel)
  -> 立即再次创建 Builder 和 Prefix
```

Esse fluxo de duas fases não é necessário para correção; é apenas uma chamada duplicada após a fusão. Mudar
para ramos mutuamente exclusivos:

```text
Context 尚未初始化
  -> ensureContextInitialized(activeModel)       # 一次完成

Context 已初始化
  -> rebuildContextPrefix(activeModel)           # 为新的 model step 重建
```

Assim o primeiro Turn cria o Builder apenas uma vez; Turns comuns seguintes, o novo model step do Guide e os
outros caminhos que realmente precisam atualizar o Prefix continuam reconstruindo. Operações como Rewind, que
não criam requisição de modelo, não constroem um Active Model extra.

### 7.4 Queue fecha apenas o invariante já determinado

Mensagens comuns na fila ainda abrem um novo Turn quando consumidas. Nesta rodada só se corrige o fato de modelo
na documentação e nos testes de regressão:

```text
消息入队
└─ 保存完整 Submission Model Selection
        |
Session Selection 后续变化
        |
        v
队首消费并开启新 Turn
└─ 使用入队时冻结的 Provider / Model / Reasoning
   Provider Config 则在创建 Active Model 时读取当前最新配置
```

Remover a afirmação antiga de que "a mensagem na fila usa o Session Selection mais recente ao ser consumida". A
semântica de produto entre `sendQueuedNow`, o encaminhamento imediato por padrão e Guide/Queue fica
explicitamente suspensa nesta rodada, sem alterar protocolo nem implementação, e sem usar o Todo 68 para inferir
nada a respeito.

### 7.5 Excluir explicitamente `outputStyle`

O `outputStyle` ainda pode sofrer, durante a inicialização assíncrona do Context, com o mesmo turno lendo valores
diferentes em pontos diferentes. Esse é um problema genérico preexistente de consistência de parâmetros de
Submission e não faz parte da refatoração de Provider/Active Model. Esta rodada apenas registra o limite e não
o modifica; se mais adiante se decidir fechar isso, deve ser criado um Todo separado, sem ampliar o Todo 68.

## 8. Superfície de impacto e invariantes

### 8.1 Cadeias que precisam de verificação direta

- Troca explícita de Provider/Model em um Turn comum;
- Novo model step aberto pelo Guide dentro do mesmo Turn;
- Off-Peak de escopo de execução;
- Herança do Active Model pai pelo Subagent e sobreposição explícita;
- Inicialização do Context da primeira rodada, reconstrução posterior do Prefix e SessionStart Hook;
- Projeção de ferramentas relacionadas ao modelo e requisição do Adapter usando o mesmo Active Model.

### 8.2 Cadeias adjacentes em que só se verifica o invariante, sem expandir a implementação

- A Queue comum salva a Submission Selection completa e a usa em um novo Turn futuro;
- Atualizações de Registry/Personal Config afetam apenas Active Models criados depois;
- Desktop `continuous` e Mobile `replayable` apenas repassam a mesma Submission já submetida, sem introduzir
  dedução própria de escolha de modelo;
- O cold recovery da Session ainda restaura o Selection, em vez de serializar o Active Model;
- Passos auxiliares como Compact, Memory e geração de título continuam criando e usando explicitamente o próprio
  Active Model, sem reler campos de modelo do Context.

### 8.3 O que esta rodada não faz

- Não modifica `sendQueuedNow` nem a semântica de encaminhamento imediato padrão;
- Não trata a consistência genérica de admission do `outputStyle`;
- Não cria Context/Provider/Execution Snapshot;
- Não muda a UI de seleção de modelo, a atualização do Provider Registry nem o protocolo de transporte
  remoto.

## 9. Testes de fechamento do Review e critérios de conclusão

Andamento mais recente do Review: a cadeia principal de execução, a entrada de tipo de 7.2 e as pontes de
remoção do Builder/persistência já foram fechadas. O Builder recebe o Active Model diretamente; os 2213 testes do
Core e os 82 testes direcionados finais do Bootstrap passaram. O Pro obteve as evidências em máquina descritas
abaixo, detalhadas em `68-72-implementation-report.md` no mesmo diretório: requisições e Context consistentes em
A → B → C → A consecutivos, e a segunda rodada reforçou as asserções do marcador de alvo.

A checagem de tipos do Core, do Bootstrap e da raiz no workspace atual já passou, e o Lint da raiz tem apenas os
warnings já existentes no repositório; esses resultados automatizados provam que a cadeia principal não tem
regressão evidente, mas não substituem a verificação em máquina abaixo. Por exigência mais recente do usuário,
tudo é testado uniformemente no MacBook Pro; o Air passa a ser apenas a origem do problema original e não é
mais exigido como máquina de execução.

Sobre a base das sete séries de testes de regressão do Core já existentes, completar e revisar:

1. Mesmo que a entrada do Context Source venha de uma fixture antiga, ela não pode virar um fato de modelo
   atual; a descrição de modelo no prompt final tem de vir do Active Model;
2. As informações de ambiente do Subagent não carregam uma segunda identidade de modelo, e o child Prompt e a
   requisição continuam usando o mesmo child Active Model;
3. O primeiro Turn inicializa o Context Builder só uma vez, e Turns seguintes e o Guide só reconstroem uma vez,
   em fronteiras legítimas de model-step;
4. A Submission na fila continua usando o Provider, Model e Reasoning congelados no momento da entrada na fila,
   mesmo que o Session Selection mude depois;
5. Regressão em máquina do cenário original: no MacBook Pro, dentro da mesma Session, alternar continuamente
   entre três modelos com o mesmo modelId e Providers diferentes, e, após cada troca, a primeira requisição
   precisa satisfazer simultaneamente:
   - o marcador de mudança de modelo da UI é o Provider alvo;
   - a descrição de modelo no Context é o Provider/Model alvo;
   - a requisição real do Adapter usa o mesmo Active Model;
   - o "Provider do passo anterior" não aparece mais.

Níveis de verificação:

```text
Core 单测
  -> 冻结/初始化/Context/Queue 不变量

Bootstrap 集成测试
  -> Submission -> ModelFactory -> Context -> Adapter 纵向一致

Desktop E2E / MacBook Pro 实机
  -> 连续切模后的第一条消息无滞后
```

Antes de concluir, é preciso passar de novo pelos testes direcionados de Core/Bootstrap, pelo typecheck dos pacotes
relevantes, pelo `pnpm typecheck` e pelo `pnpm lint` da raiz e por `git diff --check`. Se o ambiente de Desktop
E2E continuar bloqueado, é preciso preservar os logs de execução e o rastro de requisições do MacBook Pro como
evidência em máquina; não se pode substituir a regressão original apenas por testes unitários.