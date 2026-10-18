# 06 Privatização do envelope de armazenamento de configuração e do Repository

> Status: concluído
>
> Data: 2026-08-24
>
> Revisão de origem: [`../provider-implementation-architecture-conformance-review.md`](../provider-implementation-architecture-conformance-review.md)
>
> Design alvo: [`../design/registry/configuration.md`](../design/registry/configuration.md)
>
> Pré-requisitos sugeridos: [`todo-03-provider-model-ownership-and-property-totality.md`](./todo-03-provider-model-ownership-and-property-totality.md), [`todo-05-model-ref-retirement.md`](./todo-05-model-ref-retirement.md)

## 1. Objetivo da tarefa

Remover `ProviderConfigDocument` e `ModelSelectionConfigDocument` da API pública do Domínio de Provider, trazendo `schemaVersion`, o envelope JSON, o parsing, a serialização e as migrações de volta para a implementação privada de armazenamento do Repository do Node.

Este Todo não remove arquivos versionados nem reduz a confiabilidade da persistência. O arquivo de configuração ainda precisa de Schema estrito, migração de versões, backup, escrita atômica, file lock, revision e watcher; a única mudança é que a camada de domínio e os chamadores deixam de perceber esses conceitos físicos de armazenamento.

```text
Atual

Settings / Config Service / Projection / Legacy Importer
                          |
                          v
         ProviderConfigDocument / ModelSelectionConfigDocument
          |- schemaVersion
          |- Domain Config
          |- toJSON()
          `- parse / migrate
                          |
                          v
                    Node Repository

Alvo

Settings / Config Service / Projection / Legacy Importer
                          |
                          v
 ProviderConfigLayerUpdate / ModelSelection | undefined
                          |
                          v
                    Node Repository
          |- private Stored*Vn schema
          |- parse / serialize / migrate
          |- backup / atomic write / file lock
          `- revision / watcher
```

## 2. Decisões centrais

### 2.1 `Document` não é um conceito de domínio

O Domínio de Provider só conhece:

- `ProviderConfigMap`;
- `ModelConfigRules`;
- `ProviderConfigLayerSnapshot`;
- `ProviderConfigLayerUpdate`;
- `ModelSelection`;
- Config Overlay, validação de integridade, Registry e resolução da seleção inicial de modelos.

`schemaVersion`, o objeto de nível superior do arquivo, o layout dos campos JSON e as migrações descrevem apenas "como salvar", e não constituem uma nova Config Layer, Effective Config ou estado de runtime. Portanto, `@zcode/provider` não deve mais exportar objetos com semântica de `Document`.

### 2.2 Não substituir `Document` por uma nova camada intermediária

Não criar um novo `ConfigEnvelope`, `ConfigPayload`, `ConfigState`, `SerializedConfig` público ou DTO equivalente. Os valores de domínio atuais já são suficientes:

```ts
interface ProviderConfigLayerSnapshot {
  readonly revision: string;
  readonly providers: ProviderConfigMap;
  readonly models: ModelConfigRules;
}

interface ProviderConfigLayerUpdate {
  readonly providers: ProviderConfigMap;
  readonly models: ModelConfigRules;
}
```

O Repository de Provider continua usando Snapshot/Update como fronteira. Os valores de negócio de leitura e escrita do Repository de Model Selection usam diretamente `ModelSelection | undefined`; não criar um novo objeto público apenas para preservar a camada de embrulho `.configuredDefault`.

### 2.3 A estrutura de armazenamento pode ter nome, mas deve ser privada

Dentro de `provider-node` é possível declarar estruturas por versão, por exemplo:

```ts
interface StoredProviderConfigV1 {
  readonly schemaVersion: 1;
  readonly providers: unknown;
  readonly models: unknown;
}

interface StoredModelSelectionConfigV1 {
  readonly schemaVersion: 1;
  readonly configuredDefault?: unknown;
}
```

Os tipos exatos dos campos são restringidos por um Schema Zod privado e pelas funções de serialização. O nome pode ser `Stored*Vn` ou `*FileVn`, mas não pode ser exportado pelo barrel público de `@zcode/provider-node`, nem se tornar Contract de Service, UI, Runtime ou Protocol.

### 2.4 A confiabilidade do armazenamento é preservada integralmente

