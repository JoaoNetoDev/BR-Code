# Contrato de validade E2E das 14 ferramentas CUA

Status: contrato normativo de regressão

## Objetivo

`run-cua --all` e `run-cua --common-apps` devem provar comportamento observável,
e não apenas que uma requisição MCP retornou sem erro. O manifesto congelado de 14
ferramentas permanece a fonte da verdade do protocolo, enquanto C18 prova que toda
ferramenta pode ser executada em uma única sessão controlada.

## Descongelamento

O manifesto congelado de 30 ferramentas foi **deliberadamente** reduzido para 14.
Esta é uma contração projetada, não um drift acidental, e está registrada aqui
para que um leitor futuro não trate a baseline menor como uma regressão. A
justificativa, o julgamento por ferramenta e a decisão explícita de descongelamento
vivem em `docs/refactor-port-specs/2026-09-10-cua-sdk-v3-api.md` §3 e §4.3.

A nova baseline é **14**. O gate de drift de 4 vias (`TOOL_NAMES` + `TIER_TABLE` +
`TOOL_REGISTRY` + o manifesto do evaluador cross-repo) é **mantido**, agora
asseverado em 14 em vez de 30. O gate existe para impedir drift não intencional,
não para proibir uma remoção intencional registrada nesta seção.

Os 17 nomes removidos e seu caminho substituto:

| Ferramenta removida | Caminho substituto |
|---|---|
| `double_click` | `left_click` com `click_count` 2 |
| `triple_click` | `left_click` com `click_count` 3 |
| `right_click` | `left_click` com `mouse_button` `"right"` |
| `middle_click` | `left_click` com `mouse_button` `"middle"` |
| `hold_key` | `key` com uma duração de hold |
| `screenshot` (desktop inteiro) | `get_app_state` com `include_screenshot` (apenas raster por app) |
| `zoom` | nenhum — o raster por app é entregue em escala utilizável |
| `list_displays` | nenhum — a captura por app segue o display da janela |
| `switch_display` | nenhum — o mesmo |
| `cursor_position` | nenhum — puramente diagnóstico |
| `wait` | nenhum — o SDK assenta internamente; nunca dormir |
| `mouse_move` | nenhum — perda de capacidade aceita |
| `left_mouse_down` | `left_click_drag` para arrastos; press-and-hold é uma perda aceita |
| `left_mouse_up` | o mesmo |
| `read_clipboard` | nenhum — perda de capacidade aceita |
| `write_clipboard` | a ferramenta nativa `paste`, uma das 14 congeladas (salvar no Helper → escrever → tecla de paste da plataforma → restaurar) |
| `open_application` | `get_app_state` com um `app_ref` — um app que não está rodando é iniciado a frio **em background** dentro do caminho de observação. As três sub-capacidades não têm substituto: `activate` (trazer para foreground), `url` (lançar com um documento) e `new_instance` (um segundo processo do mesmo bundle) sumiram. Harnesses que precisarem de um documento ou pasta já abertos precisam providenciá-los como setup de fixture antes de usar a superfície de ferramentas. |

A contagem é 30 − 17 remoções + 1 nova ferramenta (`paste`) = 14. Qualquer linha
adicionada ou removida aqui precisa manter essa aritmética verdadeira contra o
manifesto congelado, caso contrário a tabela deixa de ser um contrato.

Não existe raster de desktop inteiro na superfície de 14 ferramentas. Tudo que
antes raciocinava sobre a tela inteira agora precisa nomear um app e ler a captura
por app dele.

## Fronteira de evidência

Toda ferramenta mutante precisa de um oráculo fora do resultado da ferramenta:

- ações de ponteiro exigem um evento DOM/nativo confiável com o botão, a família
  de evento e a região de alvo esperados;
- ações de teclado e semânticas exigem uma mudança de estado DOM/AX resultante;
- fluxos nativos de teclado do macOS que dependem da cadeia de responder ativa
  usam `strategy=event` explícito com um `window_id` verificado exatamente, e então
  exigem um oráculo de sistema de arquivos/RTF; uma string "Key pressed" retornada
  nunca é suficiente;
- o raster por app exige conteúdo de raster determinístico mais um `image_ref`
  acionável; o evaluador lê o `image_ref.frame_id` adjacente apenas como evidência
  de linhagem interna, enquanto o caminho de ação visível ao model envia
  coordenadas sem repassar esse token;
- ferramentas de ciclo de vida exigem ordenação (`request_access` primeiro,
  `stop_computer_control` por último) e o efeito de runtime apropriado à
  ferramenta.

Um evaluator deve falhar quando falta um oráculo de comportamento obrigatório,
mesmo que a ferramenta tenha retornado `isError=false`. Screenshots de diagnóstico
são retidos depois que o oráculo assenta. Um hold opcional e limitado pode facilitar
a observação manual, mas o hold nunca é a condição de aprovação.

