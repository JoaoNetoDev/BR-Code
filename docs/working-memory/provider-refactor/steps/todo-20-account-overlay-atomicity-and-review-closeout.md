# 20 Atomicidade do Account Overlay e fechamento do Provider Review

> Status: implementado (código e verificação direcionada de Provider concluídos; itens de ambiente preexistentes do repositório inteiro estão no registro de implementação)
>
> Data: 2026-08-26
>
> Origem: revisão estática de toda a branch do Provider Refactor antes do go-live e reavaliação semântica do Account Provider
>
> Tarefas relacionadas: [`07`](./todo-07-account-connection-selection-and-access-context-cutover.md)、
> [`17`](./todo-17-provider-registry-settings-authority-boundary-closure.md)、
> [`18`](./todo-18-zcode-builtin-client-config-sync-and-lkg.md)
>
> Designs relacionados: [`configuration.md`](../design/registry/configuration.md)、
> [`registry.md`](../design/registry/registry.md)、
> [`runtime.md`](../design/registry/runtime.md)、
> [`model-creation.md`](../design/registry/model-creation.md)、
> [`environment.md`](../design/environment/environment.md)

## 0. Posicionamento da tarefa

Este Todo fecha as alterações da revisão estática de toda a branch do Provider Refactor que já tiveram decisão de produto e arquitetura, mas ainda não entraram na implementação:

1. manter o Account Built-in Provider Config como Overlay oficial e expressar com `enabled`, o `builtinModelIds` de Start Plan no nível da conta e o Account Access estruturado os fatos dinâmicos da conta atual;
2. impedir que o Registry publique a combinação intermediária "novo ZCode Built-in + Account Overlay antigo";
3. isolar fisicamente o Active/LKG do ZCode Built-in Environment por ZCode Endpoint;
4. corrigir o `--help` / `--version` da CLI, que iniciava Provider Runtime desnecessariamente, e a omissão da declaração de `zod` no Bootstrap;
5. remover as implementações ZIP órfãs confirmadas pela revisão e suas dependências exclusivas.

Este Todo não inclui o port da semântica do `origin/staging` mais recente nem o tratamento de conflitos, e também não assume o Release Checklist final nem uma barreira extra de publicação de integridade de negócio do Built-in Release.

## 1. Decisões confirmadas

### 1.1 Account continua sendo um Overlay oficial de Provider Config

O Account Overlay não existe por uniformidade formal. A conta atual realmente muda a configuração efetiva dos Built-in Providers do tipo conta:

```text
ZCode Built-in Provider Config
              |
              v
Account Built-in Provider Config
├─ enabled
├─ Start Plan builtinModelIds
└─ accessId / family / planKind / Team scope
              |
              v
Personal Provider Config
              |
              v
Effective Provider Config
```

A ordem é mantida:

```ts
const effectiveBuiltinProviders = zcodeBuiltinProviders.overlay(accountBuiltinProviders);

const effectiveProviders = effectiveBuiltinProviders.overlay(personalProviders);
```

Account lê e restringe apenas os Providers do ZCode Built-in cujo `access.type = "zhipu-account"`; não lê nem restringe Providers
exclusivos de Personal. Personal continua sendo a última camada de override do usuário.

### 1.2 A disponibilidade da conta passa a usar uniformemente `enabled`

A disponibilidade de um Account Provider deixa de ser expressa indiretamente por "ausência de Account Overlay, o que fazia o Registry sair porque `accessId` ficou incompleto".
O Account Source projeta explicitamente para cada Built-in Account Provider relevante:

```text
available
└─ enabled: true

unavailable
└─ enabled: false

unknown
├─ há um Account Overlay bem-sucedido anterior: manter o anterior
└─ não há anterior: fail-closed, enabled: false
```

`enabled` continua sendo a barreira de execução unificada do Provider. Settings pode manter Providers disabled para exibição e diagnóstico; Selection, a View executável do
Registry e o ModelFactory rejeitam `enabled = false`. Não são adicionados `available`, `eligible` em paralelo nem novos campos de estado de execução.

### 1.3 Os membros de modelo do Start Plan são um fato de nível de conta

