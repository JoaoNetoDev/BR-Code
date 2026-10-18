# Todo 35：Fechamento da Migração de Intenção do Usuário do Legacy Personal Provider

> Estado: Concluído
>
> Data: 2026-08-28
>
> Origem: Revisão do Legacy Importer antes do lançamento do Todo 33
>
> Tarefas relacionadas: [`Todo 33`](./todo-33-personal-provider-config-file-cutover.md)

## 1. Problema

O Todo 33 já migrou o Personal Provider/Model Config oficial para `provider_config.json`, mas o Legacy Importer existente ainda migra pela forma de calcular a diferença entre o "Effective Config antigo" e o Built-in atual. O `config.json` antigo mistura Built-in Preset, enriquecimento de Catalog, preenchimento padrão da página de configurações, estado de execução da conta e hardcode de modelos já aposentados, portanto a diferença não equivale à intenção do usuário.

A implementação atual ainda apresenta três desvios diretos:

- `source=builtin` ainda pode migrar API Key, enabled, modelos adicionados pelo usuário e Model Rule;
- O Personal Provider está sem `group=standard-personal` e, após a migração, não pode ser projetado como um Personal Provider completo;
- Fatos gerados pelo sistema como `maxOutputTokens`, modalities, tools, structured output e reasoning são fixados como Personal Rule.

## 2. Decisão Final

A migração preserva apenas a intenção de invocação de Provider personalizado do usuário que pode ser expressa de forma estável, os membros/ordem dos modelos e o `contextWindow` dos modelos personalizados. O Importer não analisa nem compara mais o Built-in Config atual e não cria um segundo conjunto de inferências sobre fatos de modelo.

```text
旧 config.json
      |
      +--> source = builtin
      |      `--> 整个 Provider 丢弃
      |
      `--> 用户自定义 Provider
             |
             +--> Personal Provider Config
             |      ├─ providerId / group
             |      ├─ label / logo
             |      ├─ API Key / 管理地址
             |      ├─ API Schema / Base URL / Headers
             |      ├─ enabled
             |      └─ modelIds / modelOrder
             |
             `--> Personal Model Config Rules
                    `─ 仅保留合法 contextWindow
```

`models-dev` já está obsoleto e `workspace` não é uma entrada realista desta migração; o Importer não cria branches de compatibilidade para eles. Provedores sem `source`, mas reconhecidos pelo Reader antigo como estrutura personalizada do usuário, continuam sendo tratados pela semântica default `custom` do Reader antigo.

## 3. Migração de Provider

### 3.1 Built-in

`source=builtin` é descartado por completo, não gerando Provider Overlay nem Model Rule. API Key, Endpoint, Schema, Headers, enabled, adição/remoção de modelos, ordem dos modelos e todo estado de conta não são resgatados. O Built-in Config e o Account Overlay atuais do ZCode fornecem novamente os fatos oficiais.

### 3.2 Provider personalizado pelo usuário

Um Provider personalizado válido migra os seguintes campos:

- `providerId` não vazio após o trim;
- `group=standard-personal` fixo;
- nome e logo do usuário; quando o nome é igual ao ID, o label pode ser omitido;
- API Key e endereço de gerenciamento da API Key;
- API Schema, Base URL normalizado e Headers explicitamente salvos na configuração antiga;
- `enabled` preservado como está, sem preencher `undefined`;
- `modelIds` não vazios, não removidos e deduplicados;
- a mesma ordem válida de membros é gravada em `modelOrder`.

Não são migrados source, identidade de Catalog, tempos de created/updated, `systemDisabledReason`, nem estados de execução como login/plano/falha de conexão.

## 4. Migração de Modelos

Modelos antigos no formato string apenas fornecem identidade de membro e não geram Model Rule. Modelos antigos no formato objeto, quando `deleted=true`, são removidos simultaneamente dos membros e das regras; outros modelos no formato objeto só geram uma Personal Rule precisa de `providerId + modelId` quando `contextWindow` é um inteiro positivo finito:

```ts
new ModelConfig({
  properties: new ModelPropertiesConfig({ contextWindow }),
});
```

`contextWindow` não depende de `modified`, não é comparado com os valores default do Built-in e não chama o Resolver dentro do Importer.

Todos os seguintes fatos de modelo são descartados e reanalisados pelas Model Config Rules atuais do Built-in:

- `maxOutputTokens` e `hasMaxOutputTokens`;
- formatos de entrada/saída Text/Image/Video/Audio/PDF e `modalitiesConfigured`;
- tools, structured output, native web search, mid-conversation system;
- reasoning spec/mapping/profile;
- compatibility, priority, disabled reason, model headers/options, `modelIdByKind`;
- nome de Catalog e metadados de exibição.

