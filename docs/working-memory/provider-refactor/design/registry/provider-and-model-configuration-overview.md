# Visão Geral do Sistema de Configuração de Provider e Model

> Status: síntese das decisões atuais; não substitui os contratos exatos de campo dos desenhos temáticos individuais
>
> Última atualização: 2026-09-01

Este documento explica, em uma narrativa completa, as decisões de produto e de domínio já confirmadas para o sistema de configuração de Provider e Model do ZCode. Ele responde apenas "o que é o sistema, aonde cada fato pertence e como tudo passa a valer"; não descreve como o código antigo é migrado nem guarda passos de implementação.

## 1. O que o sistema deve finalmente entregar

A configuração de Provider e de Model serve ao mesmo objetivo: ajudar o usuário a encapsular uma chamada de API de modelo.

```text
Provider Config 路径                         Model Config 路径
====================                       =================

ZCode Built-in Provider Templates          ZCode Built-in Model Config Rules
        + Account Providers                             |
              |                                         +
              v                            Personal Model Config Rules
Account Built-in Provider Config                        |
              |                                         v
              v                            Effective Model Config Rules
    Personal Provider Config                            |
              |                                         |
              v                                         |
    Effective Provider Config                           |
    ├─ identity / template / group                     |
    ├─ API schema / Endpoint                           |
    ├─ Access                                           |
    ├─ visibility                                       |
    ├─ Built-in / Personal model members                |
    └─ model order                                      |
              |                                         |
              +-------------------+---------------------+
                                  |
                                  | providerId / modelId /
                                  | api.type / baseURL
                                  v
                       Effective Model Config
                       ├─ enabled
                       ├─ properties
                       ├─ optionSpecs
                       │  └─ per-option raw-body map
                       └─必要的请求编码事实
                                  |
                                  v
                    Provider / Model 完整性校验
                                  |
                                  v
                         Provider Registry
                                  |
                                  | ModelSelection
                                  v
                            ModelFactory
                                  |
                                  v
                           Model -> Adapter -> API
```

O caminho à esquerda responde "quais Providers o Environment atual tem ao final, quais modelos cada Provider tem e como acessar o serviço"; o caminho à direita responde "quais capacidades um modelo tem, quais parâmetros podem ser escolhidos e como esses parâmetros mapeiam para a API de destino". Os dois caminhos só convergem na resolução final do modelo e não se fazem passar um pelo outro.

Os materiais de acesso necessários à chamada final podem vir diretamente da Config ou ser obtidos no momento da requisição. A Provider Config do tipo conta não gerencia credenciais dinâmicas da conta; os serviços de conexão de conta e de autenticação da requisição fornecem os materiais em tempo de execução, e o servidor continua responsável pela autorização final. Um API Provider comum pode salvar a API Key diretamente na Personal Config.

## 2. Cinco fontes de entrada de configuração

O sistema tem apenas cinco fontes de entrada de configuração:

| Fonte                              | Significado                                                          |
| --------------------------------- | ------------------------------------------------------------- |
| ZCode Built-in Provider Config    | Os Account Providers publicados pelo ZCode e os Provider Templates reutilizáveis |
| Account Built-in Provider Config  | Restrições adicionais da conta atual sobre os Built-in account providers |
| Personal Provider Config          | Providers criados pelo usuário e a sobrescrita final do usuário sobre providers existentes       |
| ZCode Built-in Model Config Rules | Os fatos estáticos de modelo e o mapeamento de API publicados pelo ZCode                           |
| Personal Model Config Rules       | Sobrescritas posteriores e esparsas do usuário sobre fatos de modelo                                  |

Cada fonte tem seu próprio Schema de entrada estrito. Os cinco Schemas restringem "o que esta fonte pode escrever", mas depois de entrar na resolução de domínio continua-se usando a linguagem comum de Provider Config, Model Config e Overlay; não se criam cinco conjuntos de tipos de Runtime.

A ordem do Provider Overlay é fixa:

```text
Provider Template? -> ZCode Built-in Account Provider? -> Account Overlay? -> Personal
                                                                      |
                                                                      v
                                                       Effective Provider Config
```

