# Registro de testes de regressão de pixels de captura de tela e Zoom do CUA

Status: o producer, o MCP independente, o ZCode Agent e a cadeia em dispositivo real do Kimi K3 no Desktop visível passaram; o candidato de enxugamento do Skill aguarda reverificação por MR/CI; a correção de atribuição de pixels da janela de sobreposição transparente já foi implementada no producer, e o pin do catalog aguarda bump

## 0.5.8 A janela de sobreposição transparente rouba cliques de coordenadas silenciosamente

A 0.5.6 unificou a atribuição de pixels de capture e dispatch no snapshot do WindowServer, e essa parte funcionou como esperado; o que esta rodada expôs foi uma lacuna nos **próprios candidatos de atribuição**. A entrega do clique por coordenada é um `SLEventPostToPid` direcionado e fixado na janela owner resolvida, sem nenhuma verificação de hit test do OS, então "a primeira janela front_to_back cujos bounds contêm o ponto" é a própria verificação de acerto. Qualquer janela on-screen que cubra esse ponto rouba o clique — independentemente de ter desenhado algum pixel ali — e a ferramenta ainda retorna success.

A trajetória `model-io-sess_364a4761` (2026-08-19 19:19–19:53, Helper 3.8.1 / producer 0.5.7) perdeu cliques três vezes, e o corpo de retorno `resolved_app_ref` registrou com fidelidade o destino da entrega:

| Requisição# | Janela que realmente recebeu o clique | layer | bounds |
| --- | --- | --- | --- |
| 18 | `com.electron.lark.iron` (LarkSSPromptWindow, camada de aviso de compartilhamento de tela do Feishu) | não-zero | `[0,0,1512,982]` |
| 25 | `com.volcengine.corplink.networkextension-wrapper` (extensão de rede do Feilian) | 25 | `[0,0,1512,982]` |
| 31 | `now.typeless.desktop` ("Status" do Typeless) | 1001 | `[381,482,750,500]` |

Três `isError=false`. 22 chamadas de ferramenta foram gastas localizando e movendo essas janelas invisíveis. Em máquinas com o Feilian instalado, **qualquer** ponto da tela principal pertence à sua janela wrapper, de modo que o clique por coordenada não é uma falha ocasional e sim a tela inteira inutilizável.

A exclusão por eliminação e alguns critérios alternativos óbvios não se sustentam (medição real de todos os 26 janelas on-screen de uma única máquina):

- `kCGWindowIsOnscreen` é true nas três, já que é pré-condição do snapshot;
- o `kCGWindowAlpha` em nível de janela é 1.0 — a transparência do conteúdo só aparece no alpha por pixel (naquela janela do Feilian os 2,39 milhões de pixels são uniformemente 4/255), e o filtro `alpha<=0` atual não enxerga isso;
- excluir por `layer!=0` mataria por engano 13 itens da barra de menus `com.apple.controlcenter` de layer-25 e 3 widgets do centro de notificações, e deixaria passar a janela fantasma de layer-0 do Feishu que tem os mesmos bounds da janela real e vem **antes** dela;
- `SLSFindWindowByGeometry` faz apenas consulta geométrica/de forma e devolve a mesma janela de sobreposição para o mesmo conjunto de pontos;
- `CGWindowListCreateImage` por janela capturando o alpha separa os casos, mas leva 75–85ms por candidato e é impraticável no caminho de entrega.

O critério passou a ser a máscara de eventos que a própria janela declara ao WindowServer: o bit `kCGEventLeftMouseDown` de `SLSGetWindowEventMask`. As janelas de sobreposição mediram `0x00005c28` / `0x00005c08` (esse bit em 0), e todos os alvos reais de clique mediram `0xee5cffde` ou `0xee5efffe` (esse bit em 1). Isso também explica por que o usuário não percebeu — a janela de sobreposição é atravessada por cliques, e o clique real realmente a atravessava; só a entrega composta que fixa a janela força o evento dentro de uma janela que já declarou não receber cliques.