O fato de produto já está confirmado: o conjunto de modelos disponíveis pode diferir entre contas de Start Plan, e o conjunto de modelos retornado por `billing/balance` precisa entrar no
Account Overlay:

```text
Start Plan balance
└─ capabilities: model:<id>
   (fallback legacy show_name mantido temporariamente)
              |
              v
Account Provider Config.builtinModelIds
              |
              v
ZCode Built-in Model Config Rules resolve
```

As regras são:

- Start Plan disponível e com um conjunto de modelos não vazio resolvido: sobrescreve a lista completa de `builtinModelIds` do Built-in com o conjunto da conta;
- interfaces Individual / Team não fornecem conjunto de modelos: o Account Overlay não escreve `builtinModelIds` e herda os membros padrão do Built-in;
- Start Plan ativo mas sem nenhum modelo resolvido nesta rodada: havendo LKG, mantém o último Overlay bem-sucedido; sem LKG, fail-closed, sem recuar para o
  conjunto padrão amplo do Built-in;
- `show_name` é mantido temporariamente apenas como entrada de compatibilidade do servidor atual; será removido em separado assim que o servidor garantir `model:<id>` de forma estável;
- Account altera apenas a elegibilidade de membro; não fornece Properties, Reasoning, context nem max output; os fatos estáticos do modelo continuam sendo
  resolvidos pelas ZCode Built-in + Personal Model Config Rules;
- o `modelIds` de Personal continua sendo adicionado depois do Inventory Built-in já restringido pela conta, e a requisição real continua sendo autorizada finalmente pelo servidor.

### 1.4 O Account Access continua entrando no Overlay, mas sem credenciais reais

`accessId` é uma identidade de acesso estável e não sensível, gerada pelo cliente a partir da identidade da conta atual, do Provider, do Plan e do escopo de Team. Não é um Secret
retornado pelo servidor, mas a semântica de execução atual precisa dele:

- mantém a mesma identidade de acesso quando a mesma conta renova Token, JWT, API Key ou Headers;
- a identidade de acesso muda ao trocar de conta, plano ou escopo de Team;
- o Active Model fixa o Account Access no momento da criação; uma renovação posterior de credenciais não pode trocar silenciosamente para outra conta;
- o Individual Coding Plan Credential Store é isolado por identidade de acesso;
- product/organization/project do Team Plan participam da resolução no momento da requisição como campos estruturados de Access.

O Account Overlay pode escrever:

```ts
access: {
  type: "zhipu-account";
  accessId: string;
  family: "zai" | "bigmodel";
  planKind: "start-plan" | "individual-coding-plan" | "team-coding-plan";
  productId?: string;
  organizationId?: string;
  projectId?: string;
}
```

Token, JWT, API Key, Headers dinâmicos e renovação de credenciais continuam pertencendo ao Request Auth/Credential Service; eles não podem entrar no Config, no Registry ou na
configuração estática do Active Model. O servidor continua sendo o responsável pela decisão final de autorização.

### 1.5 O Account Overlay precisa declarar a revisão da origem Built-in

Hoje o `AccountProviderService` usa o Built-in Account Provider para calcular o Overlay; e o Registry assina simultaneamente o Config Source e o Account
Source. Quando o Built-in muda, o Registry pode combinar por um instante novo Built-in com o Overlay antigo:

```text
B0 + A0
   |
   | Built-in -> B1
   v
B1 + A0  <- proibido publicar
   |
   | Account refresh
   v
B1 + A1  <- único novo Snapshot permitido
```

Não se estabelece um protocolo de versão comum entre as interfaces do servidor, nem se exige que a Account API retorne a revisão do Built-in. Guarda-se apenas a prova de origem na Source derivada no cliente:

```ts
interface ProviderConfigSnapshot {
  readonly revision: string;
  readonly zcodeBuiltinRevision: string;
  readonly personalRevision: string;
  // existing config fields
}

interface AccountProviderConfigSnapshot {
  readonly revision: string;
  readonly basedOnZCodeBuiltinRevision: string;
  readonly providers: ProviderConfigMap;
}
```

O Registry só publica quando os dois casam:

```ts
account.basedOnZCodeBuiltinRevision === config.zcodeBuiltinRevision;
```

Quando não casam, o Snapshot completo atual do Registry é mantido, aguardando o Account Source concluir a projeção para o novo Built-in. Mesmo que o Account receba um Provider Map
idêntico ao da rodada anterior, desde que `basedOnZCodeBuiltinRevision` tenha mudado ele precisa publicar uma nova revisão/evento de mudança do Account Source, para que o Registry
possa aplicar o novo Built-in. Uma atualização Personal não altera `zcodeBuiltinRevision` e não pode ser bloqueada por uma atualização de rede do Account.

### 1.6 Active/LKG isolados por ZCode Endpoint

Aqui, Endpoint significa o plano de controle da plataforma ZCode `zcodeEndpointOrigin` (Origin de produção, de teste ou de desenvolvimento/mock), e não o
Endpoint de API de modelos do Provider Config. O Todo 18 hoje apenas isola o TTL de refresh via `refresh-control.json.endpointKey`, mas Endpoints diferentes ainda compartilham
`active.json`, o que faz com que revisões sem relação sejam comparadas entre si.

Os arquivos remotos de Active e de controle de refresh precisam ser isolados fisicamente por um segmento de caminho estável e à prova de colisões, derivado do Endpoint normalizado:

```text
<environmentConfigRoot>/provider/zcode-builtin/
└─ <platform>/
   └─ <appVersion>/
      └─ <endpointKey>/
         ├─ active.json
         └─ refresh-control.json
```

Restrições:

- `endpointKey` é gerado deterministicamente a partir da Origin normalizada; não é permitido gravar caracteres de URL inseguros diretamente no caminho;
- as revisões só são comparadas dentro da semântica de publicação Bundled/Remote do mesmo Endpoint;
- após trocar de Endpoint, se esse Endpoint não tiver Active, usa-se o Bundled para completar o ready e depois se refresca o novo Endpoint em segundo plano;
- não se pode usar o LKG do Endpoint A como candidato para o Endpoint B;
- ao voltar para o Endpoint antigo, é permitido reutilizar o LKG desse próprio Endpoint;
- mantém-se o `endpointKey` no control payload como verificação defensiva de consistência;
- o Todo 18 ainda não formou histórico oficial de compatibilidade de publicação, portanto não se adiciona dual-read para caminhos Active antigos não particionados; o caminho antigo sai naturalmente.

### 1.7 Correções de CLI e de dependências

A lógica de preparação do Provider Runtime da CLI não pode sobrescrever entradas puramente de metadados:

```text
--help / -h / --version / -v
└─ não lê nem grava Provider Config em disco
   não inicia o refresh de /client/configs
   não depende do asset Built-in pronto
```

Corrige-se apenas o julgamento da entrada e os testes correspondentes, sem refatorar todo o Bootstrap da CLI. Comandos já existentes que não precisam de Provider Runtime, como `doctor`, permanecem como estão.

O código de produção do Bootstrap importa `zod` diretamente, portanto precisa declará-lo diretamente nas suas próprias `dependencies`, sem depender de hoisting do workspace nem de dependência transitiva.

### 1.8 Limpeza mecânica confirmada pela revisão

Remover os itens sem nenhuma referência:

- `packages/zcode-server-cli/src/packaging/zipArchive.ts`;
- `yazl`, usado apenas por ele;
- `@types/yazl`, usado apenas por ele.

Manter o `yauzl`, realmente usado para descompactação de ZIP, e manter o ZIP do Server, o notarize de macOS e o comportamento de `stat` multiplataforma corrigidos antes para o pre-push de Linux/ambiente de teste. Antes e depois da remoção, provar com `dep:refs`, `knip` e os testes de empacotamento alvo que nenhum chamador estático ou entrada de publicação depende da implementação órfã.

`packages/ui/src/hooks/useProviderModelOrder.ts` foi confirmado como adicionado pelo Provider Refactor atual e sem referências, e já foi removido no commit
`01ac05e2be`, não sendo mais conteúdo pendente deste Todo. As linhas em branco no fim dos arquivos de script PDF não são tratadas.

