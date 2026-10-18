# 23 Lacunas de decisão do Provider Refactor e consolidação das transações de Settings

> Verificação de atribuição atualizada (2026-09-09): a dívida residual de subteste/falha/promoção manual deste documento é transferida para [Todo102](todo-102-verification-debt-closeout.md), encerrando o agendamento de verificação independente aqui; as evidências históricas são preservadas, e a transferência não significa que os testes passaram.

> Status: concluído (consolidação de automação; a reverificação interativa no Electron do macOS acompanha o desenvolvimento)
>
> Data: 2026-08-27
>
> Origem: revisão reversa após a declaração de conclusão do Provider Refactor
>
> Tarefas relacionadas: [`05`](./todo-05-model-ref-retirement.md),
> [`07`](./todo-07-account-connection-selection-and-access-context-cutover.md),
> [`12`](./todo-12-model-selection-validation-boundary-cutover.md),
> [`13`](./todo-13-target-host-model-selection-authority.md),
> [`14`](./todo-14-post-refactor-mechanical-zero.md),
> [`15`](./todo-15-provider-release-validation.md),
> [`20`](./todo-20-account-overlay-atomicity-and-review-closeout.md),
> [`21`](./todo-21-zcode-builtin-config-ownership-and-model-activation-order.md)

## 0. Posicionamento da tarefa

Este Todo consolida as decisões do Provider Refactor que já estão claras, mas não entraram por completo na implementação atual. Não é uma nova reescrita de arquitetura, e não rediscute o Provider group, Model enabled, Builtin-wins, Provider/Model order, Rule exclusiva, Access protocol ou a fonte autoritativa do Host, que já foram corretamente implementados.

Os problemas encontrados nesta revisão se dividem em três categorias:

1. abstrações antigas que continuam em vigor depois de renomeadas, por exemplo `ForkModelRef`;
2. itens declarados concluídos no Todo/Design, mas que a implementação não atende, por exemplo o salvamento atômico da edição de Model e o estado herdado;
3. itens já decididos na discussão, mas que não entraram no Todo/Design oficial, por exemplo a aposentadoria do `accessId` público e o editor simplificado para Provider Built-in comum.

Ao fim, a cadeia principal precisa voltar a satisfazer:

```text
未来执行意图
    ModelSelection
          |
          v
Provider Registry + ModelFactory
          |
          v
      Active Model
          |
          +--> Account 请求期鉴权（账号服务拥有当前连接和凭据）
          `--> Adapter / AI SDK

Provider/Model Settings
    Host View @ revision R1
          |
          v
      Local Draft
          |
          v
一次原子 Host Mutation
          |
          v
