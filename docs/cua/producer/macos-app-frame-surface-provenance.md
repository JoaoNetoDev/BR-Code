# Procedência das surfaces de frame de app no macOS

Status: contrato de implementação (2026-08-23)

## Problema

Uma captura de aplicação pode conter mais do que a janela raiz solicitada. Sheets
do AppKit, painéis de open/save e popovers podem ser donos de pixels dentro do raster
retornado carregando um `CGWindowID` diferente; um painel de open/save também pode
ser hospedado por um processo XPC. Antes deste contrato, um frame de app guardava
apenas o `(pid, window_id)` raiz. Portanto, a entrada bruta de coordenadas enviava
todo pixel para a raiz com `SLEventPostToPid`. O SO não podia fazer hit-test do
pixel, de modo que um painel corretamente visível podia silenciosamente não receber
nenhum evento enquanto a ferramenta reportava um despacho bem-sucedido.

A regressão está capturada em `test/fixtures/file-panel-surface-trajectories.json`.
A fixture contém apenas identidades de janela, bounds, classes de ação e
resultados; prompts, nomes de arquivo, dados de conta e bytes de imagem foram
removidos das trajetórias fornecidas.

## Fronteira de confiança

A pertença a uma surface é uma evidência, não uma heurística de geometria. Uma
surface pertence a um frame de app somente quando todas as condições abaixo são
verdadeiras:

1. o macOS Accessibility a alcança a partir da janela focada, principal ou de
   top-level da aplicação lógica, por meio de uma caminhada de relação limitada;
2. `_AXUIElementGetWindow` retorna um `CGWindowID` real;
3. o WindowServer relata a mesma janela antes e depois da captura com PID dono,
   bundle, layer e bounds estáveis; e
4. a geometria da captura e a topologia de displays permanecem estáveis.

A caminhada de relação é limitada a 8 níveis e 64 nós. Títulos e bounds
sobrepostos nunca são usados para inferir pertença. Uma surface cross-process é
permitida apenas quando a caminhada AX prova a relação; o despacho usa o dono
do WindowServer, enquanto a observação retém a identidade da aplicação lógica.

```text
pid da aplicação lógica
        |
        +-- seeds AX focused/main/windows
        |          |
        |          `-- relação de surface filha AX (<= 8 níveis / 64 nós)
        |                         |
        |                         `-- CGWindowID real + pid dono AX
        |
        +-- snapshot do WindowServer antes da imagem
        +-- captura de pixels
        `-- snapshot do WindowServer depois da imagem
                         |
                         v
            AppFrameSurfaceSet estável
```

Um frame de app registra um conjunto `capture_surfaces` ordenado, da frente para
trás. Cada entrada contém:

- `actual_window_id` e `presentation_window_id`;
- `surface_kind` neutro e `relation` comprovado pelo AX;
- PID dono real do despacho e bundle ID canônico;
- bounds no momento da captura e layer do WindowServer.

Se a captura contiver apenas a raiz de apresentação comum e a ABI aditiva de
surfaces do WindowServer estiver indisponível, nenhum registro de surface é
emitido; o frame raiz mantém o caminho existente de verificação da janela raiz
live. Esse caso de compatibilidade não pode fazer a observação inteira falhar. Se
o AX já provou uma surface anexada, mas sua identidade de WindowServer está
indisponível ou muda durante a captura, a observação ainda é retornada, mas seu
raster é não-acionável com `capture_surfaces_unavailable` ou
`capture_surfaces_changed`. Assim, a árvore de acessibilidade continua utilizável
enquanto os pixels de painel permanecem fail-closed. Conjuntos de surface
malformados ou acima do limite seguem o mesmo caminho não-acionável.

## Observar, agir e ciclo de vida

```text
capture(before surfaces)
        |
        +-- imagem + árvore AX
        |
