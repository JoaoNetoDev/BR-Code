# 18 Sincronização remota do ZCode Built-in Config e fallback LKG

> Status: concluído
>
> Data: 2026-08-25
>
> Discussão de origem: fechamento da forma de publicação da configuração de ZCode Built-in Provider/Model após a conclusão do Provider Refactor
>
> Tarefas relacionadas: [`10`](./todo-10-zcode-builtin-provider-config-naming-cutover.md)、
> [`13`](./todo-13-target-host-model-selection-authority.md)、
> [`15`](./todo-15-provider-release-validation.md)、
> [`17`](./todo-17-provider-registry-settings-authority-boundary-closure.md)、
> [`19`](./todo-19-zcode-builtin-release-integrity-validation.md)
>
> Designs relacionados: [`configuration.md`](../design/registry/configuration.md)、
> [`registry.md`](../design/registry/registry.md)、
> [`runtime.md`](../design/registry/runtime.md)、
> [`environment.md`](../design/environment/environment.md)

## 0. Posicionamento da tarefa

Hoje o ZCode Built-in Provider Config e o ZCode Built-in Model Config Rules são lidos somente de
`config/provider/zcode-builtin.json`, publicado junto com o repositório e o pacote de instalação. Este Todo adiciona `/api/v1/client/configs` como canal de publicação remoto com prioridade para essa mesma verdade Built-in, e salva para cada Environment a configuração remota confirmada como utilizável mais recentemente (Last Known Good, LKG).

Este Todo faz apenas a mudança mínima necessária para atingir esse objetivo, sem refatorar de forma unificada a infraestrutura de Client Config existente:

- não extrai um `ClientConfigService` global;
- não altera as requisições, o TTL ou o cache de `/client/configs` já existentes no `BigModelCodingPlanSubscriptionProvider`;
- não une as requisições de Force Update, Computer Use e Desktop Context Prompt do Desktop Main;
- não altera a propriedade de configuração existente de Coding Plan, da checagem de segurança da versão oficial, de Off-Peak ou de `modelContextBudget.strategy`;
- permite que esta fase adicione uma requisição `/client/configs` independente para o Built-in Config; o fechamento de Client Config público fica para outra tarefa.

Este Todo altera apenas o Source e a temporalidade de publicação do ZCode Built-in Config, sem alterar a cadeia principal do domínio de Provider:

```text
ZCode Built-in Provider Config
              |
              v
    Account Provider Config
              |
              v
   Personal Provider Config
              |
              v
 Effective Provider Config

ZCode Built-in Model Config Rules
              +
 Personal Model Config Rules
              |
              v
Effective Model Config Rules
              |
              v
        Registry / ModelFactory
```

Remoto, LKG e configuração do pacote de instalação são três candidatos da mesma ZCode Built-in Source, e não uma nova camada de Overlay.

## 1. Decisões confirmadas

### 1.1 `/client/configs` usa uma estrutura atômica de dois níveis

O servidor adiciona um campo de primeiro nível em `data.configs`:

```ts
interface ZCodeBuiltinConfigContent {
  /** Conteúdo puro do ZCode Built-in Provider Config existente. */
  readonly providers: Record<string, ProviderConfigObject>;
  /** Conteúdo puro do ZCode Built-in Model Config Rules existente. */
  readonly modelConfigRules: readonly ModelConfigRuleObject[];
}

interface ZCodeBuiltinRelease {
  readonly schemaVersion: number;
  /** Incrementa monotonicamente a cada publicação; até um rollback de conteúdo gera uma revisão maior. */
  readonly revision: number;
  readonly config: ZCodeBuiltinConfigContent;
}

interface ClientConfigFields {
  readonly zcodeBuiltin?: ZCodeBuiltinRelease;
}
```

A estrutura mantém apenas dois níveis: o `config` interno é o conteúdo puro já existente de Provider Config e Model Config Rules, sem carregar
`schemaVersion`, `revision`, `fetchedFor` nem estado de cache; o Release externo assume uniformemente a versão de formato e a ordem de publicação.