Persist + Registry @ revision R2
```

### 0.1 Decisões que não são reabertas neste ciclo

- `modelMatch` faz correspondência completa por regex, case-insensitive, sobre o Model ID completo; quando for preciso incluir correspondência, o autor da Rule escreve explicitamente `.*` antes e depois, e o Resolver
  não completa automaticamente;
- a semântica existente de Provider group, Provider visibility e Provider/Model enabled permanece inalterada;
- Provider/Model order, Builtin-wins, os cinco Source Schema e a Rule exclusiva de `provider-model` permanecem inalterados;
- Model Config, Runtime e Protocol continuam compartilhando `properties.input_format/output_format`;
- workspace local usa Local Host e workspace remoto usa Remote Host; o Renderer não recupera a autoridade de configuração;
- não criar `ModelIdentity`, um segundo Registry, um segundo conjunto de capability DTO ou uma nova abstração de Config Document.

### 0.2 Não é objetivo

- OpenRouter, OpenCode Zen, Azure, Volcano Ark e AWS Bedrock, adiados no Todo 22;
- refatoração do Service público global de Client Config;
- refatoração do design geral de Telemetry;
- mudar o erro em string de Off-Peak para um protocolo estruturado;
- mudanças de produto no ciclo de vida de Conversation queue, continuous/replayable, workspace identity ou seleção de modelo;
- adicionar dual-read, alias de compatibilidade ou migration desnecessário para branches ainda não publicados.

## 1. Problemas confirmados e estado-alvo

| Número | Problema atual | Estado-alvo |
| --- | --- | --- |
| G1 | `accessId` entra simultaneamente no Account Overlay, Provider Config, Protocol, Credential key, Request Auth e UI | removido pelo Todo 24; o serviço de contas resolve a conexão compatível atual por family/planKind estáticos |
| G2 | `ForkModelRef { providerId, modelId, variant }` é um alias com a mesma forma do antigo `ModelRef` | a intenção futura de execução usa diretamente `ModelSelection`, e `variant` sai de cena |
| G3 | `formatModelSelection()` não consegue preservar `maxOutputTokens`, e a string continua sendo tratada como formato de domínio reversível | estado, protocolo e persistência só transportam o `ModelSelection` estruturado; a string é apenas valor de fronteira Picker/Legacy |
| G4 | a edição de Model fecha imediatamente após o submit, e rename e config save são duas Mutations | o Draft completo é submetido por uma única Mutation Host atômica, e o fechamento ocorre após o Registry observar sucesso |
| G5 | ao alterar o Model ID, a Rule exclusiva Personal não é movida primeiro nem o Effective Config é re-visualizado | o Host oferece Preview sem persistência; o novo ID atualiza imediatamente o resultado herdado e os valores explícitos Personal permanecem |
| G6 | a UI copia valores Effective para o Draft Personal, confundindo herança, não definido e sobrescrita explícita | o Draft separa valor Personal de Effective Preview, com a semântica de quatro estados observável, editável e recuperável |
| G7 | Provider Built-in comum e Provider Personal-only reutilizam o editor completo | "Adicionar fornecedor" entra no editor simplificado; "Criar fornecedor personalizado" mantém o editor completo |
| G8 | `adapterCompatibility.reasoningReplay` preserva casos especiais de modelos históricos como uma dimensão oficial de Config | remover o contêiner Compatibility por completo; todos os Adapters executam apenas o replay canônico |
| G9 | a execução e os comentários de Adapter continuam usando a nomenclatura antiga de Registry, e as declarações de conclusão de Todos antigos não batem com o fato do código | normalização mecânica dos nomes; Todos históricos ganham nota de correção, e o roadmap e o Feature Graph são sincronizados após a implementação |

## 2. Access: substituído pelo Todo 24

A versão de conexão de conta e o design antigo de invalidação de Active Model propostos inicialmente por este Todo foram revogados. O contrato atual único de Access está no
Todo 24 (documento mantido apenas na versão oficial), com os pontos principais:

- Built-in fixa `family + planKind`; o Account Overlay só projeta `enabled` e os membros de modelo da conta Start;
- a conta, o produto, o escopo de Team e as credenciais dinâmicas atuais são geridos pelo serviço de contas, e cada requisição resolve pela conexão compatível atual;
- não se salva ID de conexão de conta nem versão de conexão, e não se invalida manualmente o Active Model antigo só porque a conta mudou sob o mesmo `family + planKind`;
- Local, Remote e Standalone usam cada um o serviço de contas do seu Environment, e falham antes da rede quando falta uma conexão compatível.

## 3. ModelSelection e zeragem mecânica do `ModelRef`

### 3.1 Fork usa o `ModelSelection` padrão

Remover o `ForkModelRef` público e seu `variant`:

```text
Fork / Side Chat / Before-input Fork
    后续需要创建 Model
          |
          v
    保存 ModelSelection
    ├─ providerId
    ├─ modelId
    └─ options.reasoningLevel / maxOutputTokens（存在时）
