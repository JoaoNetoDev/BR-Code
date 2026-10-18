# Título de usuário do CUA `get_app_state`

## Resumo da funcionalidade

| Campo            | Valor                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| Intenção do desenvolvedor | Fazer com que o modelo forneça um título de ação concreto e legível pelo usuário para "ler a interface do aplicativo", evitando que todas as ações de observação mostrem o mesmo texto genérico |
| Capacidade       | Projeção da ferramenta de observação do Computer Use                                                 |
| Camada de mudança | validation + presentation                                                                           |
| Modo de operação | planning                                                                                            |
| Seeds principais | `apps/zcode-cli/packages/core/src/mcp/index.ts`、`packages/ui/src/ToolCallBlocks/renderers/cua.tsx` |
| Fora do escopo   | Modificar a fronteira de permissões do Computer Use Helper, alterar o resultado de observação de `get_app_state`, exigir título de outras ferramentas CUA |

## Contrato de produto

- O input schema visível ao modelo do `get_app_state` oficial do CUA precisa conter o `title` obrigatório: de
  1 a 120 caracteres, no idioma atual do usuário, descrevendo o objetivo desta leitura, em vez de repetir
  nomes de implementação como `get_app_state`, CUA ou MCP.
- `title` é metadado de exibição do ZCode e não pertence aos parâmetros do runtime `zcode-cua` upstream. A bridge MCP do Core
  precisa removê-lo antes de chamar `McpPort.callTool`, para não quebrar o schema estrito do upstream.
- O card de ferramenta da Conversation prioriza a exibição de `input.title`. Em sessões antigas ou chamadas históricas de provider sem title, continua
  o fallback para "Ler a interface do aplicativo {app}" ou "Ler a interface do aplicativo".
- Essa convenção se aplica somente ao CUA `get_app_state`. A ferramenta de mesmo nome em um MCP comum, as outras ferramentas CUA e o
  contrato de title já existente do `node_repl` permanecem inalterados.

## Matriz de superfícies de UI

| Cenário do usuário | Entrada de UI                  | Implementação compartilhada                          | Dono de exibição/draft                        | Validação/gating                                                        | Ação de commit                        | Autoridade/persistência                                           | Limite de modo                                                                | Deve permanecer isolado de                     |
| ---------------- | ------------------------- | ---------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------- |
| O modelo lê a interface do aplicativo | Linha de ferramenta CUA na Conversation | Projeção do descriptor MCP + `CuaToolCallBlock` | Input da ferramenta do Agente / projeção da Conversation | Core injeta o title obrigatório; dupla gating pela identidade do server CUA + `get_app_state` | `McpPort.callTool`, removendo o title antes da chamada | O runtime CUA possui apenas os parâmetros reais de observação; o title é projetado junto ao histórico de tool calls | Desktop continuous e mobile replayable exibem a mesma entrada persistida, sem mudar a semântica de entrega | schema de parâmetros do CUA upstream, outros MCP, outras ações CUA |

## Limite de estado e de chamada

```text
descriptor de tools/list do CUA
        |
        | O Core sobrepõe o title obrigatório apenas para o get_app_state oficial
        v
contrato de ferramenta do modelo -----> o modelo emite { title, app_ref, ... }
                                  |
                    +-------------+-------------+
                    |                           |
                    v                           v
       projeção da Conversation        chamada de runtime da bridge MCP
                    |                           |
                    | exibe input.title          | remove o title
                    v                           v
        resumo da ferramenta CUA          zcode-cua get_app_state
                                                |
                                                v
                                      resultado de observação do Helper
```

## Comportamento compartilhado e divergente

| Preocupação     | Compartilhado                                  | Deliberadamente diferente                                                          | Por que importa                                  |
| ------------ | --------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------- |
| Título do modelo     | Assim como no `node_repl`, um título curto dado pelo modelo     | O title do CUA é sobreposto pelo Core ao descriptor MCP externo; o `node_repl` é definido no próprio contract | O server CUA externo não deve ser obrigado a reconhecer metadados de UI do ZCode |
| Fallback de UI      | Sessões novas e antigas passam pelo mesmo renderer CUA         | Chamadas novas priorizam o título do modelo; chamadas antigas mantêm o texto fixo localizado | Tarefas históricas precisam continuar renderizáveis |
| Parâmetros de runtime | Parâmetros existentes como `app_ref` e `detail` passam como estão | Apenas `title` é removido antes do dispatch                                                   | Não se pode mudar a semântica de observação nem a compatibilidade upstream |

## Relações da funcionalidade

| Rank           | De                    | Aresta semântica                   | Para                         | Por que inspecionar                       | Evidência                |
| -------------- | ----------------------- | ------------------------------- | ------------------------------ | ------------------------------------ | ----------------------- |
| must-inspect   | tools/list do CUA          | projeta o contrato do modelo através de | a bridge MCP do Core                | Campo obrigatório precisa entrar de fato no schema do provider | `registerMcpTools`      |
| must-inspect   | a bridge MCP do Core         | remove metadados de exibição antes de  | o runtime CUA                    | O contract upstream não contém title | `McpPort.callTool`      |
| must-inspect   | a projeção da Conversation  | renderiza o title em          | o card de ferramenta CUA         | O usuário precisa ver o objetivo concreto descrito pelo modelo       | `CuaToolCallBlock`      |
| invariant-only | a projeção do title CUA    | não pode mudar                  | a autorização Helper/broker    | O title não tem relação com permissão, token ou dono do TCC  | spec do broker CUA        |
| invariant-only | a projeção do title CUA    | não pode mudar                  | a entrega continuous/replayable | O title é apenas parte do tool input já existente   | projeção da conversation |

## Invariantes que precisam ser preservados

