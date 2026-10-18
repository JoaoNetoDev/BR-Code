# Bugfix 01：Personal Overlay de Provider Built-in não pode ser adicionado novamente após exclusão

> Status：concluído
>
> Data：2026-08-27
>
> Origem：reprodução em runtime do Provider Settings do ZCode 3.9.2 oficial

## 1. 问题

Um Built-in Provider comum, após ser excluído, remove corretamente seu Personal Overlay e volta a aparecer entre os candidatos de “添加供应商” (Adicionar provedor); mas adicionar novamente no mesmo processo de Host falha:

```text
provider-settings.addBuiltinProvider FAIL
Provider deepseek 已删除或重命名
```

`ProviderSettingsFacade` grava o Provider ID em um `retiredProviderIds` em memória de processo no início da exclusão e o mantém permanentemente após o sucesso. Esse conjunto vem do antigo projeto de corrida entre renomeação e exclusão de Providers; atualmente o Provider ID é somente leitura, e um Built-in Provider comum precisa poder criar e excluir repetidamente seu Personal Overlay com ID estável. Com isso, ele se torna uma segunda fonte de verdade sobre existência, fora da Config.

## 2. 目标边界

```text
ZCode Built-in Provider Config
        |
        +-- Personal Overlay 不存在 --> “添加供应商”候选
        |
        +-- addBuiltinProvider() ------> 创建 { enabled: true } Overlay
        |
        +-- savePersonalProvider() ----> 只更新已有 Overlay
        |
        `-- deletePersonalProvider() --> 删除 Overlay，重新成为候选
```

- `standard-builtin` só pode ter seu Personal Overlay criado por `addBuiltinProvider()`;
- `standard-personal` só pode ser criado por `createPersonalProvider()`; um salvamento comum não pode criá-lo do nada;
- `savePersonalProvider()` é update-only para ambas as classes de Provider;
- `zai-family` / `bigmodel-family` são áreas fixas de Family, sem entrada comum de “添加”; a primeira configuração de conta ou API Key pode criar o Personal Overlay;
- a Facade só serializa operações do mesmo Provider, não mantém identidades aposentadas entre revisões ou entre ciclos de vida de Overlays;
- um salvamento já iniciado antes da exclusão é concluído primeiro, e só então a exclusão é executada; salvamentos tardios após a exclusão são rejeitados pelo Repository com “Overlay 不存在”;
- readicionar explicitamente é uma nova operação de configuração legítima, não afetada pela exclusão anterior.

## 3. 影响面

| Camada                | Mudança                                          | Invariante                                       |
| -------------------- | ------------------------------------------------ | ----------------------------------------------- |
| Provider Settings UI | sem mudança de interação                         | após a exclusão, os candidatos continuam vindo da Settings View oficial |
| Settings Facade      | remoção permanente de `retiredProviderIds`       | mutações do mesmo Provider continuam serializadas |
| Config Service       | salvamento comum de Built-in/Personal-only passa a ser update-only | o primeiro Overlay de Family ainda pode ser salvo |
| Personal Repository  | segue como a única autoridade sobre existência de Overlay | update atômico, providerOrder e exclusão de Rule exclusiva permanecem inalterados |
| Registry/Model       | apenas passa a observar o resultado da atualização oficial | Active Model, Selection e Account Overlay inalterados |

Desktop, Web e Remote Workspace passam pelo mesmo Settings Facade/Config Service do Environment Host de destino; a correção não introduz fallback local no Renderer nem altera desktop continuous, mobile replayable ou o estado das tarefas.

## 4. 接受用例

| Caso    | Preparação                              | Ação                        | Asserções                            |
| ------- | -------------------------------------- | --------------------------- | ------------------------------------ |
| BF01-01 | Built-in DeepSeek sem Personal Overlay | adicionar                   | gera o Overlay `{ enabled: true }`   |
| BF01-02 | Built-in DeepSeek já adicionado        | excluir e adicionar de novo | após a exclusão volta a ser candidato; a readição no mesmo processo funciona |
| BF01-03 | Built-in Overlay já excluído           | salvamento comum tardio     | o salvamento falha e o Overlay não ressuscita |
| BF01-04 | Provider Personal-only excluído/ nunca criado | salvamento comum      | o salvamento falha; é preciso passar por create antes |
| BF01-05 | Provider Family sem Personal Overlay   | primeiro salvamento de API Key/configuração de conta | permite formar um Overlay esparso |
| BF01-06 | já há um salvamento em trânsito para o mesmo Provider | excluir         | a exclusão acontece após a conclusão do salvamento; no fim o Overlay não existe |

Não se adiciona E2E: os logs do runtime oficial já provam que a requisição da UI chega corretamente ao Host, e a lacuna está no domínio puro de Provider e no ciclo de vida da Facade; os testes unitários permanentes cobrem a fronteira Config/Facade, e o E2E existente de Provider Settings continua cobrindo a regressão da entrada pela página.

## 5. 完成门禁

- `retiredProviderIds` e a mensagem “已删除或重命名” zerados no código de produção;
- o salvamento comum não pode criar Overlay `standard-builtin` nem `standard-personal`;
- o ciclo completo de exclusão, readição e novo salvamento do Built-in passa;
- regressão do primeiro salvamento de Family passa;
- testes direcionados de Provider/Services, `typecheck` da raiz, `lint` e verificação de formatação passam.

## 6. 实施结果

- removido o `retiredProviderIds`, retido entre ciclos de vida de Overlay na Facade; operações do mesmo Provider continuam serializadas pela Mutation Queue existente;
- `savePersonalProvider()` passou a ser update-only para Providers Built-in comuns e Personal-only, com a criação delegada respectivamente a `addBuiltinProvider()` e `createPersonalProvider()`;
- os Family Providers fixos Z.ai/BigModel mantêm a capacidade de gravar um Personal Overlay esparso no primeiro salvamento;
- testes unitários cobrem readição após exclusão, salvamento tardio, criação explícita de Personal-only, primeiro salvamento de Family e a ordem salvamento/exclusão;
- 625 testes direcionados de Provider, Provider Node, Services e UI passaram, assim como `typecheck` e `lint` da raiz.