Portanto, Personal é sempre a sobrescrita final do usuário. A responsabilidade da Account é apenas restringir ainda mais os Providers relacionados a conta dentro do ZCode Built-in; ela não lê, não modifica nem restringe Providers exclusivos de Personal.

A relação dos Model Rules não são três camadas de Provider Overlay, mas a concatenação de dois arrays ordenados:

```text
ZCode Built-in Model Config Rules
                  +
Personal Model Config Rules
                  |
                  v
Effective Model Config Rules
```

As Personal Rules vêm depois. Cada Rule sobrescreve apenas os itens de configuração que ela própria fornece explicitamente; Rule não é responsável por criar membros de modelo.

Overlay é um mecanismo e uma semântica natural, reutilizável de composição de configuração: ela especifica como o mesmo slot de configuração herda, sobrescreve e é limpo entre múltiplas camadas de entrada. O domínio de Provider/Model usa esse mecanismo para implementar sua própria semântica de domínio e define por conta própria o espaço de configuração, a composição de membros, os estados padrão e as operações de ciclo de vida. Overlay não é uma abstração onipotente capaz de expressar naturalmente qualquer semântica de negócio; a estrutura de configuração deve obedecer ao modelo de domínio, e não ser moldada retroativamente pela semântica do produto pelas capacidades já prontas do Overlay.

## 3. O significado exato de Built-in

`Built-in` indica apenas que aquele Provider ou membro de Model é fornecido pelos fatos embutidos do ZCode; não indica:

- que se usa uma conta ZCode;
- que já se tem permissão de acesso;
- que as credenciais já estão configuradas;
- que está habilitado por padrão;
- que certamente aparece no seletor de modelos.

Um Provider Template não é um Provider e não tem `providerId`, `group`, estado de execução ou identidade de Registry. Ele apenas fornece uma linha de base de herança Built-in reutilizável ao criar um Personal Provider. O Template usa um invólucro de domínio para guardar seu próprio Overlay de `nameMap` e `config` internos; os Model Config Rules continuam mantidos centralmente e não entram nesse invólucro. As únicas raízes de Provider reais são o Account Built-in Provider e o Personal Provider.

O Account Provider usa `group` explícito para expressar a Family; um Personal Provider comum usa sempre `standard-personal`.

Aqui é preciso distinguir entrada esparsa de resultado completo:

```text
Provider Template
└─ 以 templateId 为键；不声明 group，也不进入 Registry

Account Built-in Provider 根声明
└─ group = zai-family | bigmodel-family

Personal Provider 根声明
├─ group = standard-personal
└─ templateId? 指向可选的 Built-in Template 基线

Account / 已有 Provider 的 Personal Overlay
└─ 不提供 group，也无权改变它

Effective Provider / Registry / Settings DTO
└─ group 必须是完整值
```

Portanto, o Provider não guarda mais um booleano `builtin` extra, e também não existe um Concrete Provider `standard-builtin`. A Settings View devolve diretamente o `templateConfig?`, `effectiveBuiltinConfig?`, `personalConfig?` e `effectiveConfig` exatos, e o Renderer não adivinha a origem por ID ou por agrupamento. A origem Built-in do Model também não é escrita no Model Rule; o Host produz a origem derivada necessária para exibição e operação conforme o membro venha de `builtinModelIds` ou de `modelIds`. Quando Built-in e Personal têm o mesmo ID, forma-se apenas um membro Built-in.

## 4. O que a Provider Config responde

A Provider Config responde pelos fatos de montagem do lado do Provider para a chamada de API de modelo:

```text
Provider Config
├─ providerId / templateId? / group / label / logo
├─ visibility
├─ api.type / baseURL / static headers
├─ access
├─ builtinModelIds
├─ modelIds
└─ modelOrder
```

`visibility=hidden` oculta apenas os Settings e a Selection comuns; um Provider hidden com configuração completa e habilitada ainda pode ser usado com precisão por produtos internos através do Registry comum e do ModelFactory. O sistema não guarda `selectable` de Provider.

