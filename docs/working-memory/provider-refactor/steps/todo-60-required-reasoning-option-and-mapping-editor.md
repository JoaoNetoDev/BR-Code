# Todo 60: Generalização da Reasoning Option e encerramento do Editor de Mapping

> Atualização de atribuição de verificação (2026-09-09): as pendências residuais de sub-teste/falha/promoção manual deste documento foram transferidas para [Todo102](todo-102-verification-debt-closeout.md), encerrando o cronograma de verificação independente neste documento; as evidências históricas são mantidas, e a transferência não significa que os testes passaram.

> Status: concluído (a execução do Desktop E2E ficou bloqueada pelo ambiente gráfico)
>
> Data: 2026-09-02
>
> Pré-requisitos: o Todo 54 já consolidou o mapeamento público de Option dentro do próprio Option Spec; o Todo 58 já removeu o `default` de Option e fixou `values` de Reasoning em ordem crescente. Este Todo cobre a conclusão antiga do Todo 58 de "Reasoning Spec opcional, Mapping sem edição aberta".

## 1. Objetivo

Todo Effective Model Config completo deve declarar `reasoningLevel` e `maxOutputTokens`. Reasoning deixa de ser uma capacidade opcional; modelos sem suporte a raciocínio são representados de forma unificada pela única faixa `disabled` e por um Request Body Patch vazio.

```text
Effective Model Config
├─ reasoningLevel
│  ├─ type = enum
│  ├─ values = não vazio, do mais baixo ao mais alto
│  └─ map = expressão de Request Body Patch compilável
└─ maxOutputTokens
   ├─ type = limit
   ├─ max = inteiro positivo
   └─ map = expressão de Request Body Patch compilável
```

Representação canônica de um modelo sem raciocínio:

```json
{
  "reasoningLevel": {
    "type": "enum",
    "values": ["disabled"],
    "map": "{}"
  }
}
```

`"{}"` representa a geração de um JSON Merge Patch vazio. String vazia não é um Mapping válido, e nenhum ramo de parsing especial é adicionado para ela.

## 2. Contrato de Valores Efetivos

Model Selection / Active Model completos devem carregar um `reasoningLevel` concreto. A Option na Model Request ainda pode estar ausente como override de uso único, mas o resultado da mesclagem antes de chegar ao Executor deve estar completo.

```text
Seleção comum realmente ausente
└─ reasoningLevel = values.at(-1)

Chamadas auxiliares de Title / Goal / Git Commit / Memory / Connectivity / WebSearch / WebFetch /
Read Session Context
├─ reasoningLevel = values[0]
└─ maxOutputTokens = min(5000, optionSpecs.maxOutputTokens.max)
```

Chamadas auxiliares não devem adivinhar a capacidade por nomes como `off`, `disabled` ou `nothink`, nem manter um ramo normal com `reasoningLevel === undefined`. A ausência do Reasoning Spec significa que o Effective Model Config está incompleto, e o modelo não deve entrar no Registry.

Compact e Repo Wiki não pertencem a essas chamadas auxiliares de baixo custo: Compact dá continuidade ao Active Model congelado neste turno; Repo Wiki
usa o Model Selection escolhido explicitamente pelo usuário para aquela tarefa de geração. Nenhum dos dois pode ser reescrito silenciosamente pelas regras de chamadas auxiliares.

## 3. Aposentadoria do Thinking Budget Fixo

Todos os mapeamentos fixos `thinking.budget_tokens` / `budgetTokens` das Built-in Model Config Rules saem. Token Budget fixo é um uso do protocolo antigo e deixa de ser um meio de implementar as faixas de Reasoning.

- Manter os campos realmente suportados pelo protocolo, como `thinking.type`, `reasoning_effort` e `output_config.effort`;
- Faixas sem suporte ou sem necessidade de parâmetros de requisição usam `map: "{}"`;
- Remover os fixtures de valores de orçamento fixo, os snapshots de requisição e os textos de design atuais que ainda interpretam faixas como orçamento fixo; a Telemetry pode continuar registrando
  o thinking budget efetivamente devolvido pelo servidor na resposta, mas não pode tratá-lo como valor local de configuração ou valor esperado da requisição;
