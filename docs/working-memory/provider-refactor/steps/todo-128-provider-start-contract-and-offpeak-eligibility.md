# Todo128：contrato de start de Provider e correção da atualização de elegibilidade off-peak

> Estado: **implementação local e review aprovados, aceitação em máquina real pendente para o lote completo**. Em 2026-09-11 foram unificados o contrato de start/leitura e a atualização da elegibilidade off-peak; a verificação de serviços controlados no navegador não equivale à aceitação do pacote Air real.
>
> Escopo: interface de ciclo de vida do Provider, pontos de consumo do valor de retorno, e a atualização e o controle de concorrência da checagem de elegibilidade de tarefas off-peak.
>
> Relacionados: [Todo11 Rascunho de fronteira de composição do Runtime](./todo-11-provider-runtime-composition-boundary-cleanup.md), [Todo127 Publicação online](./todo-127-builtin-online-release.md). Este Todo não habilita a remoção de shell, renomeação ou reestruturação de owner ainda não decididas no Todo11; nem implementa o plano de download online e alinhamento Account/Built-in do Todo127.

## 1. Contexto e evidências de revisão

O usuário relatou que o Air já tem Team Plan, mas a página de automações continua desabilitando «criar tarefa off-peak», com a mensagem «仅限 coding plan 用户使用».

Em 2026-09-11 foi feita uma investigação somente leitura das configurações, logs e pacote de instalação do Air, confirmando:

- A seleção atual é BigModel Team Plan; não há ID de conta, organização, projeto ou credencial salvos em documento.
- O log do Air `~/.zcode/v2/logs/2026-09-11.log` registra às 23:01:21 (horário original do log) BigModel Team Plan como `availability: available / entitled: true / current: true`, e o Provider off-peak do BigModel também já está `entitled: true`.
- O código do Host no pacote instalado do Air é idêntico ao do repositório: o `resolveAccountProvider()` off-peak filtra os Coding Plan Providers a partir do valor de retorno de `await providerRuntime.start()`, e esse Runtime memoriza a Promise do primeiro start e o primeiro snapshot.
- Não houve reinício do Air, alteração de sua configuração de conta, criação de tarefa off-peak real nem leitura da memória completa em execução; os logs e o código do pacote comprovam que a atualização de conta e a implementação com defeito existem, mas isso não permite escrever esta investigação como uma aceitação ponta a ponta pós-correção.

A escrita problemática apareceu pela primeira vez no commit `90b2cf83ceb9f25af7fd32315a390729d83f22a8`, de título `refactor(provider): unify provider config and registry`; hora do autor 2026-08-20 18:43:17 +08:00, hora do commit 2026-08-21 11:17:22 +08:00. O `start()` nesse mesmo commit já memoriza o primeiro valor de retorno. O `bec05c983c1159126c10fbfcf578da73f85248a2`, de 2026-08-31, apenas move a closure de resolução para fora para ser compartilhada entre o serviço off-peak e o despacho do Host, e não pode ser tratado como a primeira introdução com base no blame atual.

Durante a revisão foi feita uma validação local isolada com as classes e o Store reais, com dados em diretório temporário e sem requisições de rede reais:

```text
ProviderRuntime 首次启动：account-old
Account 更新并等待 Registry.refresh 完成：account-new
再次 runtime.start()：仍是 account-old，且与首次返回对象 ===
registryService.getSnapshot() / registryService.start()：account-new

NodeProviderConfigRuntime：Personal 更新完成后，start() 仍返回首次对象；
configService.read() 已返回新的 Personal revision。

闲时 Store：旧请求 A 尚未完成 → 新请求 B 返回 Team Plan supported=true
          → A 后返回 supported=false → Store 被覆盖回 false
```

Essas são evidências de isolamento da falha, e não casos de regressão já adicionados ao repositório. Na implementação é obrigatório escrever primeiro os testes formais.

## 2. Decisões confirmadas e escopo

1. Os quatro `start()` de Provider são unificados como `Promise<void>`, responsáveis apenas por iniciar e aguardar a primeira prontidão.
2. Os dados de negócio são lidos explicitamente do Config/Registry; não se pode reter de forma durável o primeiro estado através da Promise de start.
3. A elegibilidade off-peak é rechecada depois que o Registry conclui as atualizações relevantes, e o refresh manual da página também inclui a checagem completa de elegibilidade.
4. A inicialização da página, a mudança de conexão e o refresh manual compartilham a lógica de coordenação da checagem; resultados e erros obsoletos não podem sobrescrever o estado atual.
5. As regras existentes de plano, credenciais, cota e executabilidade de modelos são preservadas; o problema não é resolvido afrouxando a elegibilidade.
6. **O Composer não é alterado**. Na rodada anterior sobre sessão de tarefa agendada e rascunho do Composer, o usuário já disse explicitamente «não alterar agora»; não é permitido incluir isso na implementação.
7. Não se altera o schema de persistência, não se adicionam arquivos de configuração ou tabelas, e não se muda a estrutura de seleção de conta/conexão, o protocolo de autenticação de requisição ou a seleção de modelos existente.

