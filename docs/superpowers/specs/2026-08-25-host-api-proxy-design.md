# Design do Proxy de APIs de Negócio Externas do Host

## Status

- Fase: implementada; em 2026-08-28 foi adicionado o consumidor explícito de porta para download de recursos remotos.
- Feedback relacionado: `ZCT-2092222819015462912`.
- Camadas de mudança: `commit-effect`, `validation`.
- O proxy de Host do `NodeApiClient` descrito aqui já foi implementado; a extensão de download de recursos remotos continua reutilizando o mesmo transport com escopo de requisição.

## Resumo do Problema

A página de configurações já aplica `httpProxy`, `httpProxyNoProxy` e `httpProxyCaCertPath` à Session do Electron e injeta a configuração de rede correspondente ao iniciar o Agent, mas as requisições de APIs de negócio externas do próprio Window Host não consomem essas três configurações.
A autorização de navegador OAuth e o callback de deep-link podem ter sucesso, mas o token exchange posterior do Host ainda se conecta diretamente à internet pública; em redes com proxy obrigatório, a requisição acaba expirando.

```text
Browser                  Electron Main              Window Host
   | OAuth authorize          |                         |
   |------------------------->|                         |
   | callback / deep-link     |                         |
   |------------------------->| route callback          |
   |                          |------------------------>|
   |                          |                         | NodeApiClient
   |                          |                         | -> global fetch
   |                          |                         | -> direct egress
   |                          |                         | X corporate firewall
```

## Fatos, Inferências e Desconhecidos

### Fatos Confirmados

- `AppSettings` é a autoridade de persistência para proxy explícito, No Proxy e CA customizado no desktop; a página de configurações informa que a mudança tem efeito após reiniciar.
- `packages/services/src/providers/api/nodeApiClient.ts` chama `globalThis.fetch` por padrão, sem política de rede do Host.
- `packages/services/src/node.ts` cria o `NodeApiClient` compartilhado pelo conjunto de serviços locais; OAuth, configuração de provedores de modelo, Coding Plan, usage, client scenes, feedback, metadados de Repo Snapshot e outros serviços o reutilizam.
- `packages/desktop/src/host/remoteWorkspaceServiceCollection.ts` cria um segundo `NodeApiClient` para os serviços globais locais do remote desktop-attached; OAuth, credenciais e fatos de plano continuam sendo deterr pelo Host do desktop.
- A construção do ambiente de Main para o Host limpa as variáveis `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY` e de CA do shell; isso faz parte do desenho de isolamento existente e não pode ser contornado herdando novamente as variáveis de ambiente.
- O Host ainda tem saídas por `fetch` direto de Bot, telemetry, upload para object storage e off-peak, que não pertencem à fronteira atual de API de negócio unificada do `NodeApiClient`.

### Inferências Apoiadas por Evidências

- Injetar no `NodeApiClient` um fetch explícito ciente de proxy é suficiente para corrigir as falhas de OAuth, Coding Plan e `client-scenes` do ticket, sem precisar modificar cada serviço de negócio.
- Um dispatcher global de processo alteraria simultaneamente tráfego de terceiros, intranet, local e de upload de objetos que não pertence a este ticket no Host, com uma superfície de regressão claramente maior.

### Saídas Posteriores Classificadas

- O manifesto de recursos remotos, os arquivos de componente e o `HEAD` de progresso de SSH/WSL/Docker desktop-attached já foram classificados: pertencem a downloads gerenciados pelo app, reutilizam o transport do ciclo de vida do Host deste desenho, mas são injetados por uma porta explícita `RemoteAssetNetworkPort`, sem definir dispatcher global.
- Se Bot, telemetry, upload de objetos de Repo Snapshot e outros `fetch` nus devem seguir o proxy do App ainda exige uma classificação de saídas separada; não se responde antecipadamente pelo produto com um dispatcher global.
- O proxy do sistema não é uma fonte implícita para as APIs gerenciadas pelo app do Host. Quando vazio, mantém-se a conexão direta; se no futuro for adicionado um fallback de sistema, é preciso definir à parte uma fronteira de confiança diferente da do navegador embutido do Electron.

