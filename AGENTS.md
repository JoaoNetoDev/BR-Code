## Princípios fundamentais

- Antes de adicionar ou modificar comportamento, atualize primeiro a spec correspondente; crie o diretório sob demanda se ele não existir. Defina as regras de produto, os donos de estado, as interfaces e os cenários de aceite antes de implementar o código.
- Considere como fonte de verdade o código do checkout atual, o `package.json` e as políticas de arquitetura. Nas instruções, mantenha apenas as features, os comandos e os arquivos que o repositório atual oferece; ao remover uma feature, limpe junto as referências nas instruções e nas skills.
- Ao investigar um problema, sem pedido explícito de alteração de código, investigue primeiro a causa. Combine código-fonte, logs e evidências de runtime para separar causas confirmadas de hipóteses a validar.
- Preserve alterações locais não relacionadas à tarefa; não restaure por conta própria módulos ou dependências internas que já foram removidos.

## Comandos e estrutura do repositório

Antes de começar, execute `node scripts/check-workspace-freshness.mjs` para verificar a baseline. A versão do Node é definida pelo `mise.toml`.

Os comandos abaixo são executados a partir da raiz do repositório:

| Finalidade        | Comando                                   |
| ----------------- | ----------------------------------------- |
| Checagem de tipos | `pnpm typecheck`                          |
| Lint              | `pnpm lint` / `pnpm lint:fix`             |
| Checagem de formatação | `pnpm fmt:check`                     |
| Desenvolvimento desktop | `pnpm dev:desktop`                  |
| Desenvolvimento web | `pnpm dev:web`                          |
| Checagem pré-commit | `pnpm verify:pre-push` (Lint, checagem de arquitetura e testes unitários afetados) |
| Checagem de arquitetura | `pnpm architecture:check --changed` |
| Pacote de leitura de módulo | `pnpm architecture:context <module-id>` |
| Dependências e exports não usados | `pnpm knip`               |
| Consulta de referências de export | `pnpm dep:refs --list-exports <file>` |

O modo `affected` usa a seleção oficial do Vitest e executa apenas as UT raiz selecionadas; quando o pacote inteiro é selecionado, a checagem explica e omite as UT, sai com sucesso e não impede o Push; não substitui os testes do CLI nem o E2E do desktop. A execução completa usa `pnpm test` / `pnpm test:unit` e só é acionada quando o usuário pedir explicitamente. O escopo e o contrato de saída estão descritos em [pre-push](docs/testing/pre-push-hook.md).

Para pontos de entrada de teste, considere o `package.json` atual do pacote alvo e os arquivos de teste reais; não presuma a existência de comandos unificados de unit test ou E2E.

- `packages/desktop`: Electron main, host, renderer.
- `packages/web`, `packages/server`: cliente e servidor Web.
- `packages/ui`: componentes React compartilhados, hooks e stores Zustand.
- `packages/services`: serviços de negócio; `packages/rpc`: framework de RPC.
- `packages/shared`: protocolo e tipos compartilhados; `packages/client`: SDK de cliente do Agent.
- `apps/zcode-cli`: CLI do Agent e runtime.
- `CONTEXT.md`: vocabulário de domínio da loja de plugins; leia antes de modificar UI relacionada.
- `DESIGN.md`: especificação de design de UI; leia antes de modificar UI.

## Implementação e verificação

- Para alterações de código, use `.agents/skills/architecture-governance/SKILL.md`: execute primeiro a checagem de arquitetura e depois leia o contexto controlado do módulo alvo.
- Evite estado duplicado e múltiplos caminhos de escrita. Defina de forma clara o único dono, as interfaces, as direções de dependência, a ordem de eventos e os limites de idempotência; não use timeouts para mascarar problemas de sincronização.
- Havendo mudança de comportamento, adicione antes os testes correspondentes; mudanças de interação exigem cenários de E2E. Verifique se os testes estão consistentes com a implementação e execute de fato as verificações disponíveis. Quando não executar ou quando o ambiente limitar, declare isso honestamente.
- Ao corrigir bugs, comente em chinês explicando o motivo e a base da correção. Ao identificar um defeito de design, alinhe antes com o usuário; não fique acumulando branches de fallback.
- A descrição do PR deve explicar o contexto, a intenção de design e o comportamento antes e depois; em caso de correção de bug, descreva item a item o cenário que dispara, a evidência da causa raiz, o mecanismo da correção e a verificação de regressão, associando o link da issue existente quando possível. Marque com honestidade as causas raiz não confirmadas ou os commits introduzidos, sem inferir atribuição por proximidade de módulo ou de tempo.
- Em soluções que envolvam estado, ordenação, sincronização remota ou assíncrona, use diagramas para mostrar donos e ordem de eventos.
- É obrigatório executar `pnpm typecheck` e `pnpm lint`, reportar os resultados reais e não relatar falhas pré-existentes como sucesso.
- Use IO de arquivos e de rede assíncrono; para importações entre pacotes, use as entradas públicas e respeite os aliases de caminho existentes.
- É proibido: a UI chamar o Repo diretamente, o Service referenciar implementações concretas do Runtime, importações entre domínios de detalhes de implementação e dependências circulares.

