# Addendum do Todo 13: construção do valor de ModelSelection e semântica de default de Option

> Status: absorvido e concluído
>
> Data: 2026-08-25
>
> Tarefa relacionada: [`todo-13-target-host-model-selection-authority.md`](./todo-13-target-host-model-selection-authority.md)

Este documento mantém de forma independente as decisões complementares que surgiram após a discussão do Todo 13; sua construção de valores esparsos e a semântica de duas fases Select/Submission já foram absorvidas pela implementação oficial e pelo Design do Todo 13.

## 1. Conclusão principal

`ModelSelection` é um valor de seleção imutável, e não um contêiner mutável que faz patch contínuo de Provider, Model e Options sobre o objeto original.

```ts
interface ModelSelection {
  providerId: ProviderId;
  modelId: ModelId;
  options?: {
    reasoningLevel?: string;
    maxOutputTokens?: number;
  };
}
```

Depois de concluída a troca da identidade do modelo ou o ajuste de Options, o que o solicitante submete é sempre um novo valor completo de `ModelSelection`. O Registry e o ModelFactory consomem esse valor, mas não são responsáveis por transformar a Selection antiga em uma nova Selection.

A terminologia deve distinguir:

- `ModelSelection`: o valor de seleção completo, com `providerId`, `modelId` e `options` opcional;
- `ModelSelection.options`: subestrutura esparsa que, dentro da Selection, guarda apenas as sobrescritas explícitas de option;
- não usar "reconstruir um Model Selection Option" para se referir à troca completa; o termo correto é "reconstruir um `ModelSelection`".

## 2. A troca da identidade do modelo reconstrói a Selection no solicitante

Trocar do modelo A para o modelo B não é sobrescrever `providerId/modelId` sobre a Selection antiga, nem exige que a camada comum projete um algoritmo de "limpar, migrar ou compatibilizar as options antigas".

```text
旧 ModelSelection A
|- providerId: provider-a
|- modelId: model-a
`- options: A 的显式意图

用户选择目标模型 B
        |
        v
切换方依据目标候选和本次用户意图重新构造
        |
        v
新 ModelSelection B
|- providerId: provider-b
|- modelId: model-b
`- options: 只包含这次明确指定给 B 的值
```

Semântica recomendada:

```ts
const nextSelection: ModelSelection = {
  providerId: target.providerId,
  modelId: target.modelId,
};
```

É proibido usar a expansão do objeto antigo como mecanismo genérico de troca:

```ts
const nextSelection = {
  ...previousSelection,
  providerId: target.providerId,
  modelId: target.modelId,
};
```

A segunda forma carregaria por acidente as options explícitas do modelo de origem para o modelo de destino, fazendo com que o comportamento da troca dependesse do formato do objeto antigo. Mesmo que dois modelos suportem hoje uma option de mesmo nome, a camada comum não pode inferir que o usuário deseja herdá-la; se alguma interação concreta quiser suportar no futuro "trocar levando consigo uma certa configuração", essa interação deve construir explicitamente a Selection de destino e deixar um contrato de produto próprio.

## 3. Ajustes de Option no mesmo modelo também produzem um novo valor

Quando apenas se modificam options como o reasoning do modelo atual, a identidade do modelo não muda, mas o resultado ainda é um novo `ModelSelection`:

```ts
const nextSelection: ModelSelection = {
  providerId: current.providerId,
  modelId: current.modelId,
  options: {
    reasoningLevel: "high",
  },
};
```

O editor de Options do mesmo modelo pode preservar deliberadamente as outras folhas explícidas ainda válidas daquela Selection; isso é editar a mesma intenção de seleção e difere da migração automática das options do modelo de origem em uma troca entre modelos. Em ambos os casos, o final é submeter um novo valor, sem exigir que o Registry, o ModelFactory ou o Session owner modifiquem a Selection no lugar.

## 4. Options guardam apenas a intenção explícita

`ModelSelection.options` é uma estrutura esparsa:

- uma folha não especificada explicitamente não é gravada na Selection;
- `options: {}` deve ser normalizado para a ausência de todo o campo `options`;
- a Selection oficial não armazena `null`; uma API de patch pode usar `null` para expressar limpeza, mas o resultado persistido remove a folha correspondente;
- quando o usuário escolhe explicitamente um valor que por acaso é igual ao default atual, isso ainda é um pin explícito e deve ser salvo;
- a UI apenas exibir o default atual não constitui uma atribuição explícita.

