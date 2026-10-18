# Especificação de lazy start do CUA Helper (macOS / Windows)

## Status

- Status: implementado (MR1/MR2 entregues em feat/cua-helper-lazy-startup + producer feat/win-lazy-fork@5bcdde06); todos os portões verdes (typecheck/lint/architecture/testes unitários de services 3141); MC-1/2/3 reais no darwin e a cadeia completa MC-4~7/9 no Windows aguardam verificação em máquina real
- Data: 2026-09-21
- Escopo de aplicação: Desktop Host (services), cadeia de spawn/sessão do Agent, SDK zcode-cua (producer),
  Computer Use Helper
- Plataformas: macOS e Windows; Linux está fora do escopo desta especificação
- Pré-requisito: M7 já entregou no darwin a linha de base de lazy start (spawn sempre injeta socket estável, a
  primeira chamada CUA do SDK se autolaça, a página de configurações sobe sob demanda). Esta especificação
  estreita os caminhos residuais do darwin e leva o Windows para o mesmo modelo
- Relação de substituição: esta especificação substitui as cláusulas de admissão relacionadas ao spawn
  env da
  [Especificação de isolamento do ciclo de vida do Helper](./2026-09-02-helper-lifecycle-agent-runtime-isolation-spec.md)
  — isto é, a entrada «2026-09-10 spawn fast path» da §3.1 e a entrada de sonda limitada em §3.3 de
  «o spawn env do Agent precisa decidir se pode injetar o tuple atual do broker». As demais cláusulas
  daquela especificação (fail-closed, verificação de identidade de processo, fence de geração, ausência de
  sondagem periódica, eventos do Helper não devem descartar o Agent) continuam totalmente válidas

## 1. Invariantes de produto

**Invariante central: credencial voltada ao Agent = (caminho de transporte, pluginAuthority) é dado puro.**
A cunhagem e a derivação têm zero IO; a injeção (spawn env, resolver, página de configurações) tem zero
IO, zero espera e zero dependência de saúde. O start/stop e a saúde do Helper só afetam o resultado das
chamadas de ferramentas CUA e a exibição na página de configurações, nunca a ordem de start do Host, do
spawn do Agent ou da criação de sessão.

Devem valer para sempre:

1. O start do processo Host não pode disparar instalação, start ou sondagem do Helper (a coleta de órfãos
   acontece apenas com a criação preguiçosa do host pelo fluxo de autorização).
2. A resolução do spawn env do Agent não pode conter nenhuma IO do Helper: sem `checkHealth`, sem
   `waitForTransport`, sem acquire e sem corrida com deadline.
3. Os únicos disparadores legítimos de start do Helper são três:
   - o `ensureBrokerAvailable` do SDK na primeira chamada CUA do Agent (o único caminho de primeira
     chamada);
   - ações explícitas do usuário: `getStatus` da página de configurações e o fluxo de autorização de
     permissões;
   - ações de manutenção do Host: `restartAfterPermissionGrant` e outras entradas de restart do resolver.
4. A auto-retirada por 300s de ociosidade no modo standalone é uma característica: sai quando ninguém usa,
   não fica residente.
5. A credencial injetada no spawn é constante durante todo o ciclo de vida do processo Host (nome de pipe
   estável no Windows, socket estável no macOS); reiniciar ou trocar a geração do Helper não reemite
   credenciais, e o Agent que já a possui não precisa de nenhuma ação de atualização.

## 2. Problema atual (fatos de linha de base em 2026-09-21)

**darwin (M7 entregue, com resíduo)**:

- O spawn env já injeta sempre socket estável + authority cunhado no spawn (`node.ts:2184`); o resolver já
  é pass-through apenas peek (`node.ts:2308`); a primeira chamada do SDK se autolaça com instalação e
  refresh do bundled (producer `computer-use-runtime.ts:91`).
- Bloqueio residual: logo após o fluxo de autorização ter criado um host gerenciado, o spawn passa por
  `buildCuaProductHelperAgentEnv`, com `checkHealth(1000)` quente, sonda de recuperação de marker e
  corrida reservada (`node.ts:1123`); no cenário de Helper pendurado isso consome 1s inteiro.
- O caminho de aquecimento `warmHelperForBuiltInPlugin` conflita com a semântica de lazy start.

**win32 (ainda no modelo antigo)**:

- spawn `await getOrCreateDefaultCuaProductHelper` (inclui IO de resolução de runtime) +
  `waitForTransport(1000)` (`node.ts:1186/1193`).
