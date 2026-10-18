# Aprovação de Permission e permissão em nível de projeto

## Contexto

O diálogo de permissão do desktop precisa suportar "permitir sempre neste projeto". O agent já suporta `permissionUpdates` internamente, mas o lado do app só recebe uma resposta simples de allow/deny, o que faz com que a UI só consiga mostrar "Permitir somente desta vez" e "Recusar".

## Objetivo

Modelar as opções de permissão como uma combinação de "texto exibido + resposta real do protocolo":

- `allow_once`: permite somente esta chamada de ferramenta.
- `allow_project`: permite, neste projeto, a mesma ferramenta/regra daqui em diante, com a resposta carregando `permissionUpdates`.
- `deny`: recusa esta chamada de ferramenta.

A CUA oficial confiável tem ainda uma semântica restrita de grupo de capacidade em nível de projeto: depois que o usuário escolhe `allow_project` para a CUA oficial pela primeira vez, as ferramentas oficiais de CUA subsequentes no mesmo projeto compartilham essa única autorização, sem novos diálogos só porque os nomes das ferramentas `get_app_state`, `left_click`, `key` e `drag` são diferentes. Essa exceção apenas amplia o escopo de correspondência dentro da família de ferramentas da CUA oficial; ela não altera a semência de uso único de `allow_once` nem amplia as permissões de ferramentas MCP comuns.

## Restrições do protocolo

`interaction/requestPermission`, o evento `permission.requested` e o snapshot de permissão pendente precisam carregar `options`. Cada option precisa conter:

- `optionId`: ID estável da option.
- `kind`: semântica de exibição na UI.
- `name` / `description`: textos exibidos.
- `response`: o `ZCodePermissionResponse` devolvido tal e qual ao agent quando o usuário escolhe aquela option.

O app legacy repassa a decisão conforme `option.response`; o V4 entrega ao interaction handler já registrado no Agent por meio do optionId estável e não deriva a resposta do índice de UI. O acesso total pertence à ação de submissão independente descrita abaixo e não pode ser tratado como um allow comum.

## Deny with feedback (V4)

O snapshot de permissão do V4 pode declarar "feedback permitido ao recusar" por meio de `freeText: true`. Esse campo é uma capacidade de entrada, não uma quarta decisão de permission, e não altera o protocolo de `allow_once`, `allow_project` e `deny`.

- Desktop, Web e `/remote` do celular reutilizam o mesmo `PermissionDialog` e o mesmo `resolveInteraction`; o desktop mantém `desktop-continuous` e Web/celular mantêm `web-remote-replayable`.
- O feedback enviado pelo usuário viaja em `resolveInteraction.answer.freeText` e entra, junto com `optionId: "deny"`, no mesmo `tool_result` negado e provider-visible; não há nova user message real, `steer` ou novo tipo de evento de permissão.
- O conteúdo da recusa começa com um texto Deny estável; um feedback não vazio é anexado em formato fixo: o texto estável seguido de um espaço, `To tell you how to proceed, the user said:`, e então uma quebra de linha com `<trimmed feedback>`.
- Feedback em branco recai no texto Deny estável; o `freeText` das options de allow é ignorado; option desconhecida continua falhando de forma fechada como deny.
- O campo de entrada é uma linha de navegação de UI independente, numerada depois das opções de permissão (`5.` quando há acesso total, `4.` nas combinações antigas de capacidades) e selecionada/highlighted separadamente do Deny; o foco padrão continua na primeira option de permissão. As setas e Tab / Shift+Tab circulam entre as opções de permissão e a linha de entrada, e a tecla numérica correspondente (`5` no conjunto completo) foca a linha de entrada sem submeter; a seleção de candidatos do IME não troca de linha.
- A linha de entrada e as opções de permissão pertencem ao mesmo grupo visual, com espaçamento de linha uniforme de 4px; entre os detalhes da ferramenta, o grupo de opções e a área de confirmação inferior o espaçamento continua em 12px. O campo fica fora do `listbox` de permissões e não altera a semântica de acessibilidade das opções.
- Quando a linha de entrada não está vazia, Enter ou a confirmação submete Deny with feedback; quando está vazia, Enter não submete e a confirmação fica desabilitada. A confirmação de Deny normal continua anexando o feedback não vazio existente, Allow continua ignorando o feedback; Escape continua apenas saindo do foco de input e o limite de cinco linhas permanece.
- O input de feedback do PermissionDialog é uma textarea multilinha com quebra automática e altura crescente conforme o conteúdo; o número é alinhado ao centro vertical do texto da primeira linha da textarea e não se move junto com a altura total do campo (as opções de permissão normais continuam centralizadas), com no máximo 5 linhas e 4096 caracteres e rolagem dentro do campo quando ultrapassar as linhas; o schema compartilhado de `resolveInteraction` não restringe o `freeText` de outras interactions, evitando estreitar o comportamento já existente de AskUserQuestion, Plan e user-input genérico. Rascunhos não submetidos existem apenas na memória do renderer, e o pending command continua guardando apenas o resumo sensível.
- legacy v3, TUI e bot não declaram essa capacidade e continuam usando o caminho de compatibilidade do Deny normal.