Resposta ilustrativa:

```json
{
  "code": 0,
  "data": {
    "configs": {
      "zcodeBuiltin": {
        "schemaVersion": 1,
        "revision": 42,
        "config": {
          "providers": {},
          "modelConfigRules": []
        }
      }
    }
  }
}
```

`config.providers` e `config.modelConfigRules` precisam aparecer, ser parseados e ser aplicados em conjunto como uma mesma publicação. O cliente não suporta dois campos de primeiro
nível independentes e não permite misturar Provider remoto com Model Rules locais nem Provider local com Model Rules remotas.

`zcodeBuiltin` é um agrupamento atômico na fronteira de transporte do Client Config e não se torna um novo objeto de domínio de Provider nem uma camada de Overlay. Após um parse bem-sucedido, ele é
imediatamente projetado como o `ProviderConfigMap + ModelConfigRules` de que o `ProviderConfigLayerSnapshot` existente precisa.

O Built-in no repositório/pacote de instalação continua mantido como um único JSON completo. A ordenação em grupos de Provider e em camadas de Model Rule é expressa pela ordem de declaração de arquivo único
definida em [`configuration.md`](../design/registry/configuration.md); este Todo não o divide em vários arquivos-fonte e não adiciona pipeline de geração/composição de configuração. Remote, Environment Active Cache e Bundled usam sempre a mesma forma de Release de dois níveis acima.

### 1.2 A configuração remota é substituição completa, não patch sobre o Bundled

O `config.providers` remoto é o conjunto ordenado completo dos Providers ZCode Built-in atuais, e `config.modelConfigRules` é o array completo e ordenado de
Built-in Rules atuais. Quando o servidor remove um Provider, membros de modelo ou Rule, o cliente precisa remover o mesmo no novo snapshot e não pode continuar
repondo a partir da Config Bundled.

```text
Bundled Release ─────┐
Active Cache Release ┼─> escolher um candidato compatível ─> ZCode Built-in Source
Remote Release ──────┘
```

Uma Model Config Rule individual continua podendo ser esparsa; as Personal Rules continuam vindo depois das Built-in Rules e sua ordem não muda por causa da sincronização remota.
A barreira de publicação de integridade de negócio do Built-in Release não faz parte da primeira versão da sincronização do cliente; o Todo 19 antigo foi descontinuado e, se for necessário no futuro, outra tarefa de barreira de publicação será criada.

### 1.3 Responsabilidades de Bundled, LKG e Remote

As três entradas físicas são:

| Entrada                   | Significado                                                       | Ciclo de vida      | Reescrita em runtime       |
| ------------------------ | ---------------------------------------------------------- | ------------ | -------------------- |
| Bundled Config           | Baseline compatível carregada pelo pacote de instalação atual                                   | Versão de release do App | Não                   |
| Environment Active Cache | O Built-in aceito e em uso pelo Environment atual; também cumpre o papel de LKG | Sobre reinícios de processo   | Sim, por substituição atômica         |
| Remote Config            | Resposta atual de `/client/configs.data.configs.zcodeBuiltin`       | Um único refresh remoto | Não é usado diretamente como arquivo persistido |

O runtime não pode reescrever o `config/provider/zcode-builtin.json` do repositório nem os assets somente-leitura do pacote de instalação. Um resultado remoto bem-sucedido substitui atomicamente apenas o `active.json` gravável do Environment ao qual pertence. Esse arquivo é ao mesmo tempo a Source ativa lida em conjunto por Host/Worker e o LKG no momento do restart; não se mantém um segundo arquivo de LKG.

A configuração do repositório/pacote de instalação continua sendo atualizada em conjunto a cada publicação de configuração Built-in, garantindo que novas instalações e clientes sem LKG válido tenham um baseline razoável;
isso faz parte do processo de publicação e não equivale ao cliente reescrever o repositório de código.

### 1.4 LKG significa apenas Last Known Good e não garante atualização natural