```

Quando uma mensagem histórica tem fatos reais de provider/model/reasoning, mas não tem a escolha futura completa, cabe a esse consumidor decidir explicitamente se consegue construir uma Selection; não se deve criar
outro tipo de Ref/Identity para contornar o julgamento semântico. `Model.options` continua sendo valor de execução já vinculado e não pode ser retroprojetado de forma genérica como escolha futura.

### 3.2 A Selection estruturada é a única representação de domínio

`modelSelectionSchema` continua sendo o único Schema estrito do objeto estruturado. Estes locais só podem guardar ou transmitir o objeto:

- comandos e respostas de Protocol;
- estado de produto como Session/Task/Automation/Subagent/Repo Wiki;
- intenções futuras de execução como Fork/Compact/Child;
- configurações, defaults e parâmetros de envio de modelos do Host e do Agent.

Strings são permitidas apenas em duas fronteiras:

1. o Picker Value exigido pelos controles Select da UI;
2. a leitura explícita de strings Legacy já publicadas.

As funções relacionadas devem ser nomeadas conforme a semântica real como `formatModelPickerValue`, `parseModelPickerValue` ou
`parseLegacyModelSelectionValue`; não se pode continuar afirmando que `parse(format(selection))` recupera a Selection completa com `maxOutputTokens`.
O chamador precisa manter ao mesmo tempo a Selection estruturada e não pode reconstruir e sobrescrever o estado completo a partir do Picker Value.

### 3.3 Semântica de comparação

Não criar um `sameModelSelection()` unificado nem um helper `ModelIdentity`. Cada consumidor continua comparando explicitamente os campos que realmente lhe importam, preservando o comportamento anterior à refatoração:

- ao decidir se o alvo de execução mudou, pode-se comparar apenas `providerId/modelId`;
- ao decidir se a escolha do usuário mudou, cada produto compara explicitamente as folhas de opção que guarda;
- reasoning não entra novamente na identity;
- não alterar resultados de comparação existentes só para reduzir código duplicado.

## 4. Settings: tornar a edição de Model uma transação manual de verdade

### 4.1 Contrato único de submissão

O diálogo de edição de Model continua usando salvamento manual. O Host expõe uma Mutation completa, cuja entrada contém no mínimo:

```ts
interface SavePersonalModelDraftInput {
  providerId: string;
  originalModelId: string;
  nextModelId: string;
  personalConfig: ModelConfigObject;
  basedOnRevision: string | number;
}
```

O nome real pode seguir a nomenclatura existente dos serviços, mas a semântica não pode ser dividida. O Host conclui, na mesma transação:

1. validar membership de Provider/Model, conflito Builtin, Model ID e Source Schema;
2. ao fazer rename do Personal Model, atualizar atomicamente `modelIds` e `modelOrder`;
3. mover a Rule Personal `provider-model` correspondente;
4. salvar o Personal Model Config completo e esparso;
5. persistir e publicar a revision do Registry;
6. devolver a nova Host View/revision já observável.

O diálogo só pode fechar depois de receber a resposta de sucesso. Em caso de falha de validação, persistência, publicação de Registry ou conflito de revision, o Draft e o diálogo são preservados, com um erro explícito;
não se compensa com rollback de duas chamadas no Renderer.

### 4.2 Preview em tempo real do Model ID

O Host oferece um Preview sem persistência e sem mutation de Registry:

```text
Original Personal Rule + Local Draft
              |
              +--> 在预览态把 exact target 移到 nextModelId
              |
              v
按 nextModelId + Effective Provider api/baseURL 解析 Built-in Rules
              |
              v
叠加 Personal Draft 中明确存在的叶子
              |
              v
返回 Effective Preview + validation issues
```

Após alterar o Model ID, um Preview com debounce deve ser executado. Respostas antigas precisam ser descartadas por request sequence ou Draft revision e não podem sobrescrever uma entrada mais nova. O Preview
não altera o arquivo Personal, o membership de Provider, o modelOrder nem o Registry oficial. No salvamento, o Host precisa reexecutar a resolução e a validação autoritativas e não pode confiar no
Preview do Renderer.

### 4.3 Separar Draft dos fatos herdados

O Draft do Renderer não copia mais valores Effective como valor Personal. Cada campo guarda pelo menos:

```ts
interface ModelFieldDraft<T> {
  personal: T | null | undefined;
  inherited: T | undefined;
  effective: T | undefined;
}
```

Não é obrigatório criar mecanicamente esse tipo genérico; pode-se usar a estrutura existente por campo. Os quatro estados semânticos de produto que precisam ser mantidos são:

| Estado | Fato salvo | UI |
| --- | --- | --- |
| upstream tem valor, sem Personal | não escreve Personal | exibe o valor herdado com baixa ênfase |
| upstream não tem valor, sem Personal | não escreve Personal | "não definido"/travessão |
| valor Personal explícito | escreve a folha esparsa correspondente | realce normal, permite voltar à herança |
| explicit clear no Personal | escreve `null`, apenas nos campos que permitem clear | exibe claramente o estado limpo, que não equivale a não sobrescrito |

Entradas numéricas/de texto usam o valor herdado como placeholder; Boolean/Format usam Toggle Chip/Selectable Tag no estilo existente, distinguindo estado por visto, travessão, contorno e uma entrada de desfazer de baixa interferência, e não apenas por cor. PDF/Audio continuam ocultos, mas preservados sem perda. `requiresMfjsToolSchema` fica por último no editor.

### 4.4 Slots de JSON

Continuam existindo três editores JSON independentes:

- `optionSpecs.reasoningLevel`;
- `optionSpecs.maxOutputTokens`;
- `reasoningMapping`.

Cada editor substitui diretamente seu próprio slot Personal, e conteúdo vazio restaura a herança; não há merge por key dentro do editor. O salvamento valida com o Schema autoritativo do Provider e oferece, no mínimo, formatação e erros com caminho de campo; se o editor escolhido entregar coluna e linha de forma confiável, exiba também linha e coluna. A UI não copia o JSON Effective para a caixa de texto Personal; o resultado Effective usa um preview separado e de baixa ênfase.

## 5. Settings: distinguir adição de Built-in e criação de Provider personalizado

As Provider Settings comuns mantêm duas entradas:

```text
添加供应商
└─ 从 group=standard-builtin 且尚无 Personal Overlay 的候选中选择
   └─ 创建/启用 Personal Overlay 后进入简化编辑器
      ├─ API Key
      └─ 模型列表与模型配置

