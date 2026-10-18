# Comando ZCode `/init` AGENTS.md

## Resumo da funcionalidade

| Campo | Valor |
| --- | --- |
| Mudança | Adicionar um comando de prompt embutido `/init` que cria ou atualiza o `AGENTS.md` do workspace atual. |
| Superfícies visíveis ao usuário | Sugestões de slash do app desktop, caminho de envio de prompt `--stdio` do app, ajuda e despacho de comandos slash da CLI/TUI. |
| Docs existentes | `docs/architecture/zcode-code-architecture-overview.md`, `docs/architecture/message-flow.md`, `apps/zcode-cli/docs/design/agents-user-instructions-merge.md`, `docs/settings-directory-sources.md`. |
| Responsáveis pelo código existente | Fachada de entrada do bootstrap do agente, lista de comandos slash do ZCode Protocol, central de comandos da CLI, sugestões de slash da UI. |
| Fora de escopo | Novo método do ZCode Protocol, semântica de replay exclusiva de mobile, inicialização do `~/.zcode/AGENTS.md` global, expansão do E2E de conversa. |

## Registro de esclarecimentos

| Rodada | Pergunta | Resposta do usuário | Limite fixado | Necessário acompanhamento |
| --- | --- | --- | --- | --- |
| 1 | O ZCode deveria espelhar o `/init` no estilo Claude, mas mirando as instruções do ZCode? | "加一下" após o plano proposto. | Implementar `/init` como comando de prompt embutido que cria `AGENTS.md`. | não |
| 1 | `AGNENTS.md` é intencional ao pé da letra? | Não corrigido após o plano; a fonte de verdade do projeto é `AGENTS.md`. | Tratar `AGNENTS.md` como typo e criar/atualizar `AGENTS.md`. | não |
| 1 | A v1 deve incluir instruções globais do usuário? | Nenhum pedido explícito. | A v1 mira apenas a raiz do workspace atual. | sim, o futuro `/init --user` pode ser especificado depois. |

## Decisões de limite

| Limite | Decisão | Inclui | Exclui / poda | Fonte |
| --- | --- | --- | --- | --- |
| Semântica do comando | `/init` é um comando de prompt normal, não um comando de sessão. | A UI envia `/init` pelo fluxo normal de envio/fila de prompt; o agente o reescreve em um prompt de inicialização. | Nenhum método de protocolo `session/init` e nenhum caminho especial de controle de sessão na UI. | `docs/architecture/message-flow.md`, inspeção de código |
| Arquivo alvo | `AGENTS.md` na raiz do workspace atual. | Criação do arquivo ausente; leitura e patch do arquivo existente. | `CLAUDE.md`, `AGNENTS.md`, `~/.zcode/AGENTS.md` global do usuário. | Pedido do usuário e `agents-user-instructions-merge.md` |
| Instruções ocultas existentes | Verificar `.zcode/AGENTS.md` e `.agents/AGENTS.md` do workspace antes de criar um novo arquivo raiz. | Se qualquer arquivo de instrução em caminho oculto existir, informar ao usuário que as instruções já existem e que não é necessário arquivo novo. | Criar um `AGENTS.md` raiz duplicado nesse caso. | Seguimento do usuário |
| Suporte do app | Suportar o `--stdio` do app reutilizando `session/send`. | `session/send -> record.app.sendInput -> resolvedor de prompt da fachada de entrada -> turno do runtime`. | Propriedade de relay/main sobre o estado de negócio. | `docs/architecture/zcode-code-architecture-overview.md` |
| Posse do comando | O `/init` embutido reserva o nome `init`. | A lista de slash do app e a ajuda da CLI incluem `/init`; um `/init` customizado é ocultado pelo filtro de nomes reservados. | Permitir que um `/init` customizado sobrescreva o comportamento embutido. | Modelo existente de comandos reservados |
| Comportamento em sessão em execução | `/init` se comporta como entrada de prompt comum. | Sessões concluídas enviam imediatamente; comportamento de execução/compactação segue as guardas existentes de fila/steer. | Tratamento especial de compactação/controle de meta. | `docs/conversation-protocol-declaration.md` |
| Texto de consulta visível | Entrada do provider e consulta visível na UI são separadas. | O modelo recebe o prompt `/init` expandido; TurnStarted, transcrição, semente de título e snapshots da UI mantêm a consulta original `/init ...`. | Mostrar o prompt embutido longo no balão do usuário. | Relatório de bug do runtime `sess_12c80069-7d45-4288-959f-fb64c608cb97` |

## Escopo de domínio