O mecanismo de entrega não foi alterado; mudou apenas a filtragem de candidatos que já existia antes do caminho `SLEventPostToPid`, e todas as propriedades — operação em segundo plano, não roubar foco e não mover o cursor do sistema — foram preservadas. O erro fail-closed agora traz a identidade da janela pulada, e o recovery aponta para `open_application(activate=true)` para elevar a janela alvo, em vez de mexer nas janelas de sobreposição do ambiente do usuário.

O contrato do lado do producer e os dados medidos estão no `docs/frame-pixel-zoom-regression.md` §v0.5.8 do upstream. O commit do producer `baa016908` foi incorporado ao main do upstream com `da7cbaf241cc2c279fdc4cbd30df9a990db559ec`, e o pin do catalog foi elevado para esse sha. Caso de reverificação em dispositivo real: com o Feilian (ou qualquer janela de sobreposição transparente em tela cheia) presente, fazer um clique só por coordenada na sua área de cobertura; antes da correção ele era entregue silenciosamente à janela de sobreposição e retornava success, e depois deve acertar a janela visível de layer-0 abaixo, mantendo os itens de status da barra de menus de layer-25 acertáveis por clique de coordenada. A janela fantasma de layer-0 do Feishu, com os mesmos bounds da janela real e vindo antes dela, é um segundo caso vivo da mesma classe, e uma solução que filtre só por layer continua sendo um clique morto nela.

## 0.5.7 Enxugamento do Skill e limite de uso do Zoom

O Skill oficial de Computer Use é um guia de decisão do modelo, não um manual de desenvolvimento do producer. O contrato de runtime mantém `AX element -> visual fallback -> verify`: sempre que a árvore AX conseguir localizar e expressar a ação, usa-se o element target, mantendo a segurança em segundo plano e sem roubar foco; só quando o AX não consegue localizar ou expressar o alvo é que se pede o raster final e se usa coordinate target.

O modelo lê apenas os inteiros `(x,y)` do raster entregue pelo resultado da ferramenta atual e carrega o `frame_id` adjacente sem alteração. Todos os resize, byte-budget, Retina/DPI, crop, origem de janela/display e projeções de dispatch nativo são feitos internamente por `@zcode/zcode-cua` e não podem ser exigidos do modelo.

Zoom não faz parte do fluxo regular. Quando o alvo no raster atual é nitidamente identificável é obrigatório clicar diretamente; só quando o alvo é pequeno demais ou ambíguo e não é possível escolher um ponto de forma confiável é que o Zoom entra como último recurso. O prompt de modelo do C07 e a description da ferramenta usam o mesmo limite, evitando que `screenshot` e `zoom` virem passos padrão lado a lado.

O candidato correspondente do producer é `52da434158df32f6d0825db6af1c3d263754c44c` (`v0.5.7`). O Dev App visível executou com Kimi K3, em um fixture C07 Canvas que não vaza coordenadas geométricas, a sequência `list_apps -> get_app_state(include_screenshot=true) -> left_click(strategy=event)`; não chamou Zoom, não repetiu a captura de tela, e o primeiro acerto foi provado pelo oráculo DOM autenticado com `trusted=true` e `matched=true`.

## 0.5.6 Regressão de clique em captura sem AX

A causa raiz desta rodada é que o owner da captura e o owner do clique usavam duas autoridades diferentes: a proveniência de captura vinha do WindowServer, mas antes do dispatch era usado um hit test por AX. Por isso a janela de gerenciamento do Dock em tela cheia, de layer-20, era confundida como owner na captura, enquanto o AX acertava o Chrome abaixo, e o clique imediato também era recusado como `frame_live_owner_changed`.