`modified` é apenas uma marca de que a entrada antiga do modelo participou de alguma edição; não prova que um campo folha foi alterado pelo usuário e portanto não participa do julgamento de migração.

## 5. Fronteira de Arquivos e Runtime

O ciclo de vida do Todo 33 permanece inalterado: somente quando `provider_config.json` não existe, o `config.json` antigo é lido somente para escrita e a importação é executada uma única vez, sem backup e sem ler `model-providers.json`; após gravar com sucesso, apenas `provider_config.json` é monitorado. Este Todo não adiciona compatibilidade com formatos intermediários de Provider v1/v2 nem modifica a semântica de conta, seleção de modelo ou congelamento do Active Model.

## 6. Plano de Testes

Escrever primeiro os testes que falham e depois modificar a implementação de produção:

1. Provider Built-in tem migração zero mesmo contendo API Key, modelos modificados e modelos novos;
2. Provider personalizado preserva integralmente a configuração de invocação, o group `standard-personal`, enabled, membros e ordem;
3. Modelos string/objeto/removido/em branco/duplicado são projetados corretamente;
4. context válido é migrado integralmente sem depender de `modified`; context inválido ou ausente não gera Rule;
5. max output, modalities, tools, structured output, reasoning, compatibility etc. não entram na Personal Rule;
6. O resultado da migração mantém a semântica após um round-trip JSON pelo codec oficial;
7. O Provider personalizado migrado consegue se combinar com as Model Rules genéricas do Built-in para formar um modelo de Registry completo;
8. A primeira importação do Provider Runtime, o salto da importação com arquivo oficial já existente e a regressão do monitoramento de arquivo passam.

## 7. Critérios de Conclusão

- O Legacy Importer não depende mais do Built-in Snapshot do ZCode nem da projeção de diff do Effective;
- Built-in, estado de Catalog/conta e capacidades de modelos aposentados não entram no Personal Config;
- O Provider personalizado tem após a migração group completo, configuração de invocação, membros e ordenação;
- Personal Model Rule só pode conter `properties.contextWindow`;
- Os testes unitários direcionados, os testes relacionados de Services/Provider, o `pnpm typecheck` e o `pnpm lint` da raiz passam;
- Ao final, é submetido um Conventional Commit.

## 8. Resultado da Implementação

- O Importer removeu a entrada de Built-in Snapshot do ZCode e a projeção de diff do Effective; `source=builtin`, o `models-dev` aposentado e a entrada `workspace` não-Personal não são gravados no arquivo oficial;
- O `projectEffectiveProvidersToPersonalConfig`, fornecido apenas para a migração antiga, foi confirmado sem chamadores em produção e removido junto com a exportação pública e o autotest, evitando continuar expondo a entrada errada de "deduzir a intenção Personal a partir do Effective Config";
- O Provider personalizado gera diretamente um Personal Config com `group=standard-personal`, preservando a configuração de invocação, enabled, os membros de modelo deduplicados e a ordem original;
- Modelos antigos string/objeto/removido/em branco/duplicado passam por um único coletor de membros; Personal Model Rule só pode conter um `properties.contextWindow` inteiro positivo válido;
- As implementações de migração das capacidades antigas de conversão de reasoning, max output, modalities, tools e structured output foram removidas;
- Testes verticais provam que, depois que o context migrado é combinado com a Model Rule genérica do Built-in atual, o formato, as capacidades e o max output completos vêm das regras atuais e conseguem entrar no Resolver oficial;
- O teste de primeira migração dos Services prova que o round-trip do codec de `provider_config.json` preserva group, ordem dos membros e context Rule;
- A revisão posterior de ciclo de vida encontrou que o importer do Standalone CLI ainda referenciava a projeção Effective→Personal já removida; agora ele foi alterado para gerar diretamente um Provider `standard-personal`, mantendo também apenas os membros de modelo, a ordem e o `contextWindow` válido, evitando que a inicialização da CLI degradasse silenciosamente a migração para uma configuração vazia por causa da exportação ausente;
- Os testes direcionados de Services (13), `@zcode/provider` (151) e `@zcode/provider-node` (44) passaram; o `pnpm typecheck` e o `pnpm lint` da raiz passaram, sendo que o lint reportou apenas 33 warnings preexistentes e não relacionados a esta rodada; o `pnpm test:unit` completo passou em 1486 arquivos com 1 pulado, e 12672 testes passaram com 25 pulados.