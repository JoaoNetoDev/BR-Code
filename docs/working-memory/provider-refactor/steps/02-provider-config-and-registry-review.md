# Revisão do código novo da M2

> Status: snapshot de revisão pré-lançamento
>
> Data: 2026-08-20
>
> Baseline da revisão inicial: `origin/staging` `7c49a63ee381`, branch da M2 `8fd68b123417`
>
> Estado atual: a dualidade entre o DTO do formulário de configurações e a Adapter Factory pública
> identificada na revisão inicial foi removida; os fatos atuais estão no M2 Cleanup e no
> Implementation Log seguinte
>
> Objetivo da fase: [`02-provider-config-and-registry.md`](./02-provider-config-and-registry.md)
>
> Resultado da aposentadoria: [`02-provider-config-and-registry-cleanup.md`](./02-provider-config-and-registry-cleanup.md)

## Conclusão

A M2 já basicamente concluiu a troca da fonte de verdade do Provider. Official, Personal e Account
Config formam a única entrada do Registry; o antigo Provider Store, as ramificações
Catalog/Preset e o Workspace Provider Snapshot deixaram de participar da resolução de estado de um
Provider comum de longo prazo.

Na revisão inicial, cerca de `1.4k–1.9k` linhas do novo código de produção pertenciam às fronteiras
transitórias de runtime, e outras cerca de `0.7k–0.9k` linhas cuidavam da migração única de
configurações e credenciais antigas. Esse número servia para explicar os problemas encontrados na
revisão inicial e não representa mais o tamanho atual do branch; o DTO do formulário de configurações,
a montagem de Runtime Config da execução comum e alguns armazenamentos antigos em Services já
foram removidos no fechamento posterior.

Aqui é preciso distinguir dois tipos de natureza:

```text
Migração única
└─ lê fatos antigos, grava o novo formato e depois sai da cadeia de runtime

Fronteira transitória de runtime
└─ tipos antigos e novos ou mecanismos antigos e novos ainda se conectam na mesma execução
```

O primeiro afeta o volume e o custo de manutenção do código, mas não configura dupla fonte de
verdade em estado estável. O segundo reflete que a UI de configurações, o modelo temporário e a
fronteira de Adapter ainda têm trabalho de fechamento posterior.

## Escala da alteração

Os números abaixo vêm de `git diff origin/staging...HEAD`. A estatística exclui `pnpm-lock.yaml`; a
classificação de arquivos é feita por código-fonte de produção, testes e documentos Markdown e, por
causa da detecção de renomeações e de poucos arquivos de configuração não-Markdown, a soma das
categorias pode diferir em algumas linhas do total do Git.

| Conteúdo                         | Adicionadas | Removidas |
| -------------------------------- | ----------: | --------: |
| Toda a diferença do branch      |     42,805 |    54,206 |
| Excluindo lockfile              |     42,754 |    54,205 |
| Código de produção e config runtime | 17,275 |    24,915 |
| Testes                           |     15,441 |    28,237 |
| Documentos Markdown              |     10,036 |     1,053 |

No novo conteúdo de produção, `@zcode/provider`, `@zcode/provider-node` e Official Config somam `6,436`
linhas, das quais `4,120` linhas são o domínio puro e a implementação Node Source/Repository e `2,316`
linhas são o Official Config. Essa parte constitui o esqueleto de design novo mais concentrado da M2.

## Cadeia de fatos já cortada limpo

Um Provider comum de longo prazo segue hoje a mesma cadeia:

```text
Official Config
      +
Personal Config
      +
Account Config
      |
      v
Process Provider Registry
      |
      +-- Settings / Selection View
      +-- Validação da Selection
      +-- Criação de Model
      └-- Execução da requisição
```

