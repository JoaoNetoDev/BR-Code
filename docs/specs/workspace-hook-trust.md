# Mecanismo de Workspace Hook com Trust Manual (centralizado em Settings)

> **Revisão de 2026-08-13 para simplificação do Trust persistente:** a semântica de produto mais
> recente está em
> [`workspace-hook-trust-persistent-only.md`](./workspace-hook-trust-persistent-only.md).
> O Workspace Hook mantém somente o Trust persistente declarado item a item. As seções de
> especificação deste documento foram convergidas para o schema atual; a máquina de estados de
> autorização descontinuada não é mais uma entrada executável NL→Code.

> **Modelo de interação (fato atual em 2026-08):** ao enviar um prompt, se existir um Hook não
> confiável, o turno não aguarda revisão humana; o Hook pendente produz `HookRunBlocked` no turno
> e é ignorado, e uma barra de aviso aparece na parte inferior do chat. Depois que o usuário entra
> ativamente nas configurações de Hooks, ele só pode estabelecer Trust persistente item a item; o
> SessionStart ignorado não é reexecutado. O sequenciamento detalhado está em
> [`workspace-hook-trust-soft-gate.md`](./workspace-hook-trust-soft-gate.md).

| Campo        | Valor                                                                                                                                                                                                                 |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status       | Implementado; a interação atual é persistent-only + soft-gate, com verificações estáticas e de automação concluídas; o aceite manual final no Desktop real é executado pelo produto                |
| Data         | 2026-08-07                                                                                                                                                                                                             |
| Escopo       | ZCode CLI Runtime, ZCode Protocol v4, Desktop/Web UI, Remote Workspace, Headless CLI                                                                                                                                    |
| Alvo         | Hooks de `zcode.json` e `.zcode/config.json` no nível workspace/projeto                                                                                                                                                   |
| Baseline de segurança | Deny por padrão, autorização explícita, invalidação por item em caso de mudança de declaração, precedência da recusa de política                                             |
| Documentos relacionados | `docs/security/deep-link-project-trust-boundary.md`; `docs/web-remote-control/web-remote-control-architecture.md`; `docs/web-remote-control/task-realtime-sync.md`; `docs/web-remote-control-task-command-queue.md` |
| Solução de interação   | Revisão concluída em `Settings → Hooks → Workspace`; não se usa um Trust Dialog separado na página de tarefas                                                       |
| Demo da interação      | `docs/specs/workspace-hook-trust-demo.html` (protótipo histórico, substituído pela especificação persistent-only)                                                 |
| Aceite manual          | `docs/testing/workspace-hook-trust-manual-acceptance.md`; fixtures gerados por `scripts/create-workspace-hook-trust-uat-fixture.mjs`                                  |

## 1. Resumo

Esta seção de resumo descreve a implementação atual; a interação e os estados seguem
[`workspace-hook-trust-persistent-only.md`](./workspace-hook-trust-persistent-only.md) e
[`workspace-hook-trust-soft-gate.md`](./workspace-hook-trust-soft-gate.md). Este documento
descreve apenas o contrato atual de Trust persistente e soft-gate, sem manter os detalhes
normativos do modelo de interação antigo.

O baseline de segurança, o discovery isolado, o domínio de Trust, a admissão no Runtime, a
revisão Desktop/Mobile, a rota remota, CLI/Headless, o rollout e a telemetria foram concluídos e,
pelos documentos persistent-only e soft-gate, convergidos para:

- declarações de Hook de workspace/projeto são normalizadas pelo discovery do Runtime em um snapshot imutável e não podem entrar no caminho executável antes da admissão;
- o Desktop exibe a configuração de Hooks em `Settings → Hooks → Workspace`; linhas não confiáveis oferecem apenas o "confiar" persistente por item e mostram o interruptor de execução efetiva desligado e não operável; linhas confiáveis não exibem emblema adicional de estado de Trust;
- ausência de Host capaz, clientes antigos, geração obsoleta, divergência de snapshot, falha do Trust store e falha na reconstrução da configuração resultam em fail closed;
- Desktop continuous e Web/Mobile replayable compartilham a mesma projeção de revisão do Runtime; a resposta é vinculada a task/run/remoteSession/runtime epoch, comandos sensíveis fazem apenas ACK query e não são reproduzidos automaticamente;
- o Headless fornece status/review/grant/revoke exatos e diagnósticos de pretrust; o gate de rollout confiável, telemetria anonimizada, documentação de segurança/controle remoto/usuário e migração de diagnósticos antigos são feitos na Fase 6.

