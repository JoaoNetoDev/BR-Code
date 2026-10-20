# Serviço de Configuração de Cliente Independente (primeira fase: ordenação de plugins)

## Escopo

O usuário confirmou adicionar um ClientConfigService independente, mas sem migrar ainda a cadeia antiga. Na primeira fase, apenas a leitura de ordenação de plugins
adicionada por este MR sai do CodingPlanSubscriptionService; as requisições, cache, autenticação e estratégias de falha já existentes de plano, validação de segurança, atualização forçada, off-peak, ajuda, Built-in,
gray release do Desktop Main e CLI independente permanecem como estão.
O formato `pluginStoreOrder` do Nacos não muda e não exige ajuste das configurações já publicadas.

## Responsabilidades e Interfaces

- `packages/shared/src/clientConfig.ts`: schema de resposta de configuração pública e o ClientConfigSnapshot jápodado.
- `packages/services/src/client-config/clientConfig.ts`: contrato do IClientConfigService e canal de serviço.
- `packages/services/src/client-config/clientConfigService.ts`: requisição, validação, cache, refresh e coalescência de concorrência.
- `getSnapshot({ forceRefresh? })` retorna os campos públicos validados; atualmente contém pluginStoreOrder, zsrcUrl e uiPluginRecommendations.
  Não retorna a resposta remota inteira nem expõe dados de conta ou provider ao Renderer.
- Quando o serviço tem sucesso mas pluginStoreOrder está ausente/revogado, retorna null; um único esquema com formato corrompido continua degradando conforme o contrato de ordenação original.
  Falhas de envelope/HTTP/rede rejeitam esta leitura e preservam o snapshot já existente no serviço; o lado de negócio decide a exibição padrão.

```mermaid
flowchart LR
  D[桌面插件商店] --> P[client-config RPC]
  M[手机 shared-host attachment] --> P
  R[远程 workspace 服务视图] --> P
  P --> C[窗口 Local Host 的 ClientConfigService]
  C --> A[注入的 ApiClient 和窗口网络策略]
  A --> E[/client/configs]
  O[原有套餐等消费者] --> L[原有读取链路，保持不变]
```

## Estado e Timing

- Uma instância é criada por Local Host de escopo de janela; o conjunto de workspaces remotos injeta explicitamente e registra a mesma instância,
  sem criar um owner de configuração de ordenação remota. O celular usa essa instância via o attachment existente, sem criar outra requisição ou Host.
- Hosts Web/server comuns obtêm sua própria instância a partir de createLocalServices. A home do Web sem Host conectado
  retorna um snapshot público vazio e não emite requisição de rede diretamente.
- Na primeira fase só há leitura pública e sem autenticação de conta, credentials=omit, sem dependência de credentialService.
  A chave de cache é a URL real da requisição (endpoint canônico, app_version, platform); o contexto de requisição é injetado pela montagem do Host.
  Contextos diferentes não compartilham snapshot/requisição em voo, e resultados atrasados só são escritos de volta na key à qual pertencem.
- O TTL do snapshot válido é de 1 hora; requisições em voo do mesmo contexto são coalescidas. O refresh forçado ignora o snapshot válido, mas não o limpa.
  Durante um refresh forçado, a leitura normal ainda pode usar imediatamente o snapshot válido antigo; a substituição só é atômica após o sucesso do refresh.
- A requisição HTTP e a leitura do corpo usam um AbortSignal com orçamento total de 15 segundos por requisição; falhas não são cacheadas e não travam para sempre o estado em voo.
- Devolve uma cópia do snapshot para evitar que consumidores do mesmo processo modifiquem o cache. A UI não ganha TTL de requisição; o hook generation existente
  continua isolando resultados atrasados de desmonte/refresh sobreposto/serviços diferentes.
- Não toca em task/session/owner/queue/stream; a semântica de recuperação de desktop-continuous e web-remote-replayable
  permanece igual. A configuração pública de ordenação não é agrupada por workspacePath nem por workspaceIdentity.

## Superfície de Impacto