Privatizar o Repository não significa simplesmente fazer `JSON.parse()` e confiar no tipo. Todas estas capacidades são preservadas:

- Validação estrita por Schema em runtime;
- `schemaVersion` atual e migração para versões adjacentes futuras;
- Rejeição de versões mais altas com erros diagnosticáveis;
- Backup do arquivo original antes da migração de arquivos Personal;
- Escrita atômica e file lock com permissões privadas;
- Revision baseada em conteúdo normalizado;
- Deduplicação do watcher e notificação de mudanças;
- Compreensão consistente do mesmo Schema de arquivo oficial por parte do Official Source e do Personal Repository.

Esses comportamentos são garantidos por testes de Repository/codec e não podem ser enfraquecidos pela remoção de classes públicas.

## 3. Fronteira alvo da configuração de Provider

### 3.1 Domínio e Repository

```text
@zcode/provider
|- ProviderConfigMap
|- ModelConfigRules
|- ProviderConfigLayerSnapshot
|- ProviderConfigLayerUpdate
|- ProviderConfigService
`- Overlay / Resolver / Registry
             |
             | read/update
             v
@zcode/provider-node
|- NodeOfficialProviderConfigSource
|- NodePersonalProviderConfigRepository
`- private provider-config-file-codec
   |- StoredProviderConfigVn
   |- parse / serialize
   `- migrate
```

- O Official Source retorna `ProviderConfigLayerSnapshot` após fazer o parsing do arquivo;
- O Personal Repository recebe `ProviderConfigLayerUpdate`, monta internamente e grava o arquivo versionado;
- O revision continua sendo produzido pelo Repository a partir do conteúdo persistido normalizado;
- O Domínio não escolhe o formato de arquivo nem chama `toJSON()` para gerar o envelope de armazenamento.

### 3.2 Projeção Personal

`projectEffectiveProvidersToPersonalConfig()` hoje retorna `ProviderConfigDocument`. O alvo é retornar `ProviderConfigLayerUpdate`, expressando apenas o Provider Map e as Model Rules resultantes da projeção.

Este Todo apenas corrige a fronteira de retorno, e não reaprova Effective -> Personal como caminho normal de salvamento das Settings. As Settings oficiais continuam submetendo um Personal Overlay esparso formado pelas modificações reais do usuário; essa função de projeção atende apenas a importação explícita de configurações antigas que ainda estão na janela de compatibilidade, e deverá ser aposentada junto com o Legacy importer.

### 3.3 Tipo de migração

`ProviderConfigDocumentMigration = (input: unknown) => unknown` deixa de ser exportado pelo Domínio. A migração oficial de versões é uma implementação do Schema de armazenamento e deve ser gerenciada pelo codec privado do `provider-node`.

Se o Bootstrap precisar injetar um Legacy importer sem versão durante a transição, ele retorna `ProviderConfigLayerUpdate | null`; o Repository fica responsável por validar os valores de domínio, aplicar o envelope de arquivo da versão atual e gravar. O Legacy importer não produz `schemaVersion` nem conhece as classes de serialização do arquivo oficial.

## 4. Fronteira alvo da Model Selection

Hoje `model-selection-config.ts` mistura armazenamento de arquivo e resolução de domínio, e precisa ser separado:

```text
@zcode/provider
|- ModelSelection
|- InitialModelSelectionResolution
`- resolveInitialModelSelection()

@zcode/provider-node
|- NodeModelSelectionConfigRepository
`- private model-selection-config-file-codec
   |- StoredModelSelectionConfigVn
   |- strict schema
   `- parse / serialize / migrate
```

O comportamento público do Repository é restrito a:

```ts
read(): Promise<ModelSelection | undefined>;
saveConfiguredDefault(selection: ModelSelection | undefined): Promise<void>;
```

Se algum chamador realmente precisar do valor após o salvamento, `saveConfiguredDefault()` pode retornar um `ModelSelection | undefined` congelado, mas nunca deve retornar o Document de armazenamento. A assinatura final deve ser a menor necessidade comprovada por testes dos chamadores.

`resolveInitialModelSelection()` continua recebendo `configuredDefault?: ModelSelection` e a Registry View; ela é independente da versão do arquivo, de arquivo ausente e de migração, e deve permanecer no Domínio.

## 5. Limite entre Legacy e migração oficial