## 3. Interfaces e limites de leitura após a mudança (camada por camada)

### 3.1 Interface de ciclo de vida

| Objeto | Resultado atual em uma nova chamada | Resultado após a confirmação |
| --- | --- | --- |
| `ProviderRuntime.start()` | snapshot de Registry do primeiro start, memorizado | `Promise<void>` |
| `NodeProviderConfigRuntime.start()` | snapshot de Config do primeiro start, memorizado | `Promise<void>` |
| `ProviderRegistryService.start()` | snapshot de Registry atualmente concluído | `Promise<void>` |
| `NodeProviderRegistryRuntime.start()` | repassa o snapshot de Registry subjacente | `Promise<void>` |

O `ProviderConfigRuntime.start()` dos Services é um wrapper de repasse do Node Config Runtime e também precisa passar a `Promise<void>`.

Preservar a deduplicação de start, o retry de falhas existente, a ordem do primeiro carregamento, a assinatura de mudanças e a liberação completa de recursos. Não é permitido repetir a inicialização, registrar listeners ou disparar refresh de rede só para que cada `start()` devolva dados novos. O tipo do callback de ready dos Facades deve expressar «apenas aguardando prontidão», sem se apoiar mais em `Promise<unknown>` para afrouxar a restrição.

### 3.2 Leitura e atualização de dados

```text
await start()                    apenas aguarda a primeira prontidão
      |
      +--> configService.read()          lê a configuração atual
      `--> registryService.getSnapshot() lê o snapshot derivado atual e já concluído

Account / Config mudam
      |
Registry recalcula e publica um novo snapshot
      |
notificações de mudança existentes → consumidores leem o estado atual
```

«Snapshot atual» significa a atualização de Registry **concluída** mais recente; não há promessa de aguardar requisições de rede de conta em andamento. A conclusão de `start()` também não significa que atualizações posteriores de Account terminaram; fluxos que precisam aguardar a aplicação do refresh continuam usando a fronteira explícita de conclusão/notificação do refresh.

Mantém-se o Config/Registry atual como única fonte de verdade, sem adicionar um segundo cache de «estado mais recente do Provider». A responsabilidade explícita de refresh de `refresh()` não é incorporada a `start()`.

### 3.3 Todos os pontos de consumo do valor de retorno

| Local da chamada | Uso atual | Requisito de implementação |
| --- | --- | --- |
| `resolveAccountProvider()` off-peak em `packages/services/src/node.ts` | filtra continuamente os plano Providers no snapshot devolvido por `start()` | aguardar o start e então ler o Registry atual; preservar a conexão corrente única, entitlement, modelo e restrições de autenticação |
| Log de start do mesmo arquivo | registra a versão da configuração de start e a contagem de Providers | ler o Registry explicitamente após a conclusão do start |
| `packages/provider-node/src/provider-registry-runtime.ts` | quando a Account Source ainda não foi inicializada, constrói um snapshot padrão indisponível a partir do Config | aguardar o start do Config e ler a configuração necessária a partir de `configService.read()` |
| `packages/services/src/model-provider/providerRuntime.ts` | memoriza e devolve externamente o resultado do start do Registry | memorizar a Promise de prontidão, sem devolver mais snapshot de negócio |
| `apps/zcode-cli/packages/bootstrap/src/app/process-provider-registry-runtime.ts` | salva o resultado do start do Node Registry Runtime como o `snapshot` externo | ler o snapshot de start explicitamente para o log único necessário, sem usar essa propriedade como leitura contínua de estado |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-entrypoint.ts` | usa o `snapshot` acima para escrever o log de start | adaptar junto com o item anterior; em tempo de execução continua sendo usado o serviço de Registry |
| Testes e camadas de wrapper | devolvem e asseveram o snapshot de start | passar a aguardar o start e asseverar pela interface de leitura; sincronizar o tipo de retorno |

As configurações de Provider, a seleção de modelos, o MCP oficial, Bot, Wiki, a geração de informação de commit do Git, a preparação de start de Agent e as entradas de despacho de configuração já foram verificadas: usam serviços separados ou apenas aguardam prontidão; não são registradas incorretamente como tendo todas o defeito do snapshot antigo. A superfície de execução do Prompt/TUI da CLI usa o serviço de Registry, e o consumo de produção atual do `snapshot` de start externo é o log de start do Protocol. Rodar uma verificação de referências antes de implementar, para não deixar passar novas chamadas posteriores.