O Provider não tem `enabled` no nível raiz. Assim que um Personal Provider é criado, sua definição permanece nos Settings; quando a configuração está incompleta ele ainda pode continuar sendo editado, apenas não entra no Registry executável. Um Account Provider entra fixamente na Family correspondente, e a elegibilidade da conta é expressa apenas por `zhipu-account access.entitled`. O interruptor de execução de um Model continua sendo expresso por `enabled` do Model Config.

## 5. Membros de modelo, habilitação e ordem

Os três arrays de modelos do Provider têm um único significado cada:

```text
builtinModelIds
└─ ZCode Built-in 或 Account Built-in 管理的成员

modelIds
└─ 用户管理的 Personal 成员

modelOrder
└─ 用户整理后的完整显示顺序
```

Os membros vêm apenas de `builtinModelIds + modelIds`. O `modelOrder` não pode criar nem habilitar membros; a Model Config Rule também não pode criar membros.

Quando Built-in e Personal têm o mesmo ID, o Built-in tem precedência. Havendo IDs duplicados dentro de um único array, mantém-se a primeira ocorrência. Na leitura, itens duplicados posteriores são ignorados de forma determinística, sem construir um objeto de conflito; a página de configurações comum proíbe o usuário de escrever duplicidades e normaliza junto ao salvar da próxima vez os arrays do Provider em questão.

A habilitação de um modelo pertence ao `enabled` do Model Config. A Rule Built-in genérica fornece valores padrão completos; uma Rule Built-in específica pode definir como `false` por padrão modelos antigos obsoletos ou não recomendados; as Personal Rules específicas vêm depois das Built-in Rules e podem sobrescrever apenas a folha `enabled` de um determinado Provider/Model. Modelos desabilitados continuam visíveis nos Settings e preservam sua própria configuração e ordenação, mas não podem ser executados, testados, usados como fallback nem criados com precisão.

A ordenação básica dos modelos é unificada como:

```text
未出现在 modelOrder 中的 Built-in
                +
modelOrder 中仍有效的成员
                +
未出现在 modelOrder 中的 Personal
```

Quando a página de configurações comum cria um novo Personal Model, ela atualiza `modelIds` e o `modelOrder` completo na mesma gravação atômica, e cria a Rule Personal específica daquele modelo, escrevendo explicitamente `enabled=true`. Portanto, "Personal não ordenado" trata apenas de configurações escritas à mão pelo usuário, incompletas ou que contornaram a página de configurações comum; um modelo novo adicionado normalmente não cai no terceiro trecho. Quando o usuário arrasta um item, também é salvo o orden completo de todos os membros válidos no momento, limpando IDs stale/duplicate.

A ordenação de Providers usa o `providerOrder` de topo do Personal e não se apoia mais na ordem de inserção do mapa de Providers para expressar a ordenação do usuário. As Account Families Z.ai/BigModel continuam como regiões fixas de produto e não participam do arrastar comum de Providers; todos os Personal Providers participam uniformemente da ordenação comum. Ao criar uma instância de Template ou um Provider totalmente customizado, deve-se gravar junto o orden completo atual dos Providers comuns em `providerOrder`; o trecho final não ordenado tem apenas o papel de normalização determinística de entradas externas escritas à mão ou anômalas.

## 6. Enabled, Executable e Selectable

As três palavras pertencem a camadas diferentes:

```text
Enabled
└─ Effective Model Config.enabled

Executable
└─ 当前目标 Host 完成成员、启用和完整性解析后的 Registry 结果

Selectable
└─ Executable 结果再经过普通用户可见性过滤后的 Selection View
```

A relação entre os conjuntos é:

```text
Selectable Models
    ⊆
Executable Models
    ⊆
Enabled Models ⊆ Provider Model Members
```

Nem `executable` nem `selectable` são campos de Config. Entrar no Registry já significa executable; entrar na Model Selection View já significa selectable. Os Settings podem devolver estados derivados e issues concretos para fins de exibição, mas não podem salvá-los de volta como fatos.

O Provider não precisa de um `selectable` independente. Se um Provider aparece ou não na interface de seleção de modelos depende apenas de ele ser visible e ter pelo menos um Model selectable.

## 7. O que as Model Config Rules respondem

O Model Config responde apenas pelos fatos de um modelo ou da combinação modelo/API:

```text
Model Config
├─ enabled
├─ properties
│  ├─ contextWindow
│  ├─ input_format / output_format
│  ├─ supportsToolCall
│  ├─ supportsJsonSchemaOutput
│  ├─ supportsNativeWebSearch
│  └─ supportsMidConversationSystem
├─ optionSpecs
│  ├─ reasoningLevel.values/map
│  └─ maxOutputTokens.max/map
├─ requiresMfjsToolSchema
└─ 经证据确认、确属请求编码的窄兼容事实
```

O `map` de cada Option gera diretamente um RFC 7396 Patch do Request Body JSON bruto da API de destino; não existem `reasoningMapping` independente, mapeamento de AI SDK Provider Options nem autoridade duplicada para o campo max-output. O contrato exato está em [`../model/model-option-map.md`](../model/model-option-map.md).

O Model Config não inclui `visibility` do modelo, Access do Provider, credenciais, membros nem ordenação. O modelo não tem um segundo conjunto de visibility; se um usuário comum consegue ver o modelo é decidido pela Selection View formada conjuntamente pela visibility do Provider e pelo enabled do Model.

As Personal Rules se dividem em duas categorias:

```ts
type ModelConfigRule =
  | {
      type: "provider-model";
      providerId: string;
      modelId: string;
      config: ModelConfig;
    }
  | {
      type: "match";
      providerMatch?: string;
      modelMatch: string;
      apiMatch?: string;
      baseURLMatch?: string;
      config: ModelConfig;
    };
```

A combinação Effective é fixada em `ZCode Built-in Rules + Personal provider-model Rules`.

Personal permite somente a sobrescrita exata por `providerId + modelId`; a página de configurações não pode fabricar regras de casamento globais reescrevendo a disposição física do JSON.

Tanto a fonte Built-in quanto a Personal podem usar `type="provider-model"`: ele expressa que o fato pertence apenas a uma combinação exata de Provider/Model. As Rules exclusively Built-in são gerenciadas pelo ZCode Built-in Release e não são afetadas pelas operações de ciclo de vida da página de configurações; as Rules exclusivamente Personal são gerenciadas pela página de configurações — movidas quando um Personal Model é renomeado, removidas quando ele é excluído, e removidas junto ao excluir o Personal Overlay de um Provider.

Apenas a fonte Built-in pode usar `type="match"` para expressar um conjunto de alvos. Personal não guarda nem lê Match Rules globais; as Rules específicas usam IDs estruturados, sem necessidade de escapar IDs para expressões regulares e sem usar a marcação `exclusive=true`, fácil de interpretar errado.

Uma Rule pode usar `modelMatch`, `providerMatch`, `apiMatch` e `baseURLMatch` conforme necessário, com base em fatos reais. Isso não equivale a hardcodar modelos no código de negócio: tanto o casamento quanto os valores de configuração pertencem às Built-in/Personal Rules, e Adapter e Runtime apenas leem o resultado final resolvido.

A ordenação estável das Built-in Rules é a especificação de autoria dos arquivos publicados, não uma prioridade dinâmica de runtime: depois de um fallback completo e conservador, colocam-se sucessivamente Model Match, Model + API Match, Model + API + Endpoint Match, o Match com escopo de Provider válido para todos os membros e um pequeno número de Provider-Model Exact Rules; famílias de modelos iguais ficam em sequência. O `modelMatch` faz casamento por expressão regular insensível a maiúsculas ASCII sobre o Model ID completo; os outros matchers seguem seus respectivos contratos. As Rules continuam sendo aplicadas apenas na ordem física do array, e um acerto posterior sobrescreve o anterior. A especificação completa de manutenção está em [`zcode-builtin-provider-config.md`](./zcode-builtin-provider-config.md).

## 8. Formatos de entrada e saída dos modelos

Config, Registry, Model, Runtime, Adapter e o protocolo usam a mesma estrutura real:

```ts
properties: {
  input_format: {
    support_text: boolean;
    support_image: boolean;
    support_video: boolean;
    support_audio: boolean;
    support_pdf: boolean;
  }
  output_format: {
    support_text: boolean;
  }
}
```