## 2. Cadeia de refresh alvo

```text
Bundled / Active com escopo de Endpoint / Remote
                    |
                    v
          ZCode Built-in Source Bn
                    |
                    +----------------------+
                    |                      |
                    v                      |
       AccountProviderService             |
       ├─ enabled                          |
       ├─ Start builtinModelIds            |
       └─ accessId / scope                 |
                    |                      |
                    v                      |
      Account Overlay basedOn = Bn         |
                    |                      |
                    +----------+-----------+
                               |
Personal Provider Config ------+
                               |
                               v
                     Provider Registry
                               |
                               v
                   later ModelFactory.create()

Active Model já criado
└─ permanece congelado
```

## 3. Passos de implementação

### Step 0: sincronizar primeiro o Design oficial e o Feature Graph

- registrar em `configuration.md`, `registry.md`, `runtime.md` e `model-creation.md` os campos do Account Overlay e a
  barreira de revisão deste Todo;
- registrar no Design de Environment o isolamento físico do Active/LKG por Endpoint;
- corrigir a descrição antiga de caminho `<platform>/<appVersion>/active.json` no Todo 18;
- atualizar o invariante de Provider Registry do Feature Graph: o Account Overlay controla explicitamente `enabled`, os membros de modelo Start da conta e o
  Account Access, e o Registry só publica combinações com revisões de origem correspondentes.

### Step 1: escrever primeiro os testes que falham

- fixar o comportamento de `enabled` do Account, dos membros de modelo Start da conta, do LKG e do mismatch de revisão;
- fixar que a atualização Personal não espera o refresh do Account;
- fixar o isolamento de Active/LKG entre Endpoint A/B;
- fixar que CLI help/version não prepara o Provider Runtime;
- fixar a dependência direta do Bootstrap e que o caminho de empacotamento ZIP não depende do helper órfão.

### Step 2: completar as revisões por camada

- `ProviderConfigSnapshot` expõe `zcodeBuiltinRevision` e `personalRevision`, mantendo o `revision` combinado existente;
- `AccountProviderConfigSnapshot` ganha `basedOnZCodeBuiltinRevision`;
- Mutable/Empty/Test Sources usam o mesmo contrato, sem adicionar revisão por parsing de string ou wildcard;
- a revisão do Account Source inclui simultaneamente a revisão Built-in de origem e a identidade do conteúdo do Overlay, garantindo que uma nova origem com o mesmo conteúdo ainda dispare mudança.

### Step 3: corrigir o Account Overlay

- a availability projeta `enabled` explicitamente;
- unavailable publica um Overlay sparse `{ enabled: false }`;
- available publica o Account Access estruturado completo;
- o Start Plan projeta exatamente os `builtinModelIds` da conta;
- Individual/Team não copiam membros de modelo do Built-in;
- quando o Start não consegue resolver modelos, executa LKG/fail-closed, sem recuar para o Built-in amplo;
- manter a compatibilidade atual de `show_name`, mas limitada à fronteira de parsing privada do Account Source.

### Step 4: adicionar a barreira de revisão do Registry

- quando as origens Config/Account não casam, não chama o Resolver, não substitui o Registry e não notifica a Facade;
- mantém o Snapshot completo anterior;
- depois que o Account atualiza para a revisão correspondente, publica o Registry final apenas uma vez;
- mudanças de generation continuam descartando rebuilds obsoletos;
- mudanças apenas Personal seguem o caminho rápido atual e publicam imediatamente;
- uma falha de refresh mantém o último Account Overlay e o Registry completo, e emite um erro diagnosticável.

### Step 5: Active/LKG com escopo de Endpoint

- mapear o Endpoint normalizado para um segmento de caminho de cache estável e seguro;
- Active e refresh-control entram no mesmo diretório de Endpoint;
- múltiplos processos do mesmo Endpoint continuam compartilhando lock de arquivo, lease, TTL e comparação de revisões;
- a troca de Endpoint dispara o refresh Built-in desse Endpoint e converge na ordem Account -> Registry;
- remover o uso do caminho antigo não particionado, sem adicionar fallback de migração.

