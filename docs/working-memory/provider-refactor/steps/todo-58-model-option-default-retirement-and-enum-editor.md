# Todo 58: Aposentadoria do default de Model Option e Consolidação do Editor de Enum

> Atualização de atribuição de verificação (2026-09-09): a dívida de subtestes/falhas/promoção manual remanescente neste documento foi transferida uniformemente para o [Todo102](todo-102-verification-debt-closeout.md), encerrando o agendamento de verificação independente deste documento; evidências históricas são preservadas, e a transferência não significa que os testes passaram.

> Status: implementação concluída; E2E gráfico awaita reexecução em um ambiente de exibição disponível
>
> Data: 2026-09-01
>
> Pré-requisitos: Todo 42 / Bugfix 08 já fixaram os níveis de Reasoning do mais baixo ao mais alto e o uso de `values[0]` nas chamadas auxiliares; o Todo 54 já consolidou, na própria Option Spec, o mapeamento de cada Option até o Request Body original. Este Todo não altera o desenho de Option Map, Provider Template, Access, Account, membros do modelo ou autenticação de requisição.
>
> Decisão posterior: a opcionalidade do Reasoning Spec e a conclusão sobre ocultação do Mapping já foram cobertas pelo Todo 60; o desenho atual exige que todo Effective Model tenha um Reasoning Spec completo, e o mapeamento de Reasoning é exposto na página de configurações.

## 1. Objetivo

Remover todos os `default` da Model Option Spec, para que a Option Spec descreva apenas o domínio de valores válido, a ordem, o limite superior e o mapeamento da requisição; o valor de execução concreto deve ser fornecido explicitamente pela seleção de modelo ou pelo chamador da execução.

```text
Model Option Spec
├─ enum  -> valores válidos + ordem + map
└─ limit -> limite rígido + map

Model Selection / Model Request
└─ valor de Option realmente usado nesta execução
```

A ordem do Reasoning Enum é a única fonte da estratégia de default:

```text
values[0]                         values.at(-1)
   |                                   |
   v                                   v
menor nível público                    maior nível público
chamada auxiliar explícita           seleção comum realmente
e de baixo custo                     sem valor definido
```

Não criar `reasoningLevelPolicy`, `defaultPolicy`, `preferredValue`, `initialValue` nem outro conjunto de Option DTO.

## 2. Problema e causa raiz

A estrutura atual mistura "o que o modelo suporta" com "o que escolher no lugar do chamador quando ele não decidiu":

```ts
interface EnumOptionSpec {
  type: "enum";
  values: readonly string[];
  default: string;
  map: string;
}

interface LimitOptionSpec {
  type: "limit";
  max: number;
  default: number;
  map: string;
}
```

O `default` hoje é materializado repetidamente em várias camadas:

```text
Config / Built-in Rule
        |
        v
Model constructor completa uma vez
        |
        v
Adapter bindModel completa de novo
        |
        +--> Runner / Bootstrap continuam com fallback
        |
        `--> UI / Bot fazem fallback quando falta reasoning
```

Esses consumidores provam que a implementação atual permite fluxo de Option incompleto, e não provam que `default` é um fato estático do modelo.

- `maxOutputTokens.default` não é uma capacidade rígida do modelo. O que o Agent realmente precisa é de `max`; o orçamento de saída desta execução é uma escolha de execução.
- `reasoningLevel.default` não deve participar de Session existente, da seleção recente nem da troca explícita de modelo; esses estados devem guardar o nível concreto.
- Quando a entrada comum realmente não tem reasoning, o valor unificado é o último item do Enum ordenado; a chamada auxiliar de baixo custo continua tomando explicitamente o primeiro item.
- A página atual de configurações de modelo do Provider edita o Reasoning Enum em JSON e, ao mesmo tempo, vincula de fato "Token máximo de saída" ao `default`, não expressando com precisão a semântica de configuração.

### 2.1 Confirmação do falso erro de Max Output no pacote oficial do Air

Em 2026-09-01, no pacote oficial `3.10.1` em um MacBook Air, foi confirmada a seguinte reprodução estável:

1. Adicionar um modelo em um Personal Provider;
2. Informar um ID de modelo que não casa nenhuma regra específica de limite numérico, por exemplo `claude`;
3. Preencher a janela de contexto com `10000`;
4. Preencher "Token máximo de saída" com o inteiro positivo válido `1000`;
5. O salvamento ainda exibe "Token máximo de saída deve ser um inteiro positivo".

Isso não é erro de formato de entrada, de configuração local do Air nem da API do modelo. A cadeia real da implementação atual é:

```text
UI "Token máximo de saída" = 1000
              |
              v
