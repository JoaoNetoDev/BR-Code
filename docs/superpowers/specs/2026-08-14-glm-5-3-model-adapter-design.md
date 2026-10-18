# Design do adaptador de modelo GLM-5.3

## Contexto

O GLM-5.3 já é distribuído pela configuração dinâmica de providers do App. Um fornecedor pode usar
diretamente o ID de modelo oficial ou pode prefixar/sufixar identificadores de roteamento ToB;
portanto os IDs a seguir representam a mesma identidade de capacidade:

- `glm-5.3`;
- `toB-glm-5.3`;
- `proxy/GLM-5.3-cc`.

A regra de reconhecimento é conter `glm-5.3` sem diferenciar maiúsculas de minúsculas, mas esse
token não pode ser seguido imediatamente por um dígito decimal, evitando reconhecer por engano
modelos futuros como `glm-5.30` e `glm-5.31` como GLM-5.3. O ID de modelo é usado apenas para
reconhecimento de capacidade; a requisição final ao provider continua preservando o ID original da
configuração.

Os fatos de configuração padrão atuais do catálogo são:

- ID de modelo: `glm-5.3`;
- janela de contexto: 1.000.000 tokens;
- saída máxima: 128.000 tokens;
- modalidades de entrada/saída: text -> text;
- faixas de reasoning: `low` / `high` / `max`, com padrão `max`.

Esses valores de contexto, saída e modalidade são metadata padrão do catálogo para o modelo exato, e
não uma sobrescrita obrigatória do provider dinâmico do App. Ao criar e ler modelos, o App primeiro
normaliza contexto ausente ou inválido para 200K e tenta resolver a saída máxima a partir de
metadata conhecida; contexto, saída máxima e modalidade de entrada modificados depois pelo usuário
continuam sendo usados como configuração explícita. O enrichment de catálogo durante a leitura não
participa da sobrescrita de contexto; a saída máxima adota fill-only, preservando qualquer valor legal
já existente e preenchendo com o valor do catálogo apenas quando o campo está ausente; quando o
catálogo também não tem a saída correspondente, mantém-se o fallback de runtime existente de 32K.

A política padrão da CLI e a projeção dinâmica do workspace precisam dar à identidade de modelo acima
a prioridade mais alta de decisão de capacidade e reconstruir as três faixas oficiais conforme o
transporte real, antes de ler metadata de reasoning de entrada que possa estar ausente ou desatualizada.
Caso contrário, aliases de roteamento que contenham também outros tokens como DeepSeek, Claude e GPT
poderiam ser sobrescritos por políticas amplas.

O enrichment de metadata do catálogo do App mantém uma fronteira de persistência mais estreita:
completa o metadata canônico ausente apenas para o ID exato `glm-5.3`, sem diferenciar
maiúsculas de minúsculas. IDs de roteamento reais com caminho, prefixo ou sufixo não são associados a
metadata canônico no App store e ficam por conta da política padrão da CLI e do overlay dinâmico do
workspace.

A capacidade de imagem do GLM-5.3 adota o reconhecimento provider-aware já existente no GLM-5.2, em
vez de ser fixa pela identidade do modelo:

- `supportsImages=true/false` explicitamente distribuído pelo provider registry ou catálogo tem
  precedência;
- capacidade desconhecida passando pelo transporte OpenAI Chat é tratada como text-only;
- variantes reais com sufixo `glm-5.2-*` / `glm-5.3-*` e capacidade desconhecida permanecem unknown,
  cabendo à configuração explícita ou ao provider decidir; as exceções são os casos em que, após a
  normalização, o segmento final do modelo é exatamente `glm-5.2-highspeed` ou `glm-5.3-highspeed`,
  tratados como text-only sem diferenciar maiúsculas de minúsculas; o OpenAI Chat continua tratando
  uniformemente como text-only;
- capacidade desconhecida passando pelo transporte Anthropic do provider/host oficial do GLM
  permanece unknown, permitindo que a cadeia de mídia existente no lado do provider lide com isso;
- outros providers GLM de terceiros com capacidade desconhecida falham de forma fechada (fail closed)
  como sem suporte a imagem.

