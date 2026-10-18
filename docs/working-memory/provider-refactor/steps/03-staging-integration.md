# M3.0: integração do staging e posse da configuração de Provider

> Status: implementação e verificação de merge local concluídas; submetidas junto deste merge commit
>
> Última atualização: 2026-08-22
>
> Base de integração: `origin/staging@bcb119437370b74b6460b89975afae2ef5cdea33`

## 1. Objetivo

M3 precisa concluir duas coisas ao mesmo tempo:

1. absorver as capacidades de produto já adicionadas ao staging, como Video Input, configuração de tipo de entrada de modelo e reasoning de `ox-alpha`;
2. migrar de forma unificada para o novo sistema de Provider Config e Model Config Rules todos os fatos de Provider / Model que ainda estão no staging e no código antigo sob responsabilidade de configuração remota, Catalog, Workspace Snapshot ou hardcode de nome de modelo específico.

Este documento é a fonte de fato de design desta integração de staging. Logs de implementação anteriores registram apenas o que foi implementado na época e não cobrem as novas decisões já confirmadas aqui.

Nesta rodada, conforme a decisão do usuário, fazemos apenas merge local e commit, sem push e sem reescrever nenhuma branch remota.

## 2. Fronteira central

O objetivo comum de toda configuração é ajudar o ZCode a encapsular uma chamada de API de modelo correta: escolher o Provider, determinar o Endpoint e o tipo de API, determinar os membros de modelo, resolver capacidades e opções do modelo e formar a requisição final.

O sistema de configuração não exclui categoricamente as "credenciais": um Provider de API comum pode salvar diretamente uma API Key estática na Personal Provider Config. A Config de um Provider do tipo conta não gerencia credenciais de conta, apenas expressa o identificador de conexão da conta e os membros de modelo em estado de conta; as credenciais reais da conta são resolvidas e injetadas pelos Services no momento da requisição, e o serviço de modelo responde pela autenticação e pela decisão final de autorização.

Portanto é preciso distinguir:

```text
模型调用配置
├─ Provider 身份、Endpoint、API 类型、模型成员
├─ 模型能力、限制、选项和 reasoning 映射
├─ 普通 API Provider 的静态 API Key（允许）
└─ 账号连接标识

账号访问执行
├─ 根据账号连接标识解析账号凭据
├─ 请求期注入凭据
└─ 由模型服务最终决定账号能否访问目标模型
```

A configuração de conta não é uma fronteira de segurança do cliente. A configuração Personal permite que o usuário faça um override final; se a configuração após o override é realmente utilizável continua sendo decidido pela resposta do servidor.

## 3. Vocabulário de domínio

A camada de design mantém apenas fontes de configuração e resultados derivados com significado de negócio, sem introduzir o conceito extra de "documento de configuração". Versão de serialização, invólucro de arquivo e formato de leitura/escrita são detalhes de implementação e não entram no modelo de domínio.

### 3.1 Configuração de Provider

| Nome                                  | Nome de código sugerido | Significado                                                                        |
| ------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------- |
| ZCode Built-in Provider Config        | `zcodeBuiltinProviders` | Valores padrão estáticos de Provider fornecidos com o produto ZCode e declaração de Providers de conta |
| Account Provider Config               | `accountProviders`      | Complemento ou restrição em estado de conta para os Providers relacionados a conta dentro do Built-in |
| Personal Provider Config              | `personalProviders`     | Providers definidos pelo usuário e override final de Providers já existentes         |
| Effective Provider Config             | `effectiveProviders`    | Conjunto final de Providers após a sobreposição das três camadas de configuração    |

O `officialProviders` da implementação atual corresponde ao `zcodeBuiltinProviders` da semântica alvo. Se a renomeação mecânica será concluída dentro do M3 fica para a etapa de implementação decidir, mas novos designs e testes usam uniformemente o vocabulário deste documento.

### 3.2 Configuração de Model

