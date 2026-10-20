# Arquitetura de Plugins em Nível de Workspace

> Status: arquitetura aceita; implementação V1 e evidência E2E local pendente registradas; o mobile permanece apenas como integração focada e a admissão formal está pendente
> Date: 2026-08-19
> Decision: adotada a forma de configuração em dois níveis User/Workspace; sem escopo Local, e com a política de segurança aberta de Plugins já confirmada pelo ZCode
> Target: Desktop local, Agent Host de workspace SSH/WSL/Docker, shared-host attachment mobile `/remote`

## 1. Decisão final

O significado de Plugin em nível de Workspace é: o estado de habilitação e as options de runtime de um Plugin podem ser determinados pela configuração de projeto do Workspace atual. O escopo de configuração é consistente com Skill, Command e Hook, e suporta apenas dois níveis:

```text
User       ~/.zcode/cli/config.json
Workspace  <workspace>/.zcode/config.json
```

Não se implementa o seguinte:

- `<workspace>/.zcode/config.local.json`;
- `plugins/assignments/workspaces/<hash>.json` fora do Host;
- package/cache/data independentes por Workspace;
- instalação automática de Plugin ao abrir o projeto;
- hot-plug no App residente;
- approval separado para MCP de Plugin;
- Workspace trust gate no domínio de Plugin.

A configuração de Workspace pode ser rastreada pelo Git. `plugins.options`, credenciais e secrets podem, por decisão de produto, ser injetados pelo repositório do projeto, mas a UI, os logs, o diagnóstico, a captura de provider e os artefatos mobile replayable precisam ser sanitizados.

O Plugin Marketplace não faz parte do escopo de configuração: o mercado cuida apenas do ciclo de vida de packages do User no Host alvo, não exibe um seletor User/Workspace e não edita diretamente enabled/options de Plugin. Instalação, atualização, desinstalação e cache do Marketplace pertencem ao inventário de User do Host; uma instalação nova vem habilitada por padrão na config de User. O enabled/options de User e de Workspace são editados de forma unificada na visão de configuração "instalados" em Settings > Plugins.

## 2. Escopo e precedência

### 2.1 Estado de habilitação

```text
workspace.plugins.enabledPlugins[pluginId]
        ?? user.plugins.enabledPlugins[pluginId]
        ?? plugin manifest defaultEnabled
```

A ausência de uma key significa herança; um `false` explícito é uma sobrescrita válida, e não se pode substituir isso por uma implementação do tipo "ausente equivale a false".

### 2.2 Options

As options são mescladas profundamente por ID de Plugin e por option key:

```ts
effectiveOptions[pluginId] = {
  ...user.plugins.options[pluginId],
  ...workspace.plugins.options[pluginId],
};
```

Exemplo:

```json
{
  "plugins": {
    "enabledPlugins": {
      "formatter@team-market": true
    },
    "options": {
      "formatter@team-market": {
        "style": "compact",
        "apiToken": "shared-project-secret"
      }
    }
  }
}
```

A configuração de Workspace sobrescreve apenas os campos que ela declara; os demais campos continuam herdando da configuração de User.

## 3. Propriedade da persistência

### 3.1 Config de Workspace

Arquivo autoritativo:

```text
<workspace>/.zcode/config.json
```

A configuração de Plugin suportada inclui:

- `plugins.enabledPlugins`: quais Plugins o projeto habilita/desabilita;
- `plugins.options`: option comum, credencial e secret compartilhados pelo projeto;
- `plugins.dirs`: raiz de Plugin dentro do projeto ou caminho de Plugin relativo ao projeto, sujeitos à validação de caminho e de schema de manifest.

A configuração de Workspace não guarda bytes de package, estado de conclusão de instalação, cache do Marketplace, dados de Plugin nem registros de instalação de nível de usuário do Host. Uma entrada vazia em uma option sensível significa manter o valor atual; quando o usuário limpa explicitamente, apenas a option key indicada do escopo atual é removida, sem resetar a habilitação daquele Plugin nem as outras options.

### 3.2 Estado de User/Host