A [documentação oficial de parâmetros gerais da Zhipu](https://docs.bigmodel.cn/cn/guide/start/concept-param)
confirma que o GLM-5.2 e modelos acima usam `reasoning_effort` para expressar a profundidade de
raciocínio.

## Objetivos

- Registrar `glm-5.3` nos providers Z.AI, BigModel e seus respectivos Coding Plan no catálogo de
  modelos chineses.
- Registrar `glm-5.3` nos quatro providers OpenAI-compatible correspondentes do catálogo models.dev
  embutido.
- Fazer com que a política padrão da CLI e o overlay dinâmico do workspace usem o mesmo reconhecimento
  de identidade GLM-5.3: conter `glm-5.3` sem diferenciar maiúsculas de minúsculas e sem dígito
  imediatamente depois do token; o GLM-5.3 é avaliado antes de todas as políticas amplas de modelo, ou
  como a sobrescrita final em uma lista de políticas mesclada em ordem.
- O catálogo do App completa o metadata ausente apenas para o ID exato `glm-5.3` sem diferenciar
  maiúsculas de minúsculas; IDs com caminho, prefixo ou sufixo não recebem canonical enrichment. Um
  contexto de 200K ou outro contexto legal já presente no modelo exato também é tratado como
  configuração explícita e não é promovido para o 1M do catálogo.
- O catálogo e a capacidade padrão da CLI sem override explícito são 1M de contexto, 128K de saída e
  text -> text; o provider dinâmico do App preserva o contexto, a saída máxima e a modalidade de
  entrada vindos da configuração de entrada ou do usuário, apenas reconstruindo uniformemente as três
  faixas `low` / `high` / `max`, com padrão `max`.
- Quando o GLM-5.3 não tiver metadata de imagem, reutilizar o reconhecimento provider-aware do
  GLM-5.2, em vez de tratar todos os aliases de roteamento do GLM-5.3 como text-only ou como
  capable de visão.
- Requisições OpenAI-compatible projetam a faixa escolhida como `openaiCompatible.reasoningEffort`,
  com o campo final no wire sendo `reasoning_effort`.
- O provider dinâmico Anthropic projeta as três faixas como `anthropic.effort` e um budget de
  thinking fixo.
- Não reescrever o ID de modelo original, garantindo que o provider ToB continue recebendo seu nome
  de roteamento real.

## Não objetivos

- Não adicionar a GLM-5.3 as faixas `off`, `none`, `nothink`, `medium` ou `xhigh`.
- Não alterar a semântica de `max` / `high` / `nothink` do GLM-5.2.
- Não alterar o toggle de thinking `enabled` / `disabled` de outros modelos GLM.
- Não usar a identidade do modelo GLM-5.3 para sobrescrever o contexto, a saída máxima ou a
  capacidade de imagem configurados explicitamente pelo usuário.
- Não alterar decisões de entitlement remoto, modelo padrão ou visibilidade dos providers embutidos.
- Não modificar a UI, a semântica de confirmação de seleção de modelo, o estado de sessão/task ou as
  fronteiras desktop continuous / web remote replayable.

## Capacidade e cadeia de requisição

```text
Catálogo de modelos chineses            Snapshot models.dev embutido
  Providers Anthropic                   Providers OpenAI-compatible
  glm-5.3                                glm-5.3
  context=1,000,000                      context=1,000,000
  output=128,000                         output=128,000
  low/high/max                           reasoning=true
          │                                  │
          └──────────────┬───────────────────┘
                         ▼
                 Catálogo de modelos da CLI
                         │
          matcher de identidade GLM-5.3 compartilhado
              contains glm-5.3, next != digit
                         │
                 default policy converge
                 levels=[low, high, max]
                 default=max
                         │
          session.settings.thoughtLevel
                         │
                         ▼
 OpenAI-compatible: reasoningEffort=level
                         │
                         ▼
 wire do provider: reasoning_effort="low|high|max"

Provider dinâmico do App (inclui aliases ToB)
          ├─ context / output / media: preserva configuração explícita
          │                         │
          │                         └─ image desconhecida reusa o
          │                            provider-aware fallback do GLM-5.2
          │
          └─ matcher de identidade compartilhado
             reconstrói as três faixas oficiais antes do reasoning de entrada
                          │
                          ▼
             anthropic.effort + thinking budget
                          │
                          ▼
             wire do provider: output_config.effort + thinking
```

A capacidade do modelo continua sendo a fonte de verdade das faixas de reflexão. A UI existente
renderiza e alterna as faixas conforme a lista de capacidades e não ganha um ramo para o ID de modelo
`glm-5.3`.

## Implementação

1. Adicionar em `reasoning-policy.ts` as constantes das três faixas do GLM-5.3 e a factory
   OpenAI-compatible.
2. Adicionar no shared um reconhecimento unificado de identidade de modelo, usado por
   `default-policy.ts`; essa política fica depois de todas as políticas amplas de modelo, como a
   sobrescrita final ao ser mesclada em ordem. Ramos mutuamente exclusivos, por sua vez, verificam
   GLM-5.3 antes dos reconhecimentos de modelos como Kimi, DeepSeek, Claude e GPT.
3. Atualizar `models_catalog_china_llm_zcode_2026-06-03.json` adicionando o GLM-5.3 aos quatro
   providers Anthropic, com as faixas consistentes com os fatos atuais das requisições Anthropic
   dinâmicas.
4. Atualizar os quatro providers correspondentes em `apps/zcode-cli/api.json` e regenerar
   `models-dev-snapshot.ts`.
5. O catálogo do App usa metadata canônico de catálogo apenas quando o ID do modelo é exatamente
   `glm-5.3` sem diferenciar maiúsculas de minúsculas; IDs de roteamento com caminho, prefixo ou
   sufixo não são associados.
6. O overlay dinâmico do workspace reconhece o GLM-5.3 antes do ramo GLM genérico e reconstrói as
   três faixas oficiais e as provider options conforme o transporte OpenAI-compatible ou Anthropic;
   não sobrescreve o contexto, a saída máxima ou a capacidade de mídia de entrada.
7. A política padrão de reasoning do GLM-5.3 não declara `supportsImages`; quando falta a capacidade
   de mídia no runtime, compartilha o provider-aware fallback com o GLM-5.2 e inclui as variantes de
   sufixo `glm-5.3-*` na mesma semântica unknown; exceto pelas variantes Highspeed exatas, que são
   text-only conhecidas e falham de forma fechada.

## Testes

- shared/default policy: o ID oficial, variations de caixa, o path de provider, prefixos arbitrários
  e sufixos não numéricos acertam 1M/128K/três faixas; mesmo contendo ao mesmo tempo tokens de
  DeepSeek, Claude, GPT ou Opus, o GLM-5.3 prevalece; `glm-5.30`, `glm-5.31` e GLM-5.2 não são
  atingidos por engano.
- reasoning factory: as três faixas geram apenas o `openaiCompatible.reasoningEffort`
  correspondente, com padrão `max`.
- snapshot models.dev: os quatro providers contêm as capacidades básicas do GLM-5.3.
- Catálogo de modelos chineses: os quatro providers contêm GLM-5.3, reasoning de três faixas e o
  patch Anthropic.
- wire: `low` / `high` / `max` do OpenAI-compatible geram o `reasoning_effort` de nível superior.
- catálogo do App: `glm-5.3` / `GLM-5.3` conseguem completar metadata ausente como output e estender
  o reasoning canônico; contexto ausente usa o padrão de 200K do App e outros contextos legais já
  existentes permanecem inalterados; IDs com caminho, prefixo ou sufixo não recebem canonical
  enrichment, e o reasoning personalizado fora do catálogo permanece inalterado.
- overlay dinâmico: aliases do GLM-5.3 sem metadata de reasoning ou com toggle genérico ainda são
  reconstruídos como `low` / `high` / `max` e geram parâmetros conforme o transporte real;
  configuração explícita de contexto, saída máxima e mídia permanece inalterada.
- mídia do runtime: o GLM-5.3, assim como o GLM-5.2, preserva `supportsImages` explícito; quando
  ausente, cobre os ramos provider-aware de OpenAI Chat, Anthropic oficial, providers de terceiros e
  variantes de sufixo; Highspeed exato é text-only e sufixos mais longos continuam unknown.

## Resumo de impacto

### Resumo da funcionalidade

| Campo            | Valor                                                                    |
| ---------------- | ------------------------------------------------------------------------ |
| Intenção do desenvolvedor | Completar o GLM-5.3 no mesmo esquema em camadas do Kimi K3 e compartilhar com o GLM-5.2 o reconhecimento de capacidade de mídia |
| Capacidade       | Capacidades de modelo / catálogo de providers                              |
| Camada de mudança | option-source, validation                                                  |
| Modo de operação | implementation-handoff                                                     |
| Sementes centrais | matcher, catálogo, overlay dinâmico, política de reasoning, resolvedor de mídia do runtime |
| Fora de escopo   | UI, session/replay, entitlement embutido                                   |

### Comportamento compartilhado e divergente

| Aspecto                | Compartilhado entre superfícies          | Deliberadamente diferente                              | Por que importa            |
| ---------------------- | ---------------------------------------- | ----------------------------------------------------- | -------------------------- |
| Origem das opções      | Todos os pontos de seleção de modelo consomem o mesmo provider registry | Cada entrada mantém filtros e padrões existentes   | Nenhum hardcode de UI após a complementação do catálogo |
| Capacidade de reasoning | low/high/max, padrão max                 | OpenAI-compatible e Anthropic mapeiam parâmetros de wire diferentes | Não misturar namespaces     |
| Capacidade de mídia    | Metadata explícito de provider/catalogo tem precedência | Na ausência, decidido pelo provider-aware fallback do GLM-5.2 | Evita strip indevido ou passthrough indevido de imagens |
| Persistência/recuperação | Mantém a persistência existente de provider/session | desktop continuous e web replayable mantêm suas fronteiras | Nenhum estado de sincronia introduzido |

### Relacionamentos da funcionalidade

| Rank           | From                   | Aresta semântica                     | To                             | Condição             | Evidência                     |
| -------------- | ---------------------- | ------------------------------------ | ------------------------------ | -------------------- | ----------------------------- |
| must-inspect   | model catalog          | projeta capacidades para            | provider registry              | carregar GLM-5.3      | testes de fonte do catálogo    |
| must-inspect   | default policy         | fornece fatos ausentes para         | CLI model catalog              | provider estático ou personalizado | testes de adapter      |
| must-inspect   | thought level          | projeta para                        | provider request options       | low/high/max          | testes de wire                 |
| must-inspect   | shared model identity  | classifica                           | CLI policies + dynamic overlay | aliases do GLM-5.3    | testes shared/adapter/protocol |
| must-inspect   | App catalog lookup     | enriquece apenas o modelo exato      | provider store metadata        | apenas `glm-5.3` exato | testes de service           |
| must-inspect   | App dynamic provider   | reconstrói reasoning antes de       | workspace catalog overlay      | aliases do GLM-5.3    | testes de protocol             |
| must-inspect   | runtime media resolver | classifica suporte de imagem desconhecido | provider request projection    | metadata GLM-5.3 ausente | testes de model-selection |
| invariant-only | provider registry      | não pode mudar                       | session/replay boundaries      | todos os clientes     | nenhuma diferença de estado de UI/protocol |

### Donos de estado e sinks de commit

| Estado/fato              | Dono de rascunho/exibição        | Dono autoritativo           | Sink de commit            | Evidência              |
| ------------------------ | -------------------------------- | ---------------------------- | ------------------------- | ---------------------- |
| Capacidade estática GLM-5.3 | Cada entrada de seleção de modelo | catálogo + política padrão da CLI | provider registry existente | testes de catálogo/adapter |
| Faixa de reasoning atual | composer/projeção do runtime    | session settings             | troca de modelo existente | teste de wire          |
| Patch dinâmico de reasoning | overlay do workspace          | identidade compartilhada + overlay da CLI | sincronização de protocolo existente | teste de regressão de protocol |
| Capacidade dinâmica de imagem | provider registry / catálogo | resolvedor de mídia do runtime | projeção da requisição ao provider | testes de model-selection |

### Invariantes que devem ser preservados

| Invariante                                                       | Prova necessária                                  | Evidência                |
| --------------------------------------------------------------- | ------------------------------------------------- | ------------------------ |
| Apenas low/high/max, com padrão max                             | igualdade de capacidades                          | testes adapter/catálogo  |
| GLM-5.2 e a política GLM comum permanecem inalterados           | asserções negativas + suíte existente             | testes de default-policy |
| Alias ToB não cai em outras políticas amplas de modelo          | as três faixas oficiais mesmo com token conflitante | teste adapter/protocol |
| ID de modelo ToB original não é canonicalizado                  | chave do provider registry e model da requisição mantêm o valor original | teste de service/wire |
| O catálogo do App não enriquece aliases de roteamento           | IDs com prefixo/sufixo e path mantêm o metadata de entrada | teste de service |
| Configuração explícita de imagem tem precedência; unknown segue o mesmo critério do GLM-5.2 | asserções de combinação provider/transporte/sufixo | testes unitários de bootstrap |
| Não alteram entitlement do provider nem estado de UI/sessão      | arquivos relacionados ausentes do diff             | revisão do diff          |

### Evidência de codegraph

O ambiente atual não tem ferramenta de codegraph disponível; por convenção da skill usamos fallback com
`rg`. A cadeia de chamadas é:

```text
catalog/default-policy
        -> ModelCatalogSource / ModelCatalogService
        -> workspace model catalog override
        +-> runtime thought-level providerOptions -> AI SDK request body
        +-> runtime media capability resolver -> provider-visible messages
```

### Delta do grafo

| Status    | Nó                             | Razão semântica                                                 | Ação                    |
| --------- | ------------------------------ | ---------------------------------------------------------------- | ----------------------- |
| confirmed | `capability.model-capabilities` | spec do GLM-5.3, reasoning factory e media resolver viram entradas de fato | atualizar feature graph |

### Questões em aberto

Nenhuma. O usuário já esclareceu que qualquer prefixo ou sufixo é permitido, excluindo apenas um dígito
imediatamente após `glm-5.3`; contexto/saída/mídia dinâmicos preservam a configuração explícita, e a
capacidade de imagem ausente usa o mesmo reconhecimento provider-aware do GLM-5.2.

## Planejamento de casos

| Case ID   | Setup                                     | Ação                              | Asserções                                        | Camada de evidência  | Status E2E |
| --------- | ----------------------------------------- | --------------------------------- | ------------------------------------------------- | -------------------- | ---------- |
| GLM53-001 | Desativar models.dev                      | Consultar oficial/ToB/com path/com ID aproximado | Sufixo não numérico acerta, continuação numérica rejeitada | shared + unit de adapter | not-needed |
| GLM53-002 | Carregar o snapshot embutido              | Percorrer os quatro providers     | Todos têm as capacidades básicas do GLM-5.3        | integração de adapter | not-needed |
| GLM53-003 | Carregar o catálogo de modelos chineses   | Percorrer os quatro providers     | Três faixas/default/patch Anthropic corretos       | unit de service       | not-needed |
| GLM53-004 | OpenAI-compatible com fake fetch         | Selecionar as três faixas         | wire tem o reasoning_effort correspondente         | wire de adapter       | not-needed |
| GLM53-005 | Fixture dinâmico Anthropic/OpenAI        | Sincronizar alias ToB sem metadata | Reconstrói três faixas e opções de transporte     | integração de protocol | not-needed |
| GLM53-006 | Config do App com ID exato e de roteamento | Carregar provider                | ID exato é completado; ID de roteamento não é enriquecido | integração de service | not-needed |
| GLM53-007 | Metadata de imagem do GLM-5.3 ausente ou explícito | Resolver capacidade por provider/transporte | Consistente com o fallback do GLM-5.2; valor explícito tem precedência | unit de bootstrap | not-needed |

Não adicionamos E2E de conversa nesta rodada: não houve modificação de interação de UI, confirmação de
troca de modelo, estado de sessão ou semântica realtime/replayable, e os testes unitários por camada
mais os testes de wire cobrem diretamente os novos comportamentos.