Depois da correção, a cadeia de pixels fica unificada no snapshot do WindowServer. Só a superfície de gerenciamento de `com.apple.dock + layer não-zero + cobertura completa do display alvo` é atravessada; o Dock pequeno, o menu, os diálogos e outros overlays continuam bloqueando. A imagem completa, a imagem de janela de `get_app_state(include_screenshot=true)` e a subimagem do Zoom comparam owner de captura/live, bounds de janela e topologia de displays antes da dispensa final pelo Helper, sem usar AX `elementAtPoint`/`captureApp`. element target/AXPress permanece inalterado.

O C07 mantém o alvo interno do canvas não localizável pela árvore AX, e a evidência das duas camadas — MCP direto e ZCode Agent — foi completada. O marker-grid cobre window/full/zoom e registra hash/dimensões do raster, frame id, crop, pixels, ponto projetado independente, owner de captura/live, método de dispatch bruto e acerto DOM autenticado. Essa mudança não entra no estado de conversation, em snapshot/replay nem na cadeia mobile remote, portanto não modifica o catalog/matrix de conversation. Accessibility/Screen Recording do macOS já estão autorizados; o producer de pixels `625b32ad` teve 100 pontos tanto no C07 direto quanto na regressão AX do Calculator. O marker-grid independente passou em todos os gates de frame de janela, imagem completa, Zoom e stale-frame; no ZCode Desktop visível o Kimi K3 tambémcompletou um clique em canvas sem AX usando o `frame_id` exato da captura de janela.

A primeira regressão no Desktop visível também expôs um problema independente de cache de desenvolvimento: o bundle do MCP mantinha corretamente o `sharp` nativo como external, mas o cache de desenvolvimento `~/.zcode/cli/plugins/cache`, ao sincronizar apenas JS, não conseguia resolver essa dependência, fazendo screenshot e Zoom falharem com `Cannot find module 'sharp'`. O cache de desenvolvimento agora reutiliza o staging do runtime sharp do empacotamento do produto e tem um smoke real de carregamento nativo; após a sincronização, o mesmo caso K3 passou em um novo processo MCP. O pacote do produto e o cache de desenvolvimento passam a usar a mesma cadeia de dependência de mídia nativa e não dependem mais da visibilidade acidental do hoist da raiz do repositório.

## Contexto e baseline

A trajetória de xadrez do Godot de 2026-08-13 vem do protocolo de coordenadas antigo. Nela, o modelo ainda enviava `(295,623)` depois de receber uma imagem de Zoom de `756×485`, e a implementação antiga, depois de recusar as coordenadas da captura, deixava o modelo usar coordenadas de tela para executar; em outro momento, `state_id/index` foi tomado como alvo de Zoom, produzindo uma imagem `12×14` sem significado de negócio. Os dois comportamentos antigos agora têm de serreplay negativo, e não uma base de sucesso.

O baseline mínimo de producer para integridade de pixels é `72a8487d5a1bf1dfa2a31b282aafc4093a997b3e`. O producer candidato precisa ser sucessor desse baseline e preservar a exportação de `./frame-contract`, o `frame_id` imutável, o recorte do raster final e o gate de proveniência do Helper. Apenas elevar a versão de package/tag não substitui a prova de implementação.

O candidato final de integração desta rodada é `52da434158df32f6d0825db6af1c3d263754c44c` (`v0.5.7`). Ele herda o baseline de clique estável completo de `611304ccccc92e10cd97635a8cc886e0e2e3519e` e incorpora as correções de clique por captura de tela, Ghost Cursor e ciclo de vida de requisição HTTP ativa de `2fdac16ebef758d7866586d1a9de0fb3ae74e8b4`, além da simplificação da superfície do producer de `d55c5f3a7713a3499bfd7102fd7d2842b53e71ec`. O primeiro herda o raster final e a reprodução negativa da trajetória antiga de xadrez de `a0d4eaca6342b3cbff41b444309726873d0f5b11`, completa o `structuredContent.code` estável para a recusa de runtime-scope do subagente e unifica a autoridade de owner de captura/dispatch do WindowServer com o crop de Zoom de raster retido. O catalog do ZCode usa o commit exato travado, e o wrapper, a skill empacotada, o contrato de runtime do Helper e a versão final de package do producer ficam unificados em `0.5.7`.