## Contrato de Arquitetura

### Grafo de Fronteiras

```text
setting.json
  httpProxy / httpProxyNoProxy / httpProxyCaCertPath
                 |
                 | Host 首次构造网络出口时异步读取并冻结
                 v
       HostApiNetworkPolicySnapshot
                 |
                 v
        request-scoped fetch transport
          | final URL -> No Proxy?
          |             | yes -> direct dispatcher + optional CA
          |             ` no  -> proxy dispatcher + optional CA
          v
             NodeApiClient
          /       |        \
       OAuth   Coding Plan  client-scenes / provider / usage / feedback

通过显式 port 复用该 transport：
  desktop-attached remote manifest / component archive / progress HEAD

不进入该边界：
  Electron Session | Agent/CLI | Bash/stdio MCP | Bot direct fetch
  telemetry direct fetch | object-upload fetch | RPC/WS/SSH | relay
```

### Decisão D1: A autoridade das configurações permanece inalterada

**Escolha**: o Host só lê `AppSettings.httpProxy`, `AppSettings.httpProxyNoProxy` e `AppSettings.httpProxyCaCertPath`; valor vazio significa conexão direta ou confiança TLS padrão. Continua limpando as variáveis padrão de proxy e de CA do shell do usuário.

**Motivo**: consistente com as regras existentes de isolamento de rede do app/provider, evitando comportamentos invisíveis e não diagnosticáveis herdados do shell de inicialização.

**Não escolhido**: remover a limpeza das variáveis de rede padrão feita por `sanitizeZCodeRuntimeEnv`; usar `NODE_USE_ENV_PROXY`.

### Decisão D2: Usar dispatcher por requisição, sem dispatcher global de processo

**Escolha**: criar um fetch ciente de proxy na fronteira de provider HTTP de Node em `packages/services` e injetá-lo por `NodeApiClientOptions.fetchImpl`. O modo proxy usa o dispatcher explícito do `undici`; o modo direto mantém o dispatcher direto.

**Motivo**: altera apenas as requisições já declaradas como saída unificada de APIs de negócio externas, preservando a injeção de dependências e a substituibilidade em testes.

**Não escolhido**: chamar `setGlobalDispatcher` na inicialização do Host. Isso assumiria sondagem de remote server, Bot, telemetry, upload e requisições localhost, exigindo decisões de produto extras e uma matriz de regressão.

### Decisão D3: Congelar a configuração pelo ciclo de vida do Window Host

**Escolha**: quando cada Window Host precisar da política de rede pela primeira vez, ler as configurações e o arquivo de CA de forma assíncrona por meio de uma Promise single-flight e construir um snapshot imutável; o snapshot é reutilizado durante todo o ciclo de vida do Host. Alterações de configuração passam a valer no próximo reinício do app/Host.

O transport de política é um recurso gerenciado, não-RPC, da coleção do Host: a coleção local e a coleção do remote desktop-attached registram cada uma seu disposer de ciclo de vida; saída síncrona dispara um destroy best-effort, e saída por espera faz await do fechamento do dispatcher. Não se deve registrar o transport como um serviço de negócio invocável pelo renderer nem depender apenas do encerramento do processo para reciclar o pool de conexões.

**Motivo**: mantém o contrato existente da página de configurações de "tem efeito após reiniciar", evita ler o disco a cada requisição e evita trocar o pool de conexões com requisições em andamento.

**Fronteira de falha**: quando a leitura das configurações falha, a requisição atual falha de forma fechada (fail closed), e não se pode cachear a Promise rejeitada; requisições posteriores podem reler as configurações e tentar de novo. Quando há configuração explícita, mas o proxy ou a CA são inválidos, é preciso falhar fechado nessa requisição, sem voltar silenciosamente à conexão direta.

### Decisão D4: Reescrever o endpoint primeiro, depois escolher a saída

**Escolha**: o `NodeApiClient` primeiro reescreve o endpoint ZCode padrão, conforme as regras existentes, para o endpoint efetivo atual, e só então executa a escolha de No Proxy e de dispatcher sobre a URL final.

**Motivo**: o No Proxy precisa casar com o alvo real, e não com o domínio de produção antes da reescrita.

### Decisão D5: No Proxy e CA customizado consistentes com a semântica explícita existente

**Escolha**: o No Proxy suporta `*`, host exato, host:port, `.example.com` e `*.example.com`; quando há correspondência, apenas o proxy é contornado, não a CA customizada. A CA customizada é usada tanto no TLS direto quanto no proxy HTTPS e no TLS do alvo após o HTTP CONNECT.

**Fronteira de falha**: quando o arquivo de CA não existe, não é legível ou não pode ser analisado, as requisições gerenciadas pela política retornam um erro de rede estruturado; não se deve desligar a verificação de TLS.

### Decisão D6: A fronteira de owner entre workspace local e remoto permanece inalterada

**Escolha**:

- desktop local: o `NodeApiClient` do `createLocalServices` local usa a política do Host.
- desktop-attached SSH/WSL/Docker: o Agent/IO de arquivos remoto permanece inalterado; dentro do Host do desktop, os serviços app-global de OAuth, provider, usage, Coding Plan e client scenes usam a mesma classe de política do Host.
- server remote: continua usando os serviços autoritativos do server, sem que o Host do desktop sobrescreva sua saída de rede.
- celular `/remote`: apenas reutiliza o attachment de shared-host já existente; não adiciona estado de Agent, Host, relay nem protocolo de configuração de rede.

### Decisão D7: Logs de diagnóstico pouco frequentes e anonimizados

**Escolha**: registrar no máximo uma vez um log de ciclo de vida para a construção bem-sucedida ou falha do snapshot de política; a escolha de saída por requisição só é permitida em `debug`, e os campos incluem apenas `mode`, host de destino anonimizado, host de proxy, correspondência de No Proxy e custom CA enabled, sem registrar credenciais de proxy, URL completa, código OAuth, token ou valor de header.

## Resumo de Impacto

### Resumo de Funcionalidade

| Campo                      | Valor                                                                            |
| -------------------------- | -------------------------------------------------------------------------------- |
| Intenção do desenvolvedor   | Fazer as APIs de negócio externas do Host seguirem a política explícita de proxy da página de configurações |
| Capacidade                 | Política de rede de API gerenciada pelo app do Host                              |
| Camada de mudança          | commit-effect, validation                                                         |
| Modo de operação           | planning                                                                         |
| Sementes principais        | `NodeApiClient`, `createLocalServices`, `createRemoteWorkspaceServiceCollection` |
| Fora de escopo             | dispatcher global, governança de `fetch` nu, UI, protocolo, estado session/replayable |

### Matriz de Superfícies de UI

| Cenário do usuário | Entrada de UI                                              | Implementação compartilhada          | Owner de exibição/rascunho  | Origem do default/herança | Validação/gating               | Ação de commit           | Autoridade/persistência     | Limite de modo                                          | Deve permanecer isolado de                             |
| ------------------ | ---------------------------------------------------------- | ----------------------------------- | --------------------------- | ------------------------- | ------------------------------- | ----------------------- | --------------------------- | ------------------------------------------------------- | ----------------------------------------------------- |
| Configurar proxy   | Settings / General / Network                               | `GeneralSectionContent`              | SettingsPage local draft    | `AppSettings`             | schema da config + normalização | `settingService.update` | `setting.json`             | configurações do desktop; após reinício Host/Agent/Session aplicam cada um | proxy implícito do ambiente shell              |
| Login OAuth        | entrada de login do provider                               | `OAuthService` + `NodeApiClient`     | estado pendente do OAuth    | snapshot de política do Host | estado, callback, rede/TLS   | token exchange          | credential repo            | identidade local do remote desktop-attached              | identidade do server remote e Agent remoto             |
| APIs de negócio em background | entradas de Coding Plan, scenes, provider, usage, feedback etc. | `NodeApiClient` compartilhado | cada serviço de negócio    | snapshot de política do Host | URL, No Proxy, TLS, timeout | requisição de API       | cada owner de negócio     | não altera a entrega desktop/mobile                     | saídas nuas de Bot, telemetry e object upload          |

### Relacionamentos de Funcionalidade

| Rank           | De                            | Aresta semântica                | Para                                           | Condição                 | Por que inspecionar  | Evidência                                    |
| -------------- | ----------------------------- | ------------------------------- | ---------------------------------------------- | ------------------------ | ------------------- | -------------------------------------------- |
| must-inspect   | configurações de rede do desktop | fornece política explícita para | política de rede de API do Host                | próximo ciclo de vida do Host | autoridade da configuração | `settingService.ts`, textos da página de configurações |
| must-inspect   | política de rede de API do Host | injeta transport em              | `NodeApiClient`                                | HTTP(S) gerenciado pelo app | ponto único de correção | `nodeApiClient.ts`                        |
| must-inspect   | política de rede de API do Host | conecta em                       | coleções local e remote desktop-attached       | serviços app-global locais | dois pontos de montagem do client | `node.ts`, `remoteWorkspaceServiceCollection.ts` |
| conditional    | troca de endpoint              | reescreve antes de              | escolha de proxy/No Proxy                     | override de dev/test     | precisa casar com a URL final    | `NodeApiClient.request`                      |
| invariant-only | política de rede de API do Host | não deve alterar                | desktop-continuous / web-remote-replayable    | todas as requisições    | sem mudança de estado de sessão  | documentação de arquitetura                  |
| invariant-only | política de rede de API do Host | não deve se tornar global       | fetch direto / WS / SSH / RPC                  | primeira fase            | controlar a superfície de regressão | lista atual de saídas diretas              |
| evidence-only  | política de rede de API do Host | coberta por                      | testes unitários/integrados focados           | implementação           | prova, não dependência de produto | casos aceitos abaixo                      |

### Owners de Estado e Destinos de Commit

| Estado/fato                        | Owner de rascunho/exibição | Owner autoritativo       | Comando/serviço de commit  | Persistência/cache                  | Evidência                              |
| ---------------------------------- | --------------------------- | ------------------------- | -------------------------- | ---------------------------------- | -------------------------------------- |
| proxy / no-proxy / caminho da CA   | SettingsPage                | `AppSettings`             | `settingService.update`    | `setting.json`                     | `settingService.ts`                    |
| política efetiva do Host           | nenhum                     | processo do Window Host   | criação lazy do snapshot   | snapshot em memória do processo + disposer | fronteira de provider planejada |
| callback OAuth pendente             | UI/serviço do OAuth         | `OAuthService`            | `handleCallback`           | memória do processo + credential repo | `oauthService.ts`                      |
| API app-global de remote workspace | projeção de UI do remote    | Window Host do desktop    | coleção de serviços local  | configurações/credenciais locais   | `remoteWorkspaceServiceCollection.ts`  |

### Invariantes a Preservar

| Invariante                                                                              | Superfícies/modos             | Prova necessária                                        | Evidência                     |
| ---------------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------- | ----------------------------- |
| Sem proxy explícito configurado, as APIs de negócio do Host continuam em conexão direta    | todas                         | teste direto                                            | `HAP-001`                    |
| Falha de proxy explícito não pode recair em conexão direta                                 | rede com proxy obrigatório    | contagem de conexões diretas a montante capturada = 0    | `HAP-004`                    |
| As APIs de identidade local do remote desktop-attached usam a política do desktop; o server remote não é sobrescrito | modos remotos                 | testes de wiring                                        | `HAP-008/009`                |
| Não altera as saídas de Agent, Electron Session, Bot, telemetry e object upload           | todas                         | verificações de dependência e regressão                | `HAP-010`                    |
| Não altera o estado continuous/replayable, a identidade do workspace nem o estado de sessão | desktop/mobile/remote         | nenhum diff de protocolo/schema/estado                 | diff estático + testes existentes |

### Evidências de Codegraph

O ambiente atual não tem uma ferramenta de codegraph que possa ser chamada; conforme o fallback da skill, usa-se rastreamento preciso de símbolos/texto, com profundidade de expansão 2.

| Semente                  | Consulta                | Chamadores diretos / caminho principal                                                  | Profundidade | Interpretação                    |
| ------------------------ | ----------------------- | -------------------------------------------------------------------------------------- | ----------- | -------------------------------- |
| `createNodeApiClient`    | callers                 | `createLocalServices`, `createRemoteWorkspaceServiceCollection`                          | 1           | dois pontos de wiring obrigatórios |
| `NodeApiClient.request`  | callers/consumers       | OAuth, provider, Coding Plan, usage, client scenes, feedback, metadados de snapshot     | 2           | saída unificada de API de negócio |
| `settingService.get`     | caminho principal       | AppSettings -> snapshot lazy de política do Host                                        | 2           | autoridade da configuração e semântica de reinício |
| `fetch` direto           | inventário de texto     | Bot, telemetry, object upload, off-peak, sondagem de sistema                            | 1           | item de evidência; não é dependência de produto deste ciclo |

### Drift do Grafo e Delta

O feature graph existente só declara a política de rede do renderer do Electron / Browser embutido, e não tem um nó de política de rede de API gerenciada pelo app do Host. A fase de planejamento adiciona uma capacidade, serviço, evidência e arestas independentes, sem ampliar a semântica da capability de Browser existente.

## Planejamento de Casos

### Registro de Esclarecimentos

| Rodada | Pergunta                        | Resposta do usuário                                                          | Fronteira fixada                             | Necessita acompanhamento |
| ------ | ------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------- | ------------------------- |
| 1      | Volume de mudança e escopo cobertos pelo Host | o usuário continua usando `zcode-plan`; mantém-se a abordagem de `NodeApiClient` com escopo já sugerido | corrigir primeiro as APIs gerenciadas pelo app, sem dispatcher global | não                 |

### Decisões de Fronteira

| Fronteira         | Decisão                        | Inclui                       | Exclui / poda                      | Fonte                   |
| ----------------- | ------------------------------ | ---------------------------- | ----------------------------------- | ----------------------- |
| escopo do transport | injeção de fetch com escopo   | consumidores de `NodeApiClient` | fetch global/direto           | código + análise de risco |
| fonte de configuração | apenas AppSettings         | proxy/no-proxy/CA            | proxy do shell/sistema ambiente   | spec existente          |
| ativação          | próximo ciclo de vida do Host | local + remote desktop-attached | troca a quente em tempo real  | contrato da UI de configurações |
| owner remoto      | manter a autoridade atual     | serviços app-global do desktop | override do server remote     | documentação de arquitetura |

### Dimensões e Combinações Candidatas

| Candidate ID | Estado                                  | Evento                          | Alvo/superfície               | Guard/efeito esperado                                | Status   | Observações               |
| ------------ | --------------------------------------- | ------------------------------- | ------------------------------ | ---------------------------------------------------- | -------- | ------------------------- |
| HAP-001      | sem política explícita                  | requisição de API               | endpoint ZCode                 | direta, comportamento existente                      | accepted | baseline                  |
| HAP-002      | proxy explícito                         | callback OAuth                  | URL final do token             | exatamente uma requisição via proxy                  | accepted | ticket principal          |
| HAP-003      | proxy + No Proxy correspondente         | requisição de API               | alvo exato/sufixo/host:port    | direta, a CA ainda se aplica                         | accepted | semântica de bypass       |
| HAP-004      | proxy inalcançável                      | requisição de API               | endpoint externo                | falha estruturada, zero fallback direto              | accepted | invariante de segurança   |
| HAP-005      | CA customizada, sem proxy               | requisição HTTPS                | endpoint com CA privada        | TLS direto bem-sucedido                              | accepted | CA direta                 |
| HAP-006      | proxy + CA customizada                  | requisição CONNECT              | endpoint com CA privada        | TLS do túnel bem-sucedido                            | accepted | caminho corporativo       |
| HAP-007      | configurações alteradas durante o ciclo de vida do Host | requisição posterior | mesmo Host                     | snapshot antigo até reiniciar; novo Host usa o novo valor | accepted | contrato de reinício    |
| HAP-008      | remote desktop-attached                 | requisição local de OAuth/Coding Plan | serviço local do Host do desktop | política do desktop se aplica        | accepted | autoridade local          |
| HAP-009      | server remote                           | requisição de API pertencente ao remote | serviço do server       | a política do Host do desktop não a substitui        | accepted | isolamento de autoridade  |
| HAP-010      | proxy explícito                         | fetch direto fora do ApiClient  | Bot/telemetry/object upload    | inalterado nesta fase                                | accepted | guarda de escopo          |
| HAP-011      | override de endpoint + No Proxy         | requisição                      | endpoint reescrito             | casa com a URL final                                 | accepted | ordenação                 |
| HAP-012      | timeout/abort                           | resposta em streaming via proxy | ApiClient                      | comportamento atual de abort/timeout/stream preservado | accepted | paridade de transport     |
| HAP-013      | apenas proxy do sistema/shell           | requisição de API               | Host                           | ignorado; direto                                      | accepted | invariante de sanitização |

### Decisões de Poda

| Decision ID | Combinações podadas                      | Guard/invariante                                     | Motivo no produto                                    | Cobertura representativa        |
| ----------- | ---------------------------------------- | ---------------------------------------------------- | --------------------------------------------------- | ------------------------------- |
| P-001       | proxy x todos os serviços de negócio     | todos compartilham o `NodeApiClient` injetado        | evitar testes de negócio duplicados                 | OAuth + client genérico + testes de wiring |
| P-002       | permutações de entrega desktop/mobile     | sem mudança de protocolo/estado                      | o transport de rede fica abaixo da semântica de negócio do RPC | verificação estática de fronteira |
| P-003       | todos os tipos de alvo remoto            | SSH/WSL/Docker compartilham a autoridade app-global do desktop-attached | teste de wiring representativo do remote desktop-attached | `HAP-008`  |
| P-004       | comportamentos de produto com fetch direto | fora do transport com escopo                       | exige decisão de owner separada                      | apenas o invariante `HAP-010`    |

### Casos Aceitos e Evidências

| Case ID      | Setup                                        | Ação                                        | Asserções                                            | Camadas de evidência      | Status E2E |
| ------------ | -------------------------------------------- | ------------------------------------------- | ---------------------------------------------------- | ------------------------- | ---------- |
| HAP-001      | sem configurações                            | requisição ao servidor de teste            | sucesso direto, sem agente de proxy                 | unit + rede               | planned    |
| HAP-002      | proxy CONNECT local; rota direta negada      | completar a requisição de token do OAuth    | o proxy observa a URL final; a resposta tem sucesso  | unit + integração/rede    | planned    |
| HAP-003      | padrões de bypass explícitos                 | requisição a alvos correspondentes e não    | dispatcher correto escolhido                         | unit                      | planned    |
| HAP-004      | proxy morto                                  | requisição com upstream direto acessível    | falha sem atingir o upstream                         | integração/rede           | planned    |
| HAP-005/006  | endpoint com CA privada; direto/proxy        | requisição ao endpoint                      | o TLS só tem sucesso com a CA configurada            | integração/rede           | planned    |
| HAP-007      | escrever a configuração após a primeira requisição | segunda requisição, depois recriar Host/client | políticas de ciclo de vida antiga/nova observadas | unit                      | planned    |
| HAP-008/009  | fixtures de coleção remote                   | resolver serviços locais e do server        | autoridade correta do client                         | unit de wiring             | planned    |
| HAP-010      | spy de fetch direto                          | construir o client com escopo               | fetch/dispatcher global inalterado                   | unit/estático              | planned    |
| HAP-011      | reescrita de endpoint de teste               | requisição à URL de produção                | o No Proxy vê a origem reescrita                     | unit                      | planned    |
| HAP-012      | servidor lento/em streaming                  | abort e timeout                             | semântica atual de `ApiError`/stream preservada       | unit + rede                | planned    |

Não é necessária prova formal em conversa nem handoff de E2E em conversa; esta mudança não adiciona estado de produto, command, snapshot ou combinações replayable. Um smoke test real de proxy obrigatório no Windows é uma verificação complementar antes do lançamento e não substitui os testes determinísticos de integração de proxy local.

## Ordem de Implementação (testes primeiro)

1. Escrever testes falhando para o snapshot de política de rede do Host e para o fetch com escopo de requisição: direto, proxy, No Proxy, CA, fail-closed, abort.
2. Escrever testes de injeção e de escolha de rota após a reescrita de endpoint no `NodeApiClient`.
3. Implementar o provider de política de rede de API do Host dentro de `packages/services`; é proibido fazer IO de arquivo síncrono.
4. Integrar ao `createLocalServices`, depois ao conjunto de serviços locais do remote desktop-attached, e incluir o fechamento do transport na liberação de recursos das duas coleções, tanto síncrona quanto por espera.
5. Adicionar testes de montagem/isolamento, confirmando que `setGlobalDispatcher` não é chamado, que o server remote e o fetch direto permanecem inalterados e que o dispatcher não deixa handles abertos.
6. Executar os testes direcionados, `pnpm typecheck` e `pnpm lint`; quando possível, rodar também o smoke test de proxy obrigatório no Windows.

## Riscos e Rollback

| Risco                                        | Forma de contenção                                              |
| -------------------------------------------- | --------------------------------------------------------------- |
| Proxing indevido de localhost / intranet / remote server | client com escopo + No Proxy + proibição de dispatcher global |
| Correspondência errada no override de endpoint | teste de reescrita antes do roteamento                          |
| Vazamento de conexão direta após falha do proxy | teste de integração fail-closed, contando hits diretos a montante |
| CA cobrindo apenas um trecho do TLS           | validação separada para direto, proxy HTTPS e CONNECT           |
| Vazamento de pool de conexões ou dispatcher    | mantido pelo ciclo de vida do Host e fechado no dispose do serviço; teste de handles abertos |
| Deriva da semântica de atualização a quente das configurações | snapshot imutável de ciclo de vida, textos da página de configurações inalterados |

O rollback exige apenas reverter a injeção de fetch do `NodeApiClient` e o provider de política do Host; não há schema, protocolo, credenciais, formato de configuração ou migração de dados, e os caminhos de rede existentes do Electron Session e do Agent não são afetados.

## Conclusão da Implementação

Owner, origem da configuração, escopo, momento de ativação, fronteira remota, modo de falha, testes e rollback foram implementados e consolidados.
Se as demais saídas de rede nuas do Host devem seguir o proxy do App ainda exige classificação item a item, e não pode ser contornado por um dispatcher global. O download de recursos remotos já foi consolidado, em spec separada, como consumidor explícito de porta, sem alterar as saídas restantes de Bot, telemetry, object upload e demais.