maxOutputTokensValue é interpretado como default do Personal
              |
              v
a lógica de envio exige que o maxOutputTokens.max herdado já exista
              |
              +-- existe --> constrói a Limit Spec com o max herdado
              |
              `-- não existe --> resolvedMaxOutputSpec = null
                                   |
                                   v
                         erro classificado como maxOutputTokens
                                   |
                                   v
                         texto enganoso "deve ser um inteiro positivo"
```

Uma Rule de API genérica pode fornecer apenas `map`; ao não casar nenhuma Rule de modelo específico, a Inherited Option Spec portanto pode não ter `max`. O `1000` já passou pela análise de inteiro positivo; o que realmente falha é a implementação antiga, que não conseguia construir sua própria Limit Spec sem um `max` herdado.

A causa raiz tem duas camadas:

- Erro de semântica de dados: o campo de entrada chamado "saída máxima" salva na verdade `default` e trata `max` como uma premissa externa obrigatória.
- Erro de classificação: estrutura ausente e formato de entrada inválido são colapsados em um único erro de campo `maxOutputTokens`.

Este Todo não adiciona ramo de compatibilidade para modelos antigos com `default`. Após remover `default`, o campo de entrada edita diretamente `max`, e um inteiro positivo válido consegue formar sozinho um Overlay `max` do Personal; só quando o valor é vazio e nenhuma camada herdada tem `max` é que o Effective Model Config fica incompleto.

## 3. Contratos confirmados

### 3.1 Option Spec

Estrutura final:

```ts
interface EnumOptionSpecConfigInput {
  type?: "enum" | null;
  values?: readonly string[] | null;
  map?: string | null;
}

interface EnumOptionSpec {
  type: "enum";
  /** 按语义强度从低到高。 */
  values: readonly string[];
  map: string;
}

interface LimitOptionSpecConfigInput {
  type?: "limit" | null;
  max?: number | null;
  map?: string | null;
}

interface LimitOptionSpec {
  type: "limit";
  max: number;
  map: string;
}
```

Restrições:

- `values` de Enum não vazio, sem duplicatas, em ordem da mais baixa para a mais alta; o cliente não adivinha a intensidade a partir de strings específicas.
- `max` de Limit é um inteiro positivo válido, o limite rígido permitido pelo modelo.
- `map` continua lendo o valor de Option efetivo desta execução e gera um JSON Merge Patch do Request Body original.
- Personal Rule continua fazendo Overlay de folha sobre `type / values / max / map`; `values` é substituído como uma folha de array completa, não mesclado item a item.
- O Effective Model Config deixa de exigir ou expor qualquer `default` de Option.

### 3.2 Seleção de Reasoning

Regra unificada:

```text
o chamador fornece um reasoningLevel válido
└─ usar como está

o chamador não forneceu e o modelo tem Reasoning Spec
└─ preenchimento comum usa values.at(-1)

chamada auxiliar explícita e de baixo custo
└─ usar explicitamente values[0]

o chamador fornece um reasoningLevel inválido
└─ reportar erro, sem substituição silenciosa

o modelo não oferece capacidade de raciocínio
└─ usar a Spec completa com values=["disabled"], map="{}"
```

O preenchimento comum do default acontece uma única vez, no limite de resolução da Model Selection padrão. Depois de preenchido, o `preferredSelection`, a seleção recente, a Session Selection e o Active Model carregam um reasoning concreto; não é permitido que UI, Service, Model ou Adapter façem各自的 fallback próprios.

O comportamento de `resolveInitialModelSelection` é consolidado em:

- A seleção preferida da configuração é completa e válida: usar como está.
- A seleção preferida da configuração não tem reasoning e o modelo alvo suporta reasoning: completar com `values.at(-1)`.
- Quando o fallback do Registry escolhe o primeiro modelo visível: se o modelo suporta reasoning, completar também com `values.at(-1)`.
- Reasoning explicitamente fornecido e não suportado: a seleção da configuração é inválida, e não se pode mascarar o erro com o nível mais alto.
- Modelos sem suporte a reasoning usam o único nível `disabled` e o Patch vazio; não existe Effective Model sem Reasoning Spec.

Seleções recentes e troca de modelo na UI precisam resultar em uma seleção completa:

- Uma seleção recente esparsa e antiga, ao entrar na View atual, é completada pelas mesmas regras antes do uso e da nova persistência.
- Quando o usuário seleciona um modelo, o seletor de Reasoning deve receber sincronamente um valor concreto válido; sem valor histórico, exibe o nível mais alto.
- Uma Session existente continua herdando e congelando seu próprio reasoning concreto, sem derivar com atualizações de Registry ou Built-in.

### 3.3 Max Output

```text
Model Option Spec.max
└─ limite rígido do modelo

valor vinculado à Selection ou Model Request.maxOutputTokens desta execução
└─ orçamento desta execução
```

- Remover `maxOutputTokens.default` e todo o código que materializa valores de requisição a partir dele.
- Antes de entrar no Model Executor, deve ser obtido um `maxOutputTokens` válido, satisfazendo `0 < value <= max`.
- O valor pode ser fornecido pelas Selection Options já vinculadas ou explicitamente por esta requisição; quando nenhum dos dois existe, reportar erro antes do I/O de rede.
- O valor explícito da Request continua sobrescrevendo o valor vinculado da Selection.
- O Adapter consome apenas Effective Options completas e já validadas; não decide orçamento, não faz clamp e não recorre a `max`.
- Este Todo não trata `max` como valor de requisição implícito; `maxOutputTokens = max` só vale quando o chamador escolhe explicitamente.

### 3.4 Active Model e limite de execução

```text
Model Selection completa
        |
        v
ModelFactory
        |
        v
Active Model
├─ optionSpecs：domínio de valores / max / map
└─ bound options：valores explícitos da Selection
        |
        v
Model Request explicita os demais valores de execução
        |
        v
prepareRequest 完整性与范围校验
        |
        v
Adapter / Option Map / Request Signing
```

- O Active Model continua congelando Provider, Model Config, Option Specs e as Selection Options já vinculadas.
- Atualizações do Registry não modificam Models já criados.
- `Model.prepareRequest()` é a última garganta de completude antes de entrar no Executor; não é permitido empurrar Option ausente para o SDK, para a camada de rede ou para o servidor do Provider.
- O `ModelExecutor` recebe apenas Effective Options completas.
- A ordem do Option Map, os pontos de observação do Request Body original e a ordem de aplicação antes da assinatura da Request permanecem como estão no Todo 54.

## 4. GUI da Enum Option Spec

### 4.1 Forma alvo

Substituir o JSON do Reasoning Option Spec por um editor compacto de tags ordenáveis:

```text
推理档位（从低到高）

[ low ] [ medium ] [ high ] [ max ] [＋]
```

Não exibir explicações repetidas como "mais baixo", "mais alto", "padrão"; "do mais baixo ao mais alto" já expressa por completo o contrato de ordem.

### 4.2 Interação

- Cada tag exibe um valor de string bruta do Enum.
- A tag inteira pode ser arrastada para reordenar, e o resultado da ordenação é o `values` salvo.
- Um clique simples ou ativação por teclado entra na edição de texto simples.
- Cada tag editável oferece uma ação de exclusão; `＋` acrescenta um novo valor ao final e foca nele.
- Valores em branco e duplicados são proibidos; o erro é exibido no local, e um array inválido não pode ser salvo.
- Ao menos um valor é mantido; o último valor não pode ser excluído até resultar em array vazio.
- Durante o arraste a seleção de texto é proibida, e após o drop a ordem otimista é mantida diretamente, sem o piscar de voltar ao lugar antes de saltar para a nova posição.
- Suportar foco, edição, submissão, cancelamento e ajuste de ordem por teclado; não pode depender apenas do arraste com mouse.
- No desktop manter uma única linha compacta; quando o espaço faltar, quebrar linha naturalmente, sem criar barra de rolagem horizontal da página.
- Web e layout de celular reutilizam o mesmo comportamento; alvos de toque atendem às restrições de tamanho do Design existente.
- Temas claro e escuro, textos em chinês e inglês usam os Tokens e o mecanismo de internacionalização existentes.

