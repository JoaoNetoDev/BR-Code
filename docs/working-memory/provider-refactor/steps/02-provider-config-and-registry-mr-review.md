# Revisão estática do Merge Request M2

> Estado: os problemas anteriores ao lançamento foram encerrados um a um; para os itens já corrigidos, valem o status nas tabelas, o corpo do texto e o log de implementação
>
> Data: 2026-08-20
>
> Baseline da revisão: os problemas originais foram encontrados em `origin/staging` `cf009a3b199c`; o estado final é o do M2 Cleanup e do Implementation Log
>
> Objetivo da etapa: [`02-provider-config-and-registry.md`](./02-provider-config-and-registry.md)

Este documento registra os problemas encontrados na revisão estática completa do Merge Request M2, as correções já confirmadas e as fronteiras que ainda exigem discussão posterior. Ele não modifica o Design; itens que envolvem semântica de novo produto ou fronteiras de arquitetura continuam precisando de discussão item a item.

Os problemas originais vêm da revisão estática completa, e todas as correções posteriores acrescentaram o teste falho correspondente e uma regressão direcionada. A verificação completa final e as evidências de falha de baseline estão registradas no item 251 do log de implementação.

## Julgamento atual

| Número | Problema | Entendimento atual | Status |
| --- | --- | --- | --- |
| R1 | A página de configurações passou por conversão bidirecional do antigo `ModelProviderConfig` compartilhado | O estado de edição do Renderer virou uma View de mesma origem do Config oficial; os campos antigos do Store e a conversão inversa saíram da página de configurações | Encerrado |
| R2 | Criar um Provider custom exigia uma Settings View já existente | Na criação é permitido faltar a View herdada, e salva-se direto a partir do Draft completo do formulário; editar um Provider existente continua reutilizando a View | Corrigido |
| R3 | Account Access poderia entrar no Personal Config | A projeção Personal ignora o `accessId` dinâmico injetado pelo Account Overlay, mantendo a fronteira de fatos entre Official, Personal e Account | Corrigido |
| R4 | A diferença de `reasoningMapping` conflita com a semântica geral de Overlay | Quando o Mapping muda, salva-se o campo completo, coerente com a regra de cobertura total dos campos de valor comum | Corrigido |
| R5 | A renovação de autenticação da requisição reintroduzia o Registry | O snapshot estático de execução do Provider é fixado na criação do Model; a autenticação da requisição só cobre a API Key e os Headers desse snapshot | Corrigido |
| R6 | Logout e novo login poderiam reutilizar uma Coding Plan Key antiga | A identidade da conta é capturada antes da limpeza do OAuth e a Key de escopo da conta é removida; um novo login força a renovação da Key a partir do novo Token | Corrigido |
| R7 | O salvamento das configurações poderia sobrescrever uma modificação concorrente do Personal Config | O salvamento do Effective já foi movido para o `update()` atômico do Repository, e dentro do lock só se modifica o Provider alvo e a regra exata do modelo correspondente | Corrigido |
| R8 | Uma falha na atualização da conta podia deixar um pending reason não consumido | Depois de liberar o in-flight, a rodada que falhou continua consumindo automaticamente os eventos que chegaram durante o período; o último snapshot bem-sucedido permanece inalterado | Corrigido |
| R9 | O teste de Connectivity ainda chamava parâmetros antigos de Probe | O "testar conexão" de produção foi mantido; os testes especializados foram migrados para a forma de requisição do Provider/Model Config oficial | Corrigido |
| R10 | O Remote Workspace misturava fatos de modelos remotos com serviços de conta locais | O Remote Host/Worker passou a usar o Config, Credential, Account Source e Registry próprios do remoto; o Desktop não distribui mais Provider/Secret | Encerrado; o Provisioning Sync pertence ao M7 |

## Cadeia de edição das configurações

A página de configurações conduz uma sessão de edição por meio de um estado de edição privado do Renderer. Esse estado usa diretamente a estrutura de campos do Config oficial:

```text
ProviderSettingsView
        |
        v
ProviderSettingsFormProvider
├─ providerId + Registry 投影状态
├─ config: ProviderConfigObject
└─ models: { modelId, config: ModelConfigObject }[]
        |
        | 用户编辑
        v
ProviderConfigObject / ModelConfigObject
        |
        v
相对 Official Config 投影 Personal Config
```

O código relacionado está concentrado em:

- `packages/ui/src/lib/providerSettingsFormProjection.ts`;
- `packages/ui/src/lib/providerPersonalSave.ts`;
- `packages/ui/src/hooks/useModelProviders.ts`.

