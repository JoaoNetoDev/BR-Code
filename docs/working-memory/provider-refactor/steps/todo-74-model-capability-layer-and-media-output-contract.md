# Todo 74: Camadas de capacidade do modelo e contrato de saída de PDF / chamadas de ferramenta / JSON Schema

> Status: concluído (o streaming de JSON Schema continua sendo tratado separadamente pelo Todo 80)
>
> Data: 2026-09-04
>
> Cobertura: PDF do GLM-5.3-Flash, exibição da capacidade de chamadas de ferramenta, saída estrita em JSON Schema
>
> Observação: a aposentadoria do Option `default`, a completude do Reasoning Spec e a passagem explícita do orçamento de requisição já foram concluídas pelo Todo 58, pelo Todo 60 e pelas implementações seguintes; este Todo não rediscute esses pontos.

## 1. Objetivo

Fechar os limites de responsabilidade da configuração de capacidades do modelo, evitando misturar na mesma camada fatos próprios do modelo, mapeamento do protocolo de API e casos especiais de fornecedor/Endpoint. O resultado final tem o Effective Model Config atual como fonte única de capacidade em runtime; nada adivinha capacidades temporariamente pelo nome do modelo no Adapter ou na UI.

```text
Model ID
  -> Model + API Schema
  -> Provider Site / Base URL
  -> Template + Model
  -> Provider Instance + Model
  -> Personal Provider Instance + Model
  -> Effective Model Config
  -> UI 能力展示与 Runtime 请求
```

## 2. Três requisitos de produto

### 2.1 GLM-5.3-Flash suporta PDF apenas sob Anthropic Messages

- O baseline do Model não marca GLM-5.3-Flash como suporte global a PDF.
- Adiciona-se apenas a regra Model + API para `glm-5.3-flash + anthropic-messages`, fazendo essa combinação suportar PDF.
- OpenAI Chat e OpenAI Responses permanecem sem suporte a PDF nesta rodada, sem cobertura nas camadas seguintes.
- A codificação específica do PDF pertence à camada API Schema / Adapter.
- Este item adota o requisito de capacidade já confirmado internamente pelo produto, sem esperar uma discussão genérica de capacidades de fornecedor.
- Cobre a exibição na página de configurações, a Model Selection, a conversão de anexos e a cadeia real de requisição.

### 2.2 Chamadas de ferramenta deixam de ser um item de configuração

- A página de configurações oculta o item de edição “工具调用” (chamadas de ferramenta).
- O baseline de capacidades dos Providers embutidos e dos Provider Templates é unificado como `supportsToolCall: true`.
- O runtime continua usando esse campo de capacidade; não se pode remover a capacidade nem deixar o ZCode sem chamadas de ferramenta só porque a UI foi ocultada.

### 2.3 Structured Output passa a usar a semântica estrita de JSON Schema

- O campo existente na verdade expressa “o chamador fornece um JSON Schema e exige que a resposta satisfaça esse Schema”.
- Avalia-se renomear o campo para `supportsJsonSchemaOutput`, eliminando a ambiguidade entre “JSON comum / JSON mode / JSON por prompt”.
- A capacidade precisa ser confirmada por evidência de Model, API Schema e Provider/Endpoint, e não inferida globalmente apenas pelo Model ID.
- O streaming de JSON Schema é discutido à parte no Todo 80; este Todo não amplia antecipadamente o contrato de resultado em streaming.

## 3. Restrições de camadas do Model Config

Este Todo usa a ordem fixa e os tipos de Rule definidos no Todo 76, sem redefinir outro conjunto de camadas Provider/Endpoint:

```text
Model
    -> Model + API Schema
    -> Provider Site / Base URL
    -> Template Model
    -> Provider Model
    -> Personal Provider Instance overlay
```

Este Todo é responsável apenas pelos valores dos campos de PDF, chamadas de ferramenta e JSON Schema estrito, pelo repasse em runtime e pelos testes; cada campo deve ser posicionado conforme o escopo de manutenção e as regras de override de Site do Todo 76.

## 4. Fatos atuais da implementação e itens a verificar

