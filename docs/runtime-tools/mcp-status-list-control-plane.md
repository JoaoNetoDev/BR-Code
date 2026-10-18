# Superfície de controle para consulta em lote do status de MCP

## Contexto

A página de configurações de MCP precisa exibir o status de cada server na configuração atual. A solução antiga executava verificações reais de conexão uma a uma no primeiro carregamento da página, o que facilmente fazia um refresh da UI disparar muitas requisições ao control-plane e ainda misturava "exibição de status de configuração" com "checagem ativa de saúde".

## Objetivos

- O primeiro carregamento da página de configurações usa uma única consulta em lote de status, evitando disparar checagens automáticas conforme o número de servers.
- A consulta em lote de status passa por um processo CLI de control-plane em uma lane `mcp-status` independente, isolando o processo dos comandos de gestão de plugins (`plugins/*`); ambos compartilham o mesmo cwd interno (`.zcode/plugin-workspace` dentro do diretório de dados, isto é `getDataBaseDir()/.zcode/plugin-workspace`, por padrão igual a `~/.zcode/plugin-workspace`; em E2E com HOME isolado ou data dir customizado não fica sob `~`), mas não compartilham a conexão stdio.
- Mantém-se a capacidade de checagem ativa de um único server, mas ela só é acionada quando o usuário checa manualmente ou após habilitar.
- Não afundar o status de MCP no desktop main, no relay ou na cadeia de remote do celular.

## Semântica do protocolo

- `mcp/list`: devolve um snapshot do status dos MCP servers da configuração atual. A requisição é enviada a um processo CLI de control-plane da lane `mcp-status`; esse processo mantém um `McpPort` próprio, refresca o status de conexão da configuração confiável usando o mesmo adapter MCP do runtime e então devolve o snapshot local do `status()`. MCPs de projeto, ainda não confiáveis, continuam retornando apenas `untrusted` e não são conectados.
- Ciclo de vida do processo: o processo da lane mcp-status é iniciado de forma preguiçosa no primeiro `mcp/list`, no máximo um por host (a chave de processo é o cwd interno fixo). Ele realmente conecta aos MCP servers confiáveis pelo pool de conexões de nível de processo e não desconecta após terminar, portanto, além dos cerca de 45 MB do próprio processo, há MCPs filhos pendurados; para evitar essa permanência, o manager habilita `idleTimeoutMs` para essa lane (padrão 5 minutos): se ficar 5 minutos sem nenhuma requisição em voo na conexão, a árvore inteira de processos é recuperada ativamente (`terminationKind=expected`, `terminationReason=idle-timeout`), e o próximo `mcp/list` a sobe de novo de forma transparente (cold start medido em cerca de 1 s). As lanes chat / plugin não têm recuperação por ociosidade.
- Observabilidade de processo: eventos spawn/ready/exit/error são reportados via `processLifecycleReporter` no fluxo host → main → ARMS, com `lane` (`mcp-status`) no payload, o que permite distinguir do processo da lane de plugins que compartilham o mesmo cwd e command.
- Por que um processo independente: o transport de ZCode Protocol da CLI serializa estritamente as requisições na mesma conexão stdio (FIFO, apenas `session/stop` consegue furar a fila). Um `mcp/list` no modo connect realmente conecta a todos os MCP servers, e qualquer server cujo handshake não se completa consome o timeout de 30s; antes ele dividia o processo de gestão de plugins com comandos como `plugins/uninstall`, a desinstalação ficava enfileirada atrás da sondagem de 30s e a UI não recebia nenhuma resposta dentro do timeout de requisição de 5 minutos (reprodução em produção em 2026-09-03: `uninstallPlugin` esperou 37s até o usuário forçar a saída, e `mcp/list` apareceu com 60,5s = dois 30s encostados). Depois de separar para uma lane independente, uma sondagem lenta não bloqueia mais a gestão de plugins, e a recuperação de processo disparada por timeout de sondagem também não arrasta mais a instalação/desinstalação em trânsito.
- `mcp/list` pode receber `mcpServers` explícito como entrada. A página de configurações do desktop já é resolvida pelo desktop main lendo `~/.zcode/cli/config.json` com fallback de `.agents/mcp.json`, e no session create/resume real os MCPs habilitados são enviados como `params.mcpServers`; a consulta de status precisa reutilizar exatamente o mesmo lote de MCP resolvido pela UI, evitando que o agent de control-plane marque em vermelho um server realmente disponível quando o seu próprio `createConfig()` não enxerga o fallback de `.agents`.
- `mcp/probe`: mantido com a semântica de checagem ativa de um único server. Só é usado quando o usuário checa explicitamente ou após habilitar, e o resultado pode diferir do `mcp/list`.

Portanto a UI não deve interpretar o resultado de `mcp/list` como sucesso de checagem real de saúde; um connected em verde significa apenas que a origem do snapshot reporta connected.

## Fluxo de dados

1. A página de configurações de MCP da UI carrega a configuração local e então chama `zcodeAgentService.listMcpServerStatuses(...)`, passando a lista atual de MCP do ZCode Agent habilitado no workspace atual.
2. O service usa `getMcpStatusClient()`, que é o cliente do `mcpStatusProcessManager` (`lane: "mcp-status"`, independente do `pluginProcessManager` da gestão de plugins), para enviar `mcp/list`. O agent novo recebe `mcpServers`; se um agent antigo strict rejeitar esse campo opcional, o service remove o campo e tenta uma vez mais.
3. Dentro do processo CLI de control-plane, a configuração de plugins é lida conforme o workspace da requisição; se a requisição trouxer `mcpServers`, o status local do MCP do ZCode Agent segue essa entrada explícita, senão volta para o `mcp.servers` lido pelo próprio `createConfig()` do agent.
4. O handler da CLI chama `mcpPort.connectConfiguredServers(...)` em processo para atualizar os records locais da configuração confiável; MCPs de projeto untrusted são removidos da entrada de conexão. O `mcpServers` explícito e o session create/resume usam o mesmo helper de conversão de protocol para runtime, mantendo campos como timeout/env/header consistentes.
5. O handler da CLI embrulha o `listMcpServerStatuses(...)` existente para devolver o snapshot de status; o próprio `status()` só lê records locais e não conecta de novo.
6. O store da UI mescla o status pelas linhas locais de MCP do ZCode Agent atuais; a lista somente-leitura gerenciada por plugin continua sendo movida pelos dados de gestão de plugin, evitando que servers homônimos cruzem status.

## Regras de mesclagem na UI

- O mesclagem só atua nas linhas locais de MCP com `source === "zcodeagentmcp"`.
- O mesclagem usa o `name` da linha atual, mas não pode sobrescrever com name a linha somente-leitura gerenciada por plugin.
- O `mcpServers` que a página de configurações envia para `mcp/list` vem do MCP do ZCode Agent habilitado no UI store atual e precisa ser enviado junto com a entrada atual de workspaceIdentity/workspacePath, sem reaproveitar cache de outro workspace.
- A requisição precisa trazer epoch ou proteção de versão equivalente: um resultado em lote atrasado não pode sobrescrever o `changed` gerado por edição do usuário durante a requisição, nem sobrescrever um resultado de checagem manual mais recente.
- O estado de exibição que a UI escreve apenas como feedback de interação (por exemplo, mostrar `connecting` logo após habilitar, ou `unknown` após desabilitar) não pode invalidar a requisição em lote atual; só operações que mudam a entrada lida pelo agent — configuração, ativação/desativação, identidade de workspace — podem avançar o epoch.
- A página de configurações permite apenas um `mcp/list` em voo por vez; se um refresh for disparado enquanto há um em voo, ele é combinado na próxima rodada após a conclusão, evitando que vários cliques em interruptores enfileirem as conexões de MCP por dezenas de segundos.
- Ao mapear o status de runtime para o status de UI, `failed` vira `error`; `connected`, `connecting` e `disconnected` mantêm semântica exibível; `disabled` e `untrusted` aparecem como estado de configuração não bem-sucedida com uma explicação segura.
- O snapshot de status pode carregar opcionalmente um `failureKind` e um `serverRequestId` estáveis. `error` continua guardando o detalhe original, e a UI não o usa diretamente como texto principal para o usuário.
- MCP HTTP oficial confiável lê apenas o header de resposta `X-Request-Id`; diagnósticos de conexão, initialize e `tools/list` podem entrar na página de configurações, e o request id de `tools/call` vai apenas para o resultado da ferramenta correspondente. Sem HTTP response, stdio, DNS e timeout não forjam id.
- ZCode envelope `3001`, `1000`, JSON-RPC `error.code=1006/3101`, HTTP 429/5xx e outros erros JSON-RPC são mapeados respectivamente para `server_not_found`, `server_unavailable`, `not_authenticated`, `coding_plan_required`, `rate_limited`, `server_internal_error`, `protocol_error`; quando não é possível detalhar, usa-se `connection_failed`.

## Verificação

Recuperação de merge em 2026-09-06: a UI de plugins já havia sido restaurada, mas a lane independente da camada de serviço tinha ficado de fora. Desta vez o manager, o evento de requisição zerada e a recuperação por ociosidade foram religados pelos limites originais de control-plane, sem restaurar o antigo Provider Store. Oespecializado de isolamento de subprocesso passou 4/4 e a suíte completa de testes unitários do `zcodeAgentService` passou 45/45; isso não substitui a aceitação de interação real da página de configurações.

- Abrir a página de configurações de MCP pela primeira vez dispara apenas um `mcp/list`, sem checagem automática item a item na camada de UI.
- `mcp/list` refresca o status live dos MCPs confiáveis dentro do processo CLI da lane `mcp-status`: configuração correta mas inalcançável deve mostrar failed/error, e o que é conectável deve mostrar connected e a contagem de ferramentas.
- Enquanto `mcp/list` está em voo (por exemplo, um MCP server com timeout de handshake de 30s), `plugins/uninstall` e `plugins/list` precisam retornar imediatamente, sem ficar enfileirados atrás (teste unitário dos services `plugins/uninstall 不会排在挂起的 mcp/list 后面`).
- Servers que existem apenas pelo fallback de `.agents/mcp.json` também entram em `mcp/list` com `mcpServers` quando exibidos na página de configurações e devolvem snapshot, sem o falso vermelho `MCP server status was not returned by agent`.
- A checagem ativa só é disparada ao checar manualmente ou ao habilitar um server individual.
- MCP local e plugin homônimos não cruzam status.
- O resumo de falha alterna entre chinês e inglês e usa a cor comum de texto secundário; o erro original em inglês só aparece via Popover após clicar no botão de informação, e o Request ID do servidor aparece como sufixo compacto do texto de detalhe, sem repetição independente. Um refresh bem-sucedido limpa os diagnósticos antigos.
- Um resultado em lote atrasado não sobrescreve a edição do usuário nem um resultado de checagem manual mais recente.
- Cliques repetidos no interruptor ou disparo duplicado do effect pelo React dev não produzem filas sobrepostas de `mcp/list`; no máximo uma rodada extra com a entrada mais recente é rodada após a requisição atual terminar.
- No desktop, verificado via CDP que Settings → MCP Servers não tem loop de refresh duplicado, sem erros no console e com o status renderizado normalmente.