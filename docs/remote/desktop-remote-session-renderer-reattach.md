# Reattach do Renderer de Workspace Remoto no Desktop

Especificação atual. Aplica-se ao reload do renderer / recuperação por ErrorBoundary na mesma BrowserWindow, e ao reanexamento do attachment de projeto depois que a Source fica online.
SSH/WSL/Docker são gerenciados uniformemente pelo Local Host da janela, sem o modelo de processo de Remote Host separado ou em pool.
A propriedade das entradas e dos caches de projeto segue o [design de projetos virtuais](../superpowers/specs/2026-09-09-virtual-project-design.md).

## Autoridade e ordem de entrega

| Fato | Owner único |
| --- | --- |
| Conexão física da Source e sua recuperação | Window Host `SourceServerConnectionManager` |
| logical session, remoteSessionId, generation, workspace readiness | Window Host `WindowRemoteConnectionRegistry` |
| Roteamento da janela e entrega de portas do Renderer | `routesBySessionId` em `desktopRemoteSessions.ts` do Main |
| Registro e gating dos services do Renderer | service store do Renderer; o sessionId da tab não é evidência de ready |
| Identidade do projeto | `workspaceIdentity?.trim() \|\| workspacePath`, separada do caminho de execução real |

```text
renderer ready na mesma janela → Main enumera as routes com attachmentState=attachable
  → solicita o attachment ao Window Host existente → entrega a RemoteServicePort
  → Renderer registra os services scoped / ready ACK → permite o workspace RPC
Troca de Source → Registry troca session/generation → Main troca a route → reanexa o attachment
```

- Só reanexa as rotas desta janela que ainda estiverem attachable; pending, já descartadas e gerações obsoletas não são entregues.
- O reattach troca a porta e o attachment, sem destruir o Window Host compartilhado, a Source física ou as tarefas remotas.
- Quando a remote port chega antes da base ServicePort, ela é armazenada temporariamente e só é liberada (flush) depois que a base fica ready; a porta não pode ser descartada.
- Connects concorrentes do mesmo workspace podem retornar o mesmo sessionId; o Main faz join da route/attachment existente e não sobrescreve uma route saudável.
- Um ready, port ou timer tardio não pode coletar a nova generation; a falha libera com precisão apenas o attachment desta tentativa.
- O Desktop continua continuous; o celular continua com o replayable attachment do Host existente, e Main/relay não mantém snapshot de negócio.

## Seleção de cold start e reanexamento do Renderer existente

O [F5 de projetos virtuais](../superpowers/specs/2026-09-09-virtual-project-design.md) é a nova autoridade de persistência:
o cold start restaura apenas o diretório de execução ativo a partir de `lastActiveWorkspace`; as outras entradas de projeto são lidas do SQLite do Host, e o attachment é criado quando o usuário abre o projeto.
`lastWorkspaceSession` é uma projeção de compatibilidade para fallback, e não o novo open set; não se pode exigir, só porque ela contenha A/B, que o cold start gere todas as tabs A/B.
As settings antigas sem os novos campos continuam usando a importação única e a complementação active-first.
Abaixo, "todos os projetos open" se refere apenas às tabs desconectadas que o Renderer atual realmente mantém, e não a todos os diretórios dos campos antigos.

```text
cold start: conexões salvas no Host → Source online
        lastActiveWorkspace → tab ativa → attachment
        entrada de projeto do Host → usuário abre outro projeto → attachment desse diretório
recuperação de desconexão na mesma janela: tabs já existentes → Source online → reanexar uma a uma, sem roubar o foco
```

## Gating de recuperação em dois níveis

1. No cold start, o Host tenta uma vez cada uma das conexões salvas, ordenadas pelo tempo de último online, sem mais filtrar por 7 dias; usa apenas as credenciais que o Profile padrão consegue obter silenciosamente e respeita o switch global de auto-reconexão desligado. Candidatos legacy, que exigem interação ou confirmação de upgrade/migração, permanecem manuais.
2. O Renderer só recupera, depois que o Management observa a Source online, os projetos open, desconectados e de stable identity sob essa Source na janela atual; sem mais filtrar por idade do workspace ou pelo último estado connected.
3. A validade do diretório é verificada pelo Host admission; a falha de um projeto não bloqueia os demais. A UI de conversation remota está desativada, e suas entradas históricas não entram como candidatos de recuperação.
4. Deduplicação por ciclo; após um terminal close sem offline observado, não há auto-recuperação imediata. Os siblings que chegam depois do active-first são verificados por workspace key e não podem ser engolidos pela marca attempted de nível Source.

## Gating de recuperação de navegação e reanexamento (RDUX-09)