Esta especificação introduz o **Workspace Hook Trust Admission**, independente do estado usual de
habilitação de Hook, e adota explicitamente a interação **centralizada em Settings**:

1. Descobrir Hooks a partir da configuração do projeto, mas sem convertê-los ainda em callbacks executáveis;
2. Formar um `HookBundleSnapshot` imutável a partir das declarações de Hook do projeto atual;
3. Calcular um `bundleDigest` para o bundle e um `hookDeclarationDigest` para cada declaração de Hook;
4. O Trust persistente usa `workspace identity + hook declaration digest` como chave de permissão, permitindo revisão item a item;
5. O usuário pode confiar ativamente em `Settings → Hooks → Workspace`; se qualquer entrada real de dispatch de Hook de projeto encontrar uma declaração não revisada, o Runtime **não bloqueia mais o turno nem força a navegação até a página de configurações** — o hook pendente é simplesmente ignorado no turno (`HookRunBlocked`), o turno segue imediatamente e uma barra de aviso permanente aparece na parte inferior do chat (N Hooks aguardando revisão + revisar/ignorar); somente quando o usuário clica ativamente as configurações de Hooks são abertas (ver a spec do soft gate);
6. A interface de configurações oferece apenas o `Trust` persistente para cada declaração não confiável; confiança e o interruptor de configuração permanecem ortogonais;
7. Fechar a interface de configurações ou a desconexão temporária do attachment do cliente não produz decisão de segurança; dispensar a barra de aviso é apenas esconder localmente, sem persistir; a admissão pendente pode ser recuperada por evento continuous ou snapshot replayable. Persistir o Trust só afeta eventos de Hook naturais posteriores; o SessionStart já ignorado **não é reexecutado**, no máximo valendo a partir do próximo SessionStart real;
8. Uma mudança nas declarações de Hook invalida apenas o declaration digest afetado; o snapshot/bundle digest continua sendo usado para garantir consistência entre revisão e execução;
9. Em ambientes sem interação o padrão é fail closed, e o Trust preciso deve ser previamente estabelecido por comandos explícitos de CLI;
10. Políticas corporativas/gerenciadas: deny tem precedência sobre qualquer autorização do usuário;
11. O interruptor de execução efetiva de declarações não confiáveis permanece desligado e não operável; exibir ou confiar não pode reescrever a configuração original do workspace; após o sucesso do Trust o interruptor é restaurado conforme o `configuredEnabled` real;
12. O Desktop usa `desktop-continuous` e o Web no celular usa `web-remote-replayable`; ambos se conectam ao mesmo Host/Runtime, e os comandos de revisão são submetidos via attachment confiável com roteamento por owner/stale-run.

Este design autoriza as **declarações de Hook atuais exibidas na página de configurações**, e não
o conteúdo completo do código transitivo referenciado pelos comandos do Hook e suas dependências.

---

## 2. Contexto e situação atual

### 2.1 Correção de segurança atual

`apps/zcode-cli/packages/adapters/src/config/project-config.adapter.ts` atualmente trata Hooks de
projeto por dois caminhos isolados:

1. `loadProjectConfigFile()` gera um diagnóstico ao detectar `result.config.hooks` e guarda as
   declarações em um side-channel independente de candidate/snapshot:

```text
config_project_hooks_pending_trust
Project hooks are pending workspace trust and remain blocked
```

2. `normalizeProjectConfig()` ainda remove o campo `hooks` inteiro do `RuntimeConfigPatch`
   executável retornado; o candidate não é consumido pelo mergeador de configuração nem pelo
   runner configurado.

Esse comportamento corrige a seguinte cadeia de ataque:

```text
deep link externo / diretório não confiável
  -> abrir um workspace controlado pelo atacante
  -> descobrir automaticamente a configuração do projeto
  -> Hook SessionStart executa shell/process no caminho de startup ou resume
```

Portanto, o novo mecanismo de Trust não pode apenas adicionar um interruptor na página de
configurações do renderer, nem apenas fazer uma verificação temporária em um ponto de chamada de
`turn.ts`. A fronteira de segurança deve estar **antes de a declaração de Hook do projeto entrar no
Runtime executável, a partir da configuração, e deve cobrir todas as entradas de dispatch de Hook**.

### 2.2 Inconsistência entre a página de configurações e a semântica do Runtime

O Settings Service e o Runtime Adapter da Fase 1 já reutilizam o mesmo resolver
discovery/canônico, sendo capazes de exibir o snapshot de Hooks do projeto, os gates configurados
reais, a procedência da origem e `editable`. O patch executável do Runtime continua removendo
sempre os Hooks de projeto, portanto a UI atual exibe o estado "configurado mas não admitido", e não
o estado executável.