| Nome                                   | Nome de código sugerido    | Significado                                                             |
| -------------------------------------- | -------------------------- | ------------------------------------------------------------------------ |
| ZCode Built-in Model Config Rules     | `zcodeBuiltinModelRules`   | Fatos estáticos de modelo fornecidos com o produto ZCode e regras de comportamento padrão |
| Personal Model Config Rules           | `personalModelRules`       | Regras de override adicionais do usuário sobre fatos e comportamento de modelo |
| Effective Model Config Rules          | `effectiveModelRules`      | Sequência final de regras após a concatenação ordenada dos dois conjuntos |
| Effective Model Config                | `effectiveModelConfig`     | Configuração de modelo resolvida para um Provider / Model / API type final |

O `models[]` da Provider Config responde a "quais modelos este Provider tem e em que ordem de exibição"; as Model Config Rules respondem a "como esses modelos são chamados, que capacidades e limites têm". As Model Config Rules não são responsáveis por adicionar ou remover modelos do Provider.

## 4. Como os dois caminhos de configuração convergem

```text
Provider 配置路径                              Model 规则路径

ZCode Built-in Provider Config                ZCode Built-in Model Config Rules[]
              |                                            |
              v                                            |
     overlay Account Provider Config                       +
              |                                            |
              v                                            v
    overlay Personal Provider Config             Personal Model Config Rules[]
              |                                            |
              v                                            v
     Effective Provider Config                 Effective Model Config Rules[]
              |                                            |
              +----------------------+---------------------+
                                     |
                                     | 对 final provider.models[] 中每个 model
                                     | 使用 final providerId / modelId / api.type
                                     v
                          Effective Model Config
                                     |
                                     v
                              Provider Registry
                                     |
                                     v
                            封装最终模型 API 调用
```

Aqui só se destacam três conceitos derivados realmente significativos: Effective Provider Config, Effective Model Config Rules e Effective Model Config. Estados intermediários como snapshot de carregamento, último valor bem-sucedido e cache de resolução continuam como detalhes de implementação e não são promovidos a conceitos de domínio.

## 5. Regras de override de Provider

A ordem final é fixa:

```ts
effectiveProviders = zcodeBuiltinProviders.overlay(accountProviders).overlay(personalProviders);
```

A prioridade é:

```text
Personal > Account > ZCode Built-in
```

### 5.1 Fronteira de responsabilidade do Account

A Account Provider Config só trata os Providers do tipo conta já declarados na ZCode Built-in Provider Config:

- pode complementar o identificador de conexão da conta;
- pode sobrescrever o `models[]` desse Provider quando a interface de conta realmente retornar um conjunto de modelos;
- não fornece capacidades estáticas como context, modalities, reasoning ou max output;
- não lê, restringe nem reescreve Providers customizados criados pelo usuário no Personal;
- não salva nem gerencia credenciais de conta.

Portanto a entrada do Account Provider Service precisa ser a ZCode Built-in Provider Config, e não o conjunto de Providers já sobreposto com o Personal.

### 5.2 Por que o Personal vale por último

A Personal Provider Config é a expressão final do usuário sobre o encapsulamento local da chamada. Ela pode criar um Provider de API comum novo como também sobrescrever o Endpoint, o tipo de API, os membros de modelo ou a API Key estática de um Provider existente.

A camada de Account fornece fatos em estado de conta, mas não assume a imposição de autorização do lado do cliente. Mesmo que o o Personal finalmente sobrescreva o conjunto de modelos retornado pela conta, o servidor continuará fazendo a autenticação e a autorização finais das requisições reais.

### 5.3 Semântica de override de `models[]`

`models[]` é a lista de membros do Provider e adota override de lista inteira, sem interseção implícita:

```text
Built-in Provider.models
└─ 静态/默认模型成员

Account Provider.models（存在时）
└─ 当前账号接口返回的动态模型成员，整列表覆盖 Built-in

Personal Provider.models（存在时）
└─ 用户最终声明的模型成员，整列表覆盖 Account/Built-in
```

Não se introduz `allowedModelIds` extra como um segundo conjunto de semântica do Registry, nem se interpreta models do Account no cliente como lista branca de autorização.

