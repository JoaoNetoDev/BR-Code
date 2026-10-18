# Todo 147: Simplificação do Builtin Config e Ajuste da Baseline Padrão

> Status: coletando feedback continuamente; as direções abaixo já foram confirmadas, mas ainda não
> foram implementadas.
> Data: 2026-09-15.
> O usuário pediu primeiro a criação deste Todo, e os feedbacks seguintes continuam sendo anexados
> aqui; esta rodada apenas registra, sem alterar a configuração de execução nem publicar revisions.

## Objetivo

Manter a separação em camadas existente de Provider / Model e o overlay de ordenação, deixando o Builtin Config mais
fácil de manter. Adotar o conjunto fechado de modelos assumido e confirmado pelo usuário e uma
baseline mainstream de defaults, removendo as regras especiais que não são mais necessárias.

Relacionados: [design atual](../design-v2/design.md),
[Todo76 Camadas e correspondência](./todo-76-builtin-provider-config-layering-and-site-rules.md),
[Todo138 Fallback genérico de raciocínio](./todo-138-reasoning-level-ui-and-api-defaults.md).

## Feedback confirmado

### F01: Correspondência de modelo com wildcard simples de prefixo e sufixo

- Regras de Model / Model + API são consideradas frente a um conjunto limitado e fechado de
  modelos mantidos; não são adicionadas regex de limites complexas para modelos desconhecidos e
  ilimitados.
- Regras de modelos do mesmo tipo podem ser simplificadas para `.*deepseek-flash.*`, sem exigir
  agrupamentos adicionais com separadores de sufixo.
- Regras genéricas de modelo vêm primeiro, e as variantes mais específicas, de sufixo mais longo,
  vêm depois; as diferenças são cobertas pelo overlay existente campo a campo.
- A ordem é escrita explicitamente por quem mantém a configuração, e o parser continua-executando
  pela ordem do array; nenhum algoritmo novo de ordenação por tamanho ou de "modelo mais
  semelhante" é adicionado.
- Caracteres especiais de regex em literais continuam precisando de escape correto, por exemplo o
  ponto decimal em versões de modelo; a simplificação não significa cancelar todos os escapes.
- Esse princípio vale apenas para a correspondência de Model / Model + API; não afrouxa o Site URL
  nem altera a correspondência exata de identidade de Template / Provider + Model.

```text
Regra genérica de modelo → regra de modelo mais específica → regra de variante mais específica
                  A camada posterior só sobrescreve os campos declarados explicitamente
```

### F02: Remover as duas regras de Model apontadas pelo usuário

Local: `config.modelConfigRules.modelRules` em `config/provider/zcode-builtin.json`.

1. Remover a regra que faz match de `.*\\[1m\\]` e define apenas `properties.contextWindow = 1000000`.
2. Remover a regra que faz match de `.*(?:ox-alpha|glm-x-preview-f|x-preview-f-free).*` e define apenas `optionSpecs.maxOutputTokens.max = 128000`.

O escopo da remoção são as duas regras de Model completas acima. Os mesmos aliases ainda têm, na
camada Model + API, faixas de raciocínio e mapeamento de requisição; este feedback não exige
remover aquelas regras, e também não remove membros de template nem IDs de modelo já salvos pelo
usuário.

### F03: Elevar a baseline genérica de context / output

Modificar a regra de Model genérica com `modelMatch: ".*"`:

| Campo de configuração | Valor atual | Valor-alvo confirmado |
| --- | --- | --- |
| `properties.contextWindow` | `200000` | `1000000` |
| `optionSpecs.maxOutputTokens.max` | `32000` | `128000` |

- Com base na decisão do usuário nesta rodada, esses dois valores passam a ser a baseline padrão
  mainstream.
- Aqui output se refere ao limite máximo de saída do Model Config; não é criada uma política de
  "saída padrão de 128000 por requisição", nem outro conjunto de defaults de requisição.
- Regras posteriores de modelos específicos, protocolos, sites e pessoais continuam sobrescrevendo
  na ordem original; os limites declarados explicitamente por cada modelo não são forçados a um
  mesmo número.
- Campos não mencionados, como as faixas genéricas de raciocínio e a capacidade de mídia, mantêm
  a semântica atual.

## Checklist de implementação (a executar)

- [ ] Continuar anexando o feedback do usuário e deixar explícito o escopo real de execução desta
  rodada; sugestões de review não confirmadas não entram na implementação automaticamente.
- [ ] Antes de implementar, sincronizar no design vigente as descrições dos princípios de
  correspondência e da baseline padrão correspondentes.
- [ ] Cobrir primeiro com regressões: baseline genérica de 1000000 / 128000, ausência das duas
  regras acima e capacidade de os modelos específicos ainda sobrescreverem a baseline genérica.
- [ ] Certificar ordem e herança campo a campo usando modelos base e variantes com diferenças;
  não basta apenas afirmar que a string da regex ficou menor.
- [ ] Alterar a configuração e revisar novamente a ordem das regras afetadas, as capacidades
  efetivas e o mapeamento de opções; preservar as overrides Personal existentes e a identidade
  exata dos modelos.
- [ ] Atualizar os testes que dependem da baseline genérica antiga de 200000 / 32000; distinguir o
  fallback de modelo desconhecido dos valores explícitos de modelos específicos.
- [ ] Executar os testes de parsing de configuração, de mapeamento de requisição e as verificações
  exigidas pelo repositório; complementar com validação de interação conforme o impacto real na
  UI.
- [ ] Na publicação, incrementar a builtin revision conforme a versão mais recente da época,
  seguindo a cadeia de publicação existente; não antecipar a mudança de revision na fase de
  feedback.

## Limites do feedback

Este Todo não absorve automaticamente todas as sugestões de reviews anteriores. Preenchimento da
lista de manutenção, nomenclatura de desligamento de raciocínio, estratégia de escolha da faixa
mais alta e outros assuntos precisam ser registrados separadamente conforme o feedback posterior
do usuário; opiniões ainda em discussão não são tratadas como decisão de implementação.

## Registro

- 2026-09-15: criação do Todo de feedback; registro de F01 (correspondência permissiva), F02
  (remoção das duas regras especiais de Model) e F03 (ajuste da baseline genérica). Apenas mudança
  de documentação; a configuração mantém os valores originais.