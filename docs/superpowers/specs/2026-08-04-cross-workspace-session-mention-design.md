# Mention de sessões entre Workspaces com `#`

## Resumo da funcionalidade

| Campo                     | Valor                                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Mudança                   | O painel de `#` do Composer agrega todos os workspaces abertos ou restaurados sob a authority de armazenamento de sessões da sessão atual e limita os candidatos visíveis de cada workspace a 20 itens |
| Camada da mudança         | `option-source + presentation`                                                                                    |
| Superfícies visíveis ao usuário | O painel de sessions `#` do `MentionPlugin`                                                                    |
| Documentação existente    | `docs/ui/mention-panel-layout.md`、`docs/session-context-tool.md`                                                 |
| Donos de código existentes | `sessionsMentionProvider`、`useWorkspaceSessionsIndexItems`、Tab Store, resolvedor do serviço de workspace remoto  |
| Fora de escopo            | Escopo dos candidatos de conversa `@`, reescrita da mention canônica, migração de sessões entre Hosts, mudanças em Agent/protocolo, semântica de stream/queue/snapshot/replayable |

## Fronteira de produto

O usuário exige que `#` permita escolher conversas de todos os workspaces. Esta funcionalidade define «todos os workspaces» como os workspaces abertos ou restaurados na área de tarefas da janela atual que compartilham a mesma authority de armazenamento de sessões com o composer atual:

- Embora o `@` também reutilize o session provider no código atual, ele não é o ponto de entrada de produto desta rodada; ele continua consultando apenas o workspace atual.
- `#` exibe no máximo 20 candidatos por workspace. Com query vazia, são as 20 entradas atualizadas mais recentemente daquele workspace; com query, a correspondência é concluída primeiro em todas as sessões do histórico e depois são tomadas as 20 primeiras de cada `workspaceKey` entre os resultados, de modo que sessões mais antigas continuam pesquisáveis.
- Esse limite restringe apenas o resultado de candidatos no renderer; não altera a assinatura, o snapshot nem o protocolo de persistência do sessions-index.

- O composer local pode escolher sessões de todos os workspaces locais sob o Local Host de escopo de janela. Vários processos de Agent local compartilham o mesmo SQLite session DB e, após a seleção, `ReadSessionContext` consegue ler pelo session id.
- O composer remoto pode escolher sessões de múltiplos workspaces sob a mesma authority de `remoteSessionId` / serviço de Agent.
- Não há session DB compartilhada entre Hosts local e remoto, nem entre dois Hosts remotos diferentes. Nesta rodada as sessões de outra authority não são exibidas, evitando gerar referências que podem ser selecionadas, mas para as quais `ReadSessionContext` retorna `not_found`.
- Um workspace remoto desconectado não recorre ao serviço local; ele volta a entrar nos candidatos apenas depois que o remote attachment correspondente é restaurado.
- Workspaces fechados e não restaurados na janela atual ficam fora do escopo de candidatos; esta rodada não acrescenta um catálogo global persistente de workspaces.

```text
Composer trigger
        |
        +-- @ ----------------------------> 当前 workspace sessions-index（保持原行为）
        |
        +-- #
             |
             v
当前 composer workspace
        |
        v
解析 conversation storage authority
        |
        +-- Local Host / base service
        |      └-- 当前窗口全部 local workspace sessions-index
        |
        +-- Remote Host / remoteSessionId
               └-- 同一 remote authority 下全部 workspace sessions-index

其他 Host / 未连接 remote
        └-- 剪枝：不展示，不回退到 base service

聚合结果
  -> workspaceKey = workspaceIdentity?.trim() || workspacePath 去重 scope
  -> session id 去重
  -> 当前 workspace 优先
  -> 其余按最近更新时间
  -> 全量 query 匹配
  -> 每个 workspaceKey 最多保留 20 条
  -> 仍插入 [#Title](#sess_id)
```

## Matriz de Superfícies de UI

| Cenário do usuário                     | Componente de entrada                 | Origem dos candidatos                                                           | Estado local                         | Validação/Portão                                                            | Resultado do envio          | Authority / Persistência              | Limite multiplataforma                                        |
| ------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------- | ---------------------------- | ------------------------------------- | ----------------------------------------------------------- |
| Selecionar conversa relacionada em `@` | Grupo de sessions do `MentionPlugin`  | sessions-index do workspace atual (mantém o comportamento original)               | trigger/query/selected index do Lexical | Reutiliza os portões existentes                                          | Insere o Markdown de mention de session original | session store SQLite do Host atual | Inalterado nesta rodada                                   |
| Selecionar conversa relacionada em `#` | Grupo único de sessions do `MentionPlugin` | sessions-index das workspace tabs da mesma authority                        | o mesmo                                                                       | O workspace remoto precisa ter `remoteSessionId` e o serviço correspondente já resolvidos | o mesmo                       | o mesmo                               | Desktop/Web/Mobile compartilham o provider; o delivery profile não muda |
| Pesquisar conversas entre workspaces  | `MentionPanel`                         | título, session id, workspacePath, workspaceIdentity, keywords de model/provider | query                                | Primeiro casa em todo o histórico e depois mantém no máximo 20 itens por `workspaceKey` | o mesmo             | sem nova persistência                  | O workspace label é compatível com caminhos Windows/macOS/Linux |