```text
~/.zcode/cli/config.json
  plugins.enabledPlugins
  plugins.options
  plugins.suppressedBuiltins
  user-level plugins.dirs

~/.zcode/cli/plugins/
  known_marketplaces.json
  installed_plugins.json
  marketplaces/
  cache/{marketplace}/{plugin}/{version}/
  data/{pluginId}/
```

O package de Plugin, a instalação, a atualização, a desinstalação, o cache e os dados continuam sendo estado de User/Host no Agent Host alvo. Quando a configuração de Workspace referencia um package ausente, apenas a declaração é mantida e `missing` é exibido, sem download ou instalação automática.

## 4. Carregamento em runtime

A página de configurações não carrega Plugins diretamente. O Agent lê e resolve ao criar o App/Session correspondente ao Workspace:

```text
打开 Workspace / 创建新 Session
          |
          v
确定 workspacePath、workspaceIdentity、remoteTarget
          |
          v
读取 User config
          |
          v
读取 <workspace>/.zcode/config.json
          |
          v
按 Plugin ID/key 合并 effective enabled/options
          |
          v
发现目标 Host 上的 installed/builtin/Workspace Plugin package
          |
          +-------------------+
          |                   |
       package 存在        package 缺失
          |                   |
          v                   v
校验 manifest/schema     overview=missing
          |
          v
直接注册 Hook/Skill/Command/Agent/MCP
          |
          v
创建当前 Session runtime
```

Hook, Skill, Command, Agent e MCP de um Plugin usam o mesmo registry efetivo de Plugins. Em runtime não é preciso saber se a configuração veio de User ou de Workspace; o escopo afeta apenas a leitura, a escrita de volta e a exibição da origem.

### 4.1 Limite de ativação de Session

```text
保存配置
   |
   +-- 配置文件立即更新
   +-- Settings overview 立即刷新
   +-- 当前 resident App 保持创建时的 Plugin catalog
   +-- 新建 Session 使用最新 effective config
   +-- cold resume 使用最新 effective config
```

O V1 não faz hot-plug no App residente e não reinicia tarefas em execução por causa de um salvamento nos Settings.

### 4.2 Plugin MCP

O Plugin MCP entra diretamente no runtime após o registro no registry de Plugins:

- não precisa de Workspace trust;
- não precisa de approval de Plugin MCP;
- ainda faz validação de manifest, de configuração, de caminho e de schema de protocolo;
- `${user_config.KEY}` pode ser expandido em sinks sensíveis como env/header/clientSecret;
- valores sensíveis não podem ser expandidos em campos não sensíveis como command, args e URL;
- erros em runtime retornam apenas informações de diagnóstico sanitizadas.

Isso é apenas uma exceção no domínio de Plugin e não altera o contrato de segurança já existente de configurações não-Plugin como MCP de projeto de topo, Hook e Agent.

## 5. Plano de controle dos Settings

A página de configurações reutiliza a interação de escopo de Skill/Command/Hook:

```text
Settings > Plugins

Scope: [User | Workspace]
Workspace: [local workspace / remote workspace]
```

Após selecionar um Workspace, todas as leituras e escritas ficam vinculadas ao alvo Workspace selecionado.

O Plugin Marketplace é uma visão principal separada; a página de navegação não oferece seletor de escopo, e o item "gerenciar plugins" dentro da página mantém o escopo de configuração User / Workspace.

```text
Settings / Sidebar
        | open marketplace
        v
Plugin Marketplace
  | install/update/uninstall package in Host User inventory
  | new install defaults User enabled=true
  | manage -> [User | Workspace] -> browse all
        | primary navigation back
        v
Chat
```

A navegação principal volta ao chat; dentro do mercado, gerenciar e os detalhes voltam à navegação do mercado. A source do Marketplace vem apenas da configuração de User/Host; o Workspace não suporta declaração, adição ou atualização do Marketplace. A instalação de pacotes escreve no Host User, e a ativação e a configuração por projeto continuam sendo determinadas pelo escopo escolhido explicitamente na página de gerenciamento. A interação completa está em [escopo do mercado](plugin-market-interactions-scope.md).

Os detalhes do plugin distinguem três categorias de estado:

```text
Package: Installed v1.2.0 / Missing
Enabled: On / Off / Inherited
Source: User / Workspace
```

### 5.1 Habilitar/desabilitar