| Invariante                                    | Superfícies/modos                           | Prova necessária                           |
| -------------------------------------------- | ---------------------------------------- | -------------------------------------- |
| Apenas o `get_app_state` oficial do CUA exige title | nomes de server local/current/legacy        | teste unitário da bridge cobrindo a fronteira entre CUA e MCP comum    |
| `title` não é enviado ao CUA upstream                     | runtime do Agente                            | asserção de argumentos em `McpPort.callTool`            |
| Sessões antigas sem title continuam legíveis             | histórico de Desktop/Web/Mobile               | teste unitário do fallback do renderer                 |
| O title do modelo tem prioridade sobre o texto fixo de app no card da ferramenta       | conversation de Desktop/Web/Mobile          | teste unitário do summary do renderer                  |
| As permissões do Computer Use Helper e a semântica de attach remoto permanecem inalteradas | macOS desktop-local / mobile shared host | nenhuma alteração nos arquivos de broker, protocol ou delivery |

## Evidência do codegraph

O worktree atual não tem comando nem índice de codegraph que possa ser invocado, portanto foi usado o code seed do mapa de funcionalidades
com busca precisa de símbolos para conferir os caminhos de profundidade 2, sem alegar um grafo de chamadas estático completo.

| Seed                        | Consulta            | Chamadores diretos / caminho principal                                                          | Profundidade | Interpretação                                                |
| --------------------------- | ---------------- | ---------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------- |
| `registerMcpTools`          | busca de símbolo/arquivo | MCP tools/list → `createMcpToolEntry` → contrato do ToolRegistry / `McpPort.callTool` | 2     | A mesma bridge possui tanto o schema do provider quanto a fronteira de dispatch do runtime |
| `CuaToolCallBlock`          | busca de símbolo/arquivo | rota CUA do `ToolCallBlock` → projeção de summary                                     | 2     | O summary usa hoje um texto i18n fixo, então é seguro adicionar prioridade para o title       |
| `buildNodeReplDisplayModel` | busca de símbolo/arquivo | title de input do node_repl → summary do renderer                                           | 2     | O precedente de produto é title do modelo com prioridade e nome de implementação como fallback |

## Delta do grafo

| Status    | Nó/aresta                                        | Razão semântica                                     | Ação         |
| --------- | ------------------------------------------------ | --------------------------------------------------- | -------------- |
| confirmado | aliases/docs de `capability.computer-use`           | O título de usuário de `get_app_state` passa a ser semântica de produto pesquisável          | Atualizar o mapa de funcionalidades     |
| confirmado | `service.cua-tool-contract-projection`           | A bridge do Core possui a sobreposição de schema do modelo e a fronteira de remoção no runtime | Adicionar nó e aresta   |
| confirmado | code seed de `surface.computer-use-task-experience` | O renderer CUA dedicado é o ponto visível ao usuário hoje                | Adicionar code seed |

## Decisões de fronteira e podagem

| Fronteira       | Decisão                                  | Inclui                                                            | Exclui / poda                       | Origem                    |
| -------------- | ----------------------------------------- | ------------------------------------------------------------------- | --------------------------------------- | ------------------------- |
| Escopo das ferramentas       | Alterar apenas `get_app_state`                      | Identidades de server current official, `computer-use` e legacy `zcode-cua` | Outras ferramentas como screenshot, click, type      | Pedido do usuário                  |
| Autoridade do título | `input.title` do modelo é a autoridade de exibição das chamadas novas | 1 a 120 caracteres, idioma do usuário                                                | Reescrita do título do modelo pela UI a partir do nome do app          | Pedido do usuário + precedente do node_repl |
| Compatibilidade upstream       | O title é removido antes do dispatch no Core             | contrato do provider, projeção do histórico                               | Modificar ou atualizar o schema do pacote CUA externo       | Fronteira de dependência atual              |
| Compatibilidade histórica       | Sem title, usa-se o fallback i18n existente           | session antiga, provider antigo                                             | Migrar entradas históricas                        | Invariante de compatibilidade              |
| Matriz multi-plataforma        | Poda por invariantes de projeção                          | Testes unitários de renderer representativos para Desktop e mobile                    | Expandir o produto cartesiano theme/locale × clientMode | Sem mudança de layout ou de delivery    |

## Casos aceitos

| Case ID      | Configuração                   | Ação               | Asserções                                         | Camadas de evidência | Status E2E |
| ------------ | ----------------------- | -------------------- | -------------------------------------------------- | --------------- | ---------- |
| CUA-TITLE-01 | descriptor CUA oficial | Registrar `get_app_state` | `title` é obrigatório no schema do modelo e os campos required originais são preservados | contrato unitário   | automatizado  |
| CUA-TITLE-02 | Chamada do modelo com title        | Executar o handler da ferramenta    | `McpPort.callTool` recebe os outros parâmetros, mas não o title        | runtime unitário    | automatizado  |
| CUA-TITLE-03 | nova linha de ferramenta CUA         | Renderizar o summary         | exibe primeiro o title do modelo, sem mostrar o resumo fixo do app            | UI unitário         | automatizado  |
| CUA-TITLE-04 | linha histórica sem title       | Renderizar o summary         | faz fallback para o summary de app localizado existente                          | UI unitário         | automatizado  |

## Handoff de planejamento

| Item             | Destino                                        | Status     |
| ---------------- | -------------------------------------------------- | ---------- |
| Atualização da spec      | Este documento                                               | concluído   |
| Catálogo de casos     | Accepted Cases deste documento                                | concluído   |
| Matriz de cobertura  | Accepted Cases deste documento                                | concluído   |
| Backlog de decisões | nenhum                                               | concluído   |
| Handoff de E2E      | Sem novos E2E; testes unitários de contrato/runtime/UI cobrem esta fronteira | não necessário |