创建自定义供应商
└─ 创建 group=standard-personal 的不完整 Provider
   └─ 进入完整编辑器
      ├─ Provider Name（唯一）
      ├─ API Schema
      ├─ Endpoint / Headers
      ├─ API Key
      └─ 模型列表与模型配置
```

O API Schema, o Endpoint padrão e a identidade de um Provider Built-in comum vêm do Built-in Config e não são reexibidos como campos editáveis comuns no caminho principal de edição.
A remoção sempre remove apenas o Personal Overlay; o Built-in Config nunca é removido. Um Provider Personal-only desaparece naturalmente após a remoção, por não ter base Built-in.
O Provider ID é somente leitura em todas as telas.

O editor simplificado e o editor completo podem reutilizar lista de modelos, API Key e componentes de teste, mas não podem reexpor os campos completos só por reutilizar `InlineEditableProviderCard`. A Family Z.ai/BigModel mantém a UI de Family fixa, não entra nesses dois caminhos comuns e também não oferece operação de disable de Provider.

## 6. Remoção do Adapter Compatibility e zeragem dos nomes

### 6.1 Reasoning replay

O replay histórico canônico não precisa de nenhuma configuração `reasoningReplay`. A decisão final é remover por completo
`adapterCompatibility`, `reasoningReplay` e a projeção de empty-thinking sintético:

```text
Canonical Message
       |
       v
Adapter 标准编码
       |
       v