```text
UI focus (fullAccess): [1 Allow once] <-> [2 Allow project] <-> [3 Full access]
       ^                                                          |
       +---------------- [5 Feedback] <-> [4 Deny] <---------------+
                               |
                                                        Enter / Confirm
                                                               v
                                            existing Deny + answer.freeText
```

## Semântica de exibição do diálogo

- O `reason` continua sendo preservado na requisição de permissão, para diagnóstico de política, logs e cadeia de recuperação; a UI não deve tratar todas as razões de política como提示 para o usuário.
- `High risk tools require explicit approval` e `Tool has side effects and requires approval` são explicações internas de política e não são exibidas no diálogo de permissão. O diálogo já expressa o estado de aprovação por meio de "aguardando confirmação", dos detalhes da ferramenta e das opções de ação; repetir essas explicações não ajudaria o usuário a decidir.
- O `description` concreto nas entradas da ferramenta, comandos, alterações de arquivos, URLs e outros detalhes acionáveis continuam sendo exibidos conforme as regras existentes.

## Geração de regras

Os `permissionUpdates` de `allow_project` usam `addRules`:

- `behavior: "allow"`
- `toolName` vem da requisição de permissão.
- Para ferramentas que não são Bash, o `ruleContent` continua sendo extraído, sempre que possível, da entrada de permissão (URL, caminho ou glob); quando não é possível extrair, apenas o nome da ferramenta é registrado.
- Para ferramentas Bash, a stable command prefix ou a rule exata é gerada pela rule policy do CLI, com AST awareness; app, host, main, relay e TUI não podem deduzir novamente a partir do input.
- Apenas a entry de ferramenta CUA verificada pelo official plugin authority secret gate carrega `permissionCapabilityGroup: "official_cua"` em runtime. A regra sugerida de `allow_project` usa, na estrutura existente `{toolName, ruleContent?}`, a chave reservada `zcode:permission-capability:official_cua`, sem adicionar campos ao wire e sem derivar isso de nomes de server/tool de MCP falsificáveis.
- A regra do grupo de capacidade não carrega `ruleContent`. Ela expressa a autorização do usuário para todo o grupo de capacidades oficial de Computer Use dentro do projeto, e não a correspondência por string de uma coordenada, caminho ou app input específico.

O prefixo estável de Bash usa a codificação existente `"<prefix>:*"`; quando não é possível normalizar com segurança, quando há estruturas de redirect/dynamic ou quando há uma action ampla de alto risco, o comando completo é salvo como exato. Um compound command retorna no máximo cinco regras independentes e, acima do limite, cai para a string inteira como exata. Invocações somente-leitura são permitidas automaticamente pela readonly policy do Bash, sem escrever regras redundantes.

`suggestedPermissionUpdates` precisa entrar no durable event `permission.requested` e no snapshot pendente. Desktop continuous, mobile replayable, recuperação de refresh e TUI exibem e devolvem uniformemente esses dados autoritativos, sem calcular escopos de autorização diferentes.

## Limites do grupo de capacidade da CUA oficial

A correspondência do grupo de capacidade depende simultaneamente das "regras persistidas" e da "authority confiável da entry de ferramenta atual":

```text
official plugin config + authority secret
              |
              v
register MCP tool -- verified? -- no --> ordinary exact-tool permission
              |
             yes
              v
tool entry carries permissionCapabilityGroup=official_cua
              |
     first allow_project
              v
project ruleset stores official_cua group rule
              |
   later tool in same project
              v
stored group == current trusted tool group ?
        | yes                         | no
        v                             v
      allow                      normal ask/deny policy
```