- O `ensureBrokerAvailable` do SDK é no-op no win32; o Helper só pode ser aberto pelo Host via fork
  (`windowsCuaDevHelperHost.ts:308`; o nome do pipe já é cunhado pelo Host e passado via argv `--socket`).
- O `getStatus` da página de configurações no win32 retorna diretamente "CUA permissions are only
  available on macOS" (`node.ts:1900`), sem nenhum estado.

**Desperdício estrutural (confirmado pelas mudanças do M7 no darwin)**: a corrida de tolerância de 1s
no spawn espera o startup completo (incluindo 750–1080ms de verificação de assinatura do bundle +
Gatekeeper + saúde), mas o tuple que ela quer enviar já está disponível após o primeiro await de
`start()` (bind provisório, nível de milissegundos); por mais tempo que se espere, a conclusão é a mesma.

## 3. Comportamento normativo

### 3.1 Cunhagem e injeção de credenciais (unificadas nas duas plataformas)

| Plataforma | Caminho de transporte | pluginAuthority |
| --- | --- | --- |
| darwin | Derivação estável por `resolveBrokerSocketPath()` (a partir de ZCODE_HOME), zero IO | Cunhado no spawn (config-provenance por bootstrap, mantém o status quo) |
| win32 | Nome de pipe estável cunhado uma única vez pelo processo app do Host (com segmento aleatório; singleton de módulo; a reconstrução do Host reusa o mesmo nome; necessariamente diferente entre execuções do app) | Igual ao darwin |

- A injeção no spawn env é uma simples consulta de tabela; nenhum `await` de IO do Helper pode aparecer no
  corpo da função.
- O spawn env no win32 injeta também a **fork recipe** (ver 3.3).
- O resolver é sempre pass-through (sem acquire e sem reescrever credenciais); as credenciais CUA MCP
  fluem apenas pelo env do processo do agent, alinhadas ao M7 no darwin.

### 3.2 Ordem de start do Helper

Figura 1: cold start no macOS → spawn → primeira chamada CUA (máquina limpa)

```text
Host                                Agent(SDK)                     Helper(standalone)
 │ app inicia (zero Helper IO)            │                                │
 ├─ resolveSpawnEnv ─────────────────► │ spawn, retorno em <5ms            │
 │   env = { socket estável, authority } │ (não conecta socket, não sonda saúde) │
 │                                     │ ── turno normal sem CUA ──        │
 │                                     │ ══ primeira chamada CUA ══         │
 │                                     │  connect(socket estável) ✗ ENOENT  │
 │                                     │  onUnavailable → ensure(cooldown 5s)│
 │                                     │   ① ensure-installed (1ª install)  │
 │                                     │   ② LS open standalone ───────►│ bind socket estável
 │                                     │                                 │ flock instância única, sem launcherPid
 │                                     │                                 │ ⇒ auto-retirada por 300s de idle ativada
 │                                     │  ◄─ warmup-retry ───────────────┤ authenticate (portão de assinatura)
 │                                     │ ─── chamadas broker ─────────────►│
```

Figura 2: cold start no Windows → spawn (zero IO) → autolaço na primeira chamada

```text
Host                                Agent(SDK)                     Helper(forked node)
 │ app inicia: cunha nome de pipe estável (uma vez) │                                │
 ├─ resolveSpawnEnv ─────────────────► │ spawn, retorno em <5ms            │
 │   env = { NOME_PIPE, authority,       │ (zero acquire, zero espera)      │
 │          RECIPE(ver 3.3) }           │                                │
 │                                     │ ══ primeira chamada CUA ══         │
 │                                     │  connect \\.\pipe\… ✗            │
 │                                     │  ensure(branch win32) fork ──────►│ bind pipe (~300-500ms)
 │                                     │   (--socket nome estável,          │ authenticate/portão peer
 │                                     │    --parent-pid hostPid)           │ init native
 │                                     │  ◄─ warmup-retry (janela 2s) ─────┤
 │                                     │ ──── chamadas broker ────────────►│
 │  Primeiras chamadas concorrentes: o segundo fork falha no bind e sai, inofensivo; os dois Agents conectam ao mesmo Helper │
```

Figura 3: recuperação após morte/idle (isomórfica nas duas plataformas)

