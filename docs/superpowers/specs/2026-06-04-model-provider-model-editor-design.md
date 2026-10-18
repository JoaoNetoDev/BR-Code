# Design do Editor de Modelos do Model Provider

## Objetivo

As ações "Adicionar modelo" e "Editar modelo" da página de configuração de fornecedores de modelos passam a usar o mesmo editor em diálogo. Os campos são agrupados por seções na ordem de tarefa: identidade do modelo, limites de Token, entrada e saída, capacidades do modelo e opções do modelo, evitando misturar configurações diferentes; as seções não exibem títulos extras e criam hierarquia diretamente por espaçamento e bordas. Ao adicionar um modelo, não se insere mais uma linha em branco: a escrita na lista de modelos ocorre somente após o usuário confirmar e passar na validação. A origem do modal de baixo nível e a fronteira de projeção do runtime estão em `docs/superpowers/specs/2026-08-21-model-provider-modality-settings-design.md`.

## Estado atual

- `ProviderModelsSection` hoje abre `ProviderModelMetadataDialog` ao clicar em adicionar modelo e chama `onAddModel` só depois da validação.
- `ModelRowInput` já mantém o draft do modelo e usa `ProviderModelMetadataDialog` para editar o ID do modelo, a janela de contexto e o máximo de Tokens de saída.
- `ProviderModelDraftValues.maxOutputTokensValue`, a validação de inteiro positivo e a cadeia até `ModelProviderModelConfig.maxOutputTokens` já existem; o que falta é a entrada de modal, e o padrão de adicionar ainda é 200K de contexto e max output vazio.
- Os formatos de API suportados pelo modelo ficam em `ModelProviderModelConfig.kinds`, e o mapeamento de `ModelProviderApiFormat` para `ModelProviderKind` é fornecido por `mapModelProviderApiFormatToKind`.
- Ao adicionar um modelo, o formato de API é deduzido do formato de API atual da página de configurações; o diálogo não exibe multisseleção de formato de API.

## UX

- Clicar em "Adicionar modelo" abre diretamente o diálogo de edição de modelo, com o título "Adicionar modelo".
- Clicar no botão de edição de uma linha de modelo existente abre o mesmo diálogo, com o título "Editar configuração do modelo".
- Grupos e ordem do diálogo:
  1. Informações básicas: "Modelo ID" e "Ativar modelo" são dois campos verticais independentes, exibindo primeiro "Modelo ID + campo de entrada" e depois "Ativar modelo + switch". O Modelo ID é obrigatório e sofre trim ao salvar; na adição é o único campo inicialmente vazio.
  2. Limites de Token: janela de contexto e máximo de Tokens de saída. Ambos usam entrada de texto numérica sem botões de incremento e precisam ser inteiros positivos; os padrões na adição são `1000000` e `128000`, respectivamente.
  3. Entrada e saída: os tipos de entrada são exibidos de forma plana e permite quebra de linha; Text vem marcado por padrão e não pode ser desmarcado, e os demais tipos de entrada visíveis são selecionáveis. O tipo de saída exibe somente Text fixo, sem outras opções.
  4. Capacidades do modelo: exibe o Label do campo "Capacidades do modelo" e abaixo oferece as opções Tool Call, Structured Output, Native Web Search e Mid-conversation System.
  5. Opções do modelo: Reasoning Levels, Reasoning Mapping e MFJS Tool Schema, exibidos diretamente.
