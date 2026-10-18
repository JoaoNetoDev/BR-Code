# Superfície de chamadas do antigo IModelProviderService

> Data da investigação: 2026-08-17
>
> Escopo de aplicação: migração M2 de Host Settings / Selection RPC
>
> Identidade do documento: evidência da superfície histórica de chamadas antes e depois da migração M2. O corpo preserva o estado "atual" no momento da investigação; os principais consumidores já foram migrados, e os DTOs, Snapshots, interfaces e fallbacks antigos ainda não fisicamente aposentados são acompanhados de forma unificada por
> [`../steps/02-provider-config-and-registry-cleanup.md`](../steps/02-provider-config-and-registry-cleanup.md).

## Conclusão

`IModelProviderService` não é um serviço de domínio que possa ser substituído por inteiro. Ele carrega ao mesmo tempo configuração de settings, seleção de modelo, planos de conta, utilitários de conectividade e a ponte de migração Host→Worker. A nova cadeia abandona os métodos antigos conforme o uso:

| Método antigo                                                | Uso principal atual                                         | Destino                                                                                               |
| ------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `getAll` / `getAllCached`                                     | Página de settings, seleção de modelo, UI de uso, sincronização de execução antiga | Settings View ou Selection View; sem distinguir mais "disparar sincronização remota" de "só ler cache"                                    |
| `save` / `delete`                                             | Gravar Provider pela página de settings e pelo formulário de login por API Key | `ProviderSettingsService` grava o Personal Config                                                           |
| `getDisplayOrder` / `saveDisplayOrder`                        | Ordenação na página de settings e no seletor           | Overlay ordenado próprio de ProviderConfig / ModelConfig; a Preference independente antiga sai                                  |
| `resolveWorkspaceModelSelection`                              | Resolução misturada de Provider antigo, Workspace Preference e arquivo de configuração | Removido; o eco unificado do ZCode Agent usa apenas o retorno de prepare, o App Recent e o Model Selection View                  |
| `getEndpointSuggestions` / `getModelsByEndpoint`              | Sugestões de Endpoint e sondagem de modelos remotos no antigo formulário de Add Provider | O formulário de settings atual passou a exigir o preenchimento explícito do Provider Config; as duas interfaces antigas sem chamador de produção e a implementação de consulta `client/configs` foram removidas |
| `getCatalogProviders`                                         | Página de settings lendo o Catalog antigo                | Sai depois que a Official Config substitui o Catalog                                                                    |
| `testModelConnectivity`                                       | Teste explícito de conectividade na página de settings   | Connectivity Service independente; o resultado não entra no Registry                                                         |
| `refreshPresetProviders`                                      | Sincronizar Builtin／Preset remoto e reescrever a Store antiga | Official Config Source / Account Access Source saem depois de cada um refreshing                                                  |
| `refreshCodingPlanApiKey` / `clearCodingPlanApiKey`           | Login, reconexão e troca de plano                         | Account Request Auth / Account Access Service                                                          |
| `setProviderRuntimeHeaders`                                   | Header de verificação de segurança pontual do Start Plan e header temporário | Removido; o header pontual é transmitido apenas pelo Runtime Header response no nível da requisição                                       |
| `getProviderRegistrySnapshot`                         | Teste de conectividade nas settings e poucas chamadas de compatibilidade antigas | O gate de startup local e a seleção de modelo já leem o Selection View; o Snapshot completo só permanece pela compatibilidade de execução restante e sai no final            |
| `applyToProvider`                                             | Sincronizar a seleção antiga e a config completa do Provider com o Agent | Removido; a Submission carrega a Selection e o Worker constrói o próprio Registry                                                  |

O fallback de falha de rede da sincronização do Preset antigo parou de criar Start Plan. A rede de proteção de compatibilidade do Provider por API Key é mantida por enquanto; o Account Provider precisa ser formado pelo Account Overlay a partir da conexão de conta e dos fatos de benefícios, e não pode ser inferido por uma whitelist local de modelos.

## Nova superfície de serviços do Host

O novo Runtime expõe primeiro dois serviços RPC independentes:

```text
ProviderSettingsService
├─ getView
├─ save / delete Personal Provider
├─ save / delete Personal Model Config
└─ reorder Personal Provider / Model

ModelSelectionService
├─ getView
└─ validate(ModelSelection)
```

Eles compartilham o mesmo `ProviderRegistryService` e obtêm os dados de modelo lendo a View mais recente. O evento global de mudança de Registry do antigo `IModelProviderService` já saiu; o Renderer não lê arquivos, Catalog ou Account Access, nem executa Overlay.

## As quatro responsabilidades realmente presentes na página de settings atual

`ModelProviderSection` e `useModelProviders` hoje orquestram quatro tipos distintos de trabalho na mesma página e no mesmo Hook. Dividir por responsabilidade durante a migração é mais seguro do que substituir arquivo de componente por arquivo de componente.

| Responsabilidade                   | Entrada atual                                                | Limite alvo                                                                    |
| ------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------- |
| Edição de config de Provider / Model | `getAll`, `save`, `delete`, display order independente | `ProviderSettingsService`                                                   |
| Conexão de conta e plano       | OAuth, Credential, Subscription, refresh de Coding Plan key | Account Access / Request Auth; não entra no Settings Config                       |
| Teste de conexão                 | connectivity test                                     | Serviço auxiliar de settings independente; o resultado não entra no Registry; as sugestões de Endpoint antigas e a descoberta remota de modelos foram removidas |
| Sincronização de runtime          | Enviar o Snapshot completo do Registry para Workspaces já abertos após salvar | Removido depois que o Worker constrói o próprio Registry                                                |