### 4.3 Overlay e rascunho

- A GUI exibe os `values` efetivos, e o rascunho local registra apenas o Overlay de `values` do Personal após modificação explícita do usuário.
- Sem modificação, o array herdado não é copiado para a Personal Rule.
- Após a modificação, mantém-se o estilo de borda saturada de Personal Override existente, sem novo texto "padrão/modificado".
- "Restaurar tudo para o padrão" limpa o Overlay de `values` do Personal e volta a exibir os valores herdados.
- O `map` oculto precisa ser preservado como está; editar `values` não pode sobrescrever nem limpar `map`.
- Cancelar o diálogo não submete o rascunho; salvar continua passando pela validação de revision existente e pela cadeia atômica de gravação da Personal Model Rule.

### 4.4 GUI de Max Output

- O campo de entrada atual "Token máximo de saída" passa a editar `optionSpecs.maxOutputTokens.max`.
- O valor/placeholder do campo usa o `max` herdado e do Personal, sem ler ou gravar mais `default`.
- Um inteiro positivo válido digitado pelo usuário pode estabelecer diretamente um `max` do Personal, sem exigir que a Inherited Config já tenha `max`.
- Ao limpar a entrada, o Overlay de `max` do Personal é removido e o valor herdado é restaurado; se ainda assim não houver `max` final, isso é tratado como Effective Model Config incompleto, sem se disfarçar de erro de formato numérico.
- Só exibe "Token máximo de saída deve ser um inteiro positivo" quando o valor não for numérico, não for inteiro ou for menor ou igual a zero.
- Não adicionar "Token de saída desta execução" nem configuração de orçamento de execução na página de Model Config.

### 4.5 Banner de feedback do diálogo

O diálogo atual possui dois conjuntos de feedback inconsistentes:

```text
默认配置匹配成功
└─ banner verde completo abaixo da área de conteúdo

草稿校验失败
└─ uma linha em vermelho no fim do conteúdo rolável
```

Consolidar em um único componente de feedback dentro do diálogo e um slot de feedback fixo:

```text
可滚动配置内容
        |
        v
Dialog Feedback Slot
├─ success：绿色语义色 + 对勾 + 成功消息
└─ error：红色语义色 + 错误图标 + 失败消息
        |
        v
恢复默认 / 取消 / 保存
```

Requisitos:

- Sucesso e falha reutilizam a mesma estrutura de contêiner, raio, borda, espaçamento, tamanho de fonte e tamanho de ícone, alternando apenas cor semântica, ícone e texto.
- Usar Design Tokens, sem codificar cores no componente; os temas claro e escuro permanecem consistentes.
- O slot de feedback fica fora da área rolável e acima do Footer, sem ser empurrado para o fim da área rolável ou para uma posição invisível por causa de um formulário longo.
- Apenas um feedback é exibido por vez; uma falha de validação substitui imediatamente "configuração padrão do modelo carregada".
- "Configuração padrão do modelo carregada" só aparece quando um novo resultado de resolução realmente altera os campos ainda não tocados; resolver o mesmo resultado repetidamente não repete o aviso.
- O aviso de sucesso mantém a exibição curta atual; o erro persiste até o usuário modificar o campo correspondente, restaurar o padrão, reenviar com sucesso ou fechar o diálogo.
- O texto de erro precisa corresponder à verdadeira causa da falha. Erro de formato, erro de JSON Schema e Effective Config incompleto não podem compartilhar um texto enganoso.
- O banner de feedback oferece a semântica de acessibilidade correta com `role="status"` ou `role="alert"`; não pode depender apenas da cor para expressar o resultado.
- Não criar Toast global, nem misturar a validação do rascunho do diálogo na fila de feedback de salvar/testar conexão do rodapé da página do Provider.

## 5. Matriz de Superfícies de UI