Não é criado um DTO de capabilities achatado, nem derivado outro conjunto de fatos de mídia a partir do modelId, do tipo de Provider ou do modelo padrão da Session. O PDF continua participando das verificações reais de requisição e da cadeia de codificação existente; o Audio existe atualmente apenas como fato estático completo. A página de configurações exibe apenas o Text travado e os campos Image/Video/PDF editáveis; o Audio oculto precisa ser preservado tal como está ao editar os demais campos.

## 9. Provider Access e compatibilidade de requisição

`access.type` descreve como os materiais de acesso são obtidos; `api.type` descreve qual protocolo público a requisição usa; os dois são ortogonais. O protocolo de produto da Zhipu usa Access Modes limitados:

```text
zhipu-account/start-plan
└─ 官方版本访问安全校验

zhipu-account/individual-coding-plan | team-coding-plan
└─ ZCode V4 transport 请求证明准入；不扩散给普通 api-key Provider

zhipu-account/off-peak
└─ Off-Peak 排队、Ticket 与重试协议入口
```

Nenhum desses campos é uma capability de Model. Materiais dinâmicos de verificação de segurança, Runtime Key, JWT, Off-Peak Ticket e rollout remoto não entram na Config.

As decisões de compatibilidade já confirmadas são:

- reasoning compatível com OpenAI usa o histórico canônico real e a codificação nativa do SDK atual, removendo a reprodução especial do ZCode;
- `omitMaxOutputTokens` do GitHub Copilot foi removido;
- Snowflake Cortex não é suportado no momento; a reescrita de campos de saída dedicados foi removida;
- a verificação de segurança de acesso da versão oficial e o execution protocol de Off-Peak são despachados por `zhipu-account.mode`;
- `requiresMfjsToolSchema` permanece no Model Config, só converte quando ligado explicitamente e reporta erro em caso de falha;
- o empty thinking sintético Anthropic do DeepSeek foi removido; resta apenas a reprodução real do reasoning canônico;
- candidatos de assinatura text/tool do Z.AI que não entraram na linha de base atual não são adotados.

O princípio padrão de reprodução de histórico é: o que o servidor retornar de fato é repassado por completo no turno seguinte do mesmo modelo. O Adapter pode projetar campos reais sem perda, mas não pode fabricar reasoning, thinking ou signature que não existem.

## 10. Semântica de produto dos Settings

A página de configurações edita apenas a Personal Config pertencente ao Environment Host alvo. Um workspace local usa o Local Host; um workspace remoto usa o Remote Host. O Renderer não faz Overlay, ordenação, julgamento de origem, criação de fallback nem usa configuração local para se passar por fato remoto.

A página de configurações oferece duas entradas:

```text
添加供应商
└─ 从 Provider Templates 中选择
   └─ 使用当前语言的 Template 名称作为种子，原子创建具有唯一 providerId/label 的 Personal Provider 并进入编辑

创建自定义供应商
└─ 立即创建 Personal-only Provider 并进入编辑
```

A criação tem efeito imediato, não cria um rascunho temporário de Provider que exista apenas no Renderer, e não exige mais que o usuário clique em um segundo "criar" em páginas parecidas. O Provider ID nunca é editável; o Provider Name é um label independente, editável e único de forma insensível a maiúsculas. As Families Z.ai/BigModel mantêm a organização de produto por conta existente e não se fragmentam por causa do ciclo de vida de um Provider Template comum. As APIs Z.AI API e BigModel API também são apenas Templates comuns e não ocupam a forma de conexão de Family.

A seleção de Template acontece pela entrada superior, na área de detalhes à direita, usando diretamente a ordem de Templates e os nomes multilíngues publicados pela Settings View, sem nova fonte de dados de catálogo. A imagem de marca do Provider é determinada apenas pelo `logo` da Effective Provider Config; a tabela de recursos da UI serve somente para carregar keys Built-in abertas como material empacotado, e uma key desconhecida volta ao ícone genérico sem afetar a execução.

O Provider não tem `enabled` no nível raiz. A existência da definição de um Personal Provider significa que ele pertence aos Settings; quando API Key, Endpoint etc. ainda não estão preenchidos ele pode ser salvo e editado, mas não entra no Registry executável. Um Account Provider é exibido fixamente na Family, e `access.entitled` expressa apenas os direitos da conta. O posicionamento nos Settings e o consumo executable do Registry usam o mesmo conjunto de fatos, mas não são a mesma conclusão.

Na UI, o significado de domínio de "excluir fornecedor" é excluir aquela instância de Personal Provider:

```text
group = standard-personal
└─ 删除其 Personal 根定义、模型专属 Rule 与顺序成员

group = zai-family | bigmodel-family
└─ Account Provider 由 Built-in 发布，不提供删除操作
```

O sistema nunca exclui um Provider Template ou um Account Built-in Config. Um Built-in Model não exibe botão de exclusão; um Personal Model pode ser excluído ou ter seu ID alterado. Ambos os tipos de modelo podem ser habilitados/desabilitados e ordenados. A Personal Model Config Rule registra apenas a sobrescrita esparsa feita pelo usuário e não é responsável por conceder permissão de edição; se um campo pode ser editado e se um membro de modelo pode ser renomeado/excluído são duas fronteiras de produto independentes.

A página de edição de Model mantém apenas a Personal Rule esparsa. Os valores herdados/efetivos de texto, número e JSON são exibidos como placeholder, sem criar uma prévia somente leitura, e há um único "restaurar tudo para o padrão" que limpa todas as sobrescritas de Personal Rules daquele modelo; o interruptor `enabled` da lista de modelos sempre salva um booleano explícito e não exibe um "restaurar padrão" por item. Outras folhas booleanas que permitem herança usam um controle unificado: o valor Effective determina a marcação, uma folha Personal explícita é expressa por uma borda de alta saturação, e nenhum texto "padrão/modificado" é acrescentado. As Model Properties e os valores de Option abertos pelo produto são editáveis na primeira versão; o Option Spec Map é configuração oculta e é preservado tal como está ao editar os demais campos. `requiresMfjsToolSchema` fica por último. O protocolo de produto de Provider Access não entra na página comum de edição de Model.

Quando o Personal Model ID muda, é preciso primeiro mover, na semântica de prévia, a Personal exact Rule correspondente para o novo ID, depois re-resolver as Built-in Rules usando o novo ID com a API/Endpoint final do Provider, e só então sobrepor os valores Personal esparsos originais. Assim apenas os padrões herdados mudam e os valores já preenchidos pelo usuário não são sobrescritos.

## 11. Publicação Built-in e Client Config

O ZCode Built-in Provider Config e as Model Config Rules são publicados como um Release atômico, sem serem divididos em dois campos remotos que possam ficar desencontrados. A configuração do repositório/pacote de instalação é o fallback básico antes do pull e quando o pull falha; o último Release remoto aceito com sucesso pelo Environment atual é o Active/LKG; um resultado remoto bem-sucedido substitui por inteiro a mesma Built-in Source, sem entrelaçar com a Bundled.

Cada Environment usa seu próprio Endpoint de plano de controle, seu Active/LKG e seu Registry. O Host remoto escolhe e atualiza por conta própria o Built-in Release do Environment remoto; o Desktop Renderer não empurra o Release local para o ambiente de execução remoto.

LKG significa apenas Last Known Good e não garante ser mais novo que o pacote de instalação. Apenas um Active/LKG cujo Schema é compatível e cuja revision é superior à Bundled pode ter prioridade; em caso de incompatibilidade, corrupção ou versão mais antiga, há fallback para a Bundled.

## 12. Fatos que ainda aguardam decisão

As questões abaixo ainda não se tornaram fatos do desenho atual:

1. Se o DeepSeek Anthropic-compatible realmente exige synthetic empty thinking; isso precisa ser respondido com requisições A/B reais.
2. OpenRouter, OpenCode Zen, Azure, Volcano Ark e AWS Bedrock foram movidos para
   [`Todo 22`](../../steps/todo-22-additional-builtin-providers-and-cloud-access.md) e não ampliam mais o Todo 21. O Provider nativo do Google e o Vertex AI não são suportados no momento.

Essas questões alteram fatos salvos ou o escopo de suporte e devem ser decididas antes de serem escritas em Schemas precisos e no desenho de interação; os demais detalhes de implementação não podem substituir a decisão.