- O `ModelConfigRule` atual já suporta `modelMatch`, `apiMatch`, `providerMatch` e `baseURLMatch`, e o JSON Builtin já possui múltiplos grupos de regras. A divisão de tipos e a migração dos grupos ficam a cargo do Todo 76.
- O Resolver atual adota overlay sequencial; este Todo não altera a ordem, apenas consome o Effective Model Config unificado produzido pelo Todo 76.
- É preciso estabelecer uma matriz mínima de capacidades: PDF do GLM, chamadas de ferramenta e JSON Schema estrito devem ser declarados em qual camada — Model, API Schema ou Provider/Endpoint.
- A situação atual e os limites de suporte futuro do streaming de JSON Schema ficam registrados no Todo 80, sem implementação duplicada aqui.

## 5. Ordem de implementação

1. Atualizar o documento de design do Model Config associado a este Todo, confirmando as responsabilidades dos campos nas três camadas.
2. Atualizar a capacidade de PDF do GLM-5.3-Flash e os testes relacionados.
3. Ocultar a UI de chamadas de ferramenta, mantendo a capacidade em runtime e acrescentando testes de regressão.
4. Unificar Structured Output na semântica estrita de JSON Schema e concluir a renomeação do campo; o repasse em streaming fica por conta do Todo 80.
5. Verificar se Settings, Model Selection, Adapter, Runtime e testes ainda contêm campos antigos ou inferências duplicadas.
6. Concluir a validação de UI e de requisição real em um MacBook Air; o E2E gráfico segue o processo de E2E existente, sem disfarçar bloqueio de ambiente como aprovação.

## 6. Critérios de aceitação

- O GLM-5.3-Flash exibe a capacidade de entrada de PDF na cadeia de configurações e de seleção, e a requisição real de anexo não falha por falta de configuração.
- A página de configurações não oferece mais o interruptor de chamadas de ferramenta, mas modelos com chamadas de ferramenta continuam funcionando normalmente.
- O nome da capacidade de JSON Schema estrito, a configuração e a semântica de validação em Runtime são consistentes; o comportamento em streaming segue os limites do Todo 80.
- As responsabilidades das regras das camadas Provider, API Schema e Endpoint ficam única e claramente definidas no código e na documentação.
- Não se adiciona Option `default`, e não se altera a semântica já concluída de Reasoning e de orçamento de requisição.

## 7. Relação com Todos antigos

Revisão do workspace residual em 2026-09-09: as Model Properties atuais e o fixture de teste do Wiki usam uniformemente `supportsJsonSchemaOutput`. Os DTOs/reader privados `legacy*` que publicam dados antigos ainda mantêm o campo original `supportsStructuredOutput`, sem renomear mecanicamente formatos de entrada históricos; a importação de Provider antigo continua, conforme a decisão já tomada, apenas preservando o contextWindow do modelo e sem levar capacidades antigas para a nova configuração. O protocolo oficial de Model Option continua rejeitando campos de capability achatados, antigos ou novos, e as capacidades vêm apenas das properties. Este ponto esclarece o limite dos formatos privados antigos, sem adicionar compatibilidade para estados intermediários não publicados e sem reabrir este Todo.

- O item “consolidação da nomenclatura da capacidade de saída estrita em JSON Schema” do Todo 39 é coberto por este Todo; o Todo 39 deve ser marcado como `superseded` e não é mais executado em separado.
- O Todo 58 e o Todo 60 mantêm o status de concluído; este Todo não reimplementa a lógica de Option default nem de Reasoning.

## Registro de implementação (2026-09-04)

- Concluída a troca de `supportsStructuredOutput` para `supportsJsonSchemaOutput` em todo o repositório; o Schema mantém a validação estrita de objeto e o campo antigo não recebe compatibilidade de migração.
- Removido o item de edição “工具调用” da página de configurações, mantendo o campo de capacidade em runtime; o baseline Builtin continua fornecendo ao ZCode a capacidade necessária com `supportsToolCall: true`.
- A capacidade de PDF do GLM-5.3-Flash foi colocada na regra `glm-5\.3-flash + anthropic-messages` de `modelApiRules`; o baseline do Model e os demais API Schemas continuam sem declarar PDF.
- Adicionada regressão de integridade do Builtin, confirmando que a combinação Anthropic suporta PDF, que a combinação Chat não suporta e que o arquivo de configuração não contém mais o campo antigo; os testes de Provider, Adapter e UI afetados passaram, assim como `pnpm typecheck` e `pnpm lint` (0 error).
- A passagem de streaming de JSON Schema do Todo 80 permanece inalterada e continua seguindo os limites do rascunho.