```text
User scope:
  patch ~/.zcode/cli/config.json#plugins.enabledPlugins[id]

Workspace scope:
  patch <workspace>/.zcode/config.json#plugins.enabledPlugins[id]
```

A página de Workspace oferece "restaurar a configuração do User", cujo comportamento é remover a key do Workspace, em vez de gravar um terceiro tipo de sentinel.

### 5.1.1 Semântica das listas de escopo

As listas de User/Workspace da página de configurações representam visões de configuração, e não uma atribuição de recursos mutuamente exclusiva:

```text
Host available Plugin set
  = Host installed inventory
  + builtin Plugins
  + scope-specific Plugin roots/declarations

User view
  = User + manifest default projection

Workspace view
  = User + Workspace merged effective projection
```

Um mesmo Plugin instalado no Host pode aparecer simultaneamente nas páginas de User e de Workspace. A página de User edita enabled/options de User; a página de Workspace exibe o estado efetivo e a origem daquele Workspace:

- o Workspace tem key explícita: a origem é Workspace;
- o Workspace não tem key e o User tem key explícita: a origem é herança de User;
- nenhuma das camadas tem key: a origem é o manifest default.

O toggle de Workspace grava um `true`/`false` explícito no Workspace atual; "restaurar herança" apenas remove a sobrescrita do Workspace. As options de Workspace exibem o valor efetivo e a origem, mas a escrita de volta altera somente o Workspace. A página de User precisa ler a projeção de User/default sem as sobrescritas do projeto e não pode tratar a sobrescrita de Workspace como um valor de User.

MCP, Skill, Command e Hook contributions de um Plugin são exibidos conforme o enablement efetivo real do target selecionado: capacidades que passaram a valer por herança de User precisam aparecer na visão de Workspace, e as capacidades de um Plugin desabilitado não podem aparecer apenas porque o package existe.

`installed_plugins.json` é sempre o inventário de User do Host. O `scope` legado dele não possui `workspacePath` / `workspaceIdentity` e não participa do isolamento por Workspace nem da determinação da origem da configuração.

### 5.2 Options

O formulário de options grava no escopo atualmente selecionado. `sensitive: true` usa entrada mascarada, mas permite salvar na config de User ou de Workspace; não se pode bloquear o salvamento com trust ou approval.

### 5.3 Ações de package

Instalação, atualização, desinstalação e escrita de configuração permanecem independentes:

```text
Workspace enable succeeds + package missing
  -> 项目保留 enabled 声明，状态为 missing

Marketplace install succeeds
  -> package 写 Host User inventory
  -> User enabledPlugins 默认 true
  -> Workspace config 不被 Marketplace 修改
```

Não se faz uma transação pseudo-atômica entre arquivos, nem se reverte uma ação legítima de usuário que já teve sucesso do outro lado porque a outra parte falhou.

## 6. Limites remotos e mobile

```text
Renderer
   |
   v
one window-scoped Local Host
   |
   +--> local workspace service
   |
   +--> RemoteConnectionRegistry
          |
          +--> SSH / WSL / Docker / Server Agent Host
```

A leitura e escrita de arquivos usa a semântica de execução:

```text
<target workspacePath>/.zcode/config.json
```

Cache, Session, requisições assíncronas e isolamento de estado usam:

```ts
workspaceKey = workspaceIdentity?.trim() || workspacePath;
```

Um workspace remoto precisa carregar `workspaceIdentity` e `remoteSessionId`. Não se pode reutilizar um estado de Plugin errado só porque dois alvos têm o mesmo `workspacePath`.

O `/remote` do celular apenas faz attach a um shared Host existente e não cria runtime de Plugin, cópia de configuração nem estado de instalação independentes. O desktop permanece `desktop-continuous`, o celular permanece `web-remote-replayable`, e a configuração de Plugin não pode alterar essas duas semânticas de entrega.

## 7. Contrato de serviço e protocolo

A UI não escreve arquivos diretamente, preservando:

```text
UI -> PluginManagementStore -> IPluginManagementService
   -> ZCode Protocol -> Agent config loader/runtime
```

As interfaces carregam explicitamente o escopo e o contexto de Workspace:

```ts
type PluginScope = "user" | "workspace";

configurePlugin({
  pluginId,
  options,
  scope,
  workspacePath,
  workspaceIdentity,
});
```

`setPluginEnabled`, as mutações do Marketplace e overview/list também devem obedecer à mesma resolução de target. O overview precisa devolver o valor final e a origem:

```ts
{
  effectiveEnabled: true,
  enabledSource: "workspace",
  effectiveOptions: { GITHUB_HOST: "github.example.com" },
  optionSources: { GITHUB_HOST: "workspace" },
  package: { installed: true, version: "1.2.0" },
}
```

As requisições de overview/list dos Settings recebem um `configScope` opcional:

```ts
type PluginConfigScopeView = "user" | "workspace";
```

- `user`: ignora a config de Plugin do projeto e retorna a projeção de User + manifest default;
- `workspace`: retorna a projeção efetiva mesclada de User + Workspace;
- ausente: mantém o comportamento efetivo já existente, compatível com chamadores antigos.

Quando um Plugin declarado na configuração não tem package descobrível no Host alvo, `plugins/list` ainda retorna essa linha de configuração, identificada por `packageStatus: "missing"` opcional; a ausência significa que o package está disponível. Linhas missing não entram no inventário de instalados, não projetam capacidades como MCP/Skill/Command, mas ainda permitem gravar uma sobrescrita de enabled, restaurar a herança e navegar até o Marketplace para executar uma instalação explícita.

Resultados assíncronos e caches da UI precisam estar vinculados simultaneamente a
`(workspaceIdentity?.trim() || workspacePath, configScope)`.

## 8. Contrato E2E

Cada feature precisa ter setup, action, assertion e evidence próprios; não é aceitável alegar cobertura apenas de forma incidental em um caminho longo. Os casos oficiais estão em:

- [Plugin Management Lifecycle Case Catalog](../plugin-management-lifecycle-case-catalog.md)
- [Plugin Management Lifecycle E2E Coverage Matrix](../testing/plugin-management-lifecycle-e2e-coverage-matrix.md)

Os grupos de features E2E de nível Workspace são:

| Feature                         | E2E case  | O que deve provar                                                                                                                |
| ------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------- |
| User/Workspace scope UI         | `WPL-001` | As duas visões de configuração compartilham os candidatos do Host; User não é contaminada por sobrescritas do projeto; herança/sobrescrita de Workspace e isolamento A/B                           |
| precedência do estado enabled              | `WPL-002` | Um true/false explícito do Workspace sobrescreve o User; key ausente é herdada                                                                        |
| deep merge de options                  | `WPL-003` | Mesclagem por Plugin/key; options de User não cobertas são preservadas                                                                             |
| sensitive/secret                | `WPL-004` | O Workspace pode salvar e executar; UI/log/provider/artefato mobile não expõem o valor original                                                   |
| Plugin inteiro chegando direto ao runtime       | `WPL-005` | Hook/Skill/Command/Agent/MCP entram na nova Session sem trust/approval                                                         |
| comportamento com package ausente                        | `WPL-006` | Mostra apenas missing, não instala automaticamente; só pode executar após instalação explícita                                                                          |
| separação entre ciclo de vida de config e de package            | `WPL-007` | enable/disable e install/uninstall não se reverterem incorretamente um ao outro                                                                          |
| resident/cold resume            | `WPL-008` | O App residente congela; nova Session/cold resume lê a nova configuração                                                                    |
| instalação via Marketplace global      | `WPL-009` | Apenas o Marketplace de User pode adicionar/atualizar; a declaração em si não dispara download; instalação do mercado grava inventário/config de User, não enabled/options do Workspace |
| isolamento de target remoto         | `WPL-010` | Mesmo path, identity diferente não mistura configuração nem runtime                                                                             |
| instalação explícita em remoto/missing | `WPL-011` | A conexão não copia packages da máquina local; Sync/Install explícito apenas materializa o remote Host                                                            |
| shared-host mobile              | `WPL-012` | `/remote` usa o Host existente e não copia runtime/store de Plugin                                                                    |
| desabilitar builtin no Workspace       | `WPL-013` | Altera apenas enabledPlugins, sem apagar asset builtin nem dados de usuário                                                                     |
| raiz de Plugin de projeto/MCP         | `WPL-014` | Uma raiz de Plugin de projeto válida é ativada diretamente; manifest/path inválidos falham de forma fechada                                                           |
| roundtrip Marketplace/instalado | `WPL-015` | Partir de instalados do User para o mercado global; a página de navegação não tem escopo/config; a instalação grava em User; a navegação principal volta ao chat e depois se entra no gerenciamento para trocar para Workspace e configurar          |

