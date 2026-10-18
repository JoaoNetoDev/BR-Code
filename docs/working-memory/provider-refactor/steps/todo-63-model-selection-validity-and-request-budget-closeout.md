# Todo 63: invalidação de Model Selection e fechamento do orçamento de requisição

> Status: concluído
>
> Data: 2026-09-02
>
> Pré-requisitos: o Todo 58 removeu o `default` do Model Option Spec; o Todo 60 exigiu que cada Effective Model tenha um Reasoning Spec completo e ordenado. Este Todo trata uniformemente a invalidação de Selection, a recuperação de tarefas ociosas antigas e faz `maxOutputTokens` sair da Selection.

## 1. Objetivo

Separar estritamente os fatos estáticos do modelo, a escolha do usuário e os parâmetros de uma requisição:

```text
Model Config / Option Specs
├─ reasoningLevel.values：合法档位，按低到高排序
└─ maxOutputTokens.max：模型允许的硬上限

ModelSelection
├─ providerId
├─ modelId
└─ reasoningLevel

Model Request
└─ maxOutputTokens：Agent 框架为本次调用显式决定
```

`spec.max` é um orçamento de requisição válido e comum. O problema não é usar o valor máximo, e sim o ModelFactory ou o Adapter preenchendo o valor silenciosamente quando a camada chamadora não decidiu nada.

## 2. Contrato de ModelSelection

Estrutura alvo:

```ts
interface ModelSelection {
  providerId: string;
  modelId: string;
  options: {
    reasoningLevel: string;
  };
}
```

- Remover `ModelSelection.options.maxOutputTokens` e limpar os resíduos correspondentes no protocolo, na persistência, em Recent, Session, Subagent, Automation, Off-Peak, na comparação de timeline e na Hydration.
- Uma Selection recém-gravada precisa carregar um `reasoningLevel` concreto.
- Para uma Selection antiga sem reasoning, só é permitido preencher `values.at(-1)` na fronteira de inicialização do Host que já cria uma seleção padrão inteiramente nova; a camada de negócio, o Renderer, o ModelFactory e o Adapter não preenchem mais valores por conta própria.
- Reasoning explícito, mas já inválido, não pode ser substituído automaticamente.

## 3. Orçamento de requisição pontual

`maxOutputTokens` continua sendo uma Model Request Option e precisa estar completamente válido antes de entrar no Executor:

```text
具体执行链
    |
    | 显式决定本次 maxOutputTokens
    v
Active Model / Adapter
    |
    | 只校验 0 < value <= spec.max
    v
模型 API
```

- Turn comum, Off-Peak e Subagent comum podem escolher explicitamente `spec.max` pelo framework do Agent.
- Cadeias auxiliares como Title, Goal, Memory, Git Commit, Connectivity, WebSearch/WebFetch continuam usando seu orçamento explícito.
- Compact e Repo Wiki mantêm a semântica de tarefa própria, mas o valor precisa ser passado explicitamente pela camada chamadora.
- Remover o `selection value ?? spec.max` do ModelFactory; o Active Model deixa de tratar o orçamento de saída da Selection como estado de vínculo de longo prazo.
- O Adapter mantém o erro estrito de parâmetro ausente, sem clamp e sem preenchimento.

## 4. Definição unificada de invalidação de Selection

Os casos abaixo são uniformemente considerados invalidação de `ModelSelection`:

```text
ModelSelection invalid
├─ 结构无法解析
├─ Provider 不存在或不在当前 Selection View
├─ Model 不存在或不在当前 Selection View
└─ reasoningLevel 不属于当前模型的 values
```

A invalidação de Reasoning é apenas uma das causas da invalidação unificada de Selection e não estabelece um segundo fluxo de reparo. O resultado da validação precisa preservar a causa estruturada, para que a UI dê um aviso preciso; não pode apenas retornar `false` e cair silenciosamente.

## 5. Rascunho não submetido

Um rascunho não submetido não produziu efeito colateral de execução automática e, quando inválido, reutiliza a prioridade de seleção padrão já existente:

```text
当前/Recent Selection
        |
        +-- 有效 --> 保留
        |
        `-- 失效 --> 丢弃整个 Selection
                     使用 Host preferredSelection
                     显示一次通知
```

- Um rascunho novo sem nenhuma seleção histórica usa normalmente a prioridade de padrão existente, sem notificação.
- Houve seleção, mas ela ficou inválida por mudança de Registry revision: exibe o estilo de Toast/notificação já existente:
  - com fallback: `原来的模型选择已失效，已切换到当前默认模型，请确认后继续。`
  - sem fallback: `原来的模型选择已失效，请重新选择模型。`
- Uma mesma invalidação notifica apenas uma vez; não se usa Modal bloqueante nem se resolve problema de estado com timeout.

## 6. Tarefas já criadas e dados históricos

Tarefas já criadas e que podem executar automaticamente não podem trocar de modelo silenciosamente:

```text
Persisted Task Selection
        |
        +-- 当前有效 --------> 正常执行
        |
        +-- 可可靠迁移 ------> 写回完整 Selection 后执行
        |
        `-- 无法可靠恢复 ----> 保留任务
                               标记模型选择需要修复
                               禁止调度/执行
                               等待用户编辑
```

### 6.1 Tarefas ociosas antigas

Registros antigos têm apenas `model` / `thought_level`, sem identidade de Provider. A implementação antiga já escolhia Z.ai ou BigModel na execução com base na conexão da conta atual, portanto a migração confiável deve acontecer quando a Selection View de Off-Peak atual estiver pronta, e não adivinhando o Provider no SQLite Row Mapper:

```text
legacy model / thought_level
          +
current Off-Peak Selection View
          |
          v
解析唯一、当前有效的完整 Selection
          |
          +-- 成功 --> 原子写回 model_selection
          `-- 失败 --> 保留为 repair-required
```

- O Repository precisa tolerar `model_selection` ausente ou inválido registro a registro; um registro antigo não pode fazer `list()`, a sincronização ou o agendamento de outras tarefas falharem por inteiro.
- Tarefas aguardando reparo continuam aparecendo na lista; registros em estado terminal podem ser consultados normalmente.
- Tarefas não terminais e ainda não reparadas não podem ser claim, continue nem dispatch.
- Não se apagam registros antigos, não se adivinha o Provider da conta pelo nome do modelo e não se grava silenciosamente o modelo padrão atual em tarefas já criadas.

## 7. Atualização de Registry e Active Model

```text
Registry revision 更新
├─ 新草稿：校验并按第 5 节处理
├─ 已创建任务：校验并按第 6 节处理
├─ 后续新请求：从新 Registry 创建 Model
└─ 已开始执行的 Active Model：保持冻结
```

Desktop continuous e Mobile replayable compartilham apenas o resultado da validação de Selection; este Todo não muda o fluxo de mensagens, a fila, owner/lease nem o protocolo de recuperação.

## 8. Testes primeiro

1. Shared/Protocol: a Selection não aceita `maxOutputTokens`; o reasoning estruturado ainda faz round-trip.
2. Provider: a validação retorna causas estruturadas de invalidação de provider/model/reasoning; a inicialização padrão sem reasoning pega o nível mais alto e valores explícitos inválidos não são preenchidos.
3. Agent Runtime: o ModelFactory não vincula orçamento de saída; o Turn comum passa `spec.max` explicitamente; todas as outras cadeias de execução têm orçamento explícito antes do Executor.
4. UI unit: após a invalidação de Recent/rascunho atual volta ao Host preferred e expõe o resultado "ocorreu invalidação"; o rascunho novo não reporta falsamente em um estado normal.
5. UI E2E: quando uma Registry revision invalida a seleção do rascunho atual, a barra de ferramentas muda para o padrão válido e exibe uma notificação; sem modelo disponível, exige nova escolha.
6. Off-Peak Repo/Service: linhas antigas não derrubam a lista; grava de volta quando há recuperação única; quando não há recuperação, fica visível mas não agendável; as outras tarefas seguem sincronizando e sendo claim.
7. Regressão: Selection e Request Options de Session, Subagent, Automation, Repo Wiki, Title, Goal, Memory, Compact e Connectivity não se misturam.

## 9. Portão de conclusão

- Não existe `maxOutputTokens` no Schema, no protocolo e na persistência de `ModelSelection`.
- O ModelFactory não deriva mais o orçamento de saída da requisição a partir da Selection ou do Spec.
- Cada requisição de modelo tem `maxOutputTokens` decidido explicitamente pela camada chamadora real do framework do Agent.
- Invalidações de Provider/Model/Reasoning entram no mesmo fluxo estruturado de validação de Selection.
- Após a invalidação de um rascunho comum, volta-se à prioridade de padrão existente com notificação; após a invalidação de uma tarefa já criada, não se troca de modelo silenciosamente para executar.
- Registros ociosos antigos não ocultam a lista inteira nem bloqueiam outras tarefas.
- Testes direcionados, `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, E2E de Desktop relevantes e `git diff --check` passam; E2E gráfico que não possa rodar precisa ser registrado explicitamente.