LKG (Last Known Good) significa "a resposta remota Release mais recente que o Environment atual conseguiu parsear e aplicar com sucesso". Ela ainda pode:

- ser mais antiga que a Bundled Config do novo pacote de instalação;
- ter sido obtida por uma versão antiga do App;
- usar um Schema que o cliente atual já não suporta;
- não ser parseável por corrupção de arquivo;
- vir de um caminho de cache errado de outra plataforma ou Environment na mesma máquina.

Portanto, no start não se pode deixar o LKG sobrescrever o Bundled de forma incondicional. O Active Cache só é candidato quando satisfaz:

1. o envelope do Release pode ser lido;
2. `schemaVersion` é uma versão suportada pelo cliente atual;
3. o Provider Config e os Model Config Rules podem ser parseados pelo Parser oficial atual;
4. `Active.revision >= Bundled.revision`.

```text
Bundled válido ────────┐
                      +--> compatibility gate --> max revision --> startup snapshot
LKG legível/válido ───┘

LKG incompatível / mais antigo
└─ ignorar LKG, usar Bundled

Bundled e LKG ambos inválidos
└─ falhar o start do Provider Runtime; não criar fallback vazio/falso
```

A primeira versão isola fisicamente o Cache por `<platform>/<appVersion>/<endpointKey>/active.json`, sem gravar `fetchedFor` de novo no JSON e sem reutilizar entre versões só porque o JSON por acaso é parseável. Se mais adiante for necessária reutilização entre versões de patch, é preciso primeiro estabelecer um escopo de compatibilidade explícito, o que não é inferido neste Todo.

### 1.5 `revision` precisa ser ordenável e gerado pelo mesmo processo de publicação

Um Hash de conteúdo comum ou um ETag de HTTP só conseguem dizer igual/diferente, e não dizer qual entre LKG e Bundled é mais novo. Este Todo exige que
`zcodeBuiltin.revision` use um inteiro monotonicamente crescente gerado no servidor e gravado sincronamente na Config Bundled produzida pela mesma publicação.

Um rollback de conteúdo também precisa produzir uma nova revision:

```text
revision 40 -> content A
revision 41 -> content B
revision 42 -> rollback to content A
```

O cliente usa a revision para julgar a ordem de publicação, não compara o horário de arquivos locais e não trata Hash de conteúdo como versão ordenável. A Source ainda pode usar um Hash de conteúdo
padronizado como informação de deduplicação de conteúdo idêntico dentro do processo, mas isso não substitui a revision de publicação.

### 1.6 Somente a raiz de composição do Environment é responsável pela sincronização remota

Cada Environment de execução tem sua própria configuração Built-in e seu próprio LKG:

```text
Local Environment Host
├─ fetch /client/configs
├─ Local LKG
├─ Local Registry
└─ Local Core Workers read/watch the selected local file

SSH / Server Environment Host
├─ fetch /client/configs
├─ Remote LKG
├─ Remote Registry
└─ Remote Core Workers read/watch the selected remote file
```

Quando o Desktop controla um Workspace remoto, ele lê somente a Facade de Settings/Selection do Remote Host. O Desktop não empurra o
`zcodeBuiltin`, LKG, Registry Snapshot ou fatos estáticos de Provider/Model locais para o remoto.

Um Core Worker comum não requisita `/client/configs` de forma independente. O Host primeiro escolhe o candidato de start e fornece ao
Worker o mesmo caminho de arquivo Built-in legível; depois de uma atualização remota bem-sucedida, o arquivo ativo daquele Environment é atualizado atomicamente e é o watcher de Source existente do Host e do Worker que faz o refresh.
Isso evita requisições duplicadas por Workspace e múltiplas revisions coexistindo dentro do mesmo Environment.

### 1.7 Uma atualização remota só afeta Models criados depois

```text
Remote Built-in refresh
        |
        v
Source change -> Account refresh -> Registry rebuild -> Facade update
                                                |
                                                v
                                  later ModelFactory.create()

Active Model já criado
└─ permanece congelado durante sua execução
```

