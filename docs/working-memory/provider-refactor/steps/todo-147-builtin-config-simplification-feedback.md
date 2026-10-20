# Todo 147: Simplificação do Builtin Config e Ajuste da Baseline Padrão

> Status: F01–F03 implementados e verificados em 2026-10-14.
> Data: 2026-09-15.
> Este documento registra primeiro o feedback do usuário; em 2026-10-14 foi aprovado implementá-lo a
> partir do staging mais recente e submeter o MR.

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

| Campo de configuração                      | Valor atual | Valor-alvo confirmado |
| ----------------------------------------- | ----------- | --------------------- |
| `properties.contextWindow`                | `200000`    | `1000000`             |
| `optionSpecs.maxOutputTokens.max`         | `32000`     | `128000`              |

- Com base na decisão do usuário nesta rodada, esses dois valores passam a ser a baseline padrão
  mainstream.
- Aqui output se refere ao limite máximo de saída do Model Config; não é criada uma política de
  "saída padrão de 128000 por requisição", nem outro conjunto de defaults de requisição.
- Regras posteriores de modelos específicos, protocolos, sites e pessoais continuam sobrescrevendo
  na ordem original; os limites declarados explicitamente por cada modelo não são forçados a um
  mesmo número.
- Campos não mencionados, como as faixas genéricas de raciocínio e a capacidade de mídia, mantêm
  a semântica atual.

## Checklist de implementação

- [x] Continuar anexando o feedback do usuário e deixar explícito o escopo real de execução desta
  rodada; sugestões de review não confirmadas não entram na implementação automaticamente.
- [x] Antes de implementar, sincronizar no design vigente as descrições dos princípios de
  correspondência e da baseline padrão correspondentes.
- [x] Cobrir primeiro com regressões: baseline genérica de 1000000 / 128000, ausência das duas
  regras acima e capacidade de os modelos específicos ainda sobrescreverem a baseline genérica.
- [x] Certificar ordem e herança campo a campo usando modelos base e variantes com diferenças;
  não basta apenas afirmar que a string da regex ficou menor.
- [x] Alterar a configuração e revisar novamente a ordem das regras afetadas, as capacidades
  efetivas e o mapeamento de opções; preservar as overrides Personal existentes e a identidade
  exata dos modelos.
- [x] Atualizar os testes que dependem da baseline genérica antiga de 200000 / 32000; distinguir o
  fallback de modelo desconhecido dos valores explícitos de modelos específicos.
- [x] Executar os testes de parsing de configuração, de mapeamento de requisição e as verificações
  exigidas pelo repositório; complementar com validação de interação conforme o impacto real na
  UI.
- [x] Na publicação, incrementar a builtin revision conforme a versão mais recente da época,
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

## Implementação e limites de compatibilidade desta rodada

- Builtin revision 31 → 32, com a configuração de produção e a de teste sincronizadas. Regras de
  Model 84 → 82; Model + API, Site, membros de template e a contagem de identidades exatas
  permanecem inalteradas.
- Removidas declarações duplicadas que herdavam a capacidade genérica; as sobreposições necessárias
  trazidas por capacidades explicitamente menores e por regras de famílias intermediárias
  continuam preservadas.
- GLM-4.7 FlashX é posicionado depois do Flash; a regra de Messages do GLM-4.6 mantém o `(?!v)`,
  evitando que, após a simplificação, o mapeamento de texto sobrescreva os modelos visuais.
- A restauração da faixa de desligamento antiga localizava a origem pela string do matcher; após a
  simplificação, é preciso reconhecer tanto o matcher original quanto o novo matcher; a elegibilidade
  da restauração continua sendo julgada pelo matcher original, sem ampliar o alcance dos aliases
  históricos e sem escrever dados de migração.
- Os fixtures históricos de mapeamento de requisição sincronizam apenas a string de localização do
  matcher; o request map e os resultados esperados não mudam. Sufixos desconhecidos agora herdam a
  capacidade da mesma família conforme a regra permissiva já confirmada.
- A página de configurações continua exibindo a capacidade herdada; salvar a faixa de pensamento
  não pode gravar junto uma override de capacidade em Personal. O limite de saída não altera o
  número explícito de tokens da requisição.

## Registro de verificação (2026-10-14)

- Primeiro foram executadas as regressões novas para confirmar a falha da configuração antiga; só
  então a configuração foi alterada; 52 arquivos e 550 itens da suíte completa de Provider /
  Provider Node passaram.
- 242 entradas de template × 3 APIs × 2 tipos de site, totalizando 1452 combinações de parsing:
  descontando os ajustes de default explicitamente exigidos nesta rodada e a remoção das duas
  regras, não houve outras diferenças de resultado. Essa enumeração cobre o catálogo mantido e
  não garante equivalência para qualquer modelo desconhecido.
- typecheck, lint e a checagem de arquitetura de todo o repositório passaram; a checagem de
  sincronização entre as configurações de produção e de teste passou.
- O staging mais recente foi sincronizado; no desktop Linux, `provider-reasoning-fallback.test.ts`
  passou, usando o fixture replay common explícito e um servidor HTTP local dentro do caso, para
  confirmar a exibição da capacidade herdada, o salvamento esparso e o orçamento real da requisição
  de Model. Windows/macOS, Web mobile e todas as combinações de tema/idioma não foram executados.
- Observação sobre o ambiente de verificação: o typecheck de todo o repositório escreve em
  desktop/out e não pode rodar em paralelo com os artefatos de empacotamento do desktop; a
  verificação final de interação foi executada após o typecheck, com um build completo refeito.