## 6. Merge e resolução das Model Config Rules

Os dois conjuntos de Model Config Rules têm relação de concatenação de arrays, com as regras Personal depois:

```ts
effectiveModelRules = new ModelConfigRules([
  ...zcodeBuiltinModelRules.rules(),
  ...personalModelRules.rules(),
]);
```

As regras são casadas em ordem; campos casados depois sobrescrevem campos de mesmo nome já definidos por regras anteriores. O objeto resolvido precisa vir da Effective Provider Config:

```text
effectiveModelRules.resolve(
  effectiveProvider.id,
  modelId,
  effectiveProvider.api.type,
)
```

Isso garante que o override final do Personal sobre o API type do Provider também entre no branch correspondente das regras de modelo. Não se pode resolver as regras de modelo pelo Provider Built-in e depois sobrepor o Provider de Account ou Personal.

Os fatos estáticos de modelo incluem, sem se limitar a eles:

- context window e max output tokens;
- capacidades de entrada como image, video e PDF;
- níveis disponíveis de reasoning e nível padrão;
- o mapeamento de parâmetros de reasoning sob o API Schema;
- metadados do Registry como ordenação ou prioridade de modelos.

Esta rodada não acrescenta Account Model Config Rules. A interface de conta só afeta o estado de conexão do Provider e os membros de modelo e não entrega capacidades estáticas de modelo.

## 7. Interface de conta e Start Plan

As diferenças reais atuais da interface de availability de conta são:

| Tipo de conta          | Origem de availability              | Retorna ID de modelo dinâmico |
| ---------------------- | ------------------------------------ | ----------------------------- |
| Z.AI Start Plan        | `/billing/balance`                   | Sim                           |
| BigModel Start Plan    | `/billing/balance`                   | Sim                           |
| Coding Plan            | `/subscription/list`                 | Não, retorna apenas o estado de disponibilidade |
| Team Plan              | interfaces de customer / project / quota | Não, retorna apenas o estado de disponibilidade |

O Start Plan extrai `model:<id>` das `capabilities` do bucket de saldo, faz deduplicação sem diferenciar maiúsculas/minúsculas e forma o `models[]` do Account Provider. A interface retorna o conjunto de modelos visível para a conta no momento e não permite com isso fixar que "Start Plan só pode usar um determinado modelo".

A compatibilidade antiga atual trata `show_name` como ID de modelo quando o bucket de saldo não tem capability `model:`. `show_name` parece mais um campo de exibição, mas antes de o contrato do servidor esclarecer mais esta rodada mantém a compatibilidade e não a amplia para uma nova regra de identidade de modelo.

Como Coding Plan e Team Plan não retornam conjunto dinâmico de modelos, não se pode esvaziar o `models[]` desses Built-in Providers. O Start Plan também mantém os membros padrão do Built-in, para garantir um valor padrão de produto explícito quando a availability temporariamente não retorna IDs de modelo; quando o `models[]` do Account existe, ele sobrescreve como lista inteira.

## 8. Consolidação da posse de `/client/configs`

202`/api/v1/client/configs` é o centro genérico de configuração de produto remoto e não um serviço de autenticação. As interfaces relacionadas a autenticação podem colaborar com ele, mas isso não autoriza a continuar tratando os fatos estáticos de Provider / Model ali contidos como resultado de autenticação de conta.

### 8.1 `builtinProviders` e `providers`

Ambos expressam a mesma autoridade de configuração de Provider e só diferem na geração do protocolo:

- `builtinProviders`: estrutura normalizada mais nova, contendo principalmente metadados de Provider e IDs de modelo;
- `providers`: estrutura legada monolítica de compatibilidade, que mistura configuração de Provider e de modelo;
- o staging atual prioriza `builtinProviders` quando não vazio, usando `providers` apenas como fallback.

O objetivo não é manter duas entradas por longo tempo, e sim migrar os fatos estáticos ainda válidos para a ZCode Built-in Provider Config e as ZCode Built-in Model Config Rules, e então remover a sincronização remota de Provider e o fallback do protocolo antigo.