| Cenário                                          | Owner atual do valor/rascunho          | Novo default ou herdado                                      | Ponto de commit/execução          | Comportamento deste Todo                        |
| ------------------------------------------------ | -------------------------------------- | ----------------------------------------------------------- | -------------------------------- | ----------------------------------------------- |
| Diálogo de configuração de modelo do Provider    | Rascunho local de Model Rule no Renderer | Built-in/Template/Provider/Personal Effective Model Config | Personal Model Config Rule      | Editor de tags de Enum; Max edita `max`         |
| Rascunho de nova conversa                       | Rascunho do Renderer + Model Selection View | Seleção completa recente, senão `preferredSelection`     | Session Model Selection         | Completa reasoning ausente com o nível mais alto e grava valor concreto |
| Session existente                               | Agent Session Selection                  | Valor congelado da própria Session                           | Active Model / requisições seguintes | Não lê default da Spec                     |
| Troca de modelo                                 | Seleção local do Composer                | Valor válido atual, senão o nível mais alto do modelo alvo  | `session/setModel`              | Submete a seleção completa de reasoning         |
| Automation                                      | Rascunho de edição de Automation         | Valor concreto do `preferredSelection` do Target Host       | Automation record               | Grava o reasoning concreto na criação          |
| Repo Wiki                                       | Rascunho de geração do Workspace         | Sua própria seleção / Target Host View                      | Execução única do Wiki          | Não sobrescreve o rascunho da Session             |
| Subagent                                        | Formulário ou configuração Markdown      | Herança do modelo pai ou seleção explícita de alvo          | Subagent config / child Model   | Herda o valor concreto; seleção explícita é completada |
| Bot                                             | Rascunho do Bot / tarefa ativa           | Seleção concreta                                            | Execução da tarefa do Bot       | Remove o fallback `spec.default`                 |
| Title / Goal / Commit / Memory / Connectivity | Respectivas chamadas auxiliares         | `values[0]`                                                  | Vínculo único ou Request         | Mantém o nível mais baixo, sem alterar a Session |
| Execução de Model                               | Active Model + Model Request             | Não fornece default implícito                                | Model Executor                  | Falha antes da rede quando falta valor           |

Fonte de candidatos compartilhada não significa estado compartilhado. Automation, Repo Wiki, Subagent, Bot e a Session comum mantêm seus próprios rascunhos, persistência e limites de submissão.

## 6. Fases de Implementação

### Fase A: Spec, testes falhando e contrato de configuração

1. Atualizar primeiro as especificações de autoria de Model Contract, Configuration, Model Creation, Runtime, Settings, Option Map e Built-in.
2. Atualizar o Feature Graph:
   - `values` de Reasoning continua do mais baixo ao mais alto;
   - o default comum pega o último item;
   - a chamada auxiliar de baixo custo pega o primeiro item;
   - a Option Spec não possui mais `default`.
3. Escrever testes falhando para fixar o novo Schema, o Overlay, a completude e a semântica de ordenação.
4. Remover todos os `default` de Option Spec dos Built-in e dos Fixtures de teste.
5. O Schema estrito deixa de aceitar `default`; como a funcionalidade ainda não foi liberada oficialmente, não se mantém leitura dupla, campo de compatibilidade nem fallback de Runtime.

### Fase B: Completude da Model Selection

1. Fazer a validação do Registry exigir reasoning válido na Selection quando o modelo suporta reasoning.
2. Concluir o preenchimento do default comum com o nível mais alto dentro do Initial Selection Resolver existente, sem criar objetos de Policy nem um segundo Resolver.
3. Consolidar a construção de valores concretos do default configurado, do fallback do Registry, da seleção recente e da troca de modelo.
4. Remover `?? spec.default` da UI, do Bot, da Automation, do Repo Wiki e do Subagent.
5. Valores explicitamente inválidos continuam falhando, e não é permitido corrigi-los silenciosamente com o nível mais alto.

### Fase C: Valores de execução completos no Model e no Adapter