O novo modelo precisa distinguir claramente:

```text
configuredEnabled  se a configuração do Hook está habilitada
trustState         se a declaração atual passou pela admissão de Trust
effectiveRunnable  se a execução é de fato permitida neste contexto
```

Não se pode continuar usando um único `enabled` para significar ao mesmo tempo "configurado" e
"permitido com segurança".

### 2.3 O discovery de configuração não é um modelo de arquivo único

Dentro de um worktree Git, a configuração do projeto é descoberta do diretório atual até a raiz do
worktree:

```text
<dir>/zcode.json
<dir>/.zcode/config.json
```

e mesclada na ordem da raiz para o cwd; um `projectConfigPath` explícito (atualmente repassado
principalmente por testes e por poucos caminhos de construção) é acrescentado após os arquivos de
discovery, sendo uma capacidade de compatibilidade futura e não o caminho principal da UI na V1.

**O comportamento existente para diretórios não-Git é diferente:** `getProjectConfigDirectories()`
finalmente retorna apenas `cwd` e não adiciona diretórios pais intermediários ao escopo de
discovery. O construtor de snapshot precisa reutilizar esse comportamento e não pode implementar
por conta própria outra regra de "varrer diretórios pais mesmo fora do Git".

Portanto, o snapshot de discovery não pode representar apenas um arquivo `.zcode/config.json`, nem
pode fazer hash apenas do texto final exibido na UI. O bundle completo deve cobrir o escopo real de
discovery, a origem, a ordem relativa e o resultado da mesclagem; o declaration digest do Trust
item a item também deve incluir a source, o event, o matcher, a posição e toda a semântica de
execução conhecida daquele Hook.

### 2.4 Draft prewarm e momento real de execução são diferentes

O composer V4 cria a draft session antecipadamente, mas o draft prewarm não executa Hooks.

O `SessionStart` tem hoje pelo menos dois caminhos reais de execução:

- `turn.ts` chama `runSessionStartHooks("startup", ...)`;
- `resume.ts` chama `runSessionStartHooks("resume", ...)`.

O tipo de source de matcher de `runSessionStartHooks()` ainda reserva `clear` e `compact`.
Embora hoje não haja pontos de chamada independentes correspondentes, quando forem adicionados eles
deverão herdar automaticamente a admissão e não se tornar um caminho alternativo.

Esta especificação não abre automaticamente a interface de revisão na fase de draft prewarm. O
usuário pode revisar antecipadamente na página de configurações; quando qualquer entrada real capaz de
fazer dispatch de um Hook de workspace chegar, o Runtime deve concluir a admissão antes de permitir
a execução dos Hooks de projeto que correspondam a essa source/event.

---

## 3. Terminologia

### 3.1 Workspace Hook / Project Hook

Um Hook originado de `zcode.json`, `.zcode/config.json` ou de um `projectConfigPath` explícito dentro
do escopo de discovery da configuração do projeto do workspace.

Este documento o chama uniformemente de **Workspace Hook**; o enum de origem de código deve usar
`project`, para manter consistência com o `ConfigScope.Project` existente.

### 3.2 Hook Bundle

O conjunto normalizado de todas as declarações relacionadas à execução de Hooks de projeto obtidos
no discovery de configuração deste workspace.

### 3.3 HookBundleSnapshot

Um snapshot imutável em memória criado antes da admissão. O resumo visto pelo usuário, o digest
canônico e a execução real devem vir do mesmo snapshot.

### 3.3.1 Hook Declaration Digest

O digest calculado sobre a serialização canônica versionada da semântica de execução de uma única
`CanonicalWorkspaceHookEntry`. O Trust persistente e o revoke item a item usam esse digest como
fronteira de conteúdo.

O `bundleDigest` continua existindo, mas é usado para identificar o snapshot completo atual,
detectar inconsistência entre review e execute e agregar diagnósticos; já não é a única granularidade
persistente de Trust na V1.

### 3.4 Workspace Identity

A identidade da dimensão de workspace do Trust:

- workspace local: usar o `workspacePath` / `workspaceKey` canônico já existente na camada de protocolo/serviço;
- workspace remoto: usar o `workspaceIdentity` já existente;
- não é permitido usar apenas o path puro na máquina remota como identidade;
- a identidade deve ser tratada pelo serviço de Trust como uma string opaca, sem que o serviço a deduza ou recomponha por conta própria.

### 3.5 Ciclo de vida do Trust