```text
Agent(SDK)                                    Helper
 │ ── (darwin) 300s sem conexão && sem in-flight ──► idle_exit: exit(0)
 │ ── (qualquer plataforma) kill / crash ──────────► desaparece
 │ ── chamadas CUA seguintes ──► connect ✗
 │   ensure (dentro do cooldown de 5s só puxa uma vez)
 │     darwin: LS open (limpeza de flock obsoleto e rebind no socket estável)
 │     win32:  fork (mesmo nome de pipe estável → nova instância com bind exclusivo)
 │   ◄── warmup-retry conecta ── recuperação; a credencial do chamador não muda
```

Figura 4: máquina de estados do ciclo de vida do Helper (disparadores anotados)

```text
 [inexistente] ──ensure na 1ª chamada do Agent──► [iniciando bind+native] ──ready──► [servindo]
    ▲                                │                            │
    │                                │ falha de start (portão peer / peça faltando)       │ 300s sem conexão (darwin)
    │                                ▼                            │ kill / crash
    └────────────────────────────────┴────────────────────────────┘
 Start do Host / spawn / criação de sessão / resolver não aparecem em nenhuma aresta de transição (apenas leem dados puros).
```

Figura 5: página de configurações (fronteira de demanda explícita do usuário)

```text
Usuário                     Host(página de config/getStatus)        Helper
 │ entra direto na página de controle do computador        │                                 │
 │ ──────────────────────────► │ probe(ping 300ms) ── ✗ ────────│ (inexistente)
 │  (página em loading)        │ darwin: LS open standalone ────►│ bind
 │                             │ win32:  fork pelo Host ───────►│ bind pipe
 │                             │ poll ping(≤5s) ◄───────────────── ready
 │  ◄── permission_status real │                                 │ contagem de idle inicia
 │  se não subir → idle:true com texto degradado ("O Computer Use será iniciado automaticamente no primeiro uso")
```

### 3.3 Contrato de fork do SDK no win32 (novo no lado do producer)

- `ensureStandaloneHelperLaunched` ganha um ramo win32:
  `fork(recipe.entryPath, ["--socket", nome de pipe estável, "--parent-pid", recipe.hostPid],`
  `{ env: { ELECTRON_RUN_AS_NODE: "1", [ADDON_ENV]: recipe.addonPath, …allowlist } })`.
- A recipe é injetada pelo spawn env, com o nome de chave definitivamente
  `ZCODE_CUA_WIN_HELPER_RECIPE` (o valor é JSON: `entryPath`, `command`, `root`, `addonPath`,
  `commandEnv`, `hostPid`; a constante é registrada em producer helperConstants, e o lado z-code usa o
  mesmo literal, e a consistência entre os dois pontos é um contrato entre repositórios).
- `--parent-pid` é sempre o **hostPid**: o ciclo de vida do Helper fica preso ao Host (o watchdog só
  reconhece o pid do Host) e não acompanha a saída do Agent que fez o fork; o Helper sobrevive à morte do
  processo do Agent, e a quebra de escrita do stdio control channel é um prejuízo aceitável (esse channel
  existe apenas para observabilidade de quem subiu o Helper, ver abaixo).
- Instância única: o named pipe faz bind exclusivo. O segundo fork de chamadas concorrentes falha no bind
  e sai, de forma inofensiva, e ambos se conectam ao mesmo Helper.
- O control channel `transport_ready` pertence a quem fez o fork (o Agent); o spawn do Host, a consulta
  de status e `restartHelper` não dependem dele (o Host conecta direto ao pipe para consultar; para
  reiniciar, usa sua própria receita de runtime para fazer o fork novamente).
- O status atual do portão peer (M8 fail-closed, faltando 4 primitivas nativas de peer) não é alterado por
  esta especificação; ela só muda a ordem do ciclo de vida e não toca na superfície de capacidades.

### 3.4 Morte e recuperação

- Depois que o Helper morre ou sai por ociosidade, a recuperação é o ensure da próxima chamada CUA
  puxando de novo (mesmo caminho/nome de pipe, credencial inalterada); uma morte durante uma chamada em
  andamento é fechada conforme o delivery-state (`possibly_sent` proíbe replay automático).
- Não há sondagem periódica do lado do Host (conforme a especificação de isolamento §3.3); o
  `checkHealth` + `restartHelper` do resolver fica restrito ao restart pós-autorização e às entradas de
  manutenção de permissões.

### 3.5 Página de configurações (unificada nas duas plataformas)

- `getStatus`: probe (ping de 300ms, sem subir) → se ausente, sobe (darwin LS open / fork do Host no
  win32; a capacidade de resolução de runtime mantida no Host existe exatamente para isso) → depois de
  pronto, consulta o valor real de `permission_status`.