capture(after surfaces)
        |
        +-- mudou ------------------------------> devolve a árvore + raster não-acionável
        |
        `-- estável -> emite frame_id
                         |
pixel de coordenada --------+
        |
hit da frente para trás dentro de capture_surfaces
        |
        +-- nenhuma surface comprovada ---------> action_sent=false
        |
checagem de identidade live do WindowServer
        |
        +-- fechada/substituída/movida/dono trocado -> surface_replaced, action_sent=false
        |
        `-- correspondência exata
                |
                +-- app de apresentação já em foreground E o hit-test comum do OS
                |   também resolve para esta surface exata -> CGEvent de foreground
                |
                `-- caso contrário -> envia para o pid dono real + o id de janela real
```

Uma janela de cobertura não relacionada não faz parte de um frame de app e,
portanto, não pode roubar sua autoridade de coordenadas. Ela também impede que o
caminho de foreground seja escolhido: o evento permanece com escopo de janela,
então a janela não relacionada não pode recebê-lo. A separação de foreground é
necessária porque o AppKit pode confirmar um evento do SkyLight direcionado a
janela sem entregar um `NSEvent` ao responder da sheet. Frames de display
completo mantêm seu próprio contrato de hit-test comum do WindowServer.

Uma observação sem um raster acionável entregue suspende a autoridade implícita de
coordenadas. O frame retido mais recente continua utilizável apenas quando o
chamador fornece explicitamente o seu `frame_id`; uma coordenada sem qualificação
falha com uma orientação para usar um element target ou solicitar um novo
screenshot. Isso evita que bounds globais do AX sejam interpretados como pixels em
uma imagem mais antiga.

Chamadas de teclado com apenas um PID lógico resolvem a surface anexada
atualmente em foco. Quando a aplicação lógica já está em foreground, o broker usa
a cadeia de eventos de foreground para que o AppKit roteie atalhos e texto para
essa surface em foco; ele nunca ativa a aplicação implicitamente. Quando ela não
está em foreground, a entrada permanece com escopo do dono e da janela reais
resolvidos. Um `window_id` explicitamente obsoleto nunca se cura para uma nova
geração nem para a raiz de apresentação; ele falha com `surface_replaced` e exige
uma nova observação. A re-resolução de elemento inclui a identidade real da
surface pelo mesmo motivo.

### Recuperação de foreground confirmada para painéis de arquivo

Alguns comandos do AppKit e inputs de arquivo do Chromium confirmam eventos
direcionados a PID/janela sem executar o comando do responder enquanto a
aplicação lógica está em background. O único caminho de recuperação do produto é a
ação de ativação explícita:

```text
open_application(app={pid,bundle_id,window_id}, activate=true)
```

No macOS esta exceção é aceita apenas quando o `window_id` novo resolve para um
`open_panel`, `save_panel` ou `attached_dialog` estável cujo linhagem AX contenha
um painel de open/save sob a mesma raiz de apresentação. O Helper ativa a
aplicação lógica e foca essa surface exata comprovada pelo AX, e então re-confere
as identidades real/de apresentação antes de reportar `active=true`. Janelas
comuns, popovers, linhagem ausente e gerações substituídas permanecem
background-only ou falham de forma fechada. A aplicação que estava em foreground
não é restaurada.

`key` e `type` com `strategy=event` nunca ativam implicitamente. Eles exigem a
recuperação de foreground confirmada acima, uma nova observação e o
`actual_window_id` exato e atual. Falhar em satisfazer essa precondição é
`foreground_required` com `action_sent=false`, não um erro de permissão TCC do
macOS.

## Estado visível ao model

A superfície existente de 14 ferramentas permanece inalterada. `AppState.window`
adiciona campos neutros de surface:

- `surface_kind`: `window`, `attached_dialog`, `open_panel`, `save_panel` ou
  `popover`;
- `actual_window_id` e `presentation_window_id`;
- `surface_lifecycle`: `stable`, `replaced` ou `closed`.

Elementos adicionam `selected` e `default_action`. Para painéis de open/save, o
estado formatado coloca um resumo curto do diálogo antes da lista completa de
elementos: item(ns) selecionado(s), controle de confirmação padrão e o estado
habilitado dele. A saída compacta mantém esses controles e dá um caminho de
workflow determinístico:

```text
Cmd+Shift+G -> observar de novo a surface anexada -> digitar o caminho completo -> confirmar uma vez
```

## Resultado da mutação