Camada alterada: option-source / persistence (owner do cache em memória) / delivery (novo canal de serviço comum).
must-inspect: montagem do Local Host, IServiceAccessor, RemoteServiceAccess, conjunto de serviços de workspace remoto,
Web home-only, usePluginStoreOrder. should-inspect: ordenação da lista após falha/troca de serviço, refresh e troca de esquema.
invariant-only: todas as cadeias antigas de leitura de client/configs, lifecycle de plugins, Main/relay e recuperação de sessão.
O componente compartilhado é o PluginStoreListView; a UI continua lendo pelo hook, e a ordenação por categoria e as regras de migração de categoria não mudam.
O mapa de capacidades de produto existente não tem o nó exclusivo de ClientConfig; por ora ele é registrado no grafo como item pendente, como capacidade pública de configuração por plataforma;
a semântica funcional deste MR adiciona ao grafo as seeds de código reais e o owner único.

## Aceitação

| ID     | Configuração / ação / asserção                                                                                  |
| ------ | ---------------------------------------------------------------------------------------------------- |
| CCF-01 | Leituras paralelas do mesmo contexto → apenas uma requisição HTTP, leituras seguintes acertam o cache; sem leitura de credenciais |
| CCF-02 | Com snapshot válido → leitura normal durante refresh forçado retorna o valor antigo; falha no refresh forçado mantém o valor antigo legível, sucesso com revogação retorna null |
| CCF-03 | Troca de endpoint/version/platform, requisição antiga atrasada → snapshots isolados, sem sobrescrita cruzada                          |
| CCF-04 | Envelope/HTTP/corpo com erro ou pendurado → rejeição com possibilidade de retry, timeout cancela a requisição inteira                     |
| CCF-05 | RPC getSnapshot → campos públicos com tipagem estrita, campos desconhecidos não passam adiante, o chamador não pode modificar o cache    |
| CCF-06 | Múltiplos workspaces remotos / conjunto de serviços server remote → registra a mesma instância injetada                                |
| CCF-07 | dev real / navegador → Code, Work, refresh, categoria vazia e mesclagem dos guides antigos preservados; log usa client-config.getSnapshot |
| CCF-08 | Conferir os três arquivos-fonte de assinatura contra o branch base alvo do MR → alterações deste MR neles são zero, testes da cadeia antiga passam |

O E2E de navegador continua usando os casos existentes manual-review/pending, injetando o novo contrato de serviço; não promover casos oficiais por conta própria.

## Registro de Verificação Desta Rodada

- 97 itens passaram no total: novo serviço, cadeia antiga de assinatura, montagem de serviços remotos, proxy RPC, schema compartilhado e regressão de hook.
- Dois conjuntos de E2E de navegador passaram (1200px inglês claro, 390px chinês escuro), cobrindo a interação de ordenação original e os limites de categoria.
- Após reiniciar o dev real, o log do Host confirmou que a leitura da loja é `client-config.getSnapshot`,
  e `coding-plan-subscription.getPluginStoreOrder` não aparece mais. No menu de avatar real, alternando Code / Work,
  as categorias e os itens no topo de cada categoria conferem com o Nacos de teste, e o número de RPCs para a nova configuração na troca é 0.
- typecheck, lint e a verificação de arquitetura passaram; os 43 warnings preexistentes do lint foram mantidos.
- Os três arquivos-fonte de assinatura estão literalmente idênticos à baseline original do branch, e esta mudança não altera a lógica de assinatura posterior já existente no branch alvo.
- Celular real via shared-host/SSH/WSL/Docker ainda não foi integrado em hardware; o reuso da mesma instância na camada de montagem de serviço já tem teste unitário.

## Campo de Recommendations da UI

`uiPluginRecommendations` retorna o `{ pluginId, surfaceId }[]` já validado; quando ausente ou com formato inválido, retorna um array vazio, sem afetar os demais campos públicos. A entrada de recomendação reaproveita este serviço, sem adicionar cache de requisições nem polling. As regras de configuração e de exposição estão em [spec do mercado de plugins](plugins/plugin-market-interactions-scope.md#side-pane-服务端推荐配置).