A janela principal restaura o último projeto remoto ativado e a seleção de sessão; veja a [spec de navegação §2.3](./project-first-remote-navigation-spec.md#23-重连与重启后回到原处rdux-09). A restrição de "Source online não ativa automaticamente" permanece aqui: a posição de inicialização é determinada pela persistência das abas, e o reattach em background não reescreve o foco. O Host ainda pré-aquece apenas caminhos locais, e o Renderer pode ativar primeiro o placeholder remoto; antes do primeiro ready não se lê nem se renderiza conteúdo remoto, e em caso de falha ou de não conexão a aba e o banner originais são mantidos. O conteúdo já carregado permanece somente leitura conforme o owner existente; o replayable do celular não consome a recuperação de navegação do desktop.

## Manual Disconnect Boundary

A desconexão iniciada pelo usuário é a intenção de encerramento dentro da janela atual, e não pertence à recuperação de inicialização nem à recuperação de desconexão anormal. O evento de estado da Source só pode disparar a recuperação de inicialização de workspaces históricos quando entra em `online`; quando uma tab existente passa de live session para placeholder desconectado, apenas o estado de desconexão é atualizado, sem redisparar a recuperação. A complementação active-first na inicialização, ao criar uma nova tab desconectada, ainda pode disparar um recálculo de candidatos.

O Directory delta em si não é sinal de reconexão; mas, quando ele completa pela primeira vez o mapeamento `legacyWorkspaceIdentity -> remote:server:*`, o Renderer deve primeiro reprojetar de forma sincronizada as sessions em memória já recuperadas e as tabs desconectadas. Se a recuperação seguirá ou não é decidido somente pelo Source `online`, pela open membership, pela stable identity e pela dedup de uma vez por ciclo de conexão; credenciais silenciosas e o switch global de auto-reconexão são aplicados na reconexão de inicialização do Host.
Não se pode ampliar para iniciadores de auto-recuperação uma renomeação comum, a remoção de uma linha, o registro de um projeto aberto ou um history `failed` isolado; depois que o flight da Source é aprovado, uma failed open entry conta apenas como membro de recuperação desse flight.

O owner da auto-recuperação é a Source online, e não um workspace initiator. O Source `online` só decide se o flight da Source deste ciclo pode começar; depois que o flight começa, ele deve percorrer todas as entries open e disconnected dessa Source na janela atual, sem filtrar por idade do workspace ou pelo último connected. Quando um membro já está live ou está em outro flight de recuperação, apenas esse membro é liquidado, e o grupo inteiro não pode ser marcado como skipped. Sources conectados manualmente que ainda não estão online continuam reutilizando o initiator/gate de credenciais de dispositivo do Host, e esta regra não é ampliada.

## Limites de regressão e de evidência

| ID estável | Contrato e status do registro original |
| --- | --- |
| DRS-RR-01 | Com ready na mesma janela, troca o attachment e mantém a session; unit original covered. |
| DRS-RR-02/05 | pending não é entregue; a remote port é armazenada temporariamente antes do base ready; os Accepted Cases originais são planned e não podem ser presumidos aprovados a partir da tabela de candidatos. |
| DRS-RR-03/08 | Recuperação em dois níveis e reprojeção legacy→stable; unit / SSH real covered originais, válidos apenas como linha de base do registro. |
| DRS-RR-04/06/07 | Limites do celular inalterados; candidatos de inicialização inelegíveis permanecem desconectados; a desconexão manual não dispara auto-recuperação. |
| DRS-RR-09 | O flight da Source aprovado pula membros já live e continua com os siblings; a UI atual só recupera projetos. |
| DRS-RR-10 | Join de route/attachment para connects repetidos; o cenário original de conversation é unit + real SSH pending. Cenários de UI antiga não servem como evidência de aprovação da navegação atual. |

O budget de 10 segundos da inicialização pertence apenas ao physical flight do Host; em caso de timeout, primeiro se liquida um erro estável, depois se aborta e se cancela com precisão o transport.
O Renderer não pode chamar connectProfile antecipadamente para ampliar o mesmo flight de recuperação, e um handshake tardio não pode registrar online.

Os arquivos de teste e as evidências de execução ver a [matriz de cobertura](../testing/conversation-session-e2e-coverage-matrix.md); a tabela de candidatos antiga, os Accepted Cases e as restrições históricas estão preservados completos em `git show a17a875588b8d66c2bee49236292e174df651363:docs/remote/desktop-remote-session-renderer-reattach.md`.
Esta alteração apenas corrige a documentação, sem registrar resultados de execução nem alterar status formal/pending.