### 8.2 Decisões de migração de campos

| Configuração remota             | Papel atual                                            | Alvo do M3                                                        |
| ------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------- |
| `builtinProviders`              | ID e nome do Provider, membros de modelo, Endpoint, API Schema | Migrados para a ZCode Built-in Provider Config e depois a entrada remota é removida |
| `providers`                     | Configuração mista de Provider + Model do protocolo antigo | Migrada para o sistema existente e depois a entrada de compatibilidade é removida |
| `builtinModels`                 | context, max output, modalities, reasoning, priority   | Migrados para as ZCode Built-in Model Config Rules                |
| `magic_name`                    | Política de reasoning casada por nome de modelo        | Remover o matcher remoto; o comportamento válido vira Model Config Rules genérica |
| `offPeak.allowed_models`        | Lista branca de modelos da tarefa off-peak             | Deixa de ser autoridade de fato de modelo; os membros estáticos entram na Built-in Provider Config |
| `modelContextBudget.strategy`   | Graduação do orçamento de contexto do Agent            | Sem relação com a configuração de modelo e sem alteração nesta rodada |
| Produtos, planos e descontos     | SKU, exibição e configuração comercial                  | Continuam gerenciados pela configuração de produto remota independente |
| Switches de verificação de segurança, forceUpdate | Política de risco e de release            | Continuam gerenciados remotamente                                  |
| computerUse e feature flags      | Graduação de produto                                    | Continuam gerenciados remotamente                                  |

O campo `apiKey` dos tipos remotos antigos de Provider não precisa de um desenho de migração separado: o modo real de acesso já é responsabilidade do sistema de acesso existente; ao remover o protocolo antigo o campo legado é removido junto.

## 9. Remoção de hardcode de modelo específico

Este fechamento não trata apenas `ox-alpha`. Todo código antigo que "reconhece um ID de modelo específico e então decide nível de reasoning, valor padrão ou parâmetros de requisição" deve sair.

A estrutura alvo é:

```text
具体模型的静态行为
└─ ZCode Built-in / Personal Model Config Rules
             |
             v
      Effective Model Config
             |
             v
通用 API Adapter 按配置序列化请求
```

O Adapter pode manter mapeamentos de nível de protocolo, por exemplo:

- `output_config.effort` e adaptive thinking das Messages da Anthropic;
- parâmetros de reasoning das Chat Completions / Responses da OpenAI;
- diferenças de serialização do mesmo opção genérica entre API Schemas distintos.

O Adapter deixa de possuir a política de produto de "quais intensidades de reasoning um determinado modelo específico deve usar".

Aqui o termo wire é apenas o jargão comum de engenharia de rede, referindo-se ao corpo final da requisição HTTP enviada ao serviço de modelo no fio; na cadeia de reasoning do Provider não existe uma função de domínio `wire()` especial. Os `*-wire.test.ts` já existentes provam, interceptando o corpo final da requisição, que a configuração continua preservando o comportamento real de requisição já verificado no staging após passar pelo Adapter genérico.

O comportamento que precisa ser mantido para `ox-alpha` hoje é:

```text
reasoning levels = low / high / max
default = max
openai-chat-completions -> reasoningEffort
anthropic-messages      -> adaptive thinking + effort
openai-responses        -> 暂不启用专属 reasoning
```

Esses comportamentos vão para as ZCode Built-in Model Config Rules; o helper que identifica pelo nome de modelo, o matcher regex remoto, os casos especiais de Default Policy e os casos especiais de Catalog são removidos. A própria regra pode usar expressões genéricas de model match, que são apenas condições de casamento declarativas e não um caso especial de modelo dentro do código de negócio.

## 10. Fronteira das tarefas off-peak

O objetivo mais recente das tarefas off-peak é separar os "fatos estáticos de modelo" do "material de acesso de uma execução única":

```text
ZCode Built-in Provider Config + ZCode Built-in Model Config Rules
└─ builtin:offpeak-idle-plan 的静态 Provider / Model 事实

Execution context
└─ 单个闲时回合所需的 Request Auth / ticket / attribution 等请求输入
```