Os dois tipos de migração precisam ser distinguidos:

```text
无版本旧配置
    |
    v
Legacy Importer（过渡发布设施）
    |
    v
当前 Domain Value
    |
    v
Repository 写入当前版本文件

正式 schemaVersion N 文件
    |
    v
Repository private N -> N+1 migration
    |
    v
当前版本文件
```

- O Legacy importer só converte fatos explicitamente expressos pela configuração antiga e não adivinha capacidades de modelos;
- Depois que a janela de upgrade forçada terminar, o Legacy importer, o parser antigo, as constantes de compatibilidade e os testes são removidos por completo;
- Migrações de versões adjacentes de formatos oficiais já publicados são mantidas por longo prazo;
- Schemas intermediários nunca publicados não estabelecem histórico de compatibilidade;
- Nem a migração Legacy nem a oficial podem se espalhar novamente para Core, Registry, Settings ou Runtime.

## 6. Superfície de impacto atual

Antes da implementação, verificar pelo menos os seguintes consumidores:

| Escopo                                                             | Vazamento atual                                          | Alvo                                            |
| ------------------------------------------------------------------ | -------------------------------------------------------- | ----------------------------------------------- |
| `packages/provider/src/config/document.ts`                       | Provider Document, parser e migration públicos           | Remover o envelope de armazenamento público      |
| `packages/provider/src/model-selection-config.ts`                | Armazenamento e resolução de seleção misturados          | Manter apenas a lógica de domínio da seleção     |
| `packages/provider/src/personal-config-projection.ts`            | Retorna Document                                         | Retornar Layer Update                           |
| `packages/provider-node/src/personal-provider-config-repository.ts` | Importa o Document público                              | Usar codec privado                               |
| `packages/provider-node/src/official-provider-config-source.ts`  | Importa migration pública                                | Usar o mesmo codec privado                       |
| `packages/provider-node/src/model-selection-config-repository.ts` | read/save retornam Document                              | Ler e gravar Selection diretamente               |
| `packages/provider-node/src/provider-config-runtime.ts`          | O tipo do importer vaza Document                         | O importer retorna Layer Update                  |
| CLI/Services Legacy importer                                     | Constrói Document                                        | Produzir apenas valores de domínio               |
| Testes de Provider/Provider Node                                 | Têm o Document público como sujeito de teste             | Dividir por responsabilidade de domínio/armazenamento |

Na implementação, conferir o escopo completo com `rg`, referências do TypeScript e os exports dos pacotes, e não migrar mecanicamente apenas pela lista de arquivos acima.

## 7. Testes primeiro

### 7.1 Domínio

1. A projeção Personal retorna `ProviderConfigLayerUpdate`, com a semântica de providers/models inalterada;
2. `resolveInitialModelSelection()` mantém o comportamento para configured default, default indisponível e fallback do Registry;
3. Testes e exports do Domínio não referenciam mais `schemaVersion`, Document, parse/migrate ou JSON de arquivo;
4. Config Overlay, validação de integridade e comportamento de publicação do Registry permanecem inalterados.

### 7.2 Repository de Provider

1. O arquivo de Provider da versão atual é feito em parsing estrito e gera o mesmo Layer Snapshot;
2. Após o round-trip de um Layer Update, providers/models e revision ficam corretos;
3. Versão ausente, versão futura, migration ausente e campos ilegais são rejeitados conforme as regras existentes;
4. As migrations de versões adjacentes são executadas nível a nível e não podem pular etapas;
5. Após um Legacy import Personal bem-sucedido, o arquivo original é submetido a backup e o formato atual é gravado atomicamente;
6. Quando o importer falha, o Schema falha ou o backup falha, o arquivo original não é modificado;
7. Official e Personal usam o mesmo Schema de armazenamento oficial;
8. O watcher deduplica o mesmo revision e notifica normalmente mudanças reais.

### 7.3 Repository de Model Selection

1. `undefined` e um `ModelSelection` completo fazem round-trip corretamente;
2. As options de Selection mantêm validação estrita e semântica de congelamento;
3. Versões não suportadas e campos ilegais são rejeitados;
4. O comportamento de arquivo ausente, Legacy import, salvamento e restauração após reinício permanece inalterado;
5. Os chamadores não acessam mais o Document `.configuredDefault` e consomem diretamente a Selection retornada pelo Repository.