## Implementação Compartilhada e Comportamentos Divergentes

- `@` e `#` continuam compartilhando um `useSessionsMentionProvider`, com a estratégia de escopo de workspace passada explicitamente pelo gatilho; `@` usa `current-workspace` e `#` usa `same-authority-workspaces`, e não é possível ampliar o escopo incondicionalmente dentro do provider.
- `useWorkspaceSessionsIndexItems` continua reutilizando a assinatura por contagem de referências com base em `endpointKey + workspaceKey`; ao fechar o painel, este consumidor libera sua referência sem afetar as assinaturas já existentes na barra lateral.
- A linha de candidata continua exibindo o último nível do nome do workspace por meio de `description`; não é preciso adicionar layout, cor ou tamanho de fonte.
- Os candidatos do workspace atual ficam antes dos demais workspaces; dentro de cada grupo, a ordenação continua por atividade mais recente.
- O limite de 20 itens de `#` é contado por `workspaceKey` de forma independente depois da correspondência de query, e não se pode aplicar um `slice(0, 20)` global ao resultado combinado; caso contrário, o workspace atual acabaria expulsando os outros workspaces. `@` não aplica esse limite e mantém o comportamento existente de workspace atual.
- A mention canônica, a resolução de histórico e a entrada da ferramenta `ReadSessionContext` mantêm apenas o session id, sem adicionar campo de workspace.

## Relações de Impacto

| Rank           | Relação                                                    | Motivo                                                                     |
| -------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| must-inspect   | `sessionsMentionProvider -> useWorkspaceSessionsIndexItems` | Único ponto de construção do escopo de candidatos e owner da agregação ao vivo |
| must-inspect   | Tab Store + resolvedor do serviço de workspace             | Fornece todos os workspaces conhecidos e impede roteamento errado do remote para o base service |
| should-inspect | `collectSessionMentionItems`                                | Já suporta ordenação entre workspaces, workspace label, keywords de busca e dedup de session |
| invariant-only | `mentionMarkdown -> ReadSessionContext`                     | O contrato canônico e de leitura em runtime não pode mudar                |
| invariant-only | desktop continuous / web remote replayable                  | Apenas amplia o conjunto de assinaturas de baixo frequência do sessions-index, sem concatenar conversation stream nem snapshot |
| evidence-only  | testes focados em mention / testes de hook do sessions-index | Comprova escopo, ordenação, isolamento e ausência de pré-assinatura       |

## Donos do Estado

| Estado / fato                   | Authority                                          | Mirrors / caches        | Evidência                                    |
| ------------------------------- | -------------------------------------------------- | ----------------------- | --------------------------------------------- |
| Conjunto de workspaces da janela | Tab Store de escopo de janela                     | tab persistence restore | workspace tabs no hook test                  |
| workspace remoto -> serviço     | `remoteSessionId` + store de sessões de workspace remoto | identity/path lookup    | contagem de chamadas do mock service por endpoint diferente |
| Fato dos candidatos de sessão   | sessions-index de cada Host                        | shared registry store   | resultado da agregação de snapshot/delta     |
| Conteúdo do contexto da sessão  | session store SQLite do Agent Host atual            | sem mirror entre Hosts  | documentação de `ReadSessionContext` e implementação do store |
| key de isolamento de workspace  | `workspaceIdentity?.trim() \|\| workspacePath`     | scope/registry key      | caso focado de mesmo path com identity diferente |

## Decisões de Fronteira

| Fronteira        | Decisão                                        | Inclui                                  | Exclui / poda                        | Fonte                                    |
| ---------------- | ---------------------------------------------- | --------------------------------------- | ------------------------------------ | ---------------------------------------- |
| Conjunto de workspaces | Workspace tabs abertos ou restaurados na janela atual | tabs locais, tabs remotos conectados   | Workspaces históricos fechados e não restaurados | Pedido do usuário + authority atual do Tab Store |
| Host authority   | Agrega somente o mesmo Agent service/session store | local-local, mesmo endpoint remoto     | local-remote, endpoints remotos diferentes | Arquitetura `ReadSessionContext` + store SQLite |
| Ordenação        | Workspace atual primeiro, demais por atualização mais recente | mesmo título, mesmo path com identity diferente | Reordenação global por relevância | `collectSessionMentionItems` existente   |
| Orçamento de exibição | Máximo de 20 itens por workspace em `#`   | query vazia: 20 mais recentes; com query: 20 primeiros casa | 20 itens globais; truncar antes de buscar | Confirmação do usuário em 2026-08-05     |
| Canônico         | Mantém `[#Title](#sess_id)`                   | `#` (o comportamento original de `@` também não muda) | escrever workspace/endpoint na mention | Contrato de runtime existente            |
| delivery         | Não muda                                       | desktop continuous, mobile replayable   | mudanças em stream/snapshot/queue   | Documento de fatos de controle remoto     |