A parte de Config da página de settings pode ser reescrita primeiro pela nova View, enquanto os cartões de conta e as ações de conectividade continuam chamando seus serviços atuais. Durante a migração, o estado de conta não pode escrever de volta no Personal Provider Config, nem se deve continuar usando o antigo `save/getAll` como fonte de verdade só por manter o teste de conectividade.

## Destino dos campos antigos no novo Config

O antigo `ModelProviderConfig` continha configuração, marcação de Catalog, estado de conta e dados de runtime ao mesmo tempo. Os campos que realmente entram no novo Provider Config são:

| Campo antigo                                                       | Campo novo ou destino                                                                  |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `id`                                                         | key externo `providerId`                                                         |
| `name`                                                       | `label` opcional; na ausência, exibe-se o `providerId`                                           |
| `logoUrl`                                                    | `logoUrl`                                                                     |
| `apiFormat`                                                  | `apiFormat`                                                                   |
| `endpoints.baseURL`                                          | `baseURL`                                                                     |
| `apiKey`                                                     | `apiKey` do API Provider                                                      |
| `apiKeyUrl`                                                  | `apiKeyManagementUrl` do API Provider                                         |
| `headers`                                                    | `headers` estático; a página de settings atual não oferece edição, mas Official / Account Provider podem usar |
| Membros e ordem de `models`                                        | `models` do Provider Config                                                   |
| properties／options／reasoning do modelo                            | Personal `ModelConfig` exato ou `ModelConfigRules` oficial                    |
| `source`, `modified/deleted`, `systemDisabledReason`, timestamps | Não entram no novo Config; são expressos pela camada de configuração, pelo resultado de membros, pelo Account Access ou pelo estado de runtime            |

O antigo `endpoints.paths` não é migrado para o novo Config público. A página de settings atual já permite escolher apenas um `apiFormat`; o limite de gravação limpa paths históricos de múltiplos protocolos e mantém o endereço completo preenchido pelo usuário no `baseURL`. Em runtime, o operation path padrão correspondente é usado conforme o `apiFormat`. Guardar paths no novo Config recriaria o duplo trilho de endpoints que já foi aposentado.

Hoje só o canal de backend é estabelecido; a UI existente ainda não usa os novos tipos. Ao trocar a página de settings, é preciso concluir ao mesmo tempo:

```text
Congelar a entrada de escrita antiga save/delete
        |
        v
Executar a última importação de Config antigo -> Personal Config
        |
        v
O ProviderSettingsService se torna a única entrada de escrita
        |
        v
Remover as escritas da UI antiga e a escrita de display-order independente
```

Esses quatro passos precisam pertencer à mesma sequência de migração; a escrita antiga não pode continuar ocorrendo depois que o novo arquivo Personal for gerado.

## Consumidores que ainda exigem tratamento separado

`getAll/getAllCached` ainda são chamados por Usage, verificação de segurança de versão oficial, migração de Provider Family e ramo de compatibilidade de Bot. Os candidatos, a exibição de status e a migração de startup do Bot local já passaram para o Selection View; a exibição e o aquecimento do Repo Wiki local também já saíram do Snapshot antigo. Session create/resume/set/send, o pré-aquecimento de rascunhos do V4, create replayable／Bot V4 e a troca de modelo de Automation não derivam mais um runtimeModel comum a partir do Snapshot antigo, e a falha da troca de modelo local do V4 também não usa mais o Snapshot antigo para se recuperar; a leitura antiga só é mantida para Entries que ainda não montaram os novos serviços, para o remote `desktop-attached` e para chamadas de compatibilidade explícitas. Nem todas as demais chamadas precisam do mesmo tipo de dado:

- Chamadas que apenas exibem ou selecionam modelo passam a ler o Selection View.
- Chamadas que precisam editar configuração explícita passam a ler o Settings View.
- Chamadas que precisam de identidade de plano ou credenciais passam a ler o Account Service.
- Chamadas que precisam executar modelo criam o Model pelo Registry.
- Chamadas que existem apenas para a sincronização Host→Worker são removidas junto com a ponte de migração.

Por isso, a troca da UI não pode ser implementada como "converter a nova View de volta para `ModelProviderConfig[]`"; isso manteria a estrutura completa antiga como fonte de verdade implícita e preservaria a mesma semântica misturada.

## Semântica de migração do proxy do Client

`RemoteServiceAccess` cria o proxy diretamente com base no nome do canal; a existência do objeto de proxy não significa que o outro lado já registrou o canal. Portanto, os campos opcionais em `IServiceAccessor` são apenas compatibilidade de montagem de TypeScript durante a migração, e `service !== undefined` não pode ser usado como negociação de capacidade remota.

A página de settings atual lê os Provider Settings do Local Host da própria janela. Enquanto o novo Registry do Environment remoto ainda não estiver conectado, o caminho segue pela antiga cadeia de serviços remotos. Depois que todas as Entries registrarem os novos canais, a marcação opcional é removida; caso no futuro seja necessária a detecção de capacidade de Host entre versões, deve-se adicionar uma capacidade explícita ao protocolo, em vez de inferir pela existência do objeto de proxy.