1. Remover toda a materialização de Option default do Model constructor, do Adapter `bindModel`, do Runner e do Bootstrap.
2. O Active Model vincula apenas as Options explicitamente fornecidas pela Selection.
3. Ajustar o Contrato de Model Request/Execution para que as Effective Options estejam completas antes do Executor.
4. Completar a origem explícita de `maxOutputTokens` para cada entrada de execução real; não criar um fallback numérico unificado.
5. Manter a precedência do valor da Request sobre o valor vinculado, a validação de limite, o Option Map e a ordem do Request Signing.
6. Usar auditoria de dependências e referências para confirmar que helpers, tipos, Fixtures de teste e pontos de saída antigos de default foram zerados por completo.

### Fase D: GUI de configurações do Provider

1. Escrever primeiro os testes falhando de componente e interação, e só então implementar o editor compacto de tags de Enum.
2. Substituir o rascunho, o parser e a textarea do Reasoning Option Spec em JSON.
3. A entrada de Max Output passa a ser `max`, removendo o ramo antigo que exigia um `max` herdado para salvar um valor numérico válido do Personal.
4. Extrair o banner de feedback do diálogo e unificar estrutura, posição e ciclo de vida entre o sucesso do carregamento da configuração padrão e a falha de validação do rascunho.
5. Separar erro de formato de campo do erro de Effective Config incompleto, garantindo que o cenário de reprodução do Air consiga salvar `max: 1000`.
6. Validar Overlay, "Restaurar tudo para o padrão", cancelar, salvar, conflito de revision e preservação do `map` oculto.
7. Adicionar E2E de desktop e celular, cobrindo arraste, teclado, banner de feedback, tema, internacionalização e layout de largura estreita.

### Fase E: Documentação e limpeza mecânica

1. Atualizar o Bugfix 08: a requisição comum não usa mais `default`, mantendo apenas a decisão da chamada auxiliar com `values[0]`.
2. Atualizar o invariante antigo do Todo 54 e do Feature Graph, removendo "default remains ordinary request default".
3. Buscar em todo o repositório por leituras de default de Option Spec, Fixtures, Schema, documentação e JSON, garantindo que não exista um segundo conjunto de valores padrão.
4. Não remover mecanicamente conceitos legítimos chamados `default` em outras áreas.

## 7. Plano de Testes

### Config / Schema

- Specs de Enum/Limit não aceitam `default` e suportam round-trip estrito de JSON.
- `values` de Enum não vazio e sem duplicatas; `max` de Limit é inteiro positivo.
- Overlay de folha de `values`, `max` e `map` do Personal, limpeza por `null` e precedência posterior corretos.
- Cada Effective Model Config de Built-in obtém `values/max/map` completos, e o JSON oficial não exibe mais default de Option Spec.

### Model Selection

- Modelo que suporta reasoning: valor explícito válido passa, valor explícito inválido falha, e valor ausente é completado com o último item na inicialização comum.
- Modelo que não suporta reasoning: nenhum valor é gerado, e uma entrada explícita falha.
- default configurado, fallback do Registry e recent selection esparsa são completados com o nível mais alto e persistidos com o valor completo.
- A troca de modelo submete sincronamente um reasoning concreto; Sessions existentes continuam herdando o próprio valor.
- Atualizações de Built-in Rule afetam apenas selections/Models criados depois, sem alterar o Active Model existente.

### Runtime / Adapter

- Model/Adapter não sintetiza nenhuma Option a partir da Spec.
- Falha explicitamente antes do I/O de rede quando falta o `maxOutputTokens` final ou o reasoning necessário.
- O valor explícito da requisição sobrescreve o valor vinculado; ultrapassar `max` falha e não sofre clamp.
- Generate e Stream usam a mesma completude, o mesmo mapeamento e a mesma semântica de erro.
- O Option Map continua observando o valor efetivo final e gera o Request Body original correto.
- Title, Goal, Git Commit, Memory Recall e Provider Connectivity continuam usando `values[0]`.
- Session comum, Compact, Subagent, Repo Wiki, Automation e Bot usam suas próprias seleções explícitas, sem reler default da Spec.

### UI