- Remover as conversões ou validações combinadas que existiam apenas para coordinar thinking budget e max output;
- Não restaurar orçamento ou intensidade de raciocínio codificados em hardcode por ID de modelo.

O material de pesquisa histórico pode manter os fatos de sua época, mas o Design, o Built-in, os testes e a implementação de produção atuais devem usar o novo contrato.

## 4. Config e Registry

- Rule Input / Personal Model Config continuam sendo Overlay de folha esparsa, permitindo sobrescrever apenas os campos explicitamente fornecidos entre `type/values/map/max`;
- `optionSpecs.reasoningLevel` e `optionSpecs.maxOutputTokens` do Effective Model Config são ambos obrigatórios e completos;
- Resolver, Settings View, Registry DTO, protocolo entre processos e Active Model deixam de declarar o Reasoning Spec como opcional;
- Os testes de integridade do Registry cobrem Reasoning ausente, values vazio, map ausente e map inválido;
- As regras gerais Built-in fornecem uma linha de base completa sem raciocínio, e Rules específicas de modelo/API cobrem apenas suas diferenças reais;
- O `null` do Personal Overlay, o round-trip JSON e a semântica de sobrescrita de folha permanecem como estão.

## 5. Página de Configurações

A área de edição de Reasoning é sempre exibida, sem ser ocultada por o Effective Spec atual estar ausente ou ter apenas uma faixa:

```text
Faixas de raciocínio (da mais baixa à mais alta)

[ disabled ] [ low ] [ high ] [＋]

Mapping dos parâmetros de raciocínio
┌──────────────────────────────────────────┐
│ Personal map é value                    │
│ Inherited map é placeholder             │
└──────────────────────────────────────────┘
```

### 5.1 Edição de Faixas

- O `＋` é sempre exibido;
- Os chips suportam adicionar, renomear, excluir, arrastar para reordenar e operação por teclado;
- Deve restar ao menos um valor não vazio e sem duplicatas, e o último valor não pode ser excluído até esvaziar;
- O resultado da ordenação é exatamente o `values` do mais baixo ao mais alto;
- A UI não infere a semântica de mínimo, máximo ou desligado a partir das strings;
- Quando não há modificação, os values efetivos não são copiados para a Personal Rule; após modificar, escreve-se apenas a folha Personal `values`;
- "Restaurar tudo para o padrão" limpa os Overlays de Personal `values` e `map`.

### 5.2 Caixa de Texto do Mapping

- Usar o fundo, a borda, o raio e o estilo de foco de uma caixa de texto técnica comum, sem adicionar um Card externo;
- Altura fixa, fonte monoespaçada e rolagem interna;
- `value = personal reasoning map ?? ""`;
- `placeholder = inherited reasoning map ?? effective baseline map`;
- Limpar o conteúdo digitado significa remover o Overlay de Personal `map` e restaurar a herança;
- Desligar spellcheck, autocorrect, autocapitalize e autocomplete;
- Na gravação, validar que o map efetivo é não vazio e compilável; erros vão para a faixa unificada de feedback já existente no popup;
- Desktop, Web e celular compartilham o comportamento, quebrando linha naturalmente em telas estreitas e sem criar rolagem horizontal da página.

## 6. Plano de Testes

Escrever primeiro os testes que falham, depois implementar:

1. Config / Schema: o Reasoning Spec é obrigatório no Effective Config; a linha de base sem raciocínio `disabled + {}` é válida; Overlay, `null` e round-trip não regridem.
2. Resolver / Registry: Reasoning ausente, values vazio, map ausente ou map inválido não entram no Registry; um Spec completo entra no Active Model sem alterações.
3. Selection / Runtime: a ausência comum pega o último item; chamadas auxiliares pegam uniformemente o primeiro item e usam `min(5000,max)`; não existe ramo normal de Reasoning undefined.
4. Built-in: cada modelo resolve um Spec completo de Reasoning/Max Output; o JSON oficial não contém `budget_tokens`; o Option Map é testado em todas as faixas.
5. UI unit: o `＋` é exibido independentemente da quantidade atual de faixas; value/placeholder do Mapping estão corretos; limpar restaura a herança; salvar forma um Overlay esparso; Mapping inválido mostra a faixa de erro unificada.
6. UI E2E: adicionar modelo Personal, editar/ordenar faixas, sobrescrever o Mapping, restaurar padrões, cancelar sem enviar; cobrindo layouts de desktop e de tela estreita.
7. Regressão: a seleção de Option é consistente em Title, Goal, Git Commit, Memory, Connectivity, Session comum, Automation, Repo Wiki e Subagent.

Por fim, executar os testes unitários/typecheck dos pacotes afetados, o `pnpm typecheck`, `pnpm lint` e `pnpm test:unit` da raiz, a verificação de formatação e o Desktop E2E relacionado. Quando o ambiente gráfico não estiver disponível, é obrigatório registrar explicitamente o que não foi executado, sem fingir aprovação.

## 7. Critérios de Conclusão

- Não existe Reasoning Spec opcional no domínio de produção;
- Não existe thinking budget fixo no Built-in nem nos Mappings oficiais de requisição;
- Todas as chamadas auxiliares usam a mesma regra `values[0] + min(5000,max)`, sem copiar fallbacks diferentes;
- A página de configurações consegue editar faixas e Mapping a partir da linha de base existente, com o `＋` sempre visível;
- O Mapping Personal usa a interação de Overlay existente de value / inherited placeholder;
- Não há novo Reasoning Policy, Budget Resolver, Capability DTO ou hardcode de runtime por modelo específico;
- A verificação direcionada e a completa passam e o Conventional Commit é concluído.

## 8. Resultado da Implementação

- O Effective Model Config, o Registry, a criação de Active Model e a fronteira de execução do Adapter já exigem uniformemente `reasoningLevel` e `maxOutputTokens` completos; a Selection antiga só é completada com a faixa mais alta na fronteira de seleção inicial do Host.
- As regras gerais Built-in fornecem a linha de base `disabled + {}`; todos os Mappings de Reasoning Built-in atuais tiveram o `thinking.budget_tokens` fixo removido.
- Foi adicionado um único helper de Model Options auxiliares, com Title, Goal, Git Commit, Memory, Connectivity, WebSearch, WebFetch e Read Session Context usando uniformemente `values[0] + min(5000,max)`.
- A página de configurações sempre exibe o editor de faixas de Reasoning e o botão de adicionar, e ganhou uma caixa de texto de Mapping de altura fixa; o Personal Mapping usa value, o valor herdado usa placeholder, e limpar remove a folha Personal `map`.
- Foi corrigido o problema em que uma faixa de reasoning inválida na Selection histórica do Subagent sobrescrevia o Model Spec atual; agora a validação é feita uniformemente pelo Model Spec atual, com queda para a faixa mais alta.

### Registro de Verificação

- `pnpm typecheck`: passou.
- `pnpm lint`: passou, com 34 warnings já existentes no repositório e 0 erros.
- `pnpm test:unit`: 12.809 passaram, 25 skipped; o único caso de falha, de arquivamento por symlink de `componentCache`, foi reexecutado isoladamente e passou 6/6, confirmando ser flutuação do ambiente paralelo.
- `pnpm --filter @zcode/desktop typecheck:e2e`: passou.
- `settings-ui-polish.test.ts`: o build de produção teve sucesso, mas o Linux atual não tem `DISPLAY` nem `xvfb-run`, e o Chrome saiu antes de criar a sessão; essa falha de ambiente não foi registrada como aprovação funcional.