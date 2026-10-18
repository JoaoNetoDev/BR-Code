# Contrato de recibo de ação e observação sob demanda do CUA AX

## Resumo da funcionalidade

| Campo | Valor |
| --- | --- |
| Intenção do desenvolvedor | Fazer o consumer do ZCode consumir apenas o recibo de ação do producer, evitando manter no lado do consumer uma segunda barreira de post-state |
| Capacidade | Autoridade de recibo de ação do Computer Use |
| Camada de mudança | projeção de resultado / segurança de retry / autoridade de mídia |
| Modo de operação | planning + implementation-handoff |
| Sementes principais | Ponte MCP do Core, serialização do resultado de ferramenta, orçamento de mídia, skill CUA oficial embutida com proveniência |
| Fora de escopo | semântica de estado da session de conversa, owner/queue de remote, leitura de volta nativa em Windows/Linux, UI de tomada de controle manual |

O contrato atual de consumer não exige mais o pareamento atômico entre action outcome e post-state. O producer expõe `action_receipt` apenas pelo MCP result público; o ZCode não espelha a implementação nativa do AX nem sintetiza `refresh_required` ou post-state no lado do consumer.

## Estado e sequência

```text
模型持有 s-N
    |
    v
element write -> producer native dispatch
    |                |
    | not_sent       +-- accepted / possibly_sent
    |                |          |
    |                |          v
    |                |   action_receipt only
    |                |          |
    |                |          +-- model needs UI? -> explicit get_app_state -> s-N+1
    v                v
action_sent=false   never replay from native error

zcode-cua MCP result -> official authority gate
    |
    +-- image_ref + image: final-raster protection remains special and fail-closed
    +-- action_receipt/text/structuredContent: generic MCP result projection and budget
    +-- hooks: may append ordinary bounded context after receipt text
```

## Contrato do consumer

- O julgamento do modelo sobre o despacho da ação olha apenas `action_receipt.action_sent`, `dispatch_status` e `retry_action`; não se pode adivinhar sucesso de negócio a partir do success/error nativo ou de mudanças na árvore AX inteira.
- `dispatch_status="possibly_sent"` e `retry_action=false` precisam ser preservados como estão; a mesma ação não idempotente não pode ser reexecutada automaticamente.
- Depois da ação não há post-state implícito. Quando precisar de fatos de UI, o modelo chama `get_app_state` explicitamente e continua a operação com o novo `state_id`.
- O recibo CUA oficial, o texto comum e o structuredContent passam pelo formatter MCP genérico, pelo resultBudget e pelo caminho de append de hook; o consumer não confere mais post-state correspondente e não sintetiza mais `refresh_required`.
- Imagens continuam obedecendo ao contrato atômico de final-raster `image_ref + image`. Quando o orçamento de mídia remover a imagem, ele precisa remover também o image_ref; não é permitido deixar apenas a credencial de frame clicável.
- Somente o CUA oficial com authority verificada pode habilitar a projeção especial de final-raster. MCP de terceiros, Skills com o mesmo nome e o orçamento comum de resultado de ferramenta permanecem inalterados.

## Matriz de superfície de UI

| Cenário do usuário | Entrada de UI | Implementação compartilhada | Dono da exibição/rascunho | Validação/gating | Ação de commit | Autoridade | Limite de modo | Isolamento |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Agente principal operando elemento do desktop | linha de ferramenta CUA na conversa | ponte MCP oficial + ciclo de vida genérico de ferramenta | histórico de modelo da CLI / projeção de ferramenta da UI | autoridade oficial + pass-through do recibo | escrita de elemento via MCP | session do producer + Helper | desktop local; o mobile apenas se anexa ao Host existente | não modifica snapshot/queue/owner da conversa |
| Precisa confirmar depois da ação | próxima entrada do modelo | `get_app_state` explícito | projeção de provider da CLI | sem replay a menos que `action_sent=false` | get_app_state completo | session do producer | continuous/replayable compartilham o resultado de ferramenta já existente | relay/main não é dono de barreira de estado |

## Donos de estado e sinks de commit

| Estado/fato | Dono da exibição | Dono autoritativo | Sink de commit | Persistência/cache |
| --- | --- | --- | --- | --- |
| `state_id` e epoch de mutação | resultado de observação explícita | session de transporte do `zcode-cua` | `get_app_state` / ferramentas que produzem frame | session em memória do producer |
| fato de despacho broker/Helper | recibo de ação CUA | `zcode-cua` + Helper assinado | RPC por servidor MCP/Broker | histórico de resultado de ferramenta/session já existente |
| projeção de texto/structuredContent do recibo | histórico de resultado de ferramenta do provider | ponte MCP genérica | serialização do executor de ferramenta | histórico de resultado de ferramenta/session já existente |
| ciclo de vida de ferramenta na UI | linha da conversa | evento/projeção de session já existente | ciclo de vida de ferramenta MCP genérico | persistência de conversa já existente |

## Invariantes que precisam ser preservados