### Step 6: CLI, dependências e código órfão

- excluir o prepare de Provider Runtime para `--help/-h/--version/-v`;
- adicionar a dependência direta de `zod` ao Bootstrap;
- remover `zipArchive.ts`, `yazl` e `@types/yazl`;
- não modificar a cadeia de descompactação com `yauzl` nem as correções de compatibilidade de pre-push de Linux já confirmadas.

### Step 7: verificação e registro

- executar testes unitários direcionados e typecheck de Provider, Provider Node, Services e CLI Bootstrap;
- executar o `pnpm typecheck` e o `pnpm lint` da raiz, os unit relevantes e a checagem de formatação;
- atualizar o status deste Todo, o registro de implementação e as evidências do Feature Graph;
- usar Conventional Commit nas submissões, sem misturar no mesmo commit a resolução de conflitos do merge de staging.

## 4. Plano de testes

### 4.1 Account Overlay

- um Account Provider disponível recebe `enabled: true` e o Access completo;
- indisponível recebe `enabled: false`, sem expressar desativação por falha de completude;
- unknown com LKG mantém o anterior; sem LKG, fail-closed;
- quando dois contas Start retornam models diferentes, recebem `builtinModelIds` precisos e diferentes;
- Start ativo mas com lista de modelos vazia ou não resolvível não herda o Built-in amplo;
- Individual/Team que não retornam models herdam o Built-in atual;
- product/org/project do Team e o accessId são gerados de forma estável e mudam ao trocar qualquer um dos campos de identidade;
- o Account Overlay não pode restringir Providers exclusivos de Personal;
- Personal continua sobrescrevendo depois do Account.

### 4.2 Publicação atômica do Registry

- `B0/A0 -> B1` com o refresh do Account atrasado não publica `B1/A0`;
- depois que o Account completa `A1 basedOn B1`, publica apenas `B1/A1`;
- conteúdo de Account Overlay igual mas origem indo de B0 para B1 ainda dispara o rebuild final;
- Personal P0 -> P1 com Built-in ainda em B1 publica imediatamente `B1/A1/P1`;
- quando o refresh do Account falha, o Registry completo antigo é mantido;
- o Active Model já criado não sofre hot patch por nenhuma atualização.

### 4.3 Active/LKG por Endpoint

- a revisão 20 do Endpoint A e a revisão 10 do Endpoint B entram em caminhos independentes, e B não é julgado stale por A;
- A e B com a mesma revisão e conteúdos diferentes não geram erro de protocolo de publicação entre si;
- ao voltar para A, o LKG de A pode ser reutilizado;
- B sem LKG e com falha remota usa o Bundled e não usa o LKG de A;
- com múltiplos processos no mesmo Endpoint, apenas um dono de lease inicia requisições de rede;
- mudanças de Endpoint Setting/Environment disparam o refresh da Source correta.

### 4.4 CLI, dependências e limpeza

- `--help/-h/--version/-v` não chamam o prepare de Provider Runtime;
- entradas que precisam de modelo, como prompt/TUI/server, continuam fazendo prepare normalmente;
- o typecheck/install/empacotamento filtrado do Bootstrap resolve o `zod` direto;
- depois de remover `zipArchive.ts`, o dep:refs fica em zero e os testes alvo de ZIP do Server continuam passando;
- os testes de descompactação com `yauzl` e as correções de pre-push de Linux não regridem.

## 5. Não objetivos e invariantes

- não fazer merge do staging mais recente;
- não implementar, do Release Checklist final, a conta real, os artefatos reais de publicação e a verificação unificada multiplataforma;
- não implementar uma barreira extra de publicação de integridade de negócio do Built-in;
- não remover o Account Overlay, o conjunto de modelos Start da conta nem o accessId;
- não escrever Token, JWT, API Key ou Headers no Config;
- não alterar a ordem das Model Config Rules, as Model Properties, o Reasoning ou os fatos do Adapter;
- não alterar a propriedade do Active Model em Off-Peak, Subagent, Compact e Memory;
- não alterar a semântica de Desktop continuous, Mobile replayable, filas e recuperação;
- não introduzir uma segunda LKG, dual-read ou comparação de revisão entre Endpoints para o cache de Endpoint.