## Fronteiras de UI e plataforma

- Siga o `DESIGN.md`, reutilize componentes existentes e considere layout, interação, tema e internacionalização tanto no desktop quanto no Web mobile.
- Componentes acessam serviços via `packages/ui/src/hooks/`; operações de plataforma passam por `IPlatformService` (`packages/shared/src/platform.ts`), sem chamar `window.zcode` diretamente.
- Trate as diferenças entre Desktop, Web, ambientes locais e remotos via injeção de dependência, considerando Windows, macOS e Linux.
- Estado do Zustand fica em `packages/ui/src/store/`. Campos sincronizados por broadcast, como tema e idioma, precisam de proteção contra loops; estado local de UI não deve ser confundido com fato do servidor.
- Arquivos com JSX em hooks usam a extensão `.tsx`.

## Processos, protocolo e controle remoto

- O Desktop app se comunica com o Agent via stdio. Mudanças de protocolo atualizam em sincronia `packages/shared/src/zcode-protocol/index.ts`, com tipos estritos e validação em runtime.
- O Main é responsável por janelas, operações nativas, escalonamento de processos e encaminhamento de mensagens; não carrega estado de negócio de task/session.
- Cada janela usa um Local Host com escopo de janela; o workspace local compartilha esse Host. O workspace remoto é gerenciado pelo registro de conexões dentro da janela, sem criar um Desktop Remote Host separado.
- O controle remoto pelo celular conecta-se ao Host attachment já existente do desktop e reutiliza o runtime da sessão; não crie um Agent, Local Host ou sessão remota separados para o celular.
- O link em tempo real `desktop-continuous` do Desktop e o link de recuperação `web-remote-replayable` do celular devem permanecer claramente distintos. Ao modificar stream, snapshot, queue ou reconexão, valide as duas semânticas.
- O relay externo e o Main fazem apenas autenticação, pareamento, heartbeat, encaminhamento e escalonamento de attachment; não guardam estado de negócio como fila de tasks e snapshots.
- Entradas busy/running já aceitas passam por admission serial do `CommandInbox` no CLI/runtime; o Renderer mantém apenas rascunhos não submetidos e o pending optimistic overlay, e o owner/lease do Host é responsável pelo roteamento.
- Preserve owner/lease, roteamento entre Hosts e a proteção contra stale run; não remova essas verificações de fronteira com base em um único caminho.

## Workspace Identity

- `workspaceIdentity` é usado para isolamento de identidade; `workspacePath` é usado para operações de arquivos, cwd de comandos, Git e exibição de caminhos.
- A chave de identidade é uniformemente `workspaceIdentity?.trim() || workspacePath`, aplicável a deduplicação, binding, cache, filas, persistência e correlação de requisições.
- Nos links remotos, `workspaceIdentity` e `remoteSessionId` são propagados de ponta a ponta; nunca faça correspondência apenas por caminho.
- Interfaces novas mantêm fallback para caminho local; a identity remota reutiliza os utilitários existentes de construção e parsing, sem escrever o formato à mão no código de negócio.

## Logs

- A UI usa `packages/ui/src/logger.ts`, sem `console.log` direto ou `window.zcode?.log`.
- Logs de serviços relacionados a Agent/session/runtime usam `createServiceLogger(scope)` (`packages/services/src/logger/serviceLogger.ts`).
- `debug` é para diagnóstico de alta frequência, como dados brutos do protocolo, chunks de streaming e atualizações individuais de ferramentas; não é gravado em disco em produção.
- `info` é para eventos úteis em produção, como ciclos de vida de processos e sessões, resultados de permissões e inicializações one-shot.
- `warn` é para exceções recuperáveis; `error` é para erros irrecuperáveis, como crashes, falhas de handshake e perda de autenticação.
- Não escreva credenciais, dados reais de usuários ou endereços de serviços internos em logs, exemplos ou commits.