- Audio/PDF ainda não são exibidos na página de configurações; a camada inferior continua compatível com configurações antigas e fatos autoritativos remotos, e editar tipos visíveis não pode apagar silenciosamente valores ocultos existentes.
- Todas as seções são sempre exibidas e não oferecem entrada de colapso.
- Os grupos usam espaçamento e bordas leves para criar hierarquia, mantendo fundo transparente e sem introduzir cor de fundo adicional de card. O desktop mantém densidade compacta e em tela estreita os campos e opções quebram naturalmente sem alterar a semântica.
- Após abrir, o diálogo de adição foca por padrão o Modelo ID; o diálogo de edição foca e seleciona por padrão a janela de contexto, facilitando a troca rápida de valores comuns.
- O diálogo não exibe seleção de formato de API. Reasoning Levels, Reasoning Mapping e MFJS Tool Schema são exibidos diretamente como configuração normal do modelo.
- O footer dos diálogos de adição e de edição exibe "Cancelar" e "Salvar". Cancelar fecha o diálogo e descarta o draft atual; salvar, após passar na validação, envia o draft do modelo e fecha o diálogo, e a persistência do provider continua a cargo da cadeia de salvamento externo existente.
- Ao adicionar um modelo, o formato de API selecionado por padrão é o formato de API atual da página de configurações. Ao editar um modelo existente, usa-se o `kinds` já presente no modelo.
- Ao adicionar um modelo, o máximo de Tokens de saída parte de `128000` e é editável. 300ms após a digitação no Modelo ID parar, o catálogo existente de model provider é consultado pelo Modelo ID completo (trim, ignorando maiúsculas e minúsculas); durante a consulta todos os padrões e o draft são preservados, o salvamento é desabilitado e um loading compacto é exibido.
- O catálogo só preenche o valor quando declara explicitamente `maxOutputTokens` e o usuário ainda não editou o campo; ausência de correspondência, ausência de declaração, falha na consulta ou resultado tardio mantêm o valor atual e não limpam o padrão `128000`. O fallback de runtime de 32K não pode ser exibido nem gravado no formulário.
- O preenchimento automático do catálogo acontece apenas no modo de adição. O modo de edição exibe o valor salvo e permite modificação manual, sem disparar consulta ao catálogo.
- Quando o Modelo ID muda, se o valor atual de saída máxima veio do preenchimento automático do catálogo do modelo anterior e o usuário não o editou, restaura-se o padrão `128000` antes de consultar; valores digitados pelo usuário não são limpos. Depois que o diálogo é fechado ou que a digitação continua mudando, resultados de consulta antigos não podem sobrescrever o draft atual.
- A consulta ao catálogo não pode modificar a janela de contexto do formulário; o draft de novo modelo usa 1M por padrão, e modelos `[1m]` continuam seguindo a regra de 1M obrigatório. Esta entrega não adiciona preenchimento por catálogo para Context window nem releitura após o salvamento.
- Ao cancelar ou fechar o diálogo, nenhum modelo é adicionado e nenhum draft de edição é enviado. Ao salvar, só fecha se a validação passar; em caso de falha a validação o diálogo permanece aberto com o erro exibido.

```text
打开新增弹窗 ──> ID 为空 + Context=1M + Max output=128K + Input/Output=Text
模型 ID 改变 ──> pending ── 300ms 稳定 ──> 查询 catalog
                                               ├─ 明确值且用户未编辑 ──> 回填
                                               └─ 未命中/失败/已编辑 ──> 保持当前值
输入再次变化或关闭弹窗 ─────────────────────────────────────> 忽略旧查询结果

点击保存 ──> 校验失败 ──> 保持弹窗
        └─> 校验成功 ──> 提交模型 draft + 关闭弹窗
                              └─> 现有外层 provider 保存链路
```

## Regras de dados

- Ao salvar, o formato de API é convertido em `ModelProviderModelConfig.kinds`.
- `kinds` é salvo em ordem fixa: `anthropic`, `openai-compatible`, `openai`.
- `defaultKind` prioriza o kind correspondente ao formato de API atual da página de configurações; se esse kind não foi selecionado, usa-se o primeiro item dos `kinds` selecionados.
- É preciso selecionar ao menos um formato de API; caso contrário, retorna `invalid`, com o campo `kinds`.
- `resolveProviderModelDraftCommit` não faz parse do JSON de reasoning no draft do diálogo; no envio, o `reasoning` existente é preservado por `...currentModel`.
- `resolveProviderModelDraftCommit` exige que o máximo de Tokens de saída seja um inteiro positivo e o salva como `maxOutputTokens`; o padrão na adição é `128000`.
- Ao editar um modelo antigo sem `maxOutputTokens`, o draft exibe `128000`; após salvar com sucesso, esse valor é gravado.
- Para modelos locais editáveis, as output modalities são gravadas sempre como `["text"]`; modelos autoritativos somente leitura não passam por esse caminho de envio.
- Depois que a validação da adição passa, o pai `saveModels` grava o modelo completo; nenhuma linha intermediária em branco é criada.
- Depois que a validação da edição passa, reutiliza-se o `onModelCommit` existente para atualizar a linha indicada.