## 6. Critérios de conclusão

- o Account Overlay expressa a disponibilidade de um Provider de conta explicitamente com `enabled`;
- os membros de modelo precisos de cada conta do Start Plan entram em `builtinModelIds`, e um resultado vazio faz fail-closed com segurança;
- o Account Access permanece não sensível, completo e congelável, e as credenciais reais ainda são resolvidas no momento da requisição;
- o Registry nunca publica um Account Overlay cuja revisão de Built-in de origem não corresponde;
- atualizações apenas Personal não são bloqueadas pelo refresh do Account;
- Active/LKG e o controle de refresh são isolados por Endpoint;
- CLI help/version não dispara Provider Runtime; e o Bootstrap declara `zod` diretamente;
- o arquivo ZIP órfão e as dependências exclusivas são removidos, e os testes do comportamento de ZIP/Notarize multiplataforma preservado passam;
- testes direcionados, typecheck da raiz, lint, unit relevantes e checagem de formatação passam;
- Design, status deste Todo e Feature Graph ficam consistentes com a implementação final.

## 7. Impact Brief

| Campo            | Valor                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| Intenção do desenvolvedor | Fechar as lacunas já decididas no Provider Review, sem mudar a arquitetura principal                                                                   |
| Capacidade       | Provider Registry, Account Overlay, Built-in Remote/LKG, CLI Bootstrap                                          |
| Camada de mudança    | option-source / validation / persistence / commit-effect                                                        |
| Modo de operação   | planning                                                                                                        |
| Seeds principais    | `AccountProviderService`、`ProviderRegistryService`、`resolveZCodeBuiltinCachePaths`、`requiresProviderRuntime` |
| Fora do escopo     | merge de staging, verificação unificada em ambiente real, barreira de integridade de negócio do Release                                                         |

### State Owners And Commit Sinks

| State/fact                    | Dono autoritativo        | Persistência/cache             | Sink de publicação     |
| ----------------------------- | -------------------------- | ----------------------------- | ---------------- |
| Revisão/conteúdo Built-in     | ZCode Built-in Source      | `active.json` com escopo de Endpoint | Config Service   |
| enabled/models/access da conta | AccountProviderService     | Snapshot LKG em processo           | Account Source   |
| Personal Config               | Repositório Personal        | `config.json`                 | Config Service   |
| Provider/Model Efetivo      | ProviderRegistryService    | Snapshot imutável em processo     | Registry/Facades |
| Active Model                  | Model criado pelo ModelFactory | Congelado durante o ciclo de vida de execução | Adapter request  |

### Must-Preserve Invariants

- Account restringe apenas o Built-in account Provider, e Personal sobrescreve por último;
- os models Start do Account são fato de elegibilidade de membro, não fato de capacidade estática do modelo;
- a barreira de revisão expressa apenas origem derivada no cliente e não cria um protocolo de versão comum do servidor;
- Endpoint é isolamento de Source de configuração do Environment, e não o Endpoint de API de modelos;
- credenciais dinâmicas não entram no Config, e a autorização final é do servidor;
- o Active Model já criado não muda com atualizações de Config/Account.

### Graph Delta

O Step 0 de implementação vai atualizar `capability.provider-registry`: acrescentar o `enabled` do Account, os membros de modelo Start da conta, o Account Access e o
invariante de publicação atômica por `basedOnZCodeBuiltinRevision`; acrescentar o nó de persistência com escopo de Endpoint do Active/LKG do Built-in. Este Todo
é a porta de entrada de implementação de semântica já confirmada e não adiciona UI Surface.

### Unresolved Questions

Não há questão de produto em aberto que altere o escopo de implementação deste Todo. A aposentadoria de `show_name` depende de uma garantia posterior do servidor e é mantida como condição explícita de saída de compatibilidade, sem bloquear este Todo.

## 8. Registro de implementação

### 8.1 Já entregue

- `ProviderConfigSnapshot` foi dividido em revisão combinada, revisão do ZCode Built-in e revisão Personal;
  `AccountProviderConfigSnapshot` passou a carregar `basedOnZCodeBuiltinRevision`, e a revisão do Account inclui simultaneamente a origem e o conteúdo do Overlay;