```text
新 ModelSelection（显式 options）
        |
        | + 当前 Model Config Option Spec 默认值
        v
Target Worker ModelFactory
        |
        v
Active Model.options（完整且不可变）
```

Os defaults resolvidos pelo ModelFactory entram apenas no Active Model e não são reescritos no Draft, no App Recent, na Session Selection ou em qualquer outro record de produto.

## 5. Limite atual de `maxOutputTokens`

`maxOutputTokens` pertence razoavelmente ao contrato genérico de `ModelSelection.options`, mas a interface atual de seleção de modelo não o atribui deliberadamente. Portanto, o comportamento normal deste ciclo é manter essa folha ausente e deixar o ModelFactory usar o default do Model Config.

Isso significa que atualmente não é necessário:

- projetar uma estratégia de herança ou limpeza de `maxOutputTokens` para troca de modelo;
- gravar de volta um `maxOutputTokens` default na Selection para formar uma "Selection completa";
- preencher esse campo ativamente em UI, RPC ou repository onde hoje não há interação explícita correspondente.

Se algum produto abrir de fato a edição de `maxOutputTokens` no futuro, será preciso definir primeiro a semântica de interação, persistência e herança; nessa ocasião, o chamador grava a escolha explícita do usuário na nova Selection, sem alterar a fronteira genérica deste documento.

## 6. Checkpoints de implementação e revisão

1. O chamador da troca de modelo reconstrói o `ModelSelection` a partir do candidato de destino, sem expandir a Selection antiga para sobrescrever a identidade;
2. Registry/ModelFactory não oferecem helper de migração, limpeza ou adivinhação de Options entre modelos;
3. Todo caminho sem entrada explícita de `maxOutputTokens` hoje mantém o campo ausente;
4. O ModelFactory aplica os defaults do Model Config às folhas ausentes e fixa o resultado completo apenas no Active Model;
5. Session restore, round-trip de RPC, exibição na UI e gravação no repository não podem reescrever as Options Efetivas de volta na Selection;
6. Os testes provam separadamente a criação de uma nova Selection entre modelos, a edição explícita de Option no mesmo modelo e que o `maxOutputTokens` ausente não é materializado.

## 7. Não objetivos

- Não criar outro serviço de domínio Selection Builder; chamadores comuns podem usar pequenas funções puras para reduzir repetição, mas a função não possui estado nem defaults;
- Não transformar `ModelSelection` em uma classe mutável;
- Não alterar os Option Specs do Model Config, as validações do ModelFactory ou o ciclo de vida do Active Model;
- Não adicionar página de configuração ou entrada de produto para o `maxOutputTokens` que hoje não está aberto;
- Não implementar as fases Select e Submission como dois schemas distintos de identidade de modelo ou de Options.

## 8. As duas fases Select e Submission

Todo estado de produto que referencia um modelo é classificado, conforme o comportamento atual, em duas fases, e não se inventa um ciclo de vida de modelo separado para Automation, Repo Wiki, Bot, Off-Peak, Subagent e Sidecar:

```text
Select
|- 用户偏好、草稿或可复用产品配置
|- modelSelection 可以缺失
|- 缺失表示按该产品既定来源取得首选模型
`- 可以反复编辑，不代表一次工作已经提交
        |
        | 产品触发执行
        | 解析出具体 provider/model
        v