Combinações que precisam ser aceitas:

- mesmo `projectId` e mesma authority oficial de CUA já verificada: depois do primeiro `allow_project`, as demais ferramentas da CUA oficial casam com a regra do grupo de capacidade.
- Regras antigas de ferramenta exata, prefixo/wildcard de Bash e tool-only mantêm a semântica original.
- Quando a requisição de permissão é recuperada do desktop continuous para o `web-remote-replayable` do celular, a mesma resposta de option ainda é reproduzida; as regras de projeto são persistidas uma única vez pelo session store do Agent.

Combinações que precisam ser recusadas ou voltar à pergunta normal:

- a chamada seguinte após um `allow_once`.
- `projectId` diferente, sessão persistente ausente ou drift de project identity.
- MCP de terceiros usando o mesmo nome de server/tool, falsificando o id de plugin oficial, ferramenta homônima sobrescrevendo, ou drift no resultado da verificação de authority.
- ferramentas que não são CUA oficial, como MCP comum, node_repl e browser-use.
- Escrita manual da chave reservada quando a entry de ferramenta atual não tem a capability oficial de CUA confiável; é preciso voltar à pergunta/recusa normal, sem cair para o tratamento genérico por toolName exato.

É proibido codificar o grupo de capacidade como `mcp__computer-use__*`, wildcard de server-name ou wildcard de plugin-name.
Todas essas strings podem ser imitadas por MCP de terceiros e não servem como authority de autorização.

## Compatibilidade de armazenamento

As permissões de projeto continuam salvas no JSON `permission/ruleset` de `local_setting`, sem nova migração SQL, sem alteração do schema version e sem mudar o formato estrito `{toolName, ruleContent?}` de `PermissionRuleValue`; regras antigas exatas, `:*`, wildcard e tool-only são preservadas como estão.
O grupo de capacidade usa uma chave `toolName` reservada que o schema antigo consegue analisar e que um Agent antigo ignora com segurança; o prefixo/wildcard de Bash passa a ser casado com segurança pelo evaluator de AST por invocation, evitando que uma regra ampla antiga engula comandos adicionados de um compound. Não se pode reescrever em massa o ruleset histórico quando nenhuma nova autorização tiver ocorrido.

Esse é o limite entre versões mistas e rollback: o desktop/mobile/bot antigo com schema estrito consegue exibir a regra e devolvê-la tal e qual; o novo Agent a interpreta em conjunto com a capability da entry de ferramenta confiável atual. Em caso de rollback para um Agent antigo, a chave reservada não casa com nenhuma ferramenta real e, no pior caso, apenas pergunta de novo, sem ampliar a autorização nem deixar uma permissão pendente impossível de analisar.

Isso cobre requisições de permissão comuns como comandos de shell, caminhos de arquivo e URLs de rede, preservando a autoridade de interpretação de regras no lado do agent.

## Aceitação

- O diálogo de permissão sem suporte a acesso total mantém três itens: permitir somente desta vez, permitir sempre neste projeto e recusar; quando há suporte, são os quatro itens abaixo mais a quinta linha opcional de feedback.
- Após clicar em "permitir sempre neste projeto", a response devolvida pelo app contém `permissionUpdates`.
- A mesma regra seguinte não abre novamente uma requisição de permissão.
- A option em nível de projeto da CUA oficial exibe explicitamente o escopo "Computer Use"; após escolhê-la, `get_app_state → left_click → key → drag` no mesmo projeto só produz a primeira confirmação.
- Um MCP de terceiro homônimo, outro projeto e drift de authority não podem reutilizar as regras do grupo de capacidade da CUA oficial.
- O diálogo de permissão exibe em modo somente leitura os novos escopos prefix/exact e não oferece input de pattern editável; regras exatas multilinha ou muito longas mostram apenas um resumo limitado da primeira linha, e a rule completa só é transparenciada na response, sem entrar no DOM das opções.
- Após refresh/replay, o texto de escopo e os `permissionUpdates` originais são idênticos aos da primeira requisição.

## "Acesso total" no diálogo de aprovação (Todo158)