- o Account Resolver passou a projetar `enabled` de forma unificada: available habilita explicitamente, unavailable desabilita explicitamente e unknown faz fail-closed na primeira vez;
  o Start Plan adota exatamente o conjunto de modelos da conta, e um conjunto vazio executa LKG/fail-closed; Individual/Team herdam os membros do Built-in;
- o Registry ganhou a barreira de revisão Built-in/Account: quando não há correspondência mantém o último Snapshot completo e publica depois da correspondência; mudanças de revisão apenas Personal não esperam o recálculo do Account;
- o Environment Source passou a isolar `active.json` e `refresh-control.json` por um segmento de caminho SHA-256 derivado da Origin normalizada do plano de controle ZCode; a troca de Endpoint usa Bundled/LKG próprios, e respostas atrasadas do Endpoint antigo não vão para disco;
- os Services do Desktop resolvem o Endpoint atual dinamicamente ao ler as Settings; Bootstrap, Protocol e o payload stdio do Agent já percorrem a revisão de origem do
  Account; quando os primeiros fatos de Account ainda não chegaram, usa-se um Snapshot fail-closed que corresponde ao Built-in atual;
- o `--help/-h/--version/-v` da CLI já pula o prepare de Provider Runtime; e o Bootstrap já declara `zod` diretamente;
- o `zipArchive.ts` sem referências e as dependências exclusivas do Server CLI sobre `yazl` e `@types/yazl` foram removidos, e a cadeia de descompactação com `yauzl` foi preservada.

### 8.2 Evidências automatizadas

- `@zcode/provider`: 14 arquivos de teste, 130 testes aprovados e typecheck do package aprovado;
- `@zcode/provider-node`: 5 arquivos de teste, 36 testes aprovados e typecheck do package aprovado;
- testes direcionados de Account/Registry/Request Auth de Services: 3 arquivos de teste, 24 testes aprovados;
- testes direcionados de process/protocol do CLI Bootstrap: 114 testes aprovados e typecheck do package aprovado;
- 3 testes direcionados da Env de Provider Runtime da CLI para development, SEA e entradas de metadados aprovados;
- build do Server CLI aprovado; `pnpm typecheck` e `pnpm lint` da raiz aprovados; formatação dos arquivos modificados e `git diff --check` aprovados.
- o `pnpm test:unit` completo, com 12.388 testes: 12.360 aprovados, 25 pulados e 3 falhos; não houve falha na superfície de mudança de Provider,
  e as falhas são compostas pelas duas baselines preexistentes de ambiente/timing registradas na seção abaixo.

### 8.3 Baselines de repositório/ambiente confirmadas

- dois casos de ZIP para Windows dos testes de todo o pacote do Server CLI falham no ambiente Linux atual com `spawn zip ENOENT` porque o comando de sistema `zip` não existe;
  o caminho de empacotamento de produção já usava diretamente esse comando de sistema, e o helper órfão removido não tinha nenhum chamador, portanto não se trata de regressão introduzida por este Todo;
- o caso de timing de socket close do CUA Permission Broker falhou uma vez na execução concorrente completa; o mesmo caso passou ao ser reexecutado isoladamente depois, o que caracteriza uma flutuação de timing preexistente e sem relação com Provider;
- o typecheck isolado do `@zcode/cli` continua bloqueado pelo `AgentRuntimeConfig.modelSelection` ausente preexistente, com erro em
  `prompt-command.ts` e `tui-prompt-handler.ts`, fora da superfície de mudança deste Todo;
- o `fmt:check` do repositório inteiro continua varrendo o HTML inválido preexistente e o binário `gb2312.js` do Electron vendor fiddle, portanto desta vez a checagem de formatação dos arquivos modificados e o
  `git diff --check` foram usados como evidência de commit;
- a checagem de novidade do workspace não conseguiu atualizar as referências remotas porque o ambiente atual não consegue se conectar ao Git proxy `127.0.0.1:1080`; este Todo não fez merge de staging.