A evidência E2E é estratificada:

```text
UI scope/source state
  + persisted User/Workspace config snapshot
  + Agent protocol/effective overview
  + new Session runtime evidence
  + package/cache/remote target evidence
  + no-secret and no-trust/approval evidence
```

O estado atual das evidências não é "tudo concluído": `WPL-001` a `WPL-011`, `WPL-013`, `WPL-014` e `WPL-015` já têm specs pendentes independentes e obtiveram targeted/replay pass em macOS local. Em 2026-08-31 a verificação remota foi concluída usando um alvo SSH isolado: o run `WPL-010` `desktop-e2e-20260831-060023-004` prova que configurações, catálogo e runtime com o mesmo path e workspace identity diferentes não se misturam; o run `WPL-011` `desktop-e2e-20260831-054511-469` prova que a conexão não copia o package da máquina local e que só após um Sync explícito ele é materializado no remote Host e entra no runtime de uma nova Session. `WPL-012` tem apenas um teste de integração focado de shared-host e evidência de código da projeção explícita de campos de external bridge; não é um E2E de ponta a ponta no celular. Todos os casos pendentes ainda não concluíram revisão manual, promoção, Docker admission e CI nas três plataformas. `WPL-005` hoje prova a chegada direta ao runtime apenas com o fixture representativo Skill+MCP; o ciclo fechado componente a componente de Command, Agent e Hook ainda precisa ser complementado.

## 9. Fatias de implementação

### Fatia A: base de configuração

- contrato de config de User/Workspace;
- descoberta da config de Workspace;
- deep merge de `enabledPlugins` e `options`;
- liberação da persistência de option sensível e sanitização na saída;
- limites entre a source do Marketplace de User, o inventário do Host e a visão de configuração de Workspace.

### Fatia B: resolução em runtime

- startup, `mcp/list` e overview dos Settings usando o mesmo resolvedor efetivo;
- descoberta de candidatos de Plugin installed/builtin/Workspace;
- registro de Hook/Skill/Command/Agent/MCP a partir da mesma fonte;
- regressão de freeze do resident, nova Session e cold resume.

### Fatia C: plano de controle dos Settings

- seletor de config de User/Workspace;
- ciclo de vida de package sem escopo no Marketplace;
- retorno do Marketplace com returnScopeKey à lista de instalados de origem;
- enable/disable/reset de herança;
- máscara e salvamento de options sensíveis;
- CTA de package ausente/instalação;
- estados de erro independentes de package/config;
- guarda contra resultado obsoleto em target remoto.

### Fatia D: remoto/mobile e rollout

- roteamento de alvos do RemoteConnectionRegistry;
- evidência de package/config no remote Host;
- evidência de integração focado de shared-host no mobile;
- E2E direcionado em macOS/Linux/Windows.

## 10. Gates de aceitação

1. A página de Plugins tem um seletor User/Workspace cujo comportamento é consistente com o escopo de Skill/Command.
2. A configuração de Workspace é gravada em `<workspace>/.zcode/config.json`, sem criar arquivo Local.
3. O `enabledPlugins` do Workspace vale para a nova Session e package ausente não instala automaticamente.
4. As options do Workspace sobrescrevem as de User por option key; comuns, credenciais e secrets podem valer.
5. Valores sensíveis podem ser persistidos, mas UI, logs, diagnóstico, captura de provider e replay mobile não os expõem.
6. Hook/Skill/Command/Agent/MCP de Plugin entram no novo runtime sem Workspace trust e sem approval separado de MCP.
7. O ciclo de vida de package não modifica declarações do projeto; falha de configuração não reverte indevidamente uma operação de package bem-sucedida.
8. O remoto lê arquivos pelo `workspacePath` do alvo e isola o estado pelo `workspaceIdentity`.
9. O mobile reutiliza o shared Host e não cria runtime/store de Plugin independentes.
10. O App residente não muda a quente; nova Session/cold resume usa a configuração mais recente.
11. Os casos WPL com targeted pass atual possuem setup/action/assertion/evidence E2E independentes; pending, review, fixture, Docker e as gates de múltiplas plataformas continuam sendo condições posteriores de promoção.
12. Só é possível declarar o feature completamente concluído quando `WPL-001` a `WPL-015` tiverem concluído as implementações, o E2E independente, a revisão manual e as gates de plataforma correspondentes; este commit V1 não faz essa declaração.
13. O próprio commit atual precisa passar por `pnpm typecheck`, `pnpm lint`, typecheck de E2E e o E2E direcionado dos WPL já implementados.
14. A página de navegação do Marketplace não exibe controles de escopo ou options; a instalação grava sempre no inventário de User do Host e no enablement de User; a página de gerenciamento mantém o escopo de projeto e a navegação principal volta ao chat.