Um comprovante de despacho prova apenas que o evento foi aceito pela camada
nativa. A verificação de mutação é específica do alvo:

- a seleção exige `selected=true` ou uma mudança no controle de confirmação padrão;
- abrir/confirmar pode ser provado quando o painel fecha e o controle retorna à
  mesma raiz de apresentação;
- uma mudança genérica no digest da árvore de acessibilidade nunca é suficiente
  por si só.

Mesmo `return_state="none"` reporta a surface de despacho real, se é seguro
tentar a ação novamente e por que um efeito não foi verificado. A incerteza
pós-envio nunca é reproduzida automaticamente. Esses campos são evidência de
surface interna do broker; o resultado de ação visível ao model permanece
`zcode-cua-action-receipt-v1`. A resposta de permissão plana existente permanece
inalterada.

A mesma regra se aplica ao `type` só-PID: ele resolve a surface anexada em foco,
registra seu comprovante de despacho e entra na barreira de mutação antes de
assentar o estado. Uma captura que brevemente recorre à raiz de apresentação não
é prova de que o painel fechou quando a árvore retornada ainda contém uma ação
de painel padrão. Isso impede que um clique comum na barra lateral seja reportado
como uma confirmação bem-sucedida.

## E2E nativo diferencial

A fixture descartável do AppKit e os packs de tarefas M14–M16 exercitam o
servidor MCP real, o addon nativo, as identidades do WindowServer, o ciclo de
vida do NSOpenPanel e o oráculo pertencente à aplicação. Nenhuma tarefa usa
`osascript`.

```text
M14 screenshot -> confirmed activation -> exact path -> coordinate Open -> same root -> app oracle
M15 panel gen 1 -> Escape -> root -> panel gen 2 -> old window rejected -> focused sheet input
M16 raster frame -> state-only observe -> naked coordinate rejected
                                      `-> explicit retained frame -> same surface dispatch
M17 background Chrome file panel -> confirmed exact-surface activation -> exact path -> DOM oracle
```

| Caso | `main@e0d27a36` antes da correção | implementação multi-surface |
|---|---|---|
| M14 | a árvore AX do painel era visível, mas nenhum raster de painel acionável nem identidade real/de apresentação de surface era entregue | a coordenada foi despachada para a janela real do painel; o painel fechou na mesma raiz; o oráculo da fixture selecionou o arquivo exato |
| M15 | o Escape retornou `Key pressed 1 time(s).` enquanto o primeiro painel permanecia aberto, demonstrando um feedback aceito-sem-efeito | a primeira geração fecha, a segunda geração difere, a janela explícita antiga retorna `surface_replaced`, e o texto só-PID reporta a surface de despacho da sheet em foco |
| M16 | não havia raster de painel acionável disponível, então a autoridade de coordenadas não podia ser estabelecida | a observação somente-estado rejeita a coordenada nua com `action_sent=false`; o frame retido explícito despacha para a surface capturada exata e deixa sua geração inalterada |

Execute a implementação atual:

```bash
node evals/zcode-gui-eval/bin/zge.mjs validate M14
node evals/zcode-gui-eval/bin/zge.mjs validate M15
node evals/zcode-gui-eval/bin/zge.mjs validate M16
```

Para uma comparação de checkout antes/depois, aponte
`ZCODE_CUA_TS_SERVER_DIST` para o `dist/cli.js` construído de cada revisão
enquanto se executa as mesmas definições de tarefa. A latência de performance é
mantida como um diagnóstico não bloqueante; todas as checagens de comportamento,
segurança, ciclo de vida e oráculo são bloqueantes.

## Fronteira entre plataformas

- o macOS usa o conjunto de surfaces e a separação verificada foreground/background
  descrita acima.
- O Windows mantém a verificação de foreground mais o roteamento
  SendInput/UIA. Ele não consome as relações de surface do AX do macOS.
- O Linux mantém o fallback de surface única AT-SPI/X11.

As políticas de despacho por plataforma permanecem separadas; o descritor de
frame compartilhado carrega uma proveniência neutra opcional, mas não força as
três implementações por um único caminho de entrada bruta.