O build padrão `pnpm dev:desktop` precisa tratar incondicionalmente o plugin CUA como seed de filesystem em modo de desenvolvimento, escrever o `sharp` e o closure nativo da plataforma atual no source do seed e só então construir o agente. Não se pode exigir que quem chama defina `ZCODE_CUA_DEV_MODE=1`; caso contrário o bootstrap substitui atomicamente o cache por um seed da mesma versão sem `sharp`, e `screenshot`, `zoom` e `get_app_state(include_screenshot=true)` falham simultaneamente em um turno real de modelo.

O `frame_id` visível ao modelo usa um token curto e opaco (por exemplo `frame-a1b2c3d4`), sem expor a geração que o modelo poderia adivinhar. `get_app_state` retorna em ordem `image_ref -> image -> frame hint -> AX tree`; o prompt repete o token exato ao lado da imagem e exige agir antes da próxima observação visual, evitando que uma árvore AX longa empurre a proveniência do frame para fora do transcript limitado. Esse prompt não emite autoridade, e a única autoridade continua sendo o `image_ref` estruturado adjacente ao raster final. Session/generation privados, latest/supersession, TTL, digest e o gate de proveniência nativa do Helper permanecem inalterados.

## Contrato e sequência

```text
capture/zoom -> raster final + frame_id -> model {frame_id, x, y}
                                              |
                                              v
                           verificação de registry live/bounds
                              | current       | stale/inválido
                              v               v
                     proveniência do Helper   rejeição
                              |               broker calls = 0
                              v
                           atuação única
```

- O target por coordenada só aceita `{type:"coordinate", frame_id, x, y}`, e `x/y` precisam ser inteiros.
- `space:"screen"`, `space:"screenshot"` e os formatos de compatibilidade de coordenadas por `state_id/index` são todos recusados.
- O Zoom recorta a partir do raster que o modelo realmente recebeu, sem nova captura de tela e sem vazar a geometria da tela de origem.
- Stale, fora de limites e mudanças de janela/owner/topologia precisam falhar de forma fechada antes da ação nativa.
- O sucesso é definido pela mudança da marca de negócio do fixture e não apenas pelo sucesso da chamada CGEvent/AX.

## Casos automatizados

1. **Reprodução negativa da trajetória antiga**
   - `(295,623)` em um frame `756×485` é recusado por estar fora dos limites, com zero chamadas ao broker.
   - Targets antigos com `space` e `state_id/index` são recusados na fase de schema.
   - Após screenshot A -> zoom B, referenciar A devolve stale/superseded, com zero chamadas ao broker.
2. **Pressão de sequência C07**
   - screenshot -> zoom -> click acerta o único marcador do canvas.
   - screenshot -> zoom -> screenshot -> click no frame antigo é recusado.
   - Retina, dimensões ímpares, origem de tela negativa e recorte parcialmente fora dos limites mantêm a projeção do centro do pixel.
   - Depois de resize/move ou mudança de owner ou topologia de display, o frame antigo é recusado.
3. **Última milha do ZCode**
   - `image_ref` é adjacente à imagem, com bytes, MIME e dimensões inalterados.
   - Frames inválidos, duplicados ou de outra session são recusados antes do RPC do action broker.
   - Quando o producer candidato não tem a exportação frame-contract, o gate de consistência de versão falha; a relação de mesclagem com o baseline mínimo é registrada em provenance imutável e não pode ser inferida pelo semver.

## Aceitação em dispositivo real no macOS