## Combinações Candidatas e Poda

| Candidate ID | Estado                                                 | Evento               | Efeito esperado                                                   | Status   |
| ------------ | ------------------------------------------------------ | -------------------- | ----------------------------------------------------------------- | -------- |
| CWM01        | local draft, janela com workspace A/B                   | digitar `#` em A     | As sessões de A/B aparecem, com A em primeiro plano              | accepted |
| CWM02        | remote draft, workspace A/B na mesma remote authority   | digitar `#` em A     | As sessões de A/B aparecem a partir do remote service            | accepted |
| CWM03        | workspaces local e remote existem ao mesmo tempo        | digitar `#` em local  | Só aparecem sessões da authority local, e o remote não é roteado incorretamente para o base service | accepted |
| CWM04        | Duas remote authorities existentes ao mesmo tempo       | digitar `#` em A remoto | Só aparecem sessões da authority de A, e B não entra como candidato inválido | accepted |
| CWM05        | O serviço da remote tab ainda não foi restaurado        | abrir `#`            | Não assina o host local; volta a agregar quando a conexão é restaurada | accepted |
| CWM06        | Panel não habilitado                                   | render normal do composer | Nenhuma assinatura extra de sessions-index                   | accepted |
| CWM07        | local draft, janela com workspace A/B                   | digitar `@` em A     | Só assina A, e B não entra no grupo de conversas de `@`          | accepted |
| CWM08        | Workspaces A/B da mesma authority têm mais de 20 sessões cada | digitar `#` com query vazia em A | A/B mantêm apenas as 20 mais recentes, e A não pode expulsar B | accepted |
| CWM09        | A sessão que casa em B não está entre as 20 mais recentes | digitar `#` em A e buscar | Casa primeiro em todo o histórico de B e depois mostra no máximo 20 entre os resultados de B | accepted |

Poda: tema, locale, task phase, model/provider e recuperação contínua ou replayable não fazem produto cartesiano com o escopo de candidatos;
eles não alteram a authority do workspace. Testes focados de endpoint local do Desktop + remoto servem como representativos, e os componentes compartilhados existentes
continua cobrindo responsividade, tema e interação de teclado.

## Aceitação

- Ao abrir `#` no workspace local A, é possível pesquisar e escolher sessões do workspace local B; ao abrir `@`, só A continua aparecendo.
- As sessões do workspace atual continuam antes das dos demais workspaces, e a linha de candidata exibe o nome do workspace de origem.
- Com query vazia, `#` mostra no máximo as 20 sessões mais recentes de cada workspace; na busca, continua possível encontrar sessões do histórico que não estão entre as 20 mais recentes, e os resultados casados de cada workspace continuam sem passar de 20 itens. O limite não pode ser escrito por engano como um global de 20 itens.
- Mesmo path com `workspaceIdentity` diferente não mistura escopos; tanto caminhos Windows quanto Unix conseguem exibir o nome de último nível do workspace.
- Os candidatos remotos são assinados apenas pelo remote service correspondente; endpoints não conectados ou diferentes não recorrem ao base host.
- Após a seleção, o Markdown de mention de session original continua sendo inserido; não se modificam protocol, Agent runtime, queue, stream nem snapshot.
- Quando o painel não está habilitado, nenhuma assinatura de sessions-index é acrescentada.

## Entrega de Testes

- hook test focado: agregação local A/B apenas em `#`, `@` apenas-current, agregação remote da mesma authority, poda entre authorities e ausência de assinatura quando desabilitado.
- pure function test: workspace atual em primeiro plano, demais workspaces por atualização mais recente, workspace label/keywords.
- pure/provider test: query vazia toma as 20 mais recentes por `workspaceKey`; com query, casa primeiro em todo o histórico e depois toma 20 por workspace; `@` não aplica o limite entre workspaces.
- Nesta rodada não é adicionado E2E de replay de provider: o escopo de candidatos é uma composição de index de baixa frequência no renderer, já coberto pelo canônico e pelo E2E oficial; o case catalog / coverage matrix registra a cobertura focada, sem se passar por transferência de contexto entre Hosts.