Traces do Agent retêm o texto MCP exato visível ao model, que pode omitir
`structuredContent` e truncar payloads grandes. Um oráculo AX nativo pode fazer
parse de um AppState textual apenas a partir de um resultado de ferramenta CUA
oficial bem-sucedido e apenas quando `state_id`, o bundle id esperado, o `window_id`
e uma seção de elementos estão todos presentes. A prosa final do model nunca é
evidência. Para resultados grandes de `list_windows`, as mudanças de identidade
usam o `windowIds` extraído na ingestão, antes da truncagem visível ao model; fazer
parse apenas do JSON encurtado pode transformar uma janela nova real em uma falha
falsa.

## Autoridade fresca

O `state_id` de um elemento e o frame de pixels atual do transporte são snapshots
de autoridade única. Depois de uma ação que possa mutar o app, o evaluator precisa
reobservar explicitamente antes da próxima ação de elemento; a ferramenta não faz
mais essa chamada `get_app_state` implicitamente por padrão. Um
`return_state="compact"` explícito continua disponível para um estado pontual
pós-ação. Depois de uma ação de pixel, ele precisa obter um novo raster acionável
antes de outra ação de coordenada. O lane padrão do model envia apenas `x/y` de
raster; o binding do transporte mais as checagens de supersessão no despacho
garantem a atualidade. Testes determinísticos de compatibilidade podem passar um
`image_ref.frame_id` explícito, e devem provar que ids obsoletos ou inválidos
falham de forma fechada em vez de recorrer ao frame mais recente. Reutilizar
evidência visual obsoleta é um bug de teste, não uma falha de produto.

## Isolamento de fixture

Os casos de fixture do Chrome se ligam ao pid exato lançado e ao título único da
janela. Eles não podem recorrer a outro processo Chrome do usuário. A prontidão de
foreground usa as sondas nativas de processo/sessão do macOS e não pode depender do
projeto Python/PyObjC removido. A habilitação opcional do AX do Chrome baseada em
PyObjC pode rodar apenas quando existir um ambiente Python explicitamente utilizável;
sua ausência é um diagnóstico e não pode envenenar uma execução de fixture
validada.

## Auditoria de cobertura

C18 precisa alcançar todos os 14 nomes do manifesto antes de poder passar. A saída
antecipada registra o conjunto exato de ausentes. As suítes mais amplas C01-C18 e
M01-M13 fornecem cobertura de cenário independente, para que C18 não seja o único
oráculo para uma família de ferramentas. Os relatórios distinguem `infra_fail`,
falhas de contrato do evaluator e falhas de comportamento do produto; nenhuma
delas pode ser apresentada como uma execução E2E bem-sucedida.

`FULL_SURFACE_ORACLE_CHECKS` é o mapeamento de um para muitos, testado
mecanicamente, de cada nome de ferramenta congelado para suas checagens
independentes. Ele cobre inventário e identidade exata da fixture; assinatura do
raster por app e linhagem do frame; família de evento de ponteiro confiável, botão,
multiplicidade e geometria de arrasto — incluindo as formas `click_count` 2 e 3 e
as formas `mouse_button` right/middle agora roteadas por `left_click`; efeitos
exatos de texto/seleção/tecla/ação, onde `key` também cobre a forma com duração de
hold; prontidão de acesso; e o latch de parada mais a rejeição de uma ação
subsequente. `protocol.all_14_tools_have_passing_oracles` falha se alguma entrada do
mapeamento estiver ausente ou não passando.

O Finder é uma exceção deliberada de foreground. Seu responder de edição inline do
AppKit aceita o comprovante de evento de background com escopo de janela sem
executar a renomeação. Por isso M01 e M04 ligam um `window_id` live exato,
selecionam o item observado e enviam `Return/name/Return` em um único lote
`strategy=event`. Somente o estado do sistema de arquivos do diretório temporário
pode fazer esses fluxos passarem.

Os estilos de caractere do TextEdit são outro caso de cadeia de responder.
M08/M09/M10 focam e reobservam o editor, selecionam um intervalo de texto AX exato e
então enviam os atalhos de estilo e de salvar com o `window_id` verificado,
`strategy=event` e `return_state=none`. A control word RTF salva é a única
condição de aprovação. M05 em vez disso testa a persistência de acréscimo: o
TextEdit pode salvar automaticamente antes que um `cmd+s` redundante possa ser
enviado, então seu contrato termina quando o oráculo de arquivo externo é
estavelmente verdadeiro.

A navegação por teclado do Chromium não pode usar a rota automática de background
apenas porque o broker a aceitou. C16 liga a janela exata da fixture e exige
`strategy=event` para type, Tab, a forma `key` com hold e Enter. Passar exige
tanto o valor DOM submetido quanto registros confiáveis de keydown/keyup de Shift.
Uma resposta bem-sucedida de `Key pressed` sem esses eventos DOM é uma falha.