## 4. Cadeia de atualização da elegibilidade off-peak (camada por camada)

### 4.1 Momentos de disparo

Atualmente o `AutomationsSection` inicializa ao abrir a página e recheca quando a seleção de família/conexão muda em Settings; ele não usa a aplicação da atualização de Account ao Registry como critério de rechecagem. O refresh manual hoje atualiza apenas a lista de tarefas e a cota de número, perdendo a elegibilidade de plano.

Cadeia alvo:

```text
Trocar a conexão de conta
      |
a elegibilidade antiga é invalidada e a entrada de criação fica aguardando confirmação
      |
Refresh de Account concluído → atualização de Registry concluída e notificada
      |
rechecar o plano atual e as credenciais da requisição
      |
elegibilidade aprovada → consultar a cota de número → entregar à página o resultado válido da mesma geração
elegibilidade reprovada/falha → manter a regra existente de criação proibida
```

- A abertura da página continua fazendo uma checagem completa.
- Reutilizar as notificações de mudança de Provider já existentes, disparando a checagem de elegibilidade só depois de confirmar que as atualizações relevantes do Registry foram concluídas; não se pode tratar mudança em Settings como conclusão da resolução de conta.
- A ordem do refresh manual é checagem de elegibilidade e, se necessário, checagem de cota; o refresh da lista de tarefas pode ocorrer de forma independente.
- Verificar os demais pontos de entrada off-peak que compartilham o Store (incluindo `OffPeakNewTaskEntry`) para garantir a mesma fronteira de coordenação, evitando que uma montagem duplicada crie um segundo conjunto de checagens.
- Não usar nova polling periódico nem atraso arbitrário para esperar o estado de Account. Não criar um novo Agent/Host para a checagem de elegibilidade e não deixar a página se tornar owner do fato de conta.

### 4.2 Concorrência e resultados obsoletos

A deduplicação de concorrência única do `initialize()` atual não cobre `refreshCodingPlanSupport()` nem as requisições de cota. Na implementação, unificar a coordenação:

1. Se uma mudança de conexão/Provider chega durante uma checagem, marcar a checagem antiga como obsoleta e registrar que é preciso rechecar; evitar requisições concorrentes duplicadas para as mesmas interfaces de elegibilidade e cota.
2. Após o fim da checagem em trânsito, processar o estado de rechecagem mais recente; a coalescência de mudanças não pode perder a última rechecagem.
3. Sucesso antigo, falha antiga e lógica antiga de limpeza não podem reescrever o estado do Store de uma geração mais nova.
4. A elegibilidade de plano e a cota de número precisam pertencer à mesma checagem válida; não se pode combinar resultados de conexões ou checagens diferentes.
5. Preservar a proteção existente de «a seleção atual corresponde ao snapshot de suporte devolvido»; não se restaura a criação limpando a seleção de conexão do usuário ou recorrendo ao plano pessoal.

## 5. Ordem de implementação e verificação

1. Atualizar primeiro os specs atuais relacionados e escrever os testes unitários/E2E formais; este Todo é a base de implementação já confirmada, e a descrição factual do Design V2 é atualizada conforme o código for efetivado.
2. As quatro interfaces de ciclo de vida e o wrapper de repasse passam a retornar `void` de forma unificada, com adaptação dos pontos de leitura, dos logs e dos testes.
3. A resolução off-peak passa a ler o Registry atual; completar a notificação de conclusão de atualização e o refresh manual.
4. Unificar a coordenação das checagens de elegibilidade/cota, adicionando a proteção contra resultados obsoletos de sucesso e de falha.
5. Rodar a verificação dirigida e as barreiras de arquitetura, tipos e lint, e só então verificar no Air o cenário real de Team Plan, registrando o resultado antes de commitar.

| Cenário | Resultado que precisa ser provado |
| --- | --- |
| Interface de start | as quatro interfaces e o wrapper de repasse retornam `Promise<void>`; acesso concorrente inicial não recria recursos, e falhas e dispose não regridem |
| Atualização de Account / Personal após o start | a leitura explícita retorna o estado atualizado; não se pode depender de reiniciar o processo |
| Sem plano → BigModel Team Plan | a entrada se recupera automaticamente após a atualização do Registry, sem precisar sair e voltar à página |
| Cold start com Team Plan já existente | mesmo com a resolução inicial de conta mais lenta, converge para a elegibilidade correta após a atualização |
| Trocar de Team Plan / logout | a elegibilidade antiga é invalidada e não pode ser reaberta por um resultado antigo de sucesso |
| Troca rápida de conexão | inverter de propósito a ordem de conclusão das requisições; sucesso antigo e falha antiga não podem sobrescrever o novo estado |
| Refresh manual | re-resolve plano e credenciais; consulta a cota somente quando a elegibilidade é aprovada |
| Vários pontos de entrada off-peak montados ao mesmo tempo | as checagens são deduplicadas, mudanças posteriores ainda disparam a rechecagem necessária, e o requests duplicado não faz as interfaces de cota interferirem entre si |
| Execução e outros consumidores | elegibilidade off-peak, número e despacho continuam compartilhando a autenticação da conexão atual; seleção de modelos, configurações de Provider, despacho de configuração e start de Agent funcionam normalmente |

A correção de interação do APP precisa de E2E correspondente. Cobre pelo menos BigModel Team Plan e, por meio de casos em camadas, as regras existentes de Z.ai/plano pessoal; fazer uma revisão em tempo de execução com conta real no Air, tratando as ações e evidências de criação/execução reais conforme a autorização do usuário e as regras de E2E no momento da implementação, sem escrever resultados puramente mock como sucesso de serviço real.

Manter entre plataformas: Registry próprio de Host/Worker, isolamento de identidade de workspace remoto e distribuição de conta inalterados; o celular reutiliza shared-host, sem alterar o fluxo de mensagens desktop continuous / mobile replayable e sem ampliar o suporte remoto original das tarefas off-peak.

Rodar a verificação de atualidade da linha de base antes da implementação e alinhar com a linha de base real de desenvolvimento; no momento desta revisão o staging local estava 5 commits atrás de origin/staging, e a implementação relevante revisada é igual àquela referência remota, mas esse fato não substitui a verificação de início de trabalho posterior. Executar architecture, typecheck, lint e os testes unitários/E2E relevantes conforme exigido pelo repositório, e deixar registrado com honestidade o que não foi verificado.

## 6. Entrega atual e trabalho restante

- Concluído: os quatro start e a camada de repasse unificados em void, com consumidores lendo Config/Registry explicitamente; tipo de ready do Facade apertado; log de start da CLI adaptado.
- Concluído: Store com checagens de elegibilidade/cota serializadas e submetidas na mesma geração, descartando sucesso/erro antigo; as duas entradas compartilham um Hook, dirigido pela revision concluída do ProviderSettings, pela mudança de conexão e por ação manual, com deduplicação de key repetida. Sem nova polling, cache como fonte de verdade ou alteração do Composer.
- Matriz de spec/impacto: [todo-128-impact-and-cases.md](./todo-128-impact-and-cases.md). Design V2 e o spec off-peak foram sincronizados.
- Vermelho antes do verde: os casos de valor de retorno de start e os 4 casos de corrida do Store falhavam na implementação antiga; após a correção, 70 itens em 7 arquivos passaram; 10 itens do Bootstrap passaram. Cobre retry/deduplicação/dispose após falha de start, leitura explícita após atualização de Personal/Account, chegada atrasada de elegibilidade/cota e de erro antigo, as duas entradas e o refresh manual.
- Navegador pending: Snapshot + Hook + Store reais + gate de criação, com Host RPC controlado, 1 item passando, verificando a recuperação de cold start não pronto→notificação de Team, desabilitação no logout, rechecagem manual após recuperação silenciosa do backend, desabilitação por erro atual e recuperação por notificação; em cada uma das duas entradas há apenas um par de chamadas de elegibilidade/cota. Não é aceitação de pacote de instalação nem de backend real.
- Barreiras: root typecheck, Bootstrap typecheck, root lint (0 errors) e architecture (0 violations) passaram. O lint dos arquivos alvo da CLI não teve error. A integridade do grafo tinha 4 arestas suspensas preexistentes, com 0 novas; há modificações em seeds, o Codegraph não está disponível e a revisão foi feita com dep:refs/referências precisas.
- Revisão: não houve alteração na seleção de conta, nas regras de validade, na autenticação/vínculo de Ticket ou no formato de dados. Aproveitou-se para corrigir duas pré-condições de teste obsoletas envolvendo Todo124/130 nesta rodada (Provider de teste não autorizado, origem de campo oculto no modo manual), sem afrouxar a validação de produto para fazer o teste passar.
- Aguardando a aceitação do lote: o Air está atualmente acessível por SSH, mas o código desta rodada ainda não foi instalado/executado e o botão real de Team não foi revisado. Manter este item como não testado; não dar por válida a implementação nova com base em modificações de conta real, criação de Ticket ou no comportamento do pacote antigo.