A autorização de um Workspace Hook vem apenas de um registro persistente preciso no Trust store
de propriedade do usuário. `sessionId`, `taskId`, `runId`, `reviewFlowId` e `interactionId` servem
apenas para vincular um comando de revisão ao snapshot confiável atual do Runtime e não ampliam o
escopo do Trust. A validade da autorização depende somente do registro preciso
`workspace identity + hook declaration digest` e do gate atual de policy/snapshot.

compact, resume, fork, new task e subagent não podem gerar nem herdar autorizações adicionais; eles
só podem reutilizar o registro persistente existente sob a mesma workspace identity que ainda
corresponda ao declaration digest atual. Após a reconstrução do Runtime, ele deve fazer bootstrap a
partir do Trust store e falhar de forma fechada antes da leitura ser concluída.

### 3.6 Trust Record

Registro persistente no armazenamento seguro do domínio do usuário, indicando que um
`workspace identity + hook declaration digest` foi escolhido como confiável pelo usuário. O produto
atual cria um registro preciso a partir de cada linha de Hook.

### 3.7 Admission

A decisão de segurança antes de um Hook de projeto entrar no conjunto executável do Runtime. A
admissão é uma dimensão diferente da permissão comum de ferramentas e do estado enabled de um Hook.

---

## 4. Objetivos

1. Permitir que o usuário autorize explicitamente as declarações de Hook atuais do workspace, em vez de bloquear permanentemente todos os Hooks de projeto.
2. Manter o fail closed por padrão; Hooks de projeto não autorizados não podem entrar no caminho executável.
3. Usar a mesma fronteira de admissão para deep link, abertura de pasta comum, workspace recente e workspace remoto.
4. Não incomodar o usuário quando ele apenas navega por um workspace ou faz o prewarm do composer draft.
5. Permitir que o usuário continue usando tarefas mesmo sem Trust, apenas pulando os workspace Hooks.
6. Exigir nova autorização automaticamente quando as declarações de Hook do projeto mudarem.
7. Oferecer Trust item a item na UI existente `Settings → Hooks → Workspace`, expressando o estado não confiável por um interruptor efetivo travado e desligado.
8. Oferecer a Headless/automation um comportamento determinístico, auditável e sem elevação implícita de privilégio.
9. Não escrever dados de Trust no repositório do projeto, evitando que o projeto se declare confiável.
10. Preservar o comportamento existente e a semântica de ordem de execução de user Hooks, plugin Hooks e internal Hooks.
11. Suportar revoke explícito, com a interrupção subsequente da obtenção de admissão por Hooks do projeto de forma oportuna.
12. Formar uma interface de política extensível, permitindo adicionar no futuro políticas gerenciadas de deny/allow.

---

## 5. Não objetivos

1. Não validar a cadeia de suprimentos completa dos scripts, binários, interpretadores, pacotes de dependência ou recursos de rede referenciados por um Hook.
2. Não criar um novo sandbox de SO para Hooks de projeto; o Hook continua usando as capacidades existentes do Hook executor.
3. Não mesclar o Trust de Hook no prompt comum de permissão de ferramentas.
4. Não alterar a política de confiança existente do MCP do workspace.
5. Não alterar a fronteira de segurança do `permissionMode` do perfil de subagent do projeto.
6. A V1 não oferece "confiar permanentemente em todas as futuras mudanças de Hook deste workspace".
7. A V1 não oferece autorização granular do tipo "liberar permanentemente todo um evento de Hook"; o alvo do Trust é a declaração de Hook efetiva.
8. A V1 não cria Trust persistente silenciosamente via variável de ambiente.
9. A V1 não grava trust token, assinatura ou allowlist no arquivo de configuração do workspace.
10. O revoke não seresponsabiliza por encerrar processos externos de Hook já iniciados; o cancelamento de processos é uma capacidade separada posterior.

---

## 6. Modelo de ameaça e princípios de segurança

### 6.1 Cenários que precisam ser defendidos

- um atacante induz o usuário via deep link a abrir um diretório com Hook malicioso;
- após clonar um repositório, a primeira mensagem dispara o Hook `SessionStart`;
- o projeto modifica a configuração de Hook e continua reutilizando o Trust antigo;
- um workspace remoto reutiliza indevidamente o Trust de outra máquina apenas porque o path é igual;
- renderer/UI é contornado e uma chamada direta de CLI ou protocolo cria o Runtime;
- draft prewarm dispara autorização ou execução sem uma intenção explícita do usuário;
- a revisão exibe uma configuração e, após a aprovação, a execução relê outra configuração;
- a política corporativa proíbe explicitamente Hooks de projeto, mas o Trust local do usuário a sobrescreve.