| Domínio | Incluir? | Por que pode mudar comportamento | Fontes primárias |
| --- | --- | --- | --- |
| Limite de arquitetura/processo | sim | O suporte ao app solicitado depende dos limites de stdio e de posse. | `docs/architecture/zcode-code-architecture-overview.md`, `docs/architecture/message-flow.md` |
| Comportamento de conversa/sessão | sim | `/init` entra pelo envio de prompt normal e pelo comportamento de fila. | `docs/conversation-protocol-declaration.md`, `docs/conversation-product-state-space.md` |
| Permissão/ferramenta/MCP/subagentes | sim | O turno gerado pode usar `Read`, `Glob`, `Grep`, `Bash`, `Write` e `Edit`, todos pelo fluxo de permissões existente. | `docs/permission-project-approval.md`, código de eventos de ferramenta do protocolo |
| Casca/tema/localidade/responsivo da UI | limitado | A mudança de UI é apenas a visibilidade da sugestão de slash, sem novo componente ou layout. | `DESIGN.md`, `packages/ui/src/slashCommandHelpers.ts` |
| Remoto/replayable realtime de mobile | podado | Nenhum novo caminho de comando replayable; a entrega normal de prompt continua a usar os limites existentes de modo de cliente. | `docs/web-remote-control/task-realtime-sync.md` |

## Mapa de conceitos

| Conceito | Por que importa | Fonte |
| --- | --- | --- |
| Merge de instruções do `AGENTS.md` | Confirma que o ZCode já lê o padrão do usuário e o `AGENTS.md` do workspace; `/init` cria o arquivo-fonte do workspace. | `apps/zcode-cli/docs/design/agents-user-instructions-merge.md` |
| Resolvedor de comandos da fachada de entrada | Lugar existente onde o texto de prompt submetido pode ser reescrito antes da execução no runtime. | `apps/zcode-cli/packages/bootstrap/src/app/input-facade.ts` |
| Lista de comandos slash do protocolo | Snapshots do app usam esta lista para mostrar comandos embutidos e customizados. | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/slash-commands.ts` |
| Filtro de slash visível da UI | O app oculta embutidos não suportados localmente mesmo que snapshots antigos do protocolo os contenham. | `packages/ui/src/slashCommandHelpers.ts` |
| Central de comandos da CLI | A TUI faz parse local de comandos slash conhecidos; comandos conhecidos precisam de despacho explícito para evitar o fallback de resume. | `apps/zcode-cli/packages/cli/src/command-center/create.ts` |

## Donos de estado

| Estado / fato | Autoridade | Espelhos / caches | Evidência |
| --- | --- | --- | --- |
| Disponibilidade de comando slash | Snapshot de protocolo do agente | Cache de comandos slash da meta da task na UI | Teste unitário de `listProtocolSlashCommands` |
| Reescrita do texto de prompt | Fachada de entrada do bootstrap do agente | nenhum | Teste unitário do resolvedor e caminho de submissão do app |
| Conteúdo do arquivo `AGENTS.md` | Sistema de arquivos do workspace | Leituras futuras de fontes de contexto | Eventos de runtime/ferramentas e existência do arquivo |
| Comportamento em execução/fila | Serviço de sessão existente e fila da UI | Projeção do task store | Matriz de conversas existente; sem novo E2E na v1 |

## Dimensões

| Dimensão | Valores / classes de equivalência | Incluir? | Razão |
| --- | --- | --- | --- |
| Superfície de cliente | stdio do app desktop, TUI, `--prompt` headless | sim | Todos devem rotear `/init` ao mesmo resolvedor. |
| Estado do arquivo do workspace | `AGENTS.md` ausente, `AGENTS.md` existente, `.zcode/AGENTS.md` ou `.agents/AGENTS.md` oculto presente | sim | O prompt deve distinguir escrita, edição e no-op-com-mensagem. |
| Conflito de origem do comando | `init` embutido, `init` customizado | sim | O embutido reserva o nome. |
| Fase da sessão | concluída, em execução/compactando | limitado | Reutiliza o comportamento normal de prompt existente; sem nova regra de produto. |
| Alvo global do usuário | `~/.zcode/AGENTS.md` | podado | Fora da v1. |

## Combinações candidatas

| ID do candidato | Estado | Evento | Alvo/superfície | Guarda/efeito esperado | Status inicial | Notas |
| --- | --- | --- | --- | --- | --- | --- |
| INIT-01 | Workspace não tem `AGENTS.md` | Usuário envia `/init` | stdio do app desktop | Prompt normal inicia; o modelo inspeciona o repo e escreve o `AGENTS.md` do workspace. | aceito | Coberto por testes do resolvedor de prompt e de visibilidade de slash; smoke manual de runtime pode verificar a escrita do arquivo. |
| INIT-02 | Workspace tem `AGENTS.md` existente | Usuário envia `/init` | Qualquer superfície | O modelo lê o arquivo existente e o edita, evitando sobrescrita. | aceito | Comportamento de nível de prompt. |
| INIT-03 | Existe comando customizado `/init` | Lista de slash/submissão | Descoberta de comandos do agente | O comando embutido vence; o `/init` customizado é ocultado/reservado. | aceito | Mantém os embutidos previsíveis. |
| INIT-04 | Sessão em execução | Usuário envia `/init` | Composer do app | Vale o comportamento existente de fila/steer de prompt normal. | aceito | Sem ramo especial de comando de sessão. |
| INIT-05 | Usuário pede instruções globais | Usuário envia `/init --user` | Qualquer superfície | A v1 trata os args como instrução adicional, mas o prompt mantém o alvo de workspace. | podado | Uma funcionalidade futura pode adicionar o `--user` explícito. |
| INIT-06 | App/stdIO envia `/init` | Resolvedor de prompt do runtime expande o comando | Composer do app e transcrição | O provider recebe o prompt expandido; a mensagem de usuário visível na UI permanece `/init`. | aceito | Regressão de `sess_12c80069-7d45-4288-959f-fb64c608cb97`. |
| INIT-07 | Workspace tem `.zcode/AGENTS.md` ou `.agents/AGENTS.md` | Usuário envia `/init` | Qualquer superfície | O agente informa que as instruções já existem e não cria um `AGENTS.md` raiz duplicado. | aceito | Seguimento do usuário. |

## Decisões de poda

| ID da decisão | Combinações podadas | Guarda/invariante | Razão de produto | Cobertura representativa |
| --- | --- | --- | --- | --- |
| P-INIT-USER | Criação de `AGENTS.md` global do usuário | O alvo da v1 é a raiz do workspace | Evita misturar padrões do usuário com onboarding específico do repo. | O texto do prompt do resolvedor declara o alvo de workspace. |
| P-INIT-PROTOCOL | Novo método `session/init` | O agente é dono dos turnos de prompt; o app envia prompt normal | O fluxo existente de permissões/eventos de stdio já cobre ferramentas e edições de arquivo. | O caminho `session/send` permanece inalterado. |
| P-INIT-SPECIAL-UI | Ramo de comando de controle de sessão na UI | `/init` não é compact/goal | Evita duplicar a semântica de fila e de comando replayable de mobile. | `parseZCodeVisibleSlashCommand("/init") === null`. |

## Casos aceitos

| ID do caso | Setup | Ação | Asserções | Camadas de evidência | Status E2E |
| --- | --- | --- | --- | --- | --- |
| INIT-A | A descoberta de slash do protocolo tem a lista embutida e sem conflito customizado | Ler comandos slash | `/init` aparece como embutido; `/init` customizado é filtrado. | unitário | planejado |
| INIT-B | A fachada de entrada recebe `/init notas extras` | Resolver prompt | O prompt de runtime menciona o `AGENTS.md` do workspace, o caminho alvo e as notas extras. | unitário | planejado |
| INIT-C | A UI recebe o `/init` embutido do agente | Construir sugestões de slash | `/init` está visível; `/model` continua oculto. | unitário | planejado |
| INIT-D | O parser de controle de prompt da UI recebe `/init` | Parsear comando visível | Retorna null para que o caminho de envio de prompt normal trate. | unitário | planejado |
| INIT-E | A central de comandos da TUI recebe `/init` | Submeter comando | Despacha para o app ativo `submitPrompt("/init")`, não para resume. | unitário | planejado |
| INIT-F | A fachada do app submete `/init include package scripts` | Resolver e executar turno com modelo falso | A requisição ao provider inclui o prompt `/init` expandido; transcrição e entrada de TurnStarted mostram `/init include package scripts`. | unitário | planejado |
| INIT-G | A fachada de entrada recebe `/init` | Resolver prompt | O prompt de runtime pede para verificar `.zcode/AGENTS.md` e `.agents/AGENTS.md` e parar com uma mensagem ao usuário se algum existir. | unitário | planejado |

## Backfill da matriz

| Arquivo | Mudança |
| --- | --- |
| catálogo de casos | Nenhum E2E de conversa é adicionado na v1; o comportamento normal de fila de prompt é coberto pelo catálogo existente. |
| matriz de cobertura | Nenhuma linha de matriz é necessária a menos que um E2E de GUI futuro seja adicionado para criação de arquivo em runtime. |
| planilha de decisões/backlog | O futuro `/init --user` permanece indefinido e deve receber uma spec separada antes da implementação. |

## Notas de handoff para E2E

- Fixture de provider: um caso de GUI futuro de revisão manual pode usar um trace determinístico de modelo que pede `Glob`, `Read` e `Write`.
- Fixture de sistema de arquivos: criar um workspace temporário com e sem `AGENTS.md`; afirmar que apenas `AGENTS.md` é alterado.
- Estratégia de timing: usar sessão concluída para o primeiro caso de GUI; o comportamento de fila em sessão em execução é herdado dos casos existentes de fila de prompt.
- Preset Docker: não é necessário para a cobertura unitária da v1.
- Riscos de revisão: o prompt determina a qualidade do arquivo; a aceitação futura deve inspecionar o conteúdo gerado do `AGENTS.md`, e não apenas a existência do arquivo.