Submission
|- 必须携带确定的 ModelSelection
|- options 仍然只保存显式覆盖
|- 进入 Queue、等待、远程传输或重试后不重新读取首选模型
`- 最终交给 Target Worker Registry / ModelFactory
        |
        | Model Config 默认值只在创建时补齐
        v
Active Model
`- 完整、不可变的本次执行事实
```

Aqui, Select é uma fase de estado de produto e não cria um novo tipo de domínio chamado `ModelSelect`. Tanto no Select quanto no Submission, as referências a modelo usam o mesmo Schema de `ModelSelection`; a diferença está apenas em se o estado externo permite ausência e em quando a identidade do modelo é fixada.

### 8.1 Regras de transição de fase

O critério não é o nome do produto, mas o que o objeto expressa no momento:

- rascunhos, preferências do usuário e configurações reutilizáveis pertencem ao Select;
- um trabalho já aceito pelo sistema e prestes a executar pertence ao Submission;
- quando `modelSelection` está ausente no Select, o modelo preferido é resolvido na fronteira em que o produto dispara a execução e forma o Submission;
- uma vez aceito, o Submission passa a usar a Selection já determinada em Queue, espera, retirada de senha, transmissão remota, restauração e Retry;
- durante a espera, mesmo que o Host preferred, o Provider Config ou a visibilidade de modelos mudem, não há reseleção silenciosa; o Target Worker valida conforme o Registry atual ao construir o Model de fato, e falha explicitamente em caso de falha;
- uma "Selection determinada" exige apenas que `providerId/modelId` estejam determinados e não autoriza materializar os defaults do Option Spec dentro de `ModelSelection.options`.

```text
Select.modelSelection 缺失
        |
        | 读取触发时的既定首选来源
        v
Submission.modelSelection
|- providerId/modelId：确定
`- options：仍然稀疏
        |
        | 等待 / Queue / Retry
        `----------------------> 不重新 Select
```

Operações como Edit e Retry, quando produzem um novo Submission, podem herdar a Selection da Submission de origem conforme a semântica já existente daquele produto; trata-se de construir explicitamente um novo valor ao criar o novo Submission, e não de fazer a Submission antiga reler o modelo default antes de executar.

### 8.2 Classificação dos produtos existentes

| Produto/cenário          | Fase Select                                       | Fronteira que forma o Submission            |
| ----------------------- | ------------------------------------------------- | -------------------------------------------- |
| Sessão comum            | Composer / Draft                                  | O usuário envia e o sistema aceita            |
| Automation               | Preferência de modelo opcional no Automation record | Cada disparo agendado                      |
| Repo Wiki                | Seleção de modelo na geração da página ou na configuração salva | O usuário clica em gerar             |
| Bot                      | Preferência de modelo na configuração do Bot      | Uma mensagem chega e cria uma task           |
| Subagent                 | model override opcional no Profile                | A criação do Child Agent                     |
| Off-Peak                | Seleção de modelo na página de criação           | O usuário submete a tarefa off-peak e o sistema aceita |
| Title/Memory/Git         | Em geral não há Select de longo prazo separado; a intenção vem do contexto de chamada atual | Cada chamada de Sidecar forma sua própria Submission de execução |

O Automation record é um Select reutilizável. Ao manter "seguir o Workspace", ele não salva `modelSelection`; cada disparo agendado lê o Host preferred vigente naquele momento e forma a Submission determinadapara aquele disparo. Mudanças posteriores no Host preferred não afetam a Submission já formada.

O Off-Peak forma a Submission quando o usuário confirma a criação da tarefa off-peak e o sistema a aceita, portanto a Selection é fixada nessa fronteira. A espera, a retirada de senha e o despacho subsequentes executam apenas essa Submission, sem reler o Host preferred.

Quando o Subagent Profile não tem override, a fronteira de criação da Child Submission obtém a identidade do modelo a partir do Parent Active Model; depois de formada, a Child Submission também deixa de acompanhar mudanças de modelo posteriores no pai.

### 8.3 Checkpoints de implementação

1. Cada produto declara o seu próprio Select owner e o evento existente que forma a Submission, sem criar um Select Store compartilhado e mutável;
2. O Select pode não ter `modelSelection`; o Submission não pode ficar sem provider/model concretos;
3. A resolução do modelo preferido acontece apenas na fronteira de Select para Submission; o scheduler, o Queue consumer e o Retry runner não resolvem de novo;
4. A persistência, o protocolo e a transmissão remota do Submission preservam integralmente o `ModelSelection` esparso e estruturado;
5. Uma atualização do Registry só pode fazer uma Submission existente falhar explicitamente no ModelFactory, sem disparar fallback silencioso;
6. Os testes cobrem pelo menos os dois ordenamentos, "o modelo preferido muda antes da formação da Submission" e "muda depois da formação", provando que a fronteira de fixação está correta.