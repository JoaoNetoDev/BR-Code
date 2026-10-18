# Pertencimento, habilitação e ordem dos modelos de Provider

> Status: design vigente
>
> Atualizado em: 2026-08-26

## Objetivo

Pertencimento de modelo, habilitação de modelo e ordem de modelos são três fatos diferentes:

```text
Provider Config
├─ builtinModelIds / modelIds  -> quais modelos existem
└─ modelOrder                  -> em que ordem exibir

Model Config
└─ enabled                     -> se um membro pode executar
```

O array de membros do Provider não pode declarar capacidade nem habilitação de modelos; uma Model Rule não pode criar membros nem determinar sua titularidade.

## Titularidade dos membros

```ts
interface ProviderConfig {
  builtinModelIds?: readonly string[] | null;
  modelIds?: readonly string[] | null;
  modelOrder?: readonly string[] | null;
}
```

`builtinModelIds` é gerenciado pelo ZCode Built-in ou pelo Account Built-in; `modelIds` é gerenciado pelo Personal. Depois do Overlay, o Resolver normaliza ausentes ou `null` para `[]`, e então produz o inventário source-aware.

Os IDs de membro, após remoção de espaços nas pontas, são comparados por string exata, sensível a maiúsculas/minúsculas:

- duplicados no mesmo array: mantém-se a primeira ocorrência e ignoram-se as seguintes;
- Built-in e Personal com o mesmo ID: Built-in-wins, produzindo apenas um membro Built-in;
- em Settings normal é proibido adicionar no Personal um ID já existente no Built-in;
- configuração duplicada digitada manualmente ainda é lida de forma determinística; na próxima gravação de um Provider relacionado, as entradas duplicadas e obsoletas são removidas do array Personal;
- não se cria objeto de conflito, identidade suspensa nem um segundo modelo com o mesmo nome.

Uma Model Config Rule que casa com um ID inexistente não cria o membro; ela só participa da resolução no futuro, quando algum Provider realmente possuir esse membro.

## Origem Built-in explícita

O Provider usa `builtin: boolean` completo nos DTOs Effective/Registry/Settings. O `builtin` da linha de modelo é retornado explicitamente pelo Host conforme o inventário source-aware final; o Renderer não adivinha por ID, lista de Permissões de Preset, pertencimento ao Mapa Personal ou agrupamento de UI.

Model ID Built-in é somente leitura e não exibe botão de exclusão. Model ID Personal pode ser alterado por rename atômico, e Model Personal pode ser excluído.

## `enabled` do Model Config

### Habilitação na camada externa às regras de Provider (decisão posterior ao Todo107)

`ProviderConfigRule.enabled?: boolean` fica no mesmo nível de providerId e providerName, não dentro de config nem de Access. O Resolver interpreta a ausência de forma unificada como true. O interruptor Personal grava apenas o enabled externo, sem alterar Key, membros, interruptores de modelo ou conexão de conta. A Facade retorna o enabled normalizado e o executable já existente; a UI apenas mapeia cinza (desligado), amarelo (ligado mas não executável) e verde (pronto).

O grupo de conta usa o resultado público do Provider concreto correspondente à conexão atual; não se pode substituir a elegibilidade de execução pelo statusActive do menu do plano.

Model já vinculado não sofre revogação retroativa pelo interruptor de configuração; escolhas históricas permanecem, e execuções seguintes seguem a resolução e a admissão originais.

```ts
interface ModelConfig {
  enabled?: boolean | null;
  // properties / optionSpecs (incluindo map per-option) / narrow encoding facts
}
```

`enabled` é o portão de execução do modelo, não vínculo, visibilidade, autorização ou completude:

```text
Provider complete
AND Provider Rule enabled（ausente = true）
AND Account Provider entitled（somente tipo conta）
AND membership exists
AND Effective Model Config enabled
AND Model Config complete
        |
        v
Executable Model
```

Somente o Executable Model entra no Registry e, portanto, pode ser usado por fallback, testes, ID exato interno ou ModelFactory. Para usuários comuns, os candidatos exigem ainda `visibility=visible` no Provider. Model não tem visibility própria nem armazena selectable/executable.

Model disabled:

- permanece em Settings;
- mantém Properties, Options, Reasoning e a ordem;
- pode ser editado ou reativado; a lista de modelos não oferece "restaurar padrão" para enabled;
- não pode ser testado, usado em fallback, selecionado nem criado por ID exato;
- não oferece caminho de bypass do portão para tarefas internas.

Model imutável já criado não é interrompido por uma atualização de Config; criações seguintes usam o novo estado de enabled.

## Defaults Built-in e sobrescritas Personal

A Rule Built-in geral fornece o default completo `enabled=true`. Uma Rule Built-in mais específica e posicionada depois pode definir por default `false` para modelos desatualizados ou desaconselhados. Isso permite ao ZCode ajustar os defaults oficiais ao publicar novas configurações, sem precisar alterar os membros do Provider.

As Personal Rules vêm depois de todas as Built-in Rules:

```text
Built-in general enabled=true
            |
            v
Built-in specific enabled=false
            |
            v
Personal provider-model enabled=true/false
            |
            v
Effective Model Config enabled
```

Quando o usuário alterna o interruptor, grava-se apenas a folha Personal `enabled`, com um booleano explícito; a lista de modelos não oferece entrada de "restaurar padrão". Na criação normal de um Personal Model, grava-se explicitamente `enabled=true`, evitando que o fluxo de criação dependa de suposições implícitas. Schema e Overlay ainda permitem remover essa folha por edição de configuração, mas essa não é uma operação de produto do interruptor da lista de modelos.

## Rules específicas de Provider/Model

Built-in e Personal Model Rules usam a mesma estrutura:

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

O alvo de `provider-model` é uma combinação exata de Provider/Model. Ele pode pertencer a duas Sources:

- Rule específica Built-in é gerenciada pelo ZCode Built-in Release e pode declarar a especialização oficial de uma combinação Built-in Provider/Model;
- Rule específica Personal é gerenciada por Settings e pode sobrescrever um Model Built-in ou Personal.

Somente as Rules específicas Personal participam do ciclo de vida do usuário:

- criadas ou atualizadas quando Settings altera um campo de um único modelo;
- movidas no rename de um Personal Model;
- removidas no delete de um Personal Model;
- removidas no delete do Overlay Personal do Provider, para todas as Rules específicas desse Provider;
- removidas quando uma Rule fica vazia após o último campo ser restaurado.

Regras `match` também podem pertencer a Sources Built-in ou Personal, servindo a um fato comum de um conjunto de modelos/APIs/Providers/Endpoints. Qualquer rename, delete ou deduplicação de Provider/Model não adivinha nem reescreve Match Rules; Rules específicas Built-in também não são afetadas por operações do usuário. Rules específicas usam IDs estruturados, sem escapar IDs exatos para regex e sem adicionar flag `exclusive`.

## Ordem dos modelos

A ordem base é dividida em três segmentos:

```text
Built-in ausentes do modelOrder
              +
membros ainda válidos em modelOrder
              +
Personal ausentes do modelOrder
```

Isso garante que Built-in Models recém-publicados na configuração online, ainda não ordenados pelo usuário, apareçam primeiro. Ao adicionar normalmente um Personal Model em Settings, `modelIds`, o `modelOrder` completo e a Rule específica inicial são atualizados na mesma operação atômica, de modo que Personal não ordenado só pode vir de entrada manual ou anômala.

Ao salvar uma ordenação feita pelo usuário:

1. lê o inventário Effective source-aware atual;
2. ordena conforme o resultado do usuário;
3. remove IDs obsoletos e duplicados;
4. reinsere todos os membros omitidos;
5. salva o `modelOrder` completo.

Models disabled continuam aparecendo em Settings conforme o `modelOrder`. Depois que a Selection filtra os disabled, os demais modelos mantêm a ordem relativa.

## Operações do ciclo de vida

### Adicionar Personal Model

```text
validate new modelId
        |
        v
atomic write
├─ modelIds += id
├─ modelOrder = complete current order
└─ provider-model rule { enabled: true }
```

Se o ID duplicar um Built-in ou um membro Personal existente, a gravação normal é rejeitada.

### Renomear Personal Model

Substituição atômica de:

- ID antigo em `modelIds`;
- ID antigo em `modelOrder`;
- ID alvo da Rule específica `provider-model` antiga.

A prévia deve primeiro mover as Rules específicas Personal, depois resolver as Built-in Rules com o novo ID e a API/Endpoint efetiva do Provider, e por fim sobrepor os valores esparsos Personal originais. Valores preenchidos explicitamente pelo usuário permanecem iguais, e defaults herdados passam a refletir o novo ID. Match Rules genéricas não são reescritas.

### Excluir Personal Model

Remoção atômica de:

- membro em `modelIds`;
- posição em `modelOrder`;
- Rule específica `provider-model` correspondente.

Match Rules genéricas não são removidas. Built-in Model não possui essa operação.

### Excluir Overlay Personal do Provider

Remove o Overlay Personal do Provider e todas as Rules específicas `provider-model` desse Provider; Match Rules genéricas são preservadas. Um Built-in Provider volta ao baseline Built-in, e um Provider somente-Personal desaparece naturalmente por não ter outra definição raiz.

## Settings e Selection

Settings retorna a coleção completa de membros de todos os Providers visíveis, incluindo Models disabled/incomplete, e informa explicitamente:

- `builtin`;
- `enabled` efetivo;
- se o Personal sobrescreve explicitamente o enabled;
- Model Config Efetiva/Personal;
- issues de completude;
- executable/selectable derivados;
- ordem unificada.

Selection retorna apenas os modelos executáveis entre os Providers visíveis, preservando a ordem do Registry. O Renderer não filtra mais, não ordena, não aplica Overlay nem fabrica candidatos a partir de Connection/Preset/Catalog.

## Casos de aceitação

| Nº  | Entrada/Operação                                   | Resultado                                                       |
| --- | -------------------------------------------------- | --------------------------------------------------------------- |
| MM01 | Built-in `[A,B]`, Personal `[X]`                  | Inventário com Built-in A/B + Personal X                        |
| MM02 | Ambos os fontes têm X                             | Produz apenas Built-in X; duplicata Personal ignorada, limpo ao salvar |
| MM03 | Um array contém `[A,A,B]`                         | Mantém o primeiro A e B                                         |
| MM04 | Built-in Rule define A antigo como disabled       | A permanece em Settings; não entra em Registry/Selection/fallback |
| MM05 | Usuário liga o interruptor de A para true         | A volta a ser executable e mantém Personal enabled=true         |
| MM06 | Novo Built-in C ausente do modelOrder do usuário   | C aparece no segmento inicial de Built-ins não ordenados        |
| MM07 | Settings cria Personal Y                          | Membro, ordem completa e Rule específica enabled=true salvos atomicamente |
| MM08 | Personal Y renomeado para Z                       | Membro, ordem e Rule específica movidos atomicamente; Match Rule genérica não muda |
| MM09 | Exclusão de Personal Y                            | Membro, ordem e Rule específica removidos; Match Rule genérica preservada |
| MM10 | Provider disabled                                 | Todos os modelos permanecem em Settings; Registry/Selection não incluem |
| MM11 | Provider hidden e enabled, Model enabled          | Não é exibido em Settings/Selection normais; criação exata interna é possível |
| MM12 | Config atualiza após Model disabled               | Model Active existente conclui o ciclo de vida; novas criações são rejeitadas |

## Alternativas rejeitadas

- `models[]` único: o snapshot Personal ocultaria membros Built-in publicados depois;
- `enabledModelIds`: um conjunto positivo completo não consegue expressar ao mesmo tempo os defaults oficiais futuros e as sobrescritas por modelo do usuário;
- default dentro do Provider + política de habilitação por model: duplica a capacidade de Overlay das Model Rules;
- visibilidade de Model: sobrepõe-se a visibility do Provider/enabled do Model, criando um segundo conjunto de semânticas de ocultação;
- DTO de conflito de membros duplicados: a UI normal já proíbe duplicatas, e entrada manual pode ser tratada com Built-in-wins + normalização na gravação;
- codificar Rules exatas de UI por regex: titularidade de ciclo de vida fica incerta e rename/delete precisariam adivinhar;
- abstração genérica de equality/identity: a decisão de membro usa uma comparação explícita de providerId/modelId.