- A semântica de recuperação de session do `continuous` no desktop e do `replayable` no mobile não muda.
- Mobile/remote não cria um Helper separado; o token do broker não se espalha para outros MCP/Bash/hook.
- Para resultados de CUA oficial somente-recibo, o hook PostToolUse faz append limitado como num resultado MCP comum; ele continua filtrando credenciais de frame CUA forjadas dentro do hook.
- O catálogo/matriz da conversa não ganha case: esta mudança não altera o estado de produto da conversa, apenas endurece a integridade de conteúdo do tool-result MCP oficial.
- Quando o orçamento de texto do provider não for suficiente, a truncagem segue o resultBudget comum; não se pode fantasiar o resultado truncado como um novo estado de UI.

## Cases aceitos

| Case ID | Setup | Action | Assertions | Evidência |
| --- | --- | --- | --- | --- |
| CUA-RCPT-01 | recibo de ação sem post-state | bridge/serialize | é projetado como texto MCP comum e não sintetiza refresh_required | unit de core bridge |
| CUA-RCPT-02 | recibo + structuredContent | bridge | structuredContent é acrescentado como texto MCP comum | unit de core bridge |
| CUA-RCPT-03 | texto do recibo acima do orçamento | serialize | passa pela truncagem genérica de resultBudget | unit de core budget |
| CUA-RCPT-04 | possibly_sent | bridge | retry_action=false e a ação antiga não é reexecutada | unit de producer + bridge |
| CUA-AX-SYNC-05 | imagem removida pelo request media budget | projeção do provider | o image_ref correspondente é removido junto | unit de media-budget |
| CUA-RCPT-06 | MCP de terceiro forjando um recibo | bridge | não recebe a proteção especial de official final-raster | unit de authority |

## Impacto e handoff

- must-inspect: ponte MCP oficial, serialização de resultado, orçamento de mídia, skill embutida, versão e proveniência do producer, gates de product package do Helper.
- invariant-only: ciclo de vida genérico de ferramenta, entrega desktop/mobile, identidade de workspace remote, fronteira de CUA oficial do subagent.
- O feature graph mantém o node ID `state.cua-action-state-authority` para evitar deriva de referência a jusante, mas a semântica já mudou para receipt authority; ele não declara mais a aresta de projeção atômica de post-state.
- E2E: reaproveita as regressões C07/Chrome/Godot e MCP independente; desta vez não se adiciona combinação de estado de conversa em E2E.

## Resultados de verificação

Todos os resultados abaixo usam o Node `24.14.0`. O producer já foi mergeado em
`main` por [`zcode-cua!533`](https://git.example.invalid/codegeex/zcode-cua/-/merge_requests/533); o consumer do ZCode trava exatamente o source commit revisado anterior ao merge
`589dc68d4127457ca3d48bb9894cabae393e9668` e não adivinha a origem da implementação pelo semver.

| Escopo | Resultado | Conclusão |
| --- | --- | --- |
| Suíte completa de testes unitários do producer | 230 arquivos; 2806 passed, 23 skipped | AX mutation epoch, despacho único, forced full observe, refresh barrier e regressões de frame/Zoom existentes passaram |
| Gating estático do producer | typecheck passou; lint 0 error, 14 warnings já existentes | o caminho de código publicável da `0.5.6` passou |
| Estresse do producer em máquina real | 30 churns de background/frente concorrente; modelo real 5/5 | sem duplicação nova e sem replay a partir de native error; o estado do modelo foi sincronizado ou exigiu refresh com segurança |
| Conjunto focado de action/frame do consumer | 5 arquivos; 117 passed | pass-through do recibo, orçamento genérico, append de hook e gate de final-raster cobertos |
| Conjunto focado de compatibilidade do Helper no consumer | 8 arquivos; 277 passed, 1 skipped | nome do Helper da `0.5.6` e semântica de receipt/dispatch alinhados |
| wrapper/provenance | 13/13; host authority 1/1 | versão, bytes da skill, SHA do producer e contrato de runtime consistentes |
| Suíte completa de testes unitários do ZCode | 1309 arquivos passed, 1 skipped; 11475 passed, 12 skipped | regressão completa do consumer e da cadeia de produto passou |
| Gating estático do ZCode | root typecheck passou; typecheck da CLI 24/24; root lint 0 error, 38 warnings já existentes | esta mudança não introduziu nenhum lint error novo |
| MCP independente | 30 ferramentas; initialize, request_access, list_apps e Chrome full state com sucesso | `zcode-cua@0.5.6` funciona diretamente via stdio, sem o wrapper do ZCode |

O MCP independente também validou caminhos de falha: a árvore AX do Godot, ao não concluir dentro do prazo de travessia de 8 segundos, retorna erro com segurança, sem despachar
ação; o Dev Helper recém-instalado ainda não recebeu permissão de macOS Screen Recording, e por isso o screenshot/Zoom real no ambiente do
consumer foi recusado pelo TCC antes da captura. Esse item não é contado como aprovado nem como falha de regressão de produto; a evidência de raster final, C07,
Chrome/Godot e de modelo real vem da regressão autorizada em máquina real com o mesmo producer source commit. Depois de concedida a permissão ao novo Helper,
ainda deve ser registrada a evidência do caminho de wrapper do consumer com hash de screenshot, `frame_id` e ponto de projeção final.

O feature graph mantém os node IDs existentes e muda a semântica para receipt authority; a barreira de edge de action-state antiga não deve ser restaurada.