A aprovação de task principal comum oferece, quando o Agent suporta a capacidade de submissão completa,依次: permitir uma vez, sempre permitir este comando, acesso total e recusar; quando `freeText` é declarado, o feedback é a quinta linha. A permissão de projeto do comando preserva a prefix/exact rule dada pelo Agent; arquivo, rede, MCP e CUA preservam seus próprios textos de escopo.

O item 2 da aprovação de comando é descrito como "no escopo do projeto, o mesmo comando não volta a perguntar"; o item 3 é descrito como "concede ao Agent acesso total, sem novas confirmações." Esse texto não altera o escopo de autorização nem os limites de Plan descritos acima.

Apenas a ação de acesso total do diálogo de aprovação alterna em lote o Runtime da task atual, o Composer dessa task e todos os itens de fila já aceitos e ainda não executados (incluindo held/Guide) para `yolo`. Cada `planEnabled` é preservado individualmente; as demais configurações, o corpo, os anexos, a ordem e a forma de entrega não mudam; as limitações existentes de ferramentas de Plan continuam em vigor. O menu comum do Composer continua alterando apenas o rascunho. O turno atual segue executando, sem criar nova mensagem e sem modificar permission/mode do projeto, ruleset ou Recent do Composer.

```text
resolveInteraction(fullAccess) → session FIFO → registry + broker claim（Hook 退赛）
 → 队列消费屏障，固定目标 ID → SQLite 原子 execution / session_input / receipt
 → Runtime 内存 → SessionModeChanged（mode + permissionGrant + 目标 IDs）
 → V4 config/queue 同次投影 → Composer 按 interactionId 消费一次
 → 当前 broker allow → 当前工具继续
```

- `fullAccessOption` é um campo de capacidade opcional e independente, e o `options` original mantém a lista de compatibilidade antiga; apenas a nova UI funde o terceiro item. A UI antiga ignora o campo e o Agent antigo não declara a entrada. A response estática é deny, para que um cliente desconhecido não a confunda com allow.
- AskUserQuestion, ExitPlanMode, workflows que exigem confirmação independente e aprovações de origem child não declaram essa capacidade; o child continua com a aprovação original e não se pode afirmar que a subtarefa ganhou acesso total só porque a UI exibida estava no Runtime pai.
- O registry do Agent valida session/interaction. Cancelamento antes do início da transação, Hook já vencedor, respostas já recusadas ou tardias não concedem privilégio; submissões duplicadas da mesma requisição compartilham uma única operação. Uma falha após o claim preserva a aprovação e permite retry explícito ou recusa.
- A transação SQLite salva ao mesmo tempo o execution state atual, a permissão da fila alvo e o receipt deduplicado por interactionId, sem criar tabelas novas. Uma falha da transação faz rollback completo; um retry após o commit usa os alvos fixos originais e não inclui submissões posteriores.
- O consumo de Guide e o reserve/promote são coordenados com a barreira de autorização; operações já em consumo/promoção são concluídas primeiro e a aprovação pode ser repetida. Em caso de falha na publicação de eventos, modificações posteriores de modo/consumo de fila restauram primeiro o evento já submetido; uma falha de projeção é reconstruída a partir do log autoritativo original, preservando a ordem dos eventos posteriores. A ferramenta só é liberada depois que a projeção é submetida.
- Cada tentativa de acesso total administra sua própria espera: após falha de submissão/projeção a barreira desta tentativa é liberada, e respostas legadas ou timeouts que já chegaram e os que chegarem depois continuam fechando conforme a semântica original; sem resposta, a aprovação é preservada para retry/recusa explícitos. Um retry precisa estabelecer uma nova barreira e não pode reutilizar a notificação de falha já honrada para liberar antes da hora.
- A recuperação fria usa como marcador de autorização do Composer apenas receipts válidos e pertencentes à session atual; registros inválidos ou campos de extensão desconhecidos geram diagnóstico e são pulados, removendo marcadores antigos em memória e continuando a recuperação da task. O retry idempotente da ação de autorização continua recusando estritamente receipts corrompidos e não reautoriza com base na fila atual.
- O Composer persiste os IDs de grant já processados dentro do rascunho de workspaceIdentity/session existente; um snapshot normal ou uma edição de retratação não podem disparar de novo uma autorização antiga. A edição de retratação também restaura o mode, o Plan, o modelo e o reasoning já registrados no item de fila; campos ausentes em itens antigos preservam o rascunho atual. A troca de escopo não modifica as outras tasks, e uma nova submissão é tratada conforme a própria configuração explícita.
- Desktop continuous e mobile replayable seguem seus próprios contratos de entrega/reconexão; o restart do processo restaura o execution state e os marcadores de grant, e a fila continua seguindo as regras existentes de descarte na recuperação fria.

