# Limite de Domínio da Família de Provedores ZAI / BigModel

> **Nota sobre implementação histórica, substituída pelo Provider Group, Account Overlay e Access Config
> do Provider Refactor.** O `AppSettings.providerFamilyDomain`, o `ModelProviderService` e a cadeia de
> filtragem do Registry descritos no texto não são mais a fonte de verdade atual dos Provedores. O
> design atual está em `docs/working-memory/provider-refactor/design/`.

O limite de exclusividade mútua entre os provedores de modelo integrados ZAI / BigModel do ZCode é
determinado pelo provider family domain escolhido após o usuário conectar com sucesso. O estado de login
OAuth continua registrando o provider do login atual, mas deixa de ser a única fonte de verdade do domínio
de execução dos provedores de modelo.

## Fonte de verdade

- O domínio de execução do provedor de modelo atual usa `AppSettings.providerFamilyDomain`, com valor
  `"zai"` ou `"bigmodel"`.
- `providerFamilyDomain` só é gravado na WelcomeScreen após sucesso no login OAuth ou ao salvar uma API Key.
- `providerFamilyDomainMigrated` marca se os dados antigos já foram migrados, evitando que, após o logout, o
  usuário seja restaurado automaticamente pelo antigo `oauth:active_provider`.
- O provider do login OAuth do App continua usando `oauth:active_provider`, representando apenas o fato de
  autenticação.
- O espelho de login ZAI usa `oauth:zai:*`, onde `zcodejwttoken` é o JWT do runtime do ZAI Start Plan.
- O espelho de login BigModel usa `oauth:bigmodel:*`.
- Não se usa mais uma conexão de provedor independente como fonte de verdade.

## Regras de exclusividade mútua

- Quando `providerFamilyDomain` não está selecionado, a WelcomeScreen exibe as entradas de conexão ZAI e
  BigModel.
- Com `providerFamilyDomain === "zai"`, o grupo ZAI fica disponível e o grupo BigModel é desabilitado pelo
  sistema e filtrado do provider registry.
- Com `providerFamilyDomain === "bigmodel"`, o grupo BigModel fica disponível e o grupo ZAI é desabilitado
  pelo sistema e filtrado do provider registry.
- A troca para outra família de provedores só tem efeito após sucesso no login OAuth ou ao salvar uma API
  Key; cancelar ou falhar não altera o domain atual.
- O ModelProviderService limpa a apiKey derivada dos domínios não atuais e grava
  `systemDisabledReason: "oauth_provider_inactive"`. Esse reason mantém o nome histórico; o significado atual
  é provider family inativo.
- O Unlink de um provedor ZAI / BigModel equivale ao App logout do active provider correspondente; não há
  mais interface de unlink de conexão de provedor independente.
- O logout ZAI limpa simultaneamente a apiKey / availability derivadas de `builtin:zai-coding-plan` e
  `builtin:zai-start-plan`; o logout BigModel limpa `builtin:bigmodel-coding-plan`.
- Ao encerrar a sessão / desvincular o `providerFamilyDomain` atual ou ao remover a última credencial
  disponível do domain atual, `providerFamilyDomain` é limpo e `providerFamilyDomainUpdatedAt` é atualizado.
  `providerFamilyDomainMigrated` permanece true.

## Projeção em runtime

- O provider registry sincroniza somente os grupos ZAI / BigModel correspondentes ao `providerFamilyDomain`
  atual.
- O ZAI Start Plan só projeta `zcodejwttoken` no registry quando `providerFamilyDomain === "zai"`.
- A atualização da key do Coding Plan só deve ocorrer após login ou um Connect explícito; a sincronização
  normal dos metadados de preset não deve restaurar uma key antiga entre provedores.

## Migração de dados

- Se `providerFamilyDomain` já existir, não sobrescreve a escolha do usuário.
- Se `providerFamilyDomain` não existir e `providerFamilyDomainMigrated !== true`, é feita uma migração única a
  partir do estado antigo na inicialização:
  - Quando `oauth:active_provider` for `"zai"` ou `"bigmodel"`, grava o mesmo domain.
  - Sem active provider, mas com apenas uma família possuindo credencial local disponível, grava essa família.
  - Com credenciais dos dois lados ou sem credenciais em nenhum lado, não grava domain e espera a
    WelcomeScreen deixar o usuário escolher.
- Independentemente de a inferência ter sucesso ou não, grava `providerFamilyDomainMigrated = true`, evitando
  migrações repetidas depois.