- Se não subir → `{ available:false, idle:true }` com texto amigável, sem erro e sem incomodar.
- Os candidatos de subida têm a mesma origem dos variants de instalação (producer
  `standaloneHelperCandidatePaths`): os runtimes stable/preview/dev enumeram apenas a raiz de instalação do
  próprio variant. **O runtime de produção não pode enumerar a raiz dev** — quando um resíduo dev está
  presente e um pacote não assinado é escolhido silenciosamente, a página de configurações fica sempre em
  «falha ao subir» e se disfarça de problema de permissão (2026-09-22 ZCT-2102352739585175552). O runtime
  dev mantém a compatibilidade adicional com o bundle de instalação única instalado sob o nome estável na
  raiz `dev/` (intenção da correção de 2026-09-10 preservada). Candidatos ausentes → segue o caminho de
  falha ao subir, com o guia de instalação.
- No win32, remover o atalho "only available on macOS" (a lógica de consulta do valor real da permissão é,
  em si, uma chamada de método do broker independente de plataforma).

### 3.6 Janela de coexistência do fluxo de autorização (darwin, escolha conservadora)

- O host gerenciado do fluxo de autorização sobe um Helper gerenciado (socket aleatório,
  `launcherPid=Host`, sem saída por idle); dentro da janela o spawn continua injetando sempre o socket
  estável; os dois Helpers coexistem por pouco tempo sem se atrapalhar (sockets diferentes, flock sem
  conflito); no dispose do host a instância gerenciada é fechada.
- Opção de melhoria (não incluída nesta rodada): o host gerenciado no mac passa a usar o socket estável e
  a adotar a instância standalone existente, eliminando a janela de coexistência. Fica para fazer quando a
  coexistência gerar dano real na medição.

## 4. Fronteiras e donos de estado

| Estado/fato | Owner autoritativo | Descrição |
| --- | --- | --- |
| Nome de pipe estável (win32) | Singleton de módulo do Host | Cunhado uma vez pelo processo app, reutilizado na reconstrução do Host |
| Caminho de socket estável (darwin) | Derivação pura por `resolveBrokerSocketPath()` | Zero estado |
| pluginAuthority | Cunhado no lado do spawn | Semântica de config-provenance; o Helper não o valida |
| Ciclo de vida do processo Helper | Watchdog do launcher (reconhece hostPid) + contagem de idle (standalone no darwin) | Sai quando ninguém usa |
| Saúde do Helper | Consulta sob demanda (retry da chamada, página de configurações, manutenção de permissões) | Sem sondagem periódica |
| Marker de admissão do spawn | Obsoleto (esta especificação) | As gerações de recuperação internas do restart do resolver são mantidas, mas deixam de ser consumidas pelo spawn env |

## 5. Implementação por fases

### MR1 (puramente services, fechamento do darwin; verificável localmente por completo)

- Remover do spawn env o ramo de host-peeked: no darwin o spawn sempre injeta socket estável + authority,
  e `buildCuaProductHelperAgentEnv` deixa de ser alcançável no darwin.
- Testes: MC-1, MC-3; `cuaPermissionBrokerProductAgentEnv.test.ts` ajustado em conformidade.

### MR2 (producer + services, portabilidade para win32 e limpeza)

- producer: `ensureStandaloneHelperLaunched` ganha o ramo de fork win32 e teste unitário; remover o
  caminho de aquecimento `warmHelperForBuiltInPlugin` (sob lazy start, «sem candidato, então aqueço»
  conflita com o invariante 3); o bump de pin do producer usa o comando atômico
  `pnpm --filter @zcode/zcode-cua-plugin bump:producer`.
- services: singleton de nome de pipe estável; o spawn env injeta nome de pipe + authority + recipe
  (removendo o acquire win32 / `waitForTransport`); `getStatus` no win32 alinhado à 3.5.
- Limpeza (pode entrar neste MR ou em um MR3 separado): remover o cadáver de
  `buildCuaProductHelperAgentEnv`, `CUA_PRODUCT_HELPER_SPAWN_READY_DEADLINE_MS`, o consumo do marker de
  admissão no spawn e o ponto de chamada de spawn de
  `cuaProductHelperWorkspaceRegistry.setEnabled`.
- Testes: MC-4/5/6/7/8/9; a lacuna de verificação em máquina real do Windows é anotada com honestidade no
  MR.