`builtin:offpeak-idle-plan` é um Built-in Provider completo com `visibility: "hidden"`. Ele entra no mesmo Registry, mas é
oculto por Settings e pelo Model Selection Facade; a capacidade off-peak interna cria um Model comum pelo `providerId/modelId` preciso. Ele não reescreve
o modelo residente da Session. `enable_offpeak_task` pode continuar como graduação de produto remota; `allowed_models` deixa de carregar o fato de modelo do Registry.

A Provider Config precisa declarar o `api.type` completo, o Endpoint de produção, os membros de modelo e os fatos estáticos de modelo, usando
`access.type = "request-auth"` para expressar a injeção de autenticação dinâmica no momento da requisição. Na ausência de Request Auth, o Model falha explicitamente antes da requisição de rede.
`visibility` não representa confiança, permissão ou isenção de integridade.

Esta rodada incorpora ao sistema de configuração existente a informação estática de Provider / Model trazida pelo staging, mas não reesve por oportunidade toda a máquina de estado das tarefas off-peak nem trata `modelContextBudget.strategy`.

## 11. Como absorver as capacidades de produto do staging

### 11.1 Video Input

Mantém-se do staging o reconhecimento de anexo de vídeo, upload, persistência, restauração, projeção de Tool Result, conversão da requisição, orçamento, sanitização e tratamento de erro. Se o modelo suporta Video passa a ser lido apenas do atributo de modelo na Effective Model Config e não é mais completado pelo Catalog antigo, pelo Workspace Snapshot ou por fallback do Runtime.

### 11.2 Configuração de tipo de entrada de modelo

Mantém-se Text fixo, Image/Video alternável, saída Text fixa, valores padrão de context/max output e as intenções de tema, internacionalização, teclado e acessibilidade. As configurações são salvas nas Personal Model Config Rules.

Não se introduz `modalitiesConfigured`. O estado triplo dos campos de regra já consegue expressar:

```text
undefined -> Personal 对该能力没有意见
false     -> Personal 明确关闭
true      -> Personal 明确开启
```

Capacidades de PDF e Audio não exibidas não podem ser reescritas silenciosamente pelo salvamento da página. Audio entra no contrato completo de Model Property, mas esta rodada
não adiciona entrada de anexo, projeção de bloco de conteúdo nem codificação de Provider; a estrutura detalhada está em
[`../design/model/input-output-format.md`](../design/model/input-output-format.md).

### 11.3 Ciclo de vida de vigência

Depois de salvar uma configuração de Provider ou Model, a revision do Registry é atualizada, mas um Active Model já criado não é alterado a quente. A próxima criação de Model lê a configuração nova. Video, reasoning, Endpoint, API Key e outras opções de modelo seguem o mesmo ciclo de vida.

### 11.4 Local / Remote

```text
Local Environment  -> 使用本地 Config / Registry
Remote Environment -> 使用远端环境自己的 Config / Registry
```

Anexos de mídia e Submission podem passar pelo protocolo de controle remoto, mas o Desktop não envia Config de Provider local, credenciais de conta ou snapshot do Registry como fato de execução remoto.

## 12. Resultado da integração na implementação

| Área                            | Resultado do M3                                                                          |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| Overlay de Provider             | Fixo como `built-in -> account -> personal`                                               |
| Entrada do Account Provider Service | Lê apenas a ZCode Built-in Provider Config e não lê o Personal                        |
| Model rules                     | Concatenação de dois arrays, ZCode Built-in e Personal, com Personal depois                |
| Objeto de resolução das Model rules | Usa o `providerId / modelId / api.type` final do Effective Provider                     |
| `/client/configs`               | Remove fatos estáticos de Provider / Model, fallback do protocolo antigo e resolução de `magic_name` |
| reasoning                       | A estratégia por modelo específico entra nas Built-in Rules; o Adapter mantém só a serialização de protocolo |
| OffPeak                         | Built-in Provider oculto entra no Registry comum; Request Auth é injetado por requisição  |
| Video                           | A capacidade é lida só da Effective Model Config; processamento de mídia, persistência e conversão da requisição mantêm o comportamento do staging |
| Configurações de modelo         | Text fixo, Image / Video editáveis, salvos como Personal Model Config Rules               |