- Executar primeiro o marker-grid determinístico e o replay do C07 e, em seguida, rodar separadamente as cadeias de MCP direto, ZCode Agent e ZCode Desktop visível com modelo real.
- A cada execução, preservar SHA-256/dimensões do raster, frame_id, pixel do modelo, ponto projetado, provenance de janela/display, marcador de negócio antes e depois do clique e a captura de tela; os bytes completos de imagem da requisição ao provider não são salvos.
- Os casos determinísticos window/full/Zoom precisam acertar corretamente todos; a cadeia com modelo real precisa acertar corretamente ou recusar com segurança antes da ação nativa, e a ferramenta retornar success não pode substituir o resultado de negócio do fixture.
- Modelo escolhendo a região errada mas com projeção correta é classificado como falha visual/semântica; apenas frame errado, sistema de coordenadas errado ou ponto físico errado é classificado como regressão de coordenadas de pixel.

## Evidência atual

| Camada                                  | Resultado                     | Observação                                                                                                                                                                                              |
| ------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Histórico `v0.5.3/6d02fc3c`                | Recusado                     | Bifurcou de `72a8487`, sem frame-contract; prova que o mesmo número de versão não prova a implementação                                                                                                                             |
| Baseline de frame do producer `v0.5.4/a0d4eaca` | 2750 passaram, 38 ignorados  | 225 arquivos passaram e 3 foram ignorados; inclui frame, Zoom, Retina, stale e native gate                                                                                                                        |
| Producer final `v0.5.5/372cbac9`       | 2766 passaram, 23 ignorados  | 227 arquivos passaram e 1 foi ignorado; completa o código de erro estável de subagente de 30 ferramentas e o gate de consistência de versão de package/plugin, e a suíte completa de socket passou sob Node 24.14.0                                                             |
| Implementação de clique por pixel `v0.5.6/625b32ad`        | 2786 passaram, 23 ignorados  | 228 arquivos passaram e 1 foi ignorado; zge evaluator 472/472, Python 32/32, aprovado com owner unificado do WindowServer, clique sem AX em window/full/Zoom, regressão AX localizada, julgamento de evidência do modelo K3 e gate de atribuição TCC do LaunchServices do Helper |
| Producer final `v0.5.6/c863cff9`       | 2814 passaram, 23 ignorados  | Após mesclar a barreira de estado autoritativo AX do `main` mais recente, 230 arquivos passaram e 1 foi ignorado; build/typecheck/lint, evaluator 472/472 e Python 32/32 passaram                                                        |
| Producer final `v0.5.6/07a6dca8`       | 2814 passaram, 23 ignorados  | O frame hint fica fixo entre a imagem e a árvore AX, e o trace registra antes do truncamento apenas a proveniência de frame entregue; 230 arquivos passaram e 1 foi ignorado, evaluator 474/474, Python 32/32, Kimi K3 direct/app-server passou                      |
| Conjunto focado em trajetória/coordenadas do producer              | 77/77 passaram               | 12 arquivos; a trajetória antiga de xadrez ganhou 3 casos fail-closed                                                                                                                                                   |
| Integridade do consumer do ZCode                 | 124/124 passaram             | 6 arquivos; a dependência final está travada em `07a6dca8`/`0.5.6`, e o gate completo pré-commit e o pipeline do MR ainda precisam de reverificação                                                                                                                |
| Gate de versão/skill/contract do wrapper      | 13/13 passaram               | A falta de Helper no Windows ou de frame-contract do final-raster recusa diretamente                                                                                                                                     |
| Autoridade de host do wrapper                | 1/1 passou                 | O caminho de permissão de host do pacote de produto permanece consistente                                                                                                                                                                      |
| Julgador de avaliação do CUA                       | 474/474 passaram             | Conjunto completo do evaluator Node; mais Python 32/32, cobrindo C07, região, I/O de modelo K3 e recuperação de frame-id                                                                                                           |
| Definição de avaliação do CUA                   | 31/31 passaram               | definition-only quality 100                                                                                                                                                                       |
| Testes unitários completos do ZCode                        | 11476 passaram, 12 ignorados | 1309 arquivos passaram e 1 foi ignorado; `test:unit` completo executado localmente na árvore final do consumer e reverificado depois do commit pelos gates affected/pre-push por commit range                                                                  |
| ZCode Node 24.14.0                    | Passou                     | `typecheck`; `lint` com 0 error e 38 warnings existentes                                                                                                                                                    |
| Producer Node 24.14.0                 | Passou                     | `typecheck`; `lint` com 0 error e 14 warnings existentes                                                                                                                                                    |
| Validação do pacote de plugin                        | Passou                     | Proveniência da skill empacotada, SHA do producer, versão e contrato consistentes                                                                                                                                      |
| MCP `zcode-cua` independente                  | Passou                     | Node `24.14.0` iniciando `v0.5.6` por stdio; window 5/5 do canvas marker-grid, full, Zoom de strict-interior e drag todos provados como acerto pelo oráculo DOM autenticado, todos reportando `window_event`; zero dispatch de stale frame     |
| Chrome                                | Instalado                   | `151.0.7922.138`; o fixture C07 inicia e vai para primeiro plano                                                                                                                                                      |
| Godot                                 | Instalado                   | `4.7.1.stable.official.a13da4feb`; o app inicia                                                                                                                                                     |
| Wrapper dev do CUA Helper                   | Build passou                 | Usa a base SEA do Node `24.14.0` e o `ax_native.node` de mesmo ABI, com provenance `arm64/node_abi=137` aprovado e instalado em `~/.zcode/computer-use/dev`                                                                  |
| Runtime C07 no macOS                     | Passou                     | Accessibility/Screen Recording do Dev Helper mais recente estão granted; o C07 direto de final-SHA e o AX M02 do Calculator estão ambos em 100 pontos                                                                             |
| app-server do Kimi K3                    | Passou                     | As duas lanes, direct e `zcode_agent_core`, do gate de final-SHA passaram; product/release score 100 e a requisição de modelo realmente carrega e reconhece a captura de tela                                                                            |
| Kimi K3 no ZCode Desktop visível            | Passou                     | session `sess_be30c6a3-2ce7-4574-aaac-2fe821e311ed`; raster de janela `1280×900`, `frame-0c9a96ea`, pixel do modelo `(641,496)`, oráculo DOM `Marker placed at 450, 280`, canvas sem subelementos AX               |
| sharp no cache de plugin do Desktop                | Passou                     | A falta de sharp foi reproduzida de forma estável na primeira execução; depois que `sync:cache` reutiliza o staging do produto, o smoke de carregamento nativo do sharp `0.34.5`/libvips `8.17.3` e o C07 com MCP/K3 totalmente novo passaram                                                          |

O registro final em dispositivo real do Kimi K3 está vinculado ao producer `07a6dca8`: o C07 direto marcou 100 pontos; a lane app-server do ZCode foi `vision-pass`, com product score 100. O modelo realmente recebeu a imagem de janela `frame-8ce8ecf9`, enviou o pixel inteiro `(641,469)`, o Helper despachou como `window_event` e o oráculo DOM retornou `Marker placed at 450, 280`. O C07 direto do mesmo candidato também cobre o Zoom de raster retido, e a regressão AX do Calculator M02 ficou igualmente em 100 pontos.

Toda a evidência formal de automação acima usou o Node `24.14.0`; as duas permissões TCC do macOS já estão em vigor. A chave do provider e as imagens completas do provider não foram gravadas no repositório nem no MR. Um monitor secundário externo não faz parte do ambiente real desta rodada, e a origem negativa e as mudanças de topologia são cobertas por testes determinísticos; caso um ambiente de duas telas seja fornecido depois, será acrescentada uma evidência real de topologia, sem afetar a conclusão de aceitação atual de window/full/Zoom em tela única.