- As tags de Enum exibem corretamente os valores herdados, e adicionar, editar, excluir, arrastar e ordenar por teclado salvam corretamente.
- Valores em branco, duplicados e array vazio não podem ser salvos.
- Sem piscar de retorno ao soltar o arraste e sem seleção de texto.
- Estilo de modificação do Personal, "Restaurar tudo para o padrão", cancelamento sem submissão e preservação do `map` oculto corretos.
- Max Output edita `max` e não gera mais Overlay de `default`.
- Sem `max` herdado, um inteiro positivo válido digitado pode ser salvo como `max` do Personal; ao reabrir, o mesmo valor é exibido.
- Valores não numéricos, não inteiros e não positivos exibem erro de formato; quando a cadeia de herança fica sem `max`, exibe o erro preciso de configuração incompleta.
- O sucesso do carregamento da configuração padrão e a falha do rascunho usam o mesmo componente de banner de feedback; cor semântica, ícone, exclusividade mútua e ciclo de vida de sucesso/falha estão corretos.
- O banner de feedback fica fixo fora da área rolável; com formulários longos e janelas estreitas, não é preciso rolar até o fim para vê-lo.
- Resolver repetidamente a mesma configuração padrão não repete o aviso; quando o rascunho não foi realmente alterado, "configuração padrão do modelo carregada" não é exibido.
- Desktop/Web/celular, temas claro e escuro, chinês e inglês e largura estreita sem rolagem horizontal da página.

### E2E / Regressão

- Editar a ordem do Reasoning nas configurações do Provider: após salvar e reabrir, a ordem é a mesma; o mapeamento de Runtime usa o valor explícito na nova ordem.
- Adicionar `claude` em um Personal Provider sem casar nenhuma Max Rule específica, preencher Context `10000` e Max Output `1000` e conseguir salvar; a Personal Rule grava apenas `max: 1000`, sem `default`.
- Ao adicionar um modelo que casa a configuração padrão, o banner de sucesso aparece; ao provocar em seguida um erro de validação, o banner de erro o substitui imediatamente na mesma posição, e o erro some depois de corrigir o campo.
- Uma nova sessão sem recent selection usa o nível mais alto do modelo alvo; Sessions existentes não derivam.
- Ao trocar para um modelo com outro domínio de valores de Reasoning, submete-se um valor concreto válido.
- As seleções de Automation, Repo Wiki e Subagent não poluem a Session comum.
- A semântica de Session Selection/restauração do Desktop continuous e do Mobile replayable permanece inalterada; nenhum novo snapshot ou campo de restauração é introduzido.

## 8. Invariantes e não objetivos

- `values` é sempre ordenado da intensidade de raciocínio mais baixa para a mais alta.
- O default comum pega apenas `values.at(-1)`; a chamada auxiliar de baixo custo pega apenas `values[0]`.
- Não adivinhar semântica a partir de strings como `off / none / nothink / low / max`.
- Não criar Option Policy, Capability DTO, Registro de execução nem hardcode de Runtime por ID de modelo específico.
- Não alterar Provider/Model Identity, Provider Template, Account Overlay, Access, Endpoint, API Schema, autenticação ou Request Auth.
- Não alterar membros do modelo, modelo enabled, ordenação de Provider, fila, Compact, restauração e ciclo de vida do Workspace remoto.
- Não expor a GUI do Option Map nem construir um editor genérico de Request com JSON arbitrário.
- Não transformar a página de Model Config em uma página de configuração de orçamento desta requisição.

## 9. Critérios de Conclusão