### 6.2 Princípios de segurança

1. **Default deny**: sem um resultado explícito de admissão, o Hook de projeto não é executado.
2. **Runtime-enforced**: a decisão ocorre antes da formação do conjunto executável do Runtime e não depende da disciplina da UI.
3. **Content-bound**: o Trust persistente é vinculado ao declaration digest da Hook individual atual; o bundle digest é usado para consistência de snapshot.
4. **Identity-bound**: o Trust é vinculado à workspace identity.
5. **Policy-first**: deny gerenciado tem precedência sobre o Trust do usuário.
6. **Snapshot consistency**: review, digest e execução usam o mesmo snapshot imutável.
7. **No repository self-trust**: o conteúdo do projeto não pode escrever nem declarar o próprio Trust.
8. **Explicit automation**: ambientes sem interação aceitam apenas comandos de pré-autorização explícitos e auditáveis.
9. **Graceful refusal**: recusar um Hook não equivale a recusar o uso do workspace.
10. **Honest wording**: a UI deve esclarecer que o que é autorizado é a declaração do Hook, e não há garantia de que o conteúdo do script chamado não mude.

---

## 7. Árvore de decisão do usuário final

```mermaid
flowchart TD
    A["发现 workspace/project 配置"] --> B{"是否存在 project Hook candidates?"}
    B -- "否" --> N["无需 Trust；继续 Runtime"]
    B -- "是" --> C["冻结 HookBundleSnapshot Bn"]
    C --> D["解析真实 enabled gates，计算 bundle/declaration digests"]
    D --> E{"Managed policy mode?"}
    E -- "deny" --> P["blocked_policy"]
    E -- "允许评估" --> F["查询 persistent Trust"]
    F --> G{"即将 dispatch 的 enabled Hook 是否全部 admitted?"}
    G -- "是" --> R["激活同一 snapshot 中 admitted Hook"]
    G -- "否" --> H{"是否到达真实 dispatch 入口?"}
    H -- "否：draft/discovery" --> W["pending_trust；不自动打开"]
    H -- "是" --> Q["产生 HookRunBlocked；跳过 pending Hook；turn 继续"]
    Q --> K["投影 pendingCount；会话提示可按需进入 Hooks 设置"]
    K --> L{"用户是否逐条点击 Trust?"}
    L -- "是" --> J["创建/复用 immutable review generation，或走无 session pretrust RPC"]
    J --> M["重验 identity + bundle + declaration，写 persistent record"]
    L -- "否/关闭/断连/超时" --> V["不写 Trust；pending admission 保持"]
    L -- "修改 editable toggle" --> U["原子写配置；generation n superseded"]
    U --> C2["重新 discovery，构建 Bn+1 与 generation n+1"]
    C2 --> F
    M --> G
    R --> Z["与 user/plugin/internal Hook 按 provenance 顺序执行"]
    P --> Z
    Q --> Z
```

### 7.1 Semântica de dispensar, desconectar e encerrar

Os seguintes eventos não são decisões de Trust:

- fechar ou sair da página de configurações;
- reload do renderer do desktop;
- atualização da página Web no celular ou desconexão temporária do attachment replayable;
- lacuna de transporte/reanúncio enquanto o mesmo Runtime continua vivo.

Nenhum desses eventos grava Trust nem chama um `cancel` genérico; a admissão pendente permanece válida e
é recuperada a partir da projeção/snapshot do Runtime.

Somente os seguintes eventos encerram a generation de revisão atual:

- o usuário submete um Trust persistente para a declaração exatamente selecionada;
- após a mutação bem-sucedida do toggle configurado, a generation antiga é marcada como `superseded` e substituída por uma nova;
- o vencimento de `WORKSPACE_HOOK_REVIEW_TIMEOUT_MS`, que apenas expira a request imutável e não grava nenhuma decisão do usuário;
- cancelamento/exclusão explícita da sessão;
- término do processo Runtime/Host. O término do processo não forja decisão do usuário; um resume posterior precisa refazer o discovery/evaluate e criar um novo interactionId.

### 7.2 Substituição atômica de toggle durante a revisão

O toggle em revisão não modifica o snapshot imutável antigo. Para o `.zcode/config.json` atual do
workspace com `editable=true`:

```text
acquire workspace review mutation lock
  -> validate proposed config in memory
  -> atomic write temp + fsync/close + rename
  -> rebuild discovery snapshot Bn+1
  -> mark generation n superseded
```