## 6. Matriz de verificação

| Caso  | Plataforma | Estado inicial | Evento | Esperado |
| --- | --- | --- | --- | --- |
| MC-1 | darwin | app com cold start | resolução do spawn env | Nenhuma IO do Helper (host falso afirma que start/checkHealth não foram chamados), nível de milissegundos |
| MC-2 | darwin | máquina limpa | primeira chamada CUA | Instalação + subida pelo SDK e chamada bem-sucedida (regressão do M7) |
| MC-3 | darwin | fluxo de autorização recém-encerrado (host presente) | spawn | Ainda injeta sempre o socket estável; sem sonda e sem esperar 1s |
| MC-4 | win32 | app com cold start | resolução do spawn env | Zero espera, zero acquire; env contém nome de pipe + recipe |
| MC-5 | win32 | sem Helper | primeira chamada CUA | SDK faz fork → conecta dentro da janela de warmup → chamada bem-sucedida |
| MC-6 | win32 | Helper é morto | próxima chamada CUA | Falha retryable → ensure faz fork de novo (mesmo nome de pipe) → recuperação |
| MC-7 | win32 | dois Agents em primeira chamada concorrente | ensure simultâneo | Pipe de instância única; o segundo fork falha de forma inofensiva; conectam ao mesmo Helper |
| MC-8 | ambas | Helper já reiniciado/trocado de geração | spawn env e credenciais de Agents existentes | Caminho de transporte constante (mesmo socket/pipe), trocar a geração do Helper não reemite credenciais; authority do darwin é cunhada por spawn e pode diferir por agent, o que é semântica existente |
| MC-9 | win32 | sem conversa aberta | entrar direto na página de configurações | probe → fork pelo Host → valor real da permissão; em caso de falha, idle:true degradado |

Linhas vermelhas de regressão (conforme a especificação de isolamento §7, ainda válidas):

- O log do ciclo de vida do Helper não pode conter `workspace-dispose` causado diretamente por
  readiness/recovery;
- A ordem de um spawn / criação de sessão comum de Agent não inclui IO do Helper;
- O tempo de start de módulos sem CUA não inclui budget de saúde do Helper.

Comandos de verificação necessários (conforme o AGENTS.md da raiz): `pnpm typecheck`, `pnpm lint`,
`pnpm architecture:check --changed`, testes unitários afetados; mudanças que envolvem apps/zcode-cli
seguem também as [regras da CLI](../../apps/zcode-cli/AGENTS.md); o E2E de CUA no desktop segue o case
catalog atual.

## 7. Riscos e itens não verificados

1. **Lacuna de máquina real no Windows**: a máquina de desenvolvimento é macOS. A receita de fork do MR2,
   o bind de pipe e o comportamento de `transport_ready` só podem ser cobertos por teste unitário; a
   verificação em máquina real fica a cargo de um colega no Windows, e o MR anota isso com honestidade.
2. **Portão peer do M8 no Windows**: hoje o CUA é fail-closed no win32. Esta especificação não muda a
   superfície de capacidades, só a ordem do ciclo de vida; o comportamento aqui não muda depois que o
   portão peer for liberado.
3. **Efeito colateral da auto-retirada por idle (darwin)**: após 300s sem conexão, PiP e ghost cursor
   fecham junto com o Helper. Consistente com o estado atual da CLI e é a semântica natural do lazy start.
4. **Janela de coexistência do fluxo de autorização (darwin)**: ver 3.6; a opção de melhoria fica para
   quando for necessária.
5. **Corrida entre o ensure do lado do agent e o start do Helper gerenciado (janela do fluxo de autorização
   no darwin)**: flocks de sockets diferentes são independentes entre si; no pior caso há uma breve
   instância dupla dentro da janela; o dispose do host do fluxo de autorização fecha a instância.

## 8. Ordem de implementação

1. Confirmação desta especificação (este documento).
2. Implementar o MR1 e concluir localmente todas as verificações necessárias.
3. MR2: primeiro o producer (ramo de fork win32 + teste unitário) → bump de pin → integração do lado
   services → teste unitário; anotar a lacuna do Windows.
4. Avaliar e atualizar o case catalog de E2E de CUA no desktop conforme o
   [fluxo de E2E](../../.agents/skills/e2e-case-lifecycle/SKILL.md).
5. Ao final, rodar os comandos de verificação da seção 6; para plataformas sem verificação em máquina
   real, listar no MR os riscos e as evidências ainda faltantes.