## Componentes

- `ProviderModelDraftValues` mantém `kindsValue` para as regras de envio e ganha estados de draft de modal de entrada e de "tocado", sem conter `reasoningJsonValue`.
- `resolveProviderModelDraftCommit` é estendido para validar e enviar `kinds`, `defaultKind`, input modalities, output Text fixo e a origem explícita.
- `ProviderModelMetadataDialog` mantém os dois títulos (adição e edição) e organiza os campos existentes por identidade do modelo, limites de Token, entrada e saída, capacidades e opções do modelo; nenhuma seção oferece entrada de colapso.
- `ProviderModelsSection` gerencia o estado open do diálogo de adição, o draft novo e o sequenciamento da consulta ao catálogo, criando o draft padrão ao clicar no botão de adicionar.
- `ModelRowInput` continua responsável pelo diálogo de edição das linhas existentes e passa o kind do formato de API atual, usado para salvar o `defaultKind`.

## Validação e erros

- Modelo ID vazio: na adição exibe o erro de Modelo ID e não envia; na edição não se apaga mais modelo por ID vazio, e a remoção continua sendo responsabilidade do botão da lixeira.
- Formato de API vazio: exibe o erro de formato de API e não envia.
- Janela de contexto inválida: mantém o erro de janela de contexto atual.
- Máximo de Tokens de saída que não é inteiro positivo: exibe o erro de máximo de Tokens de saída e não envia.
- Modalidade de entrada sem Text: não envia; na UI normal Text não pode ser desmarcado, e o commit resolver mantém a validação defensiva.
- Não existe mais erro de validação de JSON de intensidade de raciocínio no diálogo.

## Testes

- Testes unitários cobrem todos os campos planos dos diálogos de adição e edição, além dos padrões 1M, 128K e Text de entrada/saída do novo modelo.
- Testes unitários de interação cobrem Modelo ID vazio, debounce de 300ms, acerto no catálogo, ausência de correspondência/declaração, falha na consulta e isolamento de resultado tardio.
- Testes unitários de interação cobrem consulta em pending, sobrescrita do valor preenchido automaticamente pelo usuário, preservação do valor do usuário quando o Modelo ID muda novamente e manutenção de `128000` em caso de não correspondência/falha.
- Testes unitários cobrem o modo de edição não consultando o catálogo e permitindo modificar o máximo de Tokens de saída já existente.
- Testes unitários cobrem o diálogo não renderizando mais o colapso avançado e cobrem Text de entrada não desmarcável e saída exibindo apenas Text fixo.
- Testes unitários cobrem o novo modelo com o formato de API atual da página de configurações selecionado por padrão.
- Testes unitários cobrem o commit do draft salvando Modelo ID, `kinds`, `defaultKind`, janela de contexto, máximo de Tokens de saída, input modalities e output Text fixo, e preservando o `reasoning` existente.
- Testes unitários cobrem o não envio quando o formato de API está vazio.
- Mantêm-se os testes existentes sobre tag da linha de modelo, botão de teste disabled e validação do draft de metadata.
- O E2E desktop reaproveita a cadeia real de criação de provider na página de configurações do I08, cobrindo os campos planos, os padrões 1M/128K/Text, consulta pending/loading, preenchimento real pelo catálogo, sobrescrita pelo usuário, seleção de input modalities, saída Text fixa, exibição e edição no modo de edição, persistência da configuração e o `max_tokens` da requisição final ao provider.
- Não correspondência, ausência de declaração, falha na consulta e isolamento de resultado tardio do catálogo permanecem nos testes unitários de interação com mock de service controlável; o E2E não adiciona injeção, cache ou retry de catálogo para esses ramos excepcionais.