Um refresh remoto pode mudar a nova Settings View, a Selection View, os membros de Provider e Models criados depois, mas não pode alterar a quente o Endpoint, o API Type, as Properties, os Option Specs ou o Reasoning Mapping de um
Active Model já criado.

### 1.8 Não unificar o Client Config nesta rodada

Hoje `/client/configs` ainda é lido por várias cadeias com ciclos de vida diferentes:

- produtos, planos, checagem de segurança da versão oficial, Off-Peak e Context Budget dentro do `BigModelCodingPlanSubscriptionProvider`;
- o rollout de Computer Use e Desktop Context Prompt do Desktop Main;
- o gate de Force Update antes do start do Desktop.

Este Todo não reordena esses owners, não estabelece um `IClientConfigService` público e não amplia o escopo de modificação para eliminar requisições duplicadas. A implementação da sincronização Built-in pode
reaproveitar o `ApiClient`, o Endpoint e as ferramentas de parâmetro de plataforma existentes, mas não pode depender do Coding Plan Provider e não pode deixar o Provider Config Source depender
inversamente do Subscription Service.

A única relação nova permitida é:

```text
Environment composition root existing ApiClient
              |
              v
ZCode Built-in remote fetch/synchronizer
              |
              v
Built-in active Source file（que também cumpre o papel de LKG）
```

Na unificação posterior do Client Config, essa leitura de rede pode ser movida para um Transport/Service público; não se pode mudar a propriedade de Environment já confirmada neste Todo, o contrato atômico de
`zcodeBuiltin` nem a fronteira de seleção do Active Cache.

### 1.9 Debounce do refresh gravado em nível de Environment

O `inFlight` em memória não impede que múltiplos Desktop Host, CLI ou Server Entry do mesmo Environment repitam a requisição. Cada
Environment mantém um `refresh-control.json` ao lado do Active Cache isolado por Endpoint, coordenando o refresh com lock de arquivo e lease expirável:

```text
 múltiplos Entry pedem refresh
        |
        v
travar refresh-control.json
        |
        +--> nextEligibleAt ainda não chegou ou já existe lease válido: pular a rede
        |
        `--> grava lease de curto prazo e solta o lock
                    |
                    v
                 requisição remota
                    |
                    v
              trava de novo e compara a revision
                    |
          sucesso: substitui active.json atomicamente e registra o próximo horário
          falha: mantém active.json e registra um backoff incremental
```

O lock de arquivo não é mantido durante a requisição de rede; depois de um crash de processo, a expiração do lease permite a tomada. Um refresh bem-sucedido usa um intervalo na ordem de uma hora, e uma falha usa um backoff incremental com teto. Um refresh explícito pode contornar `nextEligibleAt`, mas não pode contornar um lease ainda válido. Uma mudança de Endpoint precisa alterar o
`endpointKey` no arquivo de controle, para que o novo Endpoint não fique bloqueado pelo TTL antigo.

## 2. Semântica de falha e de refresh

### 2.1 Start

```text
read Bundled + read LKG
          |
          v
choose compatible max revision
          |
          v
publish immediately
          |
          v
start remote refresh in background
```

A requisição de rede remota não bloqueia o Provider Runtime de concluir o primeiro ready usando um candidato local válido. Se não houver nenhum candidato local válido, o start falha;
não se pode publicar um Registry vazio por causa da espera da rede, nem fabricar um Provider meio completo.

### 2.2 Classificação da resposta remota

| Situação                           | Tratamento                                     |
| ------------------------------ | ---------------------------------------- |
| Falha de HTTP/timeout/JSON/Envelope   | mantém o Snapshot e o LKG atuais e registra um erro diagnosticável |
| `configs.zcodeBuiltin` ausente    | considera que o servidor ainda não publicou e mantém o Snapshot atual    |
| Schema não suportado                  | rejeita a resposta e mantém o Snapshot e o LKG atuais       |
| Falha de parse estrito de Provider/Rule     | rejeita a resposta inteira, sem aplicação parcial               |
| revision menor que a revision válida atual | trata como resposta obsoleta e ignora                       |
| revision igual à atual e conteúdo igual    | deduplica, sem gravar em disco e sem notificar                     |
| revision igual à atual mas conteúdo diferente| trata como erro de protocolo de publicação e rejeita com registro de erro         |
| revision maior e parse compatível bem-sucedido    | substitui atomicamente o Active Cache e depois publica a mudança      |

### 2.3 Ordem de escrita e publicação

```text
remote payload
      |
      v