Evidências de implementação e aceitação em [Todo158](working-memory/provider-refactor/steps/todo-158-permission-dialog-full-access-and-queued-mode.md) e na [matriz de cobertura](testing/conversation-session-e2e-coverage-matrix.md). Um E2E pendente não é automaticamente considerado homologação manual nem aprovação da cadeia completa no celular.

## Integridade da prévia de comando (2026-09-28)

- O comando Bash no cartão de permissão tem quebra automática por padrão e mostra no máximo três linhas; conforme o transbordo real da renderização, exibe "expandir comando".
- Depois de expandido, o comando completo é preservado, ocupa no máximo dez linhas de altura e o final é visto por rolagem vertical; recolher, operação por teclado e a prohibition de um caminho longo esticar a página em tela estreita são suportados.
- Enquanto a autorização está pendente, apenas a entrada é exibida, sem saída nem placeholder de "sem saída". O aviso de saída vazia após a execução real mantém o comportamento original.
- O estado expandido pertence apenas ao componente de prévia do comando; a resposta de permissão, o estado de execução e as cadeias desktop continuous e mobile replayable não mudam.
- A regressão de navegador cobre larguras de desktop/celular, temas claro e escuro, expandir/recolher de comando longo, acesso ao final, comando curto sem botão de expansão e o botão de autorização ainda utilizável.

Registro de verificação: 8 casos passaram no E2E de navegador da UI compartilhada de `permission-full-access.test.mjs` (larguras 390/1200, temas claro e escuro); 14 testes unitários relacionados, `pnpm typecheck`, `pnpm lint` (0 erro) e o portão de arquitetura passaram. Nesta rodada não foram executados os testes de cadeia completa no Electron nem de integração de relay no celular; a fixture de navegador mantém o status de pendente para homologação manual.

O controle de expansão usa texto secundário com o tamanho de fonte text-ui-sm, sendo "展开命令 / 收起" em chinês e "Show full command / Collapse" em inglês, com uma seta de direção exibida à direita. Usa um botão de link, removendo o padding horizontal e a borda, sempre transparente, com feedback de sublinhado em hover / focus-visible; o texto do botão é estritamente alinhado à esquerda com o corpo do comando e mantém a altura padrão do botão como área de toque.

O viewport de rolagem do comando se estende até 4px da borda interna direita do cartão, e o corpo mantém a indentação e a largura útil originais via padding dentro do viewport; o botão de recolher fica fora do viewport de rolagem e não rola junto com o comando.

O marcador `$` inicial e o corpo do comando ficam no mesmo viewport de rolagem, desaparecem juntos ao rolar para longe da primeira linha e reaparecem ao voltar ao topo; ele não pode ficar fixo ao lado do meio do comando.

Caminho de teclado: quando existe o botão de expandir do comando longo, a primeira option de permissão, por padrão, retorna ao botão de comando com Shift+Tab e o botão volta à primeira opção com Tab; depois de expandir, Shift+Tab sucessivo pode entrar no viewport de rolagem do comando. Expandir ou rolar não pode submeter a autorização. Quando o comando é curto e não há botão, o ciclo de opções existente permanece inalterado.

## Escopo de tasks de grupo

Tasks de grupo do Feishu/Lark usam `SessionInfo.permission.scope = "session"` antes da execução de ferramentas. A primeira entrada de grupo confiável inicializa um ruleset de sessão vazio; entradas posteriores retêm apenas as aprovações explícitas daquela task. Tasks com escopo de sessão não leem nem escrevem a memória de aprovação de projeto. Tasks privadas/Desktop existentes sem esse marcador mantêm a semântica de projeto. Uma mudança explícita de mode do owner continua sendo configuração de sessão; o texto da mensagem e a saída do modelo nunca definem o marcador nem concedem permissões.

```
trusted group input → persisted session scope → tool permission check
                                             → session grants only
owner approval      → same pending request   → session grant update
```