## 11. Fora de escopo

- store de assignment externo ao Workspace;
- escopo Local e `config.local.json`;
- package/cache/data independentes por Workspace;
- instalação automática de package ao abrir o repo;
- hot-plug no App residente;
- coexistência de múltiplas versões do mesmo Plugin ID no mesmo Host;
- edição de enabled/options de User/Workspace dentro do Marketplace;
- relay/main mantendo estado de negócio de Plugin;
- adivinhar a identidade remota a partir do workspacePath;
- alterar os contratos de trust/approval de project hooks/MCP/subagent não-Plugin.

## 12. Postura de segurança

```text
clone/open repository
        |
        v
Workspace Plugin config loads without Workspace trust
        |
        +--> Hook/Skill/Command/Agent/MCP enter a new App
        +--> options/credentials/secrets enter Plugin runtime
        +--> Plugin MCP starts without separate approval
```

Esta é uma exceção explícita no domínio de Plugin. Um `.zcode/config.json` rastreado pode conter secrets em texto claro e também pode alterar parâmetros do runtime de Plugin ou iniciar o Plugin MCP; o produto não bloqueia esse comportamento e mantém apenas a validação de schema/caminho/protocolo e a sanitização da saída.

| Boundary                               | Decision                                            |
| -------------------------------------- | --------------------------------------------------- |
| Workspace Plugin enable, dirs, options | sem Workspace trust, entra direto na resolução de um novo App |
| Plugin Hook/Skill/Command/Agent        | ativados junto com o Plugin habilitado              |
| Plugin MCP                             | entra direto no runtime, sem approval separado     |
| Hooks/MCP/Agent de projeto de topo     | mantém o contrato de segurança já existente       |
| persistência de valores sensíveis      | User/Workspace podem salvar em texto claro          |
| saída de valores sensíveis             | deve ser mascarada em UI/log/diagnóstico/provider/artefato mobile |

## 13. Evidência e fronteira da fonte

Os limites atuais de implementação e verificação incluem:

- a configuração de projeto é carregada pela cadeia de descoberta `.zcode/config.json` já existente;
- o startup de Plugin, o `mcp/list` e o overview dos Settings precisam unificar no mesmo resolvedor efetivo;
- o package/registro de Plugin instalado é hoje de nível de usuário do Host alvo;
- `workspaceKey = workspaceIdentity?.trim() || workspacePath` é o contrato de isolamento de estado;
- o bloqueio de persistência da option `sensitive` em User/Workspace foi removido, e a saída continua sendo tratada pelo contrato de sanitização;
- a source do Marketplace é guardada apenas na camada de User/Host; a config de Workspace não declara, não adiciona e não atualiza o Marketplace, e apenas um refresh/install explícito do Marketplace de User materializa o estado de cache/package do Host alvo;
- já há evidência local para local, SSH remoto duplo e E2E de ciclo de vida pendente; o mobile até agora apenas prova que o shared-host attachment não copia o estado de Plugin, e o E2E real de `/remote` no celular ainda não foi concluído.

Na implementação não se pode modificar apenas a UI de Settings; é preciso modificar simultaneamente o config loader, a descoberta de Plugins, o startup de Session, o contrato de protocolo/serviço e os fixtures/coverage de E2E.