strict envelope/domain parse
      |
      v
atomic replace active.json
      |
      v
publish Source changed
```

Se a persistência falhar, a atualização remota desta rodada não entra no Registry em memória do Host. Assim, o Host já em execução, um Worker iniciado depois e a recuperação após restart não
veem fatos diferentes entre si. A escrita precisa usar o caminho gravável explícito do Environment, lock de arquivo e substituição atômica, sem depender de caminhos de código-fonte, de variáveis de ambiente amplas nem de cache compartilhado entre Environments.

## 3. Escopo de implementação

### Step 0: atualizar primeiro o Design oficial

- no Environment Design, converte o blueprint de longo prazo do Management Service na entrada `/client/configs.zcodeBuiltin` desta rodada;
- nos Designs de Configuration/Runtime, registrar que Bundled/LKG/Remote são candidatos da mesma Built-in Source;
- registrar que a raiz de composição do Environment é a dona da sincronização e que o Core Worker só lê o arquivo ativo;
- registrar que o Client Config Service não é unificado nesta rodada.

### Step 1: definir o Schema de Release de dois níveis e o caminho de cache

- estabelecer um Schema de runtime estrito para `configs.zcodeBuiltin`;
- adicionar a `revision` monotonicamente crescente e o `schemaVersion`;
- o `config` interno guarda somente o conteúdo de Provider Config e Model Config Rules existentes;
- Bundled, Remote e Active Cache usam exatamente a mesma estrutura de Release de dois níveis;
- expressar o escopo de compatibilidade do cache pelo caminho `<platform>/<appVersion>/<endpointKey>/active.json`, sem adicionar `fetchedFor` ao JSON;
- não introduzir no Domínio de Provider um tipo de Documento de Config Remoto.

### Step 2: estabelecer a seleção de candidatos local e o Repository atômico

- ler e parsear de forma compatível e separada o Bundled e o Active Cache;
- escolher o candidato de start por compatibilidade e revision;
- usar naturalmente o Bundled quando o Active Cache está ausente, corrompido, muito antigo ou incompatível;
- `active.json` cumpre simultaneamente o papel de Source ativa e de LKG, com uma única substituição atômica sob lock;
- não escrever nos arquivos do repositório/pacote de instalação.

### Step 3: adicionar o sincronizador remoto mínimo

- usar o `ApiClient` existente na raiz de composição do Environment para requisitar `/client/configs`;
- usar o Endpoint, o App Version e os parâmetros de plataforma do Environment atual;
- executar parse estrito do envelope e parse compatível de `zcodeBuiltin` com os Parsers de Provider/Model Config existentes;
- usar o `refresh-control.json` gravado em disco, lease expirável, timeout de requisição e backoff incremental para a deduplicação em nível de Environment;
- quando vários Hosts compartilham o mesmo caminho de Environment, comparar a revision novamente dentro do lock de arquivo para evitar que uma requisição atrasada sobrescreva algo obsoleto;
- não modificar outros consumidores de Client Config.

### Step 4: conectar o caminho de Source do Host/Worker

- o Local Host e o Remote Host usam cada um o arquivo Built-in ativo do seu Environment;
- o Core Worker spawado continua recebendo o mesmo caminho e usando o Source/watcher de arquivo existente;
- Environment Entries sem Desktop Local Host, como Prompt CLI, TUI e standalone server, têm explicitamente a mesma dona de sincronização;
- o remote anexado do Desktop consome apenas a Facade do Remote Host e não estabelece caminho local de push.

### Step 5: refresh e ciclo de vida

- fazer um refresh em segundo plano depois que o candidato local válido completar o primeiro ready;
- usar inicialmente um TTL na ordem de uma hora para as refreshes seguintes e oferecer uma entrada de refresh explícito;
- a recuperação da rede pode disparar um retry, mas uma falha não limpa o Snapshot atual;
- depois do dispose, é proibido gravar em disco ou publicar mudanças com respostas atrasadas;
- mudanças de configuração disparam os refreshes existentes de Account Source e Registry, sem criar um segundo conjunto de sincronização de Registry.

### Step 6: limpeza e verificação

- remover hardcodes de caminho que existiam apenas por causa da antiga premissa de Source em arquivo único;
- não remover nem refatorar as outras cadeias de `/client/configs`;
- atualizar o build de publicação para garantir que o Bundled e a revision de publicação remota venham do mesmo processo de publicação de configuração;
- adicionar as verificações unitárias, de integração e do Environment alvo deste Todo.

## 4. Plano de testes

### 4.1 Schema e atomicidade

- parse estrito do objeto `zcodeBuiltin` completo;
- rejeição de toda a resposta quando `config.providers`, `config.modelConfigRules`, `schemaVersion` ou `revision` estão ausentes;
- `builtinProviders/builtinModels` antigos e desconhecidos não entram na Source oficial;
- regex de Rule, API/Access de Provider, Model Properties e Reasoning Mapping usam o Schema oficial atual;
- não adicionar no cliente o conjunto extra de regras de integridade de negócio do Built-in descartado no Todo 19.

### 4.2 Seleção Bundled/LKG

- sem LKG, usar o Bundled;
- um LKG válido e mais novo vence;
- usar o Bundled quando a revision do LKG é mais antiga;
- appVersion antigo e platform errada são isolados pelo caminho de cache; Cache com Schema desconhecido, JSON corrompido ou falha do Domain Parser é ignorado;
- falha explícita quando Bundled e LKG são ambos inválidos;
- após a atualização do App, o LKG da versão antiga não é reutilizado.

### 4.3 Refresh remoto

- revision maior faz parse com sucesso, substitui `active.json` atomicamente e publica a mudança uma única vez;
- deduplicação na mesma revision com o mesmo conteúdo;
- rejeição na mesma revision com conteúdo diferente;
- revision menor e requisições obsoletas atrasadas não sobrescrevem a configuração atual;
- falhas de HTTP, timeout, JSON, Envelope, Schema, Domain Parser e de gravação em disco preservam o Snapshot/Active Cache atual;
- depois do dispose, respostas atrasadas não gravam em disco nem notificam.
- quando múltiplos Hosts/Entries fazem refresh ao mesmo tempo, apenas um obtém o lease gravado em disco e faz a requisição ao servidor;
- após um crash do dono do lease, a troca é possível depois da expiração; uma mudança de Endpoint não fica bloqueada pelo TTL antigo;
- a falha usa backoff incremental com teto e o refresh explícito ainda não contorna um lease válido.

### 4.4 Environment e execução

- o Local Host e seu Core Worker leem a mesma revision Built-in ativa;
- o Remote Host e o Remote Worker usam o LKG do próprio Environment remoto;
- o remote anexado do Desktop não usa o Built-in local do Desktop;
- workers de múltiplos Workspaces não requisitam `/client/configs` individualmente;
- depois de uma atualização Built-in, as Views de Settings/Selection são atualizadas;
- o Account Provider se restringe novamente pelo novo Built-in;
- o Active Model já criado não muda, e Models criados depois usam a nova revision;
- a Personal Provider/Model Config não é reescrita pela atualização remota e continua como o último Overlay.

### 4.5 Regressão

- o comportamento original de Client Config de produtos e planos do Coding Plan, checagem de segurança da versão oficial, Off-Peak e Context Budget permanece inalterado;
- as cadeias de requisição de Desktop Computer Use, Desktop Context Prompt e Force Update ficam inalteradas;
- a cadeia de dados de Session/Task do Desktop continuous e do Web Remote replayable não é afetada;
- as Settings de Provider, a seleção de modelos, a Connectivity, a Automation, o Subagent, o Repo Wiki e o Off-Peak continuam passando pela Facade do Host alvo;
- `pnpm typecheck`, `pnpm lint`, os testes unitários afetados e os E2E relevantes de Desktop/Remote passam.

## 5. Definição de conclusão

- `/client/configs.data.configs.zcodeBuiltin` se torna o único campo de transporte do Built-in remoto;
- Provider e Model Rules têm publicação, validação e aplicação atômicas;
- Bundled e Active Cache são escolhidos corretamente por compatibilidade e revision;
- `active.json` cumpre simultaneamente o papel de Source ativa e de LKG, e a escrita não modifica ativos do repositório nem do pacote de instalação;
- cada raiz de composição de Environment faz o seu próprio fetch, cache e publicação, e o Core Worker não requisita de forma independente;
- o Remote Workspace não recebe push do Built-in local do Desktop;
- configurações remotas com falha, obsoletas, corrompidas ou incompatíveis não quebram o Registry atualmente utilizável;
- o refresh de configuração só afeta Models criados depois;
- os outros consumidores de Client Config não foram refatorados por conta própria;
- Design, testes, typecheck e Lint são concluídos de forma sincronizada, com submissão em Conventional Commit.

## 6. Explicitamente não feito

- não estabelecer um singleton de Client Config global ou entre processos;
- não unificar as requisições de Client Config de `BigModelCodingPlanSubscriptionProvider`, do Desktop Main e do Force Update;
- não persistir o `/client/configs` inteiro, apenas o `zcodeBuiltin` já validado;
- não modelar Remoto, LKG e Bundled como três camadas de Overlay de Provider;
- não permitir a mistura de Remote Provider Config com Bundled Model Rules;
- não restaurar `builtinProviders`, `builtinModels`, Catalog, Preset ou hardcode de modelo concreto antigos;
- não alterar a semântica de Account Access, Personal Config, credenciais, autenticação de requisição ou autorização final do servidor;
- não alterar seleção de modelo, fila, recuperação, Continuous/Replayable ou o ciclo de vida da Session.

## 7. Registro de implementação

Concluído em 2026-08-25 conforme este documento:

- `@zcode/provider-node` ganhou o Schema estrito de Release de dois níveis, a seleção de candidatos Bundled/Active, a Source Active atômica,
  o arquivo de controle de refresh entre processos e o Remote Synchronizer;
- o `config/provider/zcode-builtin.json` oficial foi migrado para um Release de dois níveis com `revision=1`;
- a raiz de composição de Environment dos Services usa o Endpoint, o App Version, os parâmetros de plataforma e o `ApiClient` existentes para ler em segundo plano
  `/api/v1/client/configs`; o Local/Remote Host injeta o caminho Active no Worker;
- o Standalone Server reaproveita o owner dos Services; o Prompt CLI/TUI independente cuida do seu próprio Active/LKG e refresh em segundo plano, e não faz refresh duplicado quando o Host injeta o caminho explicitamente;
- o refresh explícito das Settings dispara a cadeia de refresh existente do Built-in Remote, do Account Source e do Registry;
- os outros consumidores de Client Config não foram modificados e nenhuma checagem extra de integridade de negócio do publicador foi adicionada.

A automação principal cobre o parse estrito, a seleção de candidatos, o conflito de mesma revision, as revisions remota nova e antiga, a atualização atômica, o lease entre processos,
a mudança de Endpoint, a resposta atrasada após dispose, a raiz de composição dos Services, o owner do Remote Host, o caminho Active do Worker e as entradas de CLI/SEA.