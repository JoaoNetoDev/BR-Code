# M2: agregação e refresh do Registry

> Status: levantamento do estado histórico; as conclusões já entraram no design alvo e na implementação do M2
>
> Data: 2026-08-13
>
> Finalidade: preservar a implementação, os limites e as questões em aberto no início do M2; os termos “atual” e “ainda pendente” no corpo mantêm o contexto da época

> O estado atual do M2 está em [`../steps/02-provider-config-and-registry.md`](../steps/02-provider-config-and-registry.md);
> os encadeamentos legados restantes estão em [`../steps/02-provider-config-and-registry-cleanup.md`](../steps/02-provider-config-and-registry-cleanup.md).
> Os nomes candidatos, itens em aberto e esquemas de agregação deste documento servem apenas para explicar o processo de levantamento.

O que o M2 precisa resolver é como o Model surge a partir dos fatos atuais do Provider. Ao discutir o Registry, é fácil misturar três coisas: como o Registry consulta múltiplos Provider Source, se o Registry guarda o resultado agregado e como as mudanças chegam aos consumidores. Este documento separa as três.

## Para onde foram as conclusões do levantamento

O design alvo já absorveu as seguintes conclusões:

```text
Config / Account Sources
          |
          | change
          v
Registry 构造不可变 View 与轻量索引
          |
          +-- 查询返回当前 View
          `-- 变化事件通知消费者重新读取
```

Cada processo tem sua própria instância de Registry; Host e Worker compartilham a implementação, não o objeto em memória. O evento expressa que a View antiga expirou, e os dados completos continuam sendo fornecidos pela interface de consulta. Ver o design correspondente em [`../design/registry/runtime.md`](../design/registry/runtime.md).

Ainda cabe ao M2 determinar como cada Source combina invalidação ativa, file watcher e freshness check, qual estratégia adotar quando a refresh de um único Source falha e como o Snapshot completo atual Host → Worker sai de cena.

`Builtin Provider Source` e `Temporary Provider` neste documento são nomes de código da época da investigação. O design atual usa Official Config + AccountProviderAccess e Provider com escopo de execution para delimitar seus objetivos.

## Limites já confirmados

Dentro do mesmo Environment, os processos que precisam da capacidade de Provider têm cada qual sua instância de Registry. Host, Core Worker, Prompt CLI e TUI reutilizam a mesma implementação de Registry, mas não compartilham objetos dentro do processo.

```text
同一 Environment 的 Provider Facts
               |
       +-------+--------+
       |                |
       v                v
 Host Registry     Worker Registry
       |                |
       v                v
 查看、选择模型       解析 Selection、创建 Model

Prompt CLI / TUI
└─ 在自己的进程内直接使用同一套 Registry 实现
```

O Host é responsável por ver e selecionar modelos. A Submission carrega `ModelSelection`, e o Core Worker cria o Model realmente executado a partir dos Provider Facts do seu próprio Environment. O Host enviar um Snapshot completo do Registry ao Worker é o encadeamento da fase atual de migração; o estado alvo deixa de depender dele.

Provider Config é apenas uma das fontes de Provider Facts. Builtin Provider, Temporary Provider e Environment remoto têm estados e ciclos de vida próprios; não se pode inferir a implementação completa do Registry a partir da forma de refresh da configuração local.

Nesta fase não expandimos a questão de o Model interno fazer cache de HTTP Client, connection pool ou objetos do Provider SDK. O M2 define primeiro os limites de origem, agregação, consulta e refresh.

## Consulta e notificação são dois problemas

O Registry pode acessar cada Source diretamente no momento da consulta:

```text
registry.listModels()
        |
        +--> Local Provider Source
        +--> Builtin Provider Source
        +--> 其他 Source
        |
        v
     合并结果
```

Essa implementação não necessariamente precisa guardar uma cópia agregada completa, mas ainda pode precisar de notificação de mudanças. Isso porque consumidores como o seletor de modelos no Host e os portões de disponibilidade de modelo, enquanto permanecem abertos, precisam saber que os dados ficaram desatualizados. Caso contrário, seria preciso puxar tudo de novo a cada interação, ou deixar cada página decidir quando fazer o refresh.

Portanto, a responsabilidade mais precisa é:

```text
查询接口
└─ 返回调用时的当前 Provider / Model 视图

变化事件
└─ 告诉长期存活的消费者：旧视图已经过期，请重新读取
```

“Publicar mudanças para fora” significa primeiro um evento no processo; não equivale a transmitir o Registry inteiro para outros processos, nem a sincronizar Registry entre si.

## Modos de agregação comparados no levantamento

### Agregação no momento da consulta

O Registry não guarda resultado agregado; cada consulta visita os Sources e combina os resultados. A relação entre objetos é a mais simples, mas cada consulta repete a resolução de conflitos, a ordenação e o cálculo de Descriptor; e se vários Sources mudarem durante a própria consulta, a mesma consulta pode enxergar instantes de tempo inconsistentes.

### View agregada materializada

O Registry guarda uma View atual imutável. Depois que um Source muda, uma nova View é construída e a antiga é substituída de uma só vez.

```text
Source A contribution ----\
                           +--> Registry View v2
Source B contribution ----/            |
                                       v
                            list / lookup / descriptor
```

A consulta é barata e a View é consistente, mas o Registry precisa lidar com refresh, concorrência e falhas. Aqui “guardar uma cópia” também não precisa significar copiar profundamente todos os Providers, Models ou recursos de execução; pode bastar guardar as contribuições imutáveis dos Sources e um índice de consulta leve.

### Estado por Source mais índice leve

Esta é a que vale mais a pena continuar validando: o Registry mantém a contribuição atual de cada Source, e a camada de agregação mantém apenas índices leves para lookup, agrupamento, ordenação e escolha de conflito. Cada Source é responsável por obter e atualizar os fatos; o Registry não assume o estado interno dos Sources.

```text
Local Source   -> Local contribution ----\
                                         +--> lookup / grouped descriptors