### 7.4 Zeração mecânica

- `@zcode/provider` não exporta mais `ProviderConfigDocument*`;
- `@zcode/provider` não exporta mais `ModelSelectionConfigDocument*`;
- O código de produção de `packages/provider` não tem `schemaVersion` nem migration de arquivos de Config;
- Service, Bootstrap, UI e Runtime não passam `Document`, `Envelope` nem DTO de armazenamento equivalente;
- Todos os testes de JSON/version/migration passam a pertencer ao `provider-node`;
- Não criar novos tipos públicos substitutos `Stored*`, `Serialized*` ou `ConfigState`.

## 8. Ordem de implementação

### Etapa A: congelar o comportamento atual de armazenamento

- Completar primeiro em `provider-node` os testes de comportamento dos arquivos de Provider Config e Model Selection;
- Fixar o comportamento atual de JSON, erros de versão, migration, backup, revision, watcher e escrita atômica;
- Confirmar que a estrutura de campos de Provider/Model do TODO 03 e o `ModelSelection` do TODO 05 já estão estáveis, evitando modificar duas vezes o Schema de armazenamento.

### Etapa B: estabelecer o codec privado do Repository

- Estabelecer em `provider-node` os codecs privados de Provider Config e Model Selection;
- Mover para lá o Schema de armazenamento, as constantes de versão, parse/serialize/migrate e os erros;
- O Official Source e o Personal Repository reutilizam o codec de Provider Config;
- Não exportar o codec nem os tipos Stored pelo barrel do pacote.

### Etapa C: restringir a API do Repository e do importer

- O Personal Provider Repository mantém a fronteira Snapshot/Update;
- A projeção Personal e o Legacy importer passam a retornar Layer Update;
- O Repository de Model Selection passa a retornar Selection diretamente;
- Bootstrap, CLI e Services deixam de ler ou construir Documents.

### Etapa D: remover o Document do Domínio

- Remover de `@zcode/provider` as duas classes de Document, o parser/migration de armazenamento e os exports correspondentes;
- Manter `resolveInitialModelSelection()` e os tipos de domínio relacionados no Domínio de Provider;
- Mover e reorganizar os testes, removendo os que só provam a existência das classes públicas de Document.

### Etapa E: verificação e commit

- Executar os testes unitários relevantes de Provider, Provider Node, Services, Bootstrap e CLI;
- Executar uma regressão representativa de Legacy import e restauração após reinício;
- Executar `pnpm typecheck`, `pnpm lint`, `pnpm fmt:check`;
- Rever os itens de zeração mecânica com `rg`;
- Conventional Commit independente.

## 9. Não objetivos e invariantes

Este Todo não é responsável por:

- Modificar a ordem de Overlay Built-in -> Account Built-in -> Personal;
- Modificar a semântica de `builtinModelIds` / `modelIds`, de conflitos ou de `enabled`;
- Modificar a mesclagem de Model Config Rule, a validação de integridade ou o Active Model;
- Modificar autenticação, Access Type, montagem da API do Provider ou a autorização final;
- Refatorar a UI de Settings, o seletor de modelos, filas, Session ou sincronização remota;
- Remover antecipadamente o Legacy importer que ainda está na janela de compatibilidade do produto;
- Aproveitar a ocasião para criar um framework genérico de Persistence, Document ou Serialization.

Deve ser mantido: a mesma entrada persistida produz a mesma Config de domínio, e a mesma atualização de domínio produz um arquivo oficial compatível; runtime, Settings e Registry não enxergam o envelope de arquivo e não precisam saber se a configuração vem de JSON, de outro formato de arquivo ou de uma futura implementação diferente de Repository.

## 10. Definição de conclusão

O vocabulário público do Domínio de Provider se reduz a camada de configuração, regras de configuração, seleção e resultados de resolução. Todos os envelopes JSON versionados, as migrações de arquivo e o ciclo de vida da persistência ficam encapsulados dentro do Repository do Node; os chamadores passam apenas valores de domínio exatos. O arquivo de configuração oficial e os comportamentos compatíveis permanecem estáveis, mas trocar a implementação de armazenamento não exige mais modificar o Domínio de Provider, as Settings, o Registry ou o Runtime.