Documentos anteriores que ainda registrem Account sobrepondo por último, sincronização de fatos remotos ou hardcode de modelo específico só podem servir como registro histórico de implementação e não como base da semântica atual.

## 13. Escopo de impacto e invariantes

Esta mudança pertence a `option-source + validation + persistence + commit-effect` e não altera diretamente o protocolo de conversa, a fila nem a semântica de replay.

| Nível           | Superfície de impacto                                                            | Motivo                                              |
| --------------- | ------------------------------------------------------------------------------- | --------------------------------------------------- |
| must-inspect   | Resolver de `packages/provider`, Account Provider Service, Registry               | Override de configuração e owner do fato final       |
| must-inspect   | Sincronização de Provider / Model em `/client/configs`                           | A antiga fonte remota de fatos precisa sair          |
| must-inspect   | CLI ModelFactory, política de reasoning, API adapters                            | As Model Rules precisam gerar a mesma requisição final |
| must-inspect   | Origem de modelo do OffPeak com escopo de execução                                | Fronteira entre configuração estática e material de acesso do turno |
| should-inspect | Provider Settings, candidatos de seleção de modelo                               | Ambos consomem o Registry, mas cada um salva semântica própria |
| should-inspect | Availability de Start/Coding/Team Plan                                            | Só o Start Plan retorna ID de modelo dinâmico        |
| conditional    | Configurações de Video / modality                                                | Nova capacidade do staging entrando na Effective Model Config |
| invariant-only | desktop continuous / mobile replayable                                           | O fechamento de Provider não pode alterar a semântica de recuperação de mensagens |
| invariant-only | workspace local / remoto                                                          | O ambiente remoto continua tendo sua própria configuração de execução |

Deve ser mantido:

1. a Personal Provider Config vale por último;
2. o Account só restringe os Providers de conta dentro do Built-in e não toca nos Providers customizados do Personal;
3. as Personal Model Config Rules vêm depois das ZCode Built-in Rules;
4. as Model Rules resolvem o API type final da Effective Provider Config;
5. `models[]` é override de lista inteira de membros do Provider e não é silenciosamente transformado em interseção de autorização;
6. um Provider de API comum ainda pode salvar API Key estática; a Config de Provider do tipo conta não gerencia credenciais de conta;
7. o servidor é sempre a autoridade final de autenticação e autorização;
8. um Active Model já criado não sofre hot update de settings;
9. o Desktop não envia Config de Provider local nem snapshot de credenciais para o Remote Environment;
10. não se restaura o Provider Store antigo, Catalog, Workspace Snapshot ou fallback do Runtime como fonte de fato de modelo.

## 14. Ordem de implementação

M3 é executado na seguinte ordem:

1. primeiro escrever as decisões deste documento como testes do resolver de Provider, do Account Service, das Model Rules e da camada wire;
2. executar o modo de integração de staging decidido pelo usuário, preservando as implementações de produto do staging fora do domínio de Provider;
3. traduzir os fatos estáticos de Provider / Model do staging para a Built-in Config e as Model Rules;
4. conectar Video e a UI de input/output format sem restaurar o Store antigo, o Catalog ou o Snapshot;
5. remover a sincronização de Provider/Model de `/client/configs`, o fallback do protocolo antigo e o hardcode de modelo específico;
6. fechar a origem dos fatos estáticos do OffPeak; o Provider completo entra no Registry e o material de acesso é injetado por requisição;
7. usar uma auditoria de referências para confirmar que as entradas antigas e os casos especiais de modelo saíram;
8. atualizar os documentos de arquitetura que ainda usam a ordem de camadas antiga.

## 15. Aceitação

A conclusão da implementação precisa provar:

- a ordem de overlay de Provider é Built-in -> Account -> Personal;
- o Account Service não lê Personal Providers;
- as Model Rules são a concatenação dos arrays ZCode Built-in + Personal e atuam sobre o Effective Provider;
- o conjunto dinâmico de modelos do Start Plan sobrescreve corretamente o conjunto padrão do Built-in, e Coding/Team Plan continuam mantendo os models do Built-in;
- API Key comum e credenciais de conta seguem seus caminhos corretos de configuração/resolução;
- `/client/configs` não entrega mais fatos estáticos de Provider / Model Registry;
- todo hardcode de reasoning por modelo específico foi removido;
- o comportamento final de requisição HTTP de `ox-alpha` e dos outros modelos suportados não regrediu;
- os fatos estáticos de modelo do OffPeak vêm de Built-in/Rules e o material de acesso do turno único não é persistido como Provider comum;
- capacidades como Video e Image vêm da Effective Model Config;
- o Active Model atual, a posse Local/Remote e a semântica de mensagens desktop/mobile permanecem inalteradas;
- Typecheck, Lint e os testes de Provider/Registry/Account/Adapter wire/OffPeak/Settings passam.

A topologia de integração desta rodada já foi decidida como merge local; o tratamento posterior das branches remotas continua sendo decidido separadamente pelo usuário e não faz parte deste commit.

## 16. Registro de implementação

Esta rodada concluiu a implementação usando `origin/staging@bcb119437370b74b6460b89975afae2ef5cdea33` como base do merge local:

- o resolver de Provider e o Account Provider Service foram fechados como Built-in -> Account -> Personal;
- o comportamento de reasoning de `ox-alpha`, `GLM-x-preview-f` e `x-preview-f-free` entrou nas Built-in Rules;
- a Default Policy não sintetiza mais fatos estáticos do Registry por nome de modelo;
- a resolução, sincronização e os matchers remotos de fatos de Provider / Model de `/client/configs` foram removidos;
- `builtin:offpeak-idle-plan` é hoje fornecido com membros estáticos pelo intermediário não publicado `executionOnly`; o M4 vai mudá-lo para o `visibility: "hidden"` genérico, com Endpoint completo e `request-auth`, sem manter esse campo intermediário;
- Video, Image e reasoning consomem apenas a Effective Model Config;
- Video do staging, edição de modality de modelo e as demais mudanças de produto de staging fora do domínio de Provider foram preservadas.

### 16.1 Resultados de verificação

| Escopo de verificação                                        | Resultado                                                                                                                             |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                                            | Passou                                                                                                                               |
| `pnpm --dir apps/zcode-cli -r --if-present typecheck`       | Passou; todos os pacotes de workspace da CLI com script de typecheck passaram                                                       |
| `pnpm lint`                                                 | Passou; 0 erro e 39 warnings já existentes do staging                                                                                |
| Testes unitários focados de Provider / Account / Registry / OffPeak / Settings | 9 arquivos e 117 testes passando                                                             |
| Testes unitários focados de CLI Video / reasoning / Registry | 13 arquivos e 185 testes passando                                                                                                     |
| Testes unitários focados no fechamento de conflitos de configuração de Provider | 5 arquivos e 93 testes passando                                                                                      |
| `pnpm test:unit`                                            | 12.296 passando, 25 pulados, 30 falhando; as falhas estão somente em 7 arquivos de teste de empacotamento Windows, notarialização macOS e ambiente nativo CUA, sem interseção com as mudanças de Provider / Model desta rodada |
| `oxfmt --check` nos 78 arquivos modificados/novos desta rodada | Passou                                                                                                                              |
| `git diff --check`                                          | Passou                                                                                                                               |

O `pnpm fmt:check` em nível de repositório continua sendo bloqueado pelo binário `apps/zcode-cli/tests/gb2312.js` já existente e pelo fixture HTML do Electron usado para testar falha de parsing, e por isso esta rodada usa a verificação de formatação dos arquivos realmente modificados/novos como gate de mudança, sem reescrever esses fixtures não relacionados.

Esta rodada gera apenas um merge commit local, sem push e sem reescrever branches remotas.