O estado de edição expressa apenas o estado interativo editável da página de configurações, e não serve como contrato de armazenamento físico, de Registry ou de execução de modelo. A estrutura de campos tem a mesma origem do Config oficial, e o Renderer não mantém mais a semântica antiga de Store como endpoints, kind, modalities e ProviderOptionsPatch.
Depois de salvar o Effective Config completo, Facade/Repository continuam responsáveis por calcular o Personal Overlay esparso em relação ao Official Config.

O bloqueio imediato da criação de Provider já foi corrigido à parte. O novo `providerId` ainda não entrou no Registry, portanto naturalmente não há item correspondente na Settings View atual; o salvamento e o teste de conexão constroem o Effective Config direto a partir do Draft completo de Provider/Model do formulário de criação.
Ao editar um Provider existente, o Renderer copia o Effective Config completo da Settings View, os controles visíveis ao usuário modificam apenas o campo correspondente e os campos não expostos são preservados como estão. O Access dinâmico da conta também já foi isolado da projeção Personal na camada de domínio.

Se no futuro for preciso distinguir nos controles valores herdados e valores Personal explícitos, aí sim evoluir o estado de edição para um Personal Draft:

```text
ProviderSettingsView
├─ effectiveConfig：渲染最终效果
├─ personalConfig：用户显式 Overlay
└─ inherited/default：输入控件的继承提示
        |
        v
Personal Provider Draft
        |
        v
针对目标 Provider 的 Personal Config 写入
```

Isso é uma melhoria posterior da interação de configurações e não afeta a remoção desta rodada do dualismo de campos antigos. O estado de edição atual não lê configuração física, não constrói Registry, não decide a disponibilidade de modelos nem cria Model.

## Projeção do Model Config

Hoje a página de configurações edita diretamente apenas Model ID, Context Window e Max Output Tokens, sem novo controle de edição de Reasoning Mapping. O estado de edição preserva o `ModelConfigObject` completo, então quando o usuário modifica outros campos não é preciso converter o Reasoning Mapping em um Patch antigo e restaurá-lo depois:

```text
ModelConfigObject.reasoningMapping
        |
        | 其他字段原位编辑
        v
ModelConfigObject.reasoningMapping
```

`ModelConfig.overlay()` trata `reasoningMapping` como cobertura integral de um valor comum. A projeção do Personal Config segue a mesma regra: quando o Mapping não muda, nenhum campo Personal é escrito; quando muda, o Mapping completo é salvo.

## Fronteira entre Model e autenticação da requisição

O Account Request Auth Service é responsável por obter a API Key e os Headers do período da requisição. A revisão estática encontrou que o Adapter chamava novamente o `resolve()` completo do AI SDK Registry atual depois de obter o `ModelRequestAuth`:

```text
已绑定 Model
        |
        | 请求前刷新鉴权
        v
Account Request Auth Service
        |
        v
ModelRequestAuth
        |
        v
当前 Registry 完整 resolve(providerId, modelId)
```

Isso fazia o mesmo Loop, após uma atualização do Registry, obter novamente Endpoint, API Format, Provider Factory, Headers ou Provider Options. Após a correção, `bindModel()` captura na criação do Model a configuração estática de execução do Provider e as capacidades do Model;
cada tentativa de requisição combina apenas a API Key/Header dinâmica sobre esse snapshot e só então cria o SDK Model daquela tentativa. Atualizações posteriores do Registry afetam apenas os Models criados depois.

Roteamento físico de rede, proxy e infraestrutura de assinatura continuam pertencendo aos serviços dinâmicos de requisição do Adapter; eles podem se atualizar conforme o próprio ciclo de vida, mas não alteram a identidade de Provider fixada no Model, o protocolo, o Endpoint, os Provider Options ou os Headers estáticos. Os testes cobrem a sequência em que, após a substituição a quente do Registry, o Model antigo continua usando o Provider Factory e os Headers estáticos originais enquanto recebe o material de autenticação mais recente.

## Ciclo de vida da Account Credential

A nova Personal Coding Plan Key usa um Access ID com identidade de conta:

```text
coding-plan:<provider>:account:<accountIdentity>
```

O tratamento antigo de logout apagava apenas a Key sem escopo de conta:

```text
coding-plan:<provider>
```