- Não existe `default` em Config, Effective Model Config, Registry DTO, Active Model nem Runtime Option Spec.
- Built-in Config e o Schema da Personal Rule não leem nem gravam default de Option Spec.
- Toda Model Selection comum que suporta Reasoning tem um nível concreto válido antes de ser submetida/usada.
- O default comum de nível mais alto e o auxiliar de nível mais baixo só têm implementação direta baseada em `values` ordenado, sem abstração de Policy nem caso especial por string.
- Toda execução de Model tem Options completas e válidas antes de entrar no Executor; ausências não chegam à camada de rede.
- O editor JSON de Reasoning foi totalmente substituído pelo editor compacto de tags ordenadas, e a página de Max Output edita apenas `max`.
- O falso erro de Max Output com valor legal, reproduzido no pacote oficial do Air, está coberto permanentemente por teste unitário e teste de interação de desktop.
- Não existem duas implementações visuais independentes para o feedback de sucesso e falha do diálogo; com conteúdo longo o feedback permanece visível e o motivo do erro é preciso.
- Passam os testes unitários direcionados, os E2E afetados, `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, o typecheck de E2E do Desktop e as validações de container relacionadas.
- `git diff --check` e a verificação de formatação dos arquivos modificados nesta rodada passam.
- Concluir o review da implementação, confirmando que não sobrou fallback de default, um segundo conjunto de fatos de seleção nem hardcode por modelo.
- Por fim, submeter um Conventional Commit; este Todo sugere o tema do commit de implementação: `refactor(provider): require explicit model option values`.

## 10. Relação com o trabalho atual do workspace

- O workspace atual está executando a reforma de Provider Template do Todo 55. O arquivo deste Todo é gravado de forma independente, sem modificar nem organizar as alterações existentes do Todo 55 no workspace.
- O Todo 58 deve ser implementado depois de o Config/Resolver Schema do Todo 55 estar estável, evitando modificar simultaneamente o Built-in Release, o Model Rule Schema e a baseline de Settings, o que geraria conflitos.
- Na implementação, reexecutar a varredura de impacto com base no workspace mais recente da época; se o Todo 58 mudar o agrupamento físico da Model Rule, ajustar apenas o ponto de gravação da configuração, sem mudar a semântica de Option deste documento.

## 11. Registro de Implementação de 2026-09-01

Concluído nesta rodada:

- O `default` de Option Spec foi aposentado por completo em Config, Schema, Built-in Release, Registry DTO, Active Model e Runtime; o Schema estrito rejeita o campo antigo;
- Quando a Selection comum não tem reasoning, o valor é completado com `values.at(-1)` no limite de resolução unificado, e a chamada auxiliar de baixo custo continua usando explicitamente `values[0]`;
- O Active Model não materializa mais valores de execução a partir da Spec; a requisição final valida o reasoning completo e o max output antes do I/O de rede;
- A página de configurações de modelo do Provider passou a editar o Reasoning Enum com tags compactas e ordenáveis, e a entrada de saída máxima edita diretamente `max`;
- Os Built-in e os Fixtures de teste não mantêm mais o antigo default de Option Spec. Uma varredura precisa em todo o repositório deixa apenas o teste negativo do Schema estrito rejeitando o campo antigo.

Evidências de verificação:

- `pnpm test:unit`: 1501 arquivos de teste aprovados, 1 skipped pré-existente; 12803 testes aprovados, 25 skipped pré-existentes;
- `pnpm typecheck` aprovado;
- `pnpm lint` aprovado, mantendo apenas os warnings já existentes no repositório;
- `pnpm --filter @zcode/desktop typecheck:e2e` aprovado;
- A verificação de formatação dos arquivos modificados e `git diff --check` aprovados;
- `pnpm fmt:check` em todo o repositório continua bloqueado pelo problema pré-existente de leitura de `apps/zcode-cli/tests/gb2312.js` e por um exemplo de HTML na documentação do Electron;
- `MP-UI-06` concluiu casos e verificação de tipos; o ambiente Linux atual não tem `xvfb-run` e o Chrome sai antes de entrar no corpo do teste, portanto o WDIO é registrado como `blocked-environment`, e não como aprovado.

## 12. Decisão posterior complementar (2026-09-05)

- Toda ModelSelection que realmente entra no ModelFactory/Runtime precisa carregar reasoning válido; ausência não é um valor padrão da camada de execução.
- Se uma seleção persistida ou recente tiver apenas Provider/Model e faltar o reasoning, ou se o reasoning já não pertencer à Spec atual, o Composer preserva a identidade do modelo e limpa o nível, pedindo que o usuário selecione de novo; não preenche silenciosamente com o nível mais alto nem exibe uma notificação genérica de "seleção inválida".
- Um rascunho recém-criado ainda pode usar `values.at(-1)` pelas regras da entrada comum quando não há valor histórico confiável; isso é um cenário diferente do de corrigir uma seleção persistida inválida já existente.
- Chamadas auxiliares explícitas e de baixo custo como Title, Goal, Memory e Connectivity continuam usando explicitamente `values[0]`; essa política não pertence ao valor padrão de ModelSelection comum, e o teste de conexão também segue essa estratégia de baixo custo.