Builtin Source -> Builtin contribution --/
```

Essa comparação impulsionou o design alvo atual de “View imutável + índice leve”. Os Sources continuam sendo donos dos seus mecanismos de obtenção e refresh; o Registry materializa uma visão estática adequada à consulta e não assume o estado de rede, de arquivos ou de conta dos Sources.

## Como o código funcionava antes da migração

Este trecho registra a implementação legada anterior ao início do M2; ele é preservado para explicar o motivo da migração. O antigo Desktop Host tinha uma implementação de “cachear snapshot,
invalidar e notificar”:

```text
Provider Store / Family Settings / Runtime Headers / Plan 状态
                              |
                              v
                 ModelProviderService
                 ├─ 缓存 Registry Snapshot
                 ├─ save/delete 等操作使缓存失效
                 └─ 重新构造 Snapshot 后触发全局事件
```

O código ficava em `packages/services/src/model-provider/modelProviderService.ts`. `getProviderRegistrySnapshot()` fazia cache de
`ZCodeProviderRegistrySnapshot`; ao salvar ou apagar um Provider, mudar o estado de Plan ou os Headers de runtime,
`emitProviderRegistryChanged()` invalidava o cache, relia e carregava o Snapshot completo no evento.

Antes da migração, o encadeamento de Host para Core Worker era:

```text
ModelProviderService.onDidChangeProviderRegistry
                    |
                    v
ZCodeAgentService
├─ 对每个 active workspace 排队
├─ 用 revision / generatedAt 去重和防旧快照覆盖
└─ workspace/updateProviderRegistry
                    |
                    v
Core Worker Workspace Catalog
├─ 清空并重建 Provider Map
├─ 更新现有 Session 的相关投影
└─ 发布 workspace state / session settings 变化
```

`packages/services/src/zcode-agent/zcodeAgentService.ts` assinava o evento do lado do Host e empurrava o snapshot;
`apps/zcode-cli/packages/bootstrap/src/zcode-protocol/workspace-model-catalog.ts` aplicava o snapshot dentro do Worker.
Era uma cadeia de cópia de snapshot completo entre processos, que saiu do caminho de produção local nesta rodada da migração do M2; o encadeamento
de compatibilidade de saída do remote desktop-attached é registrado à parte e não pode servir de base para restaurar o push global local.

Antes da migração o Renderer não assinava uniformemente uma Registry View:

- `useModelProviders` mantinha outro snapshot de Provider Config em nível de módulo, atualizado por `getAllCached()`, `getAll()`, salvamento otimista e refresh explícito, alimentando a página de configurações e a de chat.
- O portão de disponibilidade de modelos do Draft assinava `onDidChangeProviderRegistry` e adotava diretamente o Snapshot do evento quando ele chegava; na primeira montagem, lia um Snapshot ativamente.
- O Repo Wiki assinava o mesmo evento, mas usava o evento apenas como sinal de invalidação e depois chamava `getAllCached()` novamente.
- A assinatura na raiz do App servia principalmente para marcar workspaces remotos como “precisam ressincronizar o Provider Registry”.

Portanto, o sistema antigo tinha ao mesmo tempo um Provider Config UI Snapshot, um Host Registry Snapshot, um Worker Workspace Catalog e várias formas de refresh.
O mecanismo de notificação em si não era o problema; o que era problema é que a origem, a semântica e as responsabilidades entre processos dessas Views não convergiram. A versão atual já removeu o antigo
`IModelProviderService.onDidChangeProviderRegistry`; o que permanece é a notificação de mudança de View do próprio Registry Service novo, além da
invalidação de cache mantida internamente no Service antigo para os testes de conectividade.

## Semântica de notificação já incorporada ao design alvo

Para consumidores de longa duração dentro do mesmo processo, “busca inicial + notificação de mudança + nova busca” fica mais claro:

```text
消费者启动
    |
    +--> registry.list...() 取得当前视图
    |
    `--> 订阅 registry.onDidChange
                       |
                       v
                 收到失效通知
                       |
                       `--> 重新读取当前视图
```

O evento pode carregar apenas revision, motivo ou escopo afetado; os dados completos continuam sendo fornecidos pela interface de consulta. Assim, notificação e leitura de dados não criam duas fontes de autoridade. Se são necessários eventos mais granulares, isso será decidido depois que os usos de leitura da página de configurações, do seletor de modelos e do lado de execução forem organizados.

Ao criar um novo Model, o Core Worker também precisa garantir que o Registry que ele usa já reflete os Provider Facts mais recentes. Esse requisito não equivale à assinatura da UI: um Source específico pode fazer refresh ativo, observar mudanças externas ou fazer freshness check antes da consulta. Quem chama o Registry não deve saber detalhes de file watcher, mtime ou de requisições de um Plan.

## Questões que o M2 ainda precisa resolver

1. Como o Local Provider Source trata de forma unificada gravação pelo Service, modificação externa de arquivo e refresh concorrente.
2. Quando a refresh de um único Source falha, se mantém a última View bem-sucedida ou publica o resultado sem a fonte que falhou.
3. Se o evento de invalidação do Registry precisa carregar revision, motivo ou escopo afetado; a View completa não vai no evento.
4. Em que ordem o encadeamento atual de Host empurrando Snapshot completo para o Worker sai de cena, preservando ao mesmo tempo o uso interno por CLI/TUI.

A forma de cachear objetos de Model dentro do Registry e a posse dos recursos de execução do Provider não são decididas por este levantamento; ver [`../design/registry/model-creation.md`](../design/registry/model-creation.md).