A OAuth Session era limpa antes da execução do Logout Handler, de modo que o Handler não conseguia obter a identidade da conta que estava saindo. Após a correção, o OAuth Service lê o Profile ID atual antes de limpar a sessão principal e o repassa junto do Provider ID ao Logout Handler. O Handler remove a Key exata de escopo da conta e, dentro da janela de compatibilidade, continua limpando a Key antiga sem escopo de conta. Logout explícito, unlink, invalidação de JWT expirado e logout-all seguem essa cadeia de passagem de identidade; quando a recuperação por credencial corrompida não consegue obter a identidade de forma confiável, ainda se limpa pelo menos a Key antiga, e o Account Source desativa o Provider.

A correção do novo login já foi feita à parte: o `oauth-login-entitlement` realmente emitido pelo Renderer após o login agora dispara `forceCredentialRefresh`, e um novo login da mesma conta também pula o cache antigo, obtendo e sobrescrevendo a Coding Plan Key com o novo OAuth Token. O refresh histórico de `oauth-callback` continua compatível.

A renovação forçada no novo login e a remoção precisa no logout fecham juntos a janela de reutilização de Coding Plan Key antiga. No prazo mais longo ainda pode se usar um parâmetro estruturado de refresh para expressar `forceRefreshCredentials`, tirando a explicação por string de reason do logout; isso é limpeza de interface e não afeta mais a corretude do ciclo de vida atual das credenciais.

## Escrita concorrente no Personal Config

`PersonalProviderConfigRepository.update()` já fornecia lock de arquivo entre processos e read-modify-write dentro do lock. O problema estava no salvamento comum das configurações, que calculava o Personal Config inteiro a partir de um snapshot antigo do Registry e depois, via `replacePersonalConfig()`, ignorava o conteúdo mais recente lido dentro do lock.

O salvamento comum agora mantém o lock existente e completa a atualização alvo dentro dele:

```text
获得文件锁
        |
        v
读取最新 Personal Config
        |
        v
只修改目标 providerId 和对应精确模型
        |
        v
原子写回并释放锁
```

`ProviderSettingsFacade` entrega o Effective Provider e a configuração exata do modelo ao `ProviderConfigService`; o Service lê o Personal Config mais recente no `update()` do Repository, calcula a projeção em relação ao Official e substitui somente o `providerId` alvo e sua regra exata de modelo. Regras de Pattern e atualizações concorrentes de outros Providers permanecem inalteradas. A substituição total é usada apenas em migração de versão e em importação total explícita.

## Temporização da atualização da conta

O laço de atualização atual lança erro e sai em uma falha de resolução. Se um novo evento de atualização chega durante a espera pela resolução, ele fica em `pendingReasons`, mas `finishRefresh()` apenas limpa a marca de in-flight e não inicia a próxima rodada:

```text
刷新 A 进行中
        |
        +-- 新事件 B 进入 pending
        |
        v
A 失败并退出循环
        |
        v
B 无执行者
```

A implementação agora verifica o pending após o fim do in-flight atual; se ainda houver eventos, inicia automaticamente a próxima rodada. O chamador de A continua recebendo a falha, e o último snapshot bem-sucedido é preservado. Um teste dedicado cobre a sequência completa "refresh A bloqueado, evento B chega, A falha, B continua publicando um novo snapshot".

## Connectivity

Provider Connectivity continua sendo uma capacidade real de produto. A linha de modelo da página de configurações oferece a entrada de testar conexão, passando por `IProviderSettingsService.testModelConnectivity()` e pela nova cadeia de Config e Account Request Auth.

O que estava desatualizado eram as três chamadas diretas em `packages/services/test/modelProviderConnectivityProbe.test.ts`, que ainda passavam o antigo `endpoints/model/provider`, enquanto o Probe de produção já recebe `baseURL/modelId/modelConfig/providerId`. Esses testes foram migrados para as entradas oficiais e continuam cobrindo URL de requisição, Header, Reasoning Mapping e corpo de requisição do protocolo. A capacidade de produto Connectivity e a implementação de produção não foram alteradas nesta rodada.

## Fronteiras da etapa após a revisão

Os problemas de corretude de execução e bloqueadores de lançamento encontrados nesta revisão foram encerrados. Em seguida a página de configurações passou a usar diretamente o Config/View oficial, e o DTO de formulário antigo interno do Renderer também foi removido; ver a seção 281 do Implementation Log.

O trabalho restante é apenas a capacidade de produto independente do M7: o Provisioning Sync de local para remoto e as operações de configuração remota. A autoridade factual do Registry remoto permanece no remoto; essa capacidade não restaura o Host Snapshot nem altera a cadeia de fatos de Provider do M2.