## 10. Resultado da implementação

- `ModelSelection` foi fechada para Provider, Model e Reasoning; o protocolo, Session, Timeline, Recent, Automation, Subagent, Off-Peak e Repo Wiki não salvam mais `maxOutputTokens`.
- O ModelFactory não vincula mais nem usa orçamento de saída como padrão; Turn/Off-Peak/Subagent comuns escolhem explicitamente `spec.max` do modelo, e Compact, Title, Goal, Memory, Git Commit, Connectivity, WebSearch/WebFetch e Repo Wiki mantêm seus respectivos orçamentos explícitos.
- O Provider Registry retorna causas estruturadas de invalidação para Reasoning ausente e para Reasoning inválido; novas escolhas passam uniformemente por `completeNewModelSelection()` para pegar o último item da lista ordenada, e valores explícitos inválidos não são corrigidos.
- Após uma mudança de Registry revision, o rascunho limpa atomicamente a Selection inválida, volta ao Host preferred e exibe uma única notificação deduplicada por workspace/revision; o Active Model que já começou a executar permanece inalterado.
- O Repository de tarefas ociosas consegue ler registro a registro `model_selection` ausente, em Schema antigo ou corrompido; o Service só grava de volta quando o Off-Peak Resolver do Account Family atual consegue preservar o model/reason originais. Tarefas irrecuperáveis permanecem na lista, são marcadas como pendentes de reparo e perdem a elegibilidade de agendamento, e a edição exige escolher novamente o modelo completo e o Reasoning.
- A migração tardia e a gravação de volta em caso de invalidação relêm dentro do lock de escrita do SQLite, evitando sobrescrever uma correção do usuário que outro processo acabou de concluir.

### 10.1 Registro de verificação

- Testes direcionados de Provider/Services/UI: 5 arquivos, 50 casos aprovados.
- Testes direcionados de CLI Bootstrap/Contracts/Core: 9 arquivos, 109 casos aprovados.
- CLI Core completo: 2.201 casos aprovados.
- `pnpm typecheck` da raiz e o typecheck de todos os workspaces do CLI aprovados.
- `pnpm lint` aprovado (35 avisos, todos preexistentes e fora desta rodada).
- `pnpm test:unit`: 13.087 aprovados, 25 pulados; ainda há 2 falhas de baseline preexistentes e sem relação com esta rodada: a asserção antiga da quantidade de seeds de Provider no Desktop E2E e a asserção antiga do mise no pre-push.
- `oxfmt --check` e `git diff --check` aprovados em todos os arquivos alterados nesta rodada.
- O E2E gráfico do Desktop não foi executado no ambiente atual sem display; a interação central é coberta por testes unitários de React Hook/estado, e ainda precisa ser executada em um ambiente macOS com WDIO disponível.