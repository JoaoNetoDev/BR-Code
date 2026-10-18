# Todo 82：A configuração de modelo seguir as recomendações e a materialização do Draft

> Status: concluído
>
> Data: 2026-09-04

## Contexto

O diálogo de edição de modelo oferecia tanto o interruptor da linha da lista de modelos quanto um interruptor 「开启」 dentro do diálogo; os dois pontos de entrada alteravam a mesma configuração `enabled` do modelo, criando duplicação. Na base do diálogo havia ainda 「全部恢复默认」, mas a configuração de modelo já usava a mesclagem esparsa entre os valores recomendados Built-in e o Personal Model Config Overlay, faltando um modo explícito de "seguir as recomendações".

Este Todo consolida as duas interações em um único interruptor de modo de configuração: o usuário pode continuar seguindo a configuração recomendada Built-in ou pode fixar a configuração atual como uma configuração pessoal completa. A alternância altera apenas o Draft do diálogo, e a persistência ocorre somente ao clicar em "Salvar".

## Decisão de produto

### 1. Remover o ponto de entrada duplicado de ativação do modelo dentro do diálogo

- Remover o interruptor 「开启」 ao lado do ID do modelo no diálogo de edição de modelo e seu campo no Draft.
- Manter o interruptor `enabled` à direita da linha da lista de modelos, que continua sendo o único ponto de entrada de UI para o estado de ativação do modelo.
- `enabled` continua sendo um campo formal do Model Config, mas não faz parte do escopo de edição do interruptor "seguir a configuração recomendada".

### 2. "Seguir a configuração recomendada" substitui "restaurar tudo para o padrão"

O diálogo passa a manter apenas um interruptor de modo de configuração, com o texto recomendado:

- Chinês：`跟随推荐配置`
- Inglês：`Follow recommended settings`

Com o interruptor ligado, continua-se usando a lógica atual de Overlay esparso; desligado, a configuração pessoal do modelo atual fica fixada. O botão 「全部恢复默认」 na base e sua interação duplicada são removidos, sem criar um segundo ponto de entrada de reset.

### 3. Semântica de configuração dos dois modos

```text
跟随推荐配置：开
  -> 未覆盖字段使用 Built-in 推荐值
  -> Personal Overlay 保持稀疏
  -> 推荐配置更新后，未覆盖字段跟随更新

跟随推荐配置：关
  -> 当前 Effective 值写入 Personal Overlay
  -> 编辑器管理的字段全部显示为真实输入
  -> Built-in 推荐值不再参与这些字段的结果
```

No estado desligado, o que é salvo é um Personal Overlay completo dos "campos gerenciados pelo editor", e não um snapshot único de UI. Ao salvar novamente no estado ligado, o Personal Overlay do modelo é limpo e os valores recomendados e os placeholders são restaurados.

### 4. Alternância apenas no Draft

```text
打开弹窗
    |
    v
读取当前 Personal Overlay + Effective Built-in
    |
    v
形成本地 Draft
    |
    +-- 开 -> 关：把当前 Effective 值物化到 Draft
    |
    +-- 关 -> 开：清空 Draft Personal Overlay，恢复 placeholder
    |
    +-- 继续编辑：只修改 Draft
    |
    +-- 取消：丢弃全部 Draft 修改
    |
    `-- 保存：一次性提交当前模式和配置