Entry de protocolo de produção, Prompt CLI e TUI todos iniciam o Registry em nível de processo e o
passam para `createZCodeApp()`. Com o Registry habilitado, a antiga lista de modelos explicitamente
não participa dos candidatos de modelo e o antigo `modelCatalog` serve apenas como entrada da
primeira migração. As responsabilidades em estado estável do antigo `ModelProviderService`, do OAuth
Preset Repo, das Catalog Sources e do Workspace Provider Catalog foram removidas.

Portanto, o problema principal hoje não é o antigo Provider Store ainda decidir a execução em
segundo plano, e sim o fato novo precisar passar por várias formas antigas de interface antes de
alcançar consumidores ainda não migrados.

## Fronteiras transitórias de runtime

### O DTO do formulário antigo da página de configurações saiu

A revisão inicial encontrou que a página de configurações ainda convertia bidirecionalmente através
do DTO de formulário antigo:

```text
ProviderSettingsView
        |
        v
DTO de formulário ModelProviderConfig antigo
        |
        v
Edição do usuário
        |
        v
ProviderConfigObject / ModelConfigObject
```

O fechamento posterior removeu `providerSettingsLegacyProjection` e a conversão inversa
correspondente. O formulário do renderer agora carrega diretamente `ProviderConfigObject` e
`ModelConfigObject` e, após salvar, o Provider Settings Facade grava o Personal Config e espera a
atualização do Registry. O rascunho de edição continua sendo estado privado do renderer, mas já não
usa os DTOs antigos de endpoint, kind, modalities ou reasoning patch.

### A ramificação de montagem sem Registry no Core saiu

O fechamento final tornou `providerRegistry` uma dependência obrigatória de `createZCodeApp` e
migrou os testes de Bootstrap, o E2E Compact / Memory e o Prompt Trajectory. O antigo
`RuntimeModelConfig / ModelCatalog` não é mais o fato de Provider do App Factory sem argumentos; os
testes que precisam de modelos customizados criam explicitamente um Registry de teste, e a Entry de
protocolo continua usando o Registry do processo.

Esse fechamento removeu a dualidade em nível de código inicialmente apontada nesta seção.
`RuntimeModelConfig` continua em uso como entrada de Provider temporário do Turn atual e como campo
transitório do Core, e não é mais a origem de App para Providers comuns de longo prazo.

### O modelo temporário do Turn continua emprestando o Runtime Overlay

Essa parte tem cerca de `200–300` linhas, principalmente em:

- `apps/zcode-cli/packages/bootstrap/src/app/turn-execution-model-source.ts`
- `apps/zcode-cli/packages/bootstrap/src/app/turn-model-overlay.ts`
- `apps/zcode-cli/packages/bootstrap/src/app/runtime-model-factory.ts`

Providers comuns já são fornecidos pelo novo Registry. Entradas temporárias, como tarefas ociosas,
ainda passam pelo antigo Turn Overlay e são convertidas em `ExecutionScopedModelSource`:

```text
Provider comum de longo prazo -> Process Registry

Provider temporário do Turn -> Runtime Overlay -> ExecutionScopedModelSource
```

Essa fronteira já está limitada ao escopo do Turn e não grava no Registry nem em Workspace
Preferences. O Provider Overlay em nível de Workspace/Session foi removido. Depois que o design de
Provider execution-scoped for concluído, as conversões do antigo Runtime Model Config e do Catalog
poderão ser removidas.

### O novo Registry é compilado no Registry de execução existente do AI SDK

`provider-registry-model-runtime.ts` adiciona cerca de `448` linhas e compila o Provider Registry no
`AiSdkModelRegistryConfig` existente, criando o `Model` da M1 pelo `AiSdkModelAdapter` existente.

```text
Provider Registry
        |
        v
AI SDK Runtime Registry
        |
        v
AiSdkModelAdapter
```

Essa é uma projeção de implementação de runtime, não uma segunda fonte de verdade: se o modelo
existe, suas Properties, Option Specs e Selection são todos determinados pelo novo Registry. Ela ainda
expõe que o Adapter mantém internamente outra representação de Provider, e os parâmetros de
reasoning também precisam ser convertidos aqui para o antigo formato `providerOptions`.

Essa camada pode evoluir junto com os temas Adapter/Reasoning e não bloqueia o lançamento de Config e
Registry da M2. Se "código transitório" for definido como toda implementação que precisará ser
substituída no futuro, ela deve entrar na contagem; se a auditoria for apenas sobre dupla fonte de
verdade, ela não constitui um item de falha.

### Compatibilidade estreita da identidade de Account

O antigo `accessId` sem escopo de conta e a antiga Coding Plan Key mantêm pouca lógica de resolução e
de primeira importação, cerca de `50–100` linhas. A nova Account Source só produz accessId com
escopo de conta; a compatibilidade em tempo de requisição serve apenas para identificar Model/Session
antigos que já existiam durante a migração.

A condição de saída é o fim da janela de compatibilidade das Sessions antigas e do Credential Store
antigo. O código novo não pode mais gerar Account Access ID sem escopo de conta.

## Código de migração única

A migração única tem cerca de `0.7k–0.9k` linhas, concentradas principalmente em:

- `legacy-cli-personal-provider-config-importer.ts`;
- `legacyPersonalProviderConfigImporter.ts`;
- `legacyAccountProviderApiKeyLoader.ts`;
- as fronteiras `importLegacy` do Personal Config e do Model Selection Repository.

Todas seguem o mesmo ciclo de vida:

```text
Nova config inexistente ou de versão muito antiga
        |
        v
Lê o formato físico antigo
        |
        v
Gera e valida a nova Config versionada
        |
        v
Backup, escrita atomica
        |
        v
Passa a ler somente a nova Config
```

Este conjunto contém o Catalog antigo, o Provider Model antigo, o reasoning patch antigo e defaults
de compatibilidade, o que lhe dá alta complexidade, mas não é chamado inversamente pelo caminho de
estado estável do Registry. Encerrada a janela de migração, esse conjunto deve ser removido por módulo
inteiro, para não evoluir para uma camada de compatibilidade de formato de longo prazo.

## Código complexo, mas que pertence ao design alvo

A resolução de conexão do Account Provider, as Personal/Team Keys, a autenticação em tempo de
requisição e o código de Account Source são igualmente complexos, mas essa complexidade vem da
conta, dos direitos e das credenciais dinâmicas em si. Eles já convergiram para:

```text
Fatos de conta e direitos -> Account Config
Credenciais da requisição  -> Request Auth Service
Provider estático          -> Registry
```

Desde que esses módulos não regerem fatos estáticos de Provider nem repreencham o Registry a partir do
antigo Provider Store, não devem ser classificados como dívida de compatibilidade apenas por
complexidade.

## Ordem de fechamento posterior

O portão central que precisa ser mantido antes do lançamento é: entradas de produção comuns precisam
montar o novo Registry, o Store antigo só pode ser usado para migração única e o Turn Overlay não
pode se estender a Providers de estado estável.

A ordem de fechamento recomendada após o lançamento é:

1. substituir `turnRuntimeModel` e o antigo Overlay na fase de Provider execution-scoped;
2. continuar convergindo a projeção do AI SDK Runtime Registry na fase Adapter/Reasoning, evitando que
   a camada de negócio reinterprete `providerOptions`;
3. depois de encerrada a janela de compatibilidade, remover o código de migração do Personal Config
   antigo, das Account Keys e do accessId sem escopo.

A dependência de Registry de `createZCodeApp()` em produção já virou uma restrição mecânica
obrigatória, e o Harness de testes também precisa montar o Registry explicitamente; isso não pertence
mais aos itens posteriores. A M2 pode entrar no fechamento de lançamento, mas não se pode escrever
"a fonte de verdade já foi unificada" como se fosse "todos os tipos e mecanismos de execução antigos
foram removidos". O primeiro já é verdade; o segundo ainda exige os passos de aposentadoria explícitos
e mensuráveis acima.