完整回放真实 reasoning；不删除、不补造空 thinking
```

Model Config Schema, Overlay, Resolver, Registry, Runtime, Built-in Config, Personal Config e fixtures de teste não podem continuar
aceitando nem propagando o contêiner Compatibility. Formatos históricos não publicados não ganham importer; ao encontrar campos antigos, rejeitar pelo Schema estrito.

### 6.2 Nomenclatura da execução de Adapter

Os arquivos de Adapter atuais carregam de fato a montagem da execução de Model do AI SDK e já não são um Registry de negócio. Na conclusão, deve-se:

- nomear os arquivos de execução de Adapter com precisão como `model-execution.ts` / factory;
- remover comentários como "session registry" e "provider registry cache", que não correspondem mais à realidade;
- manter transport/factory/cache que realmente são privados do Adapter, sem introduzir novas abstrações públicas só por causa da renomeação;
- não copiar de volta Config de Provider e Config de Model de negócio como um Registry consultável pelo Adapter.

## 7. Impact Brief

### 7.1 Resumo funcional

| Campo | Conclusão |
| --- | --- |
| Developer intent | consolidar as lacunas de access público, ModelSelection e transação de Settings decididas mas não implementadas no Provider Refactor |
| Capability | Provider Registry, Account Request Auth, Model Selection, Provider Settings |
| Change layer | `draft-default`, `validation`, `commit-effect`, `persistence`, `presentation` |
| Operating mode | planning / implementation handoff |
| Primary seeds | `ZhipuAccountAccessConfig`, `AccountProviderCredentialService`, `ForkModelRef`, `formatModelSelection`, `ProviderModelMetadataDialog` |
| Out of scope | expansão de Provider, refatoração de Telemetry, recuperação de Conversation, serviço público de Client Config |

### 7.2 UI Surface Matrix

| Cenário do usuário | Entrada de UI | Owner do Draft/Exibição | Origem de default/herança | Validação e submissão | Owner autoritativo | Limite de modo |
| --- | --- | --- | --- | --- | --- | --- |
| Adicionar Provider Built-in comum | ação fixa das Provider Settings | estado de seleção no Renderer; sem Provider Draft | Built-in Config do Host alvo | cria Personal Overlay | Host do Environment alvo | Local/Remote usam seus próprios Hosts |
| Criar Provider Personal-only | interface de criação personalizada | estado de criação no Renderer | sem API Schema padrão | cria imediatamente um Provider incompleto, com salvamento automático posterior | Host do Environment alvo | idem |
| Editar Model | diálogo grande de salvamento manual | Local Draft do Renderer | Effective Preview do Host | uma Mutation de Model atômica | Personal Config + Registry | mesma semântica em Desktop/Mobile |
| Seleção de modelo | Conversation/Automation/Subagent/Repo Wiki | o próprio Draft de cada produto | Selection View do Host alvo | sink de commit de cada um | estado de produto próprio / Worker Registry | não unificar os ciclos de vida dos produtos |
| Exibição de conexão de Account | Family/Usage/Entitlement UI | estado projetado pelo Host | Account Connection/Availability | ações de login/conexão já existentes | serviço de contas | não lê `accessId` |

### 7.3 Relações graduais

| Nível | Relação | Motivo |
| --- | --- | --- |
| must-inspect | Account Connection -> Account Overlay -> Request Auth | mesmo sem o ID de conexão, ainda é preciso resolver pela conexão compatível atual e falhar de forma fechada quando ela falta |
| must-inspect | Model editor -> Host Mutation -> Personal Config/Registry | o salvamento em etapas atual perde o Draft e produz estado não atômico |
| must-inspect | Fork/Protocol/Persistence -> ModelSelection | `ForkModelRef` e as strings continuariam criando uma segunda representação de escolha |
| should-inspect | Usage/Telemetry/Family UI -> Account status | parte da exibição atual infere a conexão pela presença de `accessId` |
| should-inspect | Automation/Subagent/Repo Wiki/Conversation picker | compartilham o Picker Value, mas estado e ponto de submissão precisam continuar separados |
| conditional | Standalone/Remote Host Request Auth | cada Environment precisa usar o seu próprio serviço de contas |
| invariant-only | desktop continuous / mobile replayable | este ciclo não muda stream, snapshot, queue nem semântica de recuperação |
| invariant-only | Off-Peak | continua usando ModelSelection/Registry/ModelFactory comuns e autenticação por requisição |

### 7.4 State owner e Commit sink

| Estado/fato | Owner autoritativo | Espelho/cache | Commit sink |
| --- | --- | --- | --- |
| Built-in/Personal Provider e Model Config | Provider Service do Host do Environment alvo | Host View no Renderer | Provider Config Repository + publicação no Registry |
| Draft de edição de Model | Renderer do diálogo atual | sem cache persistente | uma única Host Model Mutation |
| Conexão de conta e identity atuais | Account/Credential Services | snapshot do Account Provider | fluxos existentes de login, conexão e logout |
| Credenciais por requisição | Account Request Auth Service | Credential Store/cache privado | resolvido em cada tentativa de request, sem escrever em Config |
| Escolha futura de modelo | `ModelSelection` estruturada de cada produto | apenas exibição como Picker Value | entrada de envio já existente de cada produto |
| Modelo de execução atual | Active Model do Agent Runtime | sem espelho editável reverso | criação pelo ModelFactory |

### 7.5 Invariantes que precisam ser mantidos

1. Provider Config do tipo de conta não salva credenciais nem identidade de conta; o API Access ainda pode salvar diretamente a API Key preenchida pelo usuário;
2. depois de trocar ou sair de uma conta, o Active Model antigo só pode usar a conexão da family/planKind compatível atual, ou então falhar antes da rede;
3. os Environments Local e Remote resolvem cada um o Provider Registry, a conexão de conta e as credenciais de requisição;
4. `ModelSelection` guarda apenas a intenção de escolha explícita, e a opção default continua sendo resolvida pelo ModelFactory;
5. cancelar a edição de Model não escreve configuração, falhar não fecha o diálogo e sucesso publica apenas uma revision final;
6. Model Built-in não pode ser removido, Provider ID não pode ser modificado e o Builtin Config nunca é removido pelas Settings;
7. campos ocultos pela UI, como PDF/Audio, e slots de JSON Personal não editados são preservados sem perda;
8. não mudar a atribuição de estado das entradas de seleção de modelo, nem Queue, Recovery, Off-Peak admission ou o design geral de Telemetry;
9. não restaurar ModelRef, ModelIdentity, connection key pública ou um segundo Registry;
10. não mover para abstrações novas de execution/factory as responsabilidades de configuração do Registry antigo só por causa da limpeza de nomes.

### 7.6 Revisão de graph drift e resultado da sincronização

Antes da implementação, o Feature Graph ainda declarava que o Account Overlay publicava um `accessId` opaco, e os Todo 05/21 também continham resultados de conclusão incompatíveis com o código atual.
Esse drift de graph/spec foi sincronizado junto com este Todo e o Todo 24; o escopo da revisão inclui:

- os documentos de Account Access, Request Auth, Model Selection, Settings e Registry da Design Tree;
- os nós e invariantes de Provider Registry, Model Selection, Off-Peak e Settings do Feature Graph;
- notas de correção ou links de superseded nos Todo 05, 07, 12–14, 20 e 21;
- o resultado final de conclusão da linha do tempo do Todo 00.

A sincronização não pode elevar as compensações temporárias da implementação ao status de decisão de design. A menos que apareça um fato objetivo de impossibilidade, conflito de correção ou um novo fato confiável, a implementação deve executar este Todo fielmente; ambiguidades comuns de implementação devem seguir a opção de menor impacto e reversível, sem bloquear a meta, e podem ser discutidas depois.

## 8. Fatias de implementação

### Slice A: testes falhando e contratos públicos

1. escrever primeiro testes falhando para o contrato de Access do Todo 24, a fidelidade de options do ModelSelection e a Mutation atômica de Model;
2. estabelecer testes de contrato de componente/serviço para os quatro estados do Draft de Settings, o Preview de Model ID e o editor simplificado de Built-in;
3. adicionar testes de regressão para a autoridade de Local/Remote Host, o Request Auth do Standalone e os invariantes de Off-Peak.

### Slice B: zeragem do ModelSelection

1. trocar todos os `ForkModelRef` por `ModelSelection` e remover a conversão de `variant`;
2. fazer protocolo, persistência e estado de produto guardarem apenas o objeto estruturado;
3. renomear explicitamente os helpers de string Picker/Legacy e limitar a fronteira;
4. remover Parsers/Formatters duplicados sem criar helper de comparação unificado.

### Slice C: contrato de Access

Implementado e aceito por completo pelo Todo 24; este Todo não mantém mais outra lista de implementação de Access.

### Slice D: transação de edição de Model e Preview

1. adicionar um Host Preview único e uma Host Save Mutation única;
2. submeter rename, membership, order, Rule exclusiva e Personal Config na mesma transação;
3. fazer o diálogo no Renderer esperar o sucesso para fechar, preservando o Draft em conflito/falha;
4. aplicar debounce no Preview de Model ID e rejeitar respostas obsoletas;
5. remover o helper em etapas `rename()` seguido de `save()` e a lógica de compensação otimista.

### Slice E: semântica e apresentação de Settings

1. separar no Draft o valor Personal, o Inherited Preview e o Effective Preview;
2. implementar os quatro estados herança, não definido, sobrescrita explícita e explicit clear;
3. reutilizar o Schema autoritativo nos três slots de JSON e adicionar erros de formatação e de caminho;
4. usar o editor simplificado de API Key + Model List para Provider Built-in comum e o editor completo para Personal-only;
5. mover `requiresMfjsToolSchema` para o final e concluir as verificações de Light/Dark, Desktop/Mobile, teclado e chinês/inglês.

### Slice F: Compatibility, nomes e zeragem mecânica da documentação

1. remover por completo `adapterCompatibility`, `reasoningReplay` e a projeção de empty-thinking sintético;
2. verificar se o `model-execution.ts` do Adapter e seus comentários usam nomenclatura de execution/factory, sem mudar o comportamento de transport/factory;
3. executar a busca mecânica de resíduos, removendo helpers mortos, fixtures de teste e comentários incorretos;
4. sincronizar a Design Tree, o Feature Graph, o status dos Todos e as relações de superseded;
5. submeter Conventional Commits por fatia, sem espremer todas as mudanças em um único commit impossível de revisar.

## 9. Testes e aceitação

### 9.1 Config, Account e Request Auth

- o Schema de Zhipu Account Access não aceita, serializa nem exige `accessId`;
- o Account Overlay publica apenas enabled e os membros de modelo da conta Start;
- Individual/Start/Team obtêm cada um as credenciais corretas do serviço de contas atual;
- ao trocar de conta sob a mesma Family/Plan, o Model antigo resolve novamente as credenciais pela conexão compatível atual;
- a atualização de credenciais da conta não muda em tempo quente o Endpoint, o tipo de API, as Properties ou a Model Selection do Model;
- Credential Store/in-flight cache não vazam entre contas, Providers ou escopos de Team;
- UI, Usage e Telemetry não inferem a conexão da conta por strings de access;
- Local, Remote, Standalone e Off-Peak usam os fatos de conta do seu próprio Environment.

### 9.2 ModelSelection

- `modelSelectionSchema` aceita e preserva por completo `reasoningLevel/maxOutputTokens`;
- Fork/Side Chat/Before-input Fork não produzem mais `variant` nem alias de Ref;
- o Picker Value não sobrescreve as options completas da Selection que o chamador possui;
- strings Legacy são analisadas apenas em fronteiras explícitas de importer/codec;
- Conversation, Automation, Subagent e Repo Wiki mantêm o comportamento original de comparação e submissão;
- mudanças de default de Config não são fixadas retroativamente em Selections históricas.

### 9.3 Transação de Settings e Preview

- abrir, editar e cancelar/X/Esc não escreve configuração;
- o salvamento produz apenas uma Host Mutation e uma revision final de Registry;
- o rename atualiza simultaneamente o membership Personal, o modelOrder e a Rule exata;
- falha de salvamento, conflito de revision e falha de publicação de Registry preservam o diálogo e o Draft;
- ao alterar o Model ID, a Preview Rule é movida primeiro e só então os novos defaults Built-in são resolvidos, mantendo os valores Personal explícitos;
- uma resposta obsoleta de Preview não sobrescreve o Model ID mais recente;
- round-trip dos quatro estados: upstream com valor, upstream sem valor, sobrescrita Personal e explicit clear;
- PDF/Audio e slots de JSON não editados são preservados sem perda;
- os três editores JSON substituem de forma independente, conteúdo vazio restaura a herança e conteúdo inválido impede o salvamento;
- `requiresMfjsToolSchema` fica por último.

### 9.4 Provider Settings

- "Adicionar fornecedor" lista apenas candidatos `standard-builtin` comuns ainda não adicionados;
- depois de adicionar, só aparece o caminho principal simplificado de edição de API Key + Model;
- "Criar fornecedor personalizado" cria um Provider `standard-personal` incompleto e mostra o editor completo;
- remover qualquer Provider remove apenas o Personal Overlay; o Built-in Config não muda;
- Family UI, ordenação comum, Provider ID, permissão de remoção de Model Built-in e comportamento de model enabled seguem as decisões originais;
- Desktop/Web/Mobile, Zai Light/Zai Dark, teclado, toque e chinês/inglês passam na regressão.

### 9.5 Zero mecânico

Na conclusão, no mínimo:

```text
生产公共链 accessId                       = 0
ForkModelRef / 公共同形 ModelRef alias     = 0
reasoning identity variant                = 0
当前写入路径的 Selection 字符串序列化      = 0
rename 后再 save 的 Model 编辑分步提交      = 0
adapterCompatibility / reasoningReplay         = 0
旧 Adapter Registry 命名与错误注释          = 0
```

As ocorrências de busca que permanecerem precisam ser listadas uma a uma no registro de conclusão, provando que pertencem a campos de terceiros, a fronteiras Legacy explicitamente somente leitura ou a referências de documentação histórica; não se pode usar uma allowlist ampla para mascarar
resíduos de produção.

Execução final:

- testes unitários relacionados de Provider, Services, Shared, Core, Bootstrap e UI;
- `pnpm typecheck`;
- `pnpm lint`;
- `pnpm fmt:check`;
- E2E de Desktop afetados e regressão de Provider Settings/Selection em Local/Remote Host;
- `pnpm knip` e a verificação mecânica de zero com `rg` direcionado;
- quando necessário, `pnpm test:unit:affected` e `pnpm verify:pre-push`.

## 10. Definição de conclusão

Somente quando todas as condições abaixo estiverem satisfeitas este Todo pode ser marcado como "concluído":

1. o código, os testes e os portões de zero mecânico de G1–G9 estiverem completos;
2. `accessId` não tiver voltado a entrar, com novo nome, no Provider Config, Model, Protocol, UI ou contrato público de Credential;
3. houver evidência de resolução pela conexão atual e de falha fechada quando ela falta, para troca de conta, logout, atualização de credenciais e requisições Remote/Standalone;
4. Fork, Picker, Protocol e Persistence não tiverem mais uma segunda representação de ModelSelection;
5. o salvamento da edição de Model for uma única Host Mutation, com falha preservando o Draft e Preview sem produzir persistência;
6. o editor simplificado Built-in e o editor completo Personal-only estiverem separados por group;
7. a Design Tree, o Feature Graph, o roadmap e os Todos antigos relacionados estiverem sincronizados com a implementação real e não declararem mais como concluídas coisas não atendidas;
8. os testes necessários, a verificação de tipos, o Lint, a verificação de formatação, os E2E afetados e a checagem de resíduos mecânicos passarem;
9. Conventional Commits forem submetidos por fatia revisável, preservando escolhas próprias e evidências de verificação no registro de implementação.

## 11. Registro de implementação (2026-08-27)

- O ModelSelection unificado mantém `providerId/modelId/options` estruturados; Fork, Side Chat, Automation, Subagent e
  Persistence não mantêm mais Ref alias nem reasoning identity variant;
- O salvamento da edição de Model foi consolidado em uma única Host Mutation com `basedOnRevision`, com submissão atômica de rename, membership, order e Rule Personal
  exata; o Preview só devolve valores herdados e Effective, sem persistir e sem aceitar autoridade de API/Endpoint vinda do Renderer;
- O Personal Model Draft passou a ser um Overlay realmente esparso: folhas não tocadas não são escritas, PDF/Audio e slots de JSON são preservados sem perda, e "restaurar todos os padrões" usa como
  base o novo resultado herdado do Model ID atual;
- As páginas de configuração de Provider/Model concluíram a simplificação, a ordenação e a interação de diálogo já definidas; a ordenação contínua de Provider usa projeção otimista na UI, e ao mudar o owner de Environment o
  Pending antigo é descartado, sem criar um segundo fato de configuração;
- `adapterCompatibility`, `reasoningReplay`, empty-thinking sintético e fixtures/helpers relacionados foram removidos da cadeia de produção atual;
- A fatia de Access foi concluída pelo Todo 24 conforme a decisão final, e a aposentadoria da ZAPI foi concluída pelo Todo 25.

> Complemento de revisão posterior: o Host Preview e o salvamento atômico do Model Draft já foram concluídos por este Todo; o agrupamento estável de precedência das Personal Match/Exact
> Rules, bem como a normalização mecânica dos helpers de três etapas do Resolver e do lado de escrita, ficam a cargo do
> [`Todo 28`](./todo-28-model-rule-precedence-and-order-canonicalization.md).

Evidências de verificação:

- o `pnpm typecheck` da raiz passou; o `pnpm lint` da raiz terminou com 0 error (34 warnings já existentes em todo o repositório);
- testes direcionados de configurações de Model 235/235, testes de contrato de UI/Services 47/47 e testes direcionados de Provider/Adapter/Bootstrap da CLI
  228/228 passaram;
- a Unit completa da raiz passou direto em 12.438/12.440; os dois únicos casos de ZIP no Windows falharam porque o host não tem o `zip` de sistema, e a repetição com um comando ZIP compatível e isolado passou 17/17;
- os 216 arquivos modificados neste ciclo passaram na verificação de formatação direcionada após correção com `oxfmt`; o `fmt:check` da raiz continua bloqueado por arquivos binários já existentes no repositório e por erros de parsing de HTML de exemplo do Electron upstream;
- o `knip` da raiz ainda reporta a baseline de unused já existente em todo o repositório; a verificação direcionada não reportou símbolos novos de Access, Credential ou split de UI deste ciclo;
- a busca mecânica no código de produção confirma `ForkModelRef`, `adapterCompatibility`, `reasoningReplay`,
  `anthropic-empty-thinking` e o antigo Type de Access todos como zero.