```

Alternar o modo, editar campos e "restaurar os valores recomendados" não podem gravar diretamente na Personal Config, atualizar o Registry nem disparar sincronização remota. Somente após um salvamento bem-sucedido a submissão e a atualização acontecem, pela entrada de salvamento único já existente do Provider Settings Facade.

### 5. Onde o modo é armazenado

O modo pertence ao registro de configuração pessoal exata de modelo do `providerId + modelId` específico; recomenda-se expressá-lo com um campo opcional:

```ts
{
  type: "provider-model",
  providerId,
  modelId,
  useRecommendedConfig: true,
  config: {
    // Personal Model Config Overlay
  }
}
```

- Ausente ou `true`: seguir a configuração recomendada;
- `false`: fixar a configuração pessoal.

Esse campo é metadado de modo de configuração de Settings; não entra no `ModelConfigObject` e não participa do Model Registry, do ModelFactory nem dos parâmetros de requisição. O nome de Rule `provider-model` existente e a identidade de Provider/Model não mudam; a UI usa nomes claros como "个人模型配置" ou `personalExactConfig`.

### 6. A fronteira de `enabled`

"Seguir a configuração recomendada" cobre apenas os campos de configuração gerenciados pelo editor: Context, Max Output, tipos de entrada/saída, capacidades, Reasoning, Mapping e configuração avançada. O `enabled` do modelo é gerenciado separadamente pelo interruptor da linha da lista, e a alternância de modo não pode ativar nem desativar o modelo de forma oculta.

Portanto, um "Personal Overlay completo" significa a cobertura completa dos campos gerenciados pelo editor; a alternância de modo não substitui a operação de ativação da lista de modelos.

## Escopo de implementação

- Estender o registro atual de configuração pessoal exata de modelo para salvar o modo de configuração; dar preferência a implementar isso junto da organização da Rule `provider-model` do Todo 76, sem criar nova camada de Provider nem de Registry.
- Adicionar "seguir a configuração recomendada" ao Draft de edição de modelo, garantindo que, ao alternar, os valores do formulário, o placeholder, o estilo de origem Personal e o estado do botão de salvar sejam atualizados imediatamente.
- Ao desligar o acompanhamento, gerar o Overlay completo dos campos gerenciados pelo editor com os valores Effective mais recentes; não se pode usar um snapshot Built-in desatualizado.
- Ao ligar o acompanhamento, limpar o Overlay do Draft; após salvar, os valores recomendados são restaurados. Essa ação não preserva as substituições pessoais anteriores, e o usuário que agir por engano pode cancelar antes de salvar.
- Ao salvar, reaproveitar a entrada de salvamento de Draft de modelo existente e a validação de revision; o campo de modo e a configuração são submetidos em uma única operação atômica.
- Antes de salvar no modo desligado, validar que o Personal Overlay cobre todos os campos gerenciados pelo editor e que o resultado da resolução não depende mais da complementação do Built-in para esses campos; uma falha de validação não pode permitir salvamento parcial.
- Preservar o resultado da capacidade existente de "restaurar tudo para o padrão", agora passados pelo interruptor "seguir a configuração recomendada"; remover o botão antigo, o callback antigo e os ramos de estado que existiam apenas para a entrada antiga.
- Modelos puramente customizados sem linha de base de recomendação Built-in não exibem nem desabilitam esse interruptor e continuam usando a edição de Personal Config comum.

## Não objetivos

- Não modificar a configuração de topo do Provider, o Provider Template, o Account Access ou a identidade de Provider/Model.
- Não alterar o Model Registry, o ModelFactory, o Adapter nem o protocolo de requisição; o Runtime não lê o campo de modo de configuração.
- Não alterar a semântica do interruptor `enabled` da linha da lista de modelos.
- Não criar uma nova "política de seguir recomendações" nem outro tipo de Model Config Overlay.
- Não salvar automaticamente, atualizar o Registry automaticamente nem disparar Provisioning remoto separado durante a alternância.

## Testes e aceitação

Adicionar primeiro os testes e só então implementar:

- O diálogo não exibe mais o controle duplicado de 「开启」 do modelo; o comportamento do interruptor de ativação da linha da lista permanece inalterado.
- Após abrir o diálogo, alternar o interruptor altera apenas o Draft; Personal Config, Registry e sincronização remota não mudam antes do salvamento.
- Ligado -> desligado: todos os campos gerenciados pelo editor recebem os valores Effective atuais, os placeholders desaparecem e, após salvar, forma-se um Personal Overlay completo.
- Desligado -> ligado: o Overlay do Draft é limpo, os campos voltam aos valores recomendados/placeholders e, após salvar, a substituição Personal original deixa de ser preservada.
- Cancelar após alternar: o modo e todos os campos voltam ao estado anterior à alternância, sem deixar resultado gravado em disco.
- Alterar qualquer campo no modo desligado e salvar ainda mantém um Personal Overlay completo; atualizações posteriores do Built-in não alteram esses campos.
- Depois de editar e salvar novamente no modo ligado, os campos não cobertos continuam seguindo as atualizações do Built-in.
- `enabled` mantém seu valor em qualquer alternância de modo e só pode ser alterado pelo interruptor da linha da lista de modelos.
- Quando uma configuração existente não tem o campo de modo, ela é tratada como "seguir a configuração recomendada", sem necessidade de migração de dados.
- Quando a linha de base Built-in está ausente ou incompleta, não se pode gerar um Overlay pela metade; o salvamento deve falhar de forma explícita e não gravar resultado parcial.
- Mudanças de revision do Registry, salvamentos concorrentes e respostas atrasadas não podem sobrescrever o novo Draft com valores Effective antigos.
- Executar os testes unitários de Provider Settings, Model Config, Registry e Settings UI, além das regressões necessárias no desktop/remoto; confirmar que a semântica de seleção de modelo de Model Selection, Automation, Subagent, Wiki e Composer não muda.

## Relação com os Todos existentes

- O Todo 55 já definiu que o `enabled` do Model é mantido e o `enabled` de topo do Provider é removido; este Todo apenas remove a entrada duplicada no diálogo e não altera essa conclusão.
- O Todo 77 já foi concluído e o estilo do interruptor reaproveita os controles existentes do design system; este Todo apenas acrescenta a semântica de modo de configuração.
- O Todo 76 concluiu a organização em camadas de Provider Site, Template Model e Provider Model Rule; o campo de modo deste Todo entra no mesmo registro Personal exato `provider-model`, sem criar outra camada.
- O Todo 81 é responsável pelo aviso de invalidação de seleção de modelo em Composer/tarefas ociosas e é independente do modo de herança de configuração de modelo deste Todo.

## 9. Registro de implementação (2026-09-04)

- A Personal Rule `provider-model` passou a ter a metadada opcional `useRecommendedConfig`; ausente ou `true` significa seguir as recomendações, e `false` significa fixar a configuração pessoal. Essa metadada não entra no `ModelConfig` nem participa do Registry, do ModelFactory ou dos parâmetros de requisição.
- O campo já atravessa o Settings Facade, o Provider Config Service e a UI Form Projection; o salvamento continua usando a validação de revision existente e uma única atualização do Personal Repository.
- O diálogo de edição de modelo removeu o controle duplicado de ativação do modelo e a entrada 「全部恢复默认」, mantendo a linha da lista como único ponto de edição de `enabled`; foi adicionado o interruptor Draft-only "seguir a configuração recomendada". Modelos puramente customizados sem linha de base de herança Built-in não exibem esse interruptor.
- Ao salvar no modo fixo, os campos gerenciados pelo editor do Effective atual são materializados como um Personal Overlay completo; ao voltar ao modo recomendado, o Overlay antigo só é removido se o usuário tiver feito a alternância explicitamente nesta sessão, mantendo-se separado o estado de ativação do modelo.
- Foram adicionados testes de regressão de Provider Config, Facade, Draft, Dialog e da linha do modelo; os 119 testes afetados passaram, `pnpm typecheck` passou e `pnpm lint` passou (40 warnings já existentes no repositório, 0 erros).