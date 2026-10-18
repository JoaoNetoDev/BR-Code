# Sincronização de fatos de modelos remotos do Client Config (removida)

> Status: descontinuada desde a consolidação Provider M3, em 2026-08-22.
>
> Fonte de verdade do design atual: `docs/working-memory/provider-refactor/steps/03-staging-integration.md`.

## Conclusão

`/api/v1/client/configs` não é mais a fonte de verdade do Provider / Model Registry. Os campos `builtinProviders`, `providers`, `builtinModels` e `magic_name` do protocolo antigo foram removidos da cadeia de análise e sincronização do cliente, não são mais gravados na configuração pessoal de Provider e não servem mais como fallback de capacidades de modelo para Runtime, Catalog ou Workspace Snapshot.

A configuração estática agora tem apenas dois caminhos bem definidos:

```text
ZCode Built-in Provider Config
    -> Account Provider Config
    -> Personal Provider Config
    -> Effective Provider Config

ZCode Built-in Model Config Rules[]
    + Personal Model Config Rules[]
    -> Effective Model Config Rules[]
    -> aplicam-se ao Effective Provider Config
    -> Effective Model Config
```

Neles:

- Os membros de modelo do Provider, o Endpoint, o tipo de API e a visibilidade em tempo de execução são expressos pelo Provider Config;
- context, max output, modalities, reasoning e o mapeamento de parâmetros de API são expressos pelas Model Config Rules;
- A interface de Account ainda pode retornar `models[]` em escopo de conta para Providers de contas Built-in, mas não oferece capacidades estáticas de modelo;
- O Personal Provider Config tem efeito por último;
- O comportamento de reasoning de um modelo específico não é mais decidido por casos especiais no código-fonte nem enviado por regex remoto, mas declarado pelas Built-in / Personal Rules.

## Limites preservados de `/client/configs`

Essa interface continua carregando configurações de produto remotas, como sku, controle de risco, force update, rollout gradual (canary) de Agent e feature toggles de produto. Ela pode continuar fornecendo `offPeak.enable_offpeak_task`, mas não fornece mais membros de modelo nem capacidades de modelo para tarefas ociosas.

O caminho atual das tarefas ociosas é:

```text
models do Built-in Provider `builtin:offpeak-idle-plan`
    + Effective Model Config
    -> fatos estáticos de modelo do formulário de criação e da execução

Vínculo de uma execução ociosa única
    -> Endpoint, JWT, Coding Plan key, ticket e outros materiais de acesso
```

`builtin:offpeak-idle-plan` usa `executionOnly: true` e não entra na seleção normal de modelos nem no Provider Settings. O servidor continua sendo o árbitro final sobre a allowlist de modelos, a elegibilidade da conta e a autorização das requisições.

## Nota histórica

A implementação antiga chegou a mesclar fatos de modelos remotos nos Providers locais e usava `modified` / `deletedModels` para tratar sobrescritas e remoções do usuário. Essa semântica de sincronização, lápides e fallback já saiu do sistema e não deve ser reintroduzida como caminho de compatibilidade. Ao adicionar ou ajustar fatos de modelo, deve-se alterar o ZCode Built-in Provider Config / ZCode Built-in Model Config Rules, ou o usuário deve sobrescrever via Personal Config.