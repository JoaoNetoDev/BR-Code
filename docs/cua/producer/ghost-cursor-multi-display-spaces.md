# Visibilidade do overlay do ghost cursor em múltiplos monitores (janela acompanha a tela alvo)

## Problema

O overlay do ghost cursor era, originalmente, **uma** janela sem borda que cobria a união de
todos os monitores (`ComputeDisplayUnion()`). No macOS, com "os monitores têm espaços
separados" habilitado por padrão (`com.apple.spaces spans-displays` não definido / false),
uma janela que atravessa várias telas só aparece na **tela em que ocupa a maior área**, e a
parte do canvas nas demais telas simplesmente não é exibida.

Medição real (2026-10-10, tela principal 1512×982 + monitor externo 2560×1440 à esquerda):
a janela da união era `[-2560,-458, 4072×1440]` e só aparecia no monitor externo; todo o
retorno visual das ações da CUA na tela do notebook (glide, ondulação, focus-rect, cue de
teclado) ficava permanentemente invisível, enquanto o `ghostState().shown` nativo continuava
reportando `true`. Em tela única a união é a própria tela, portanto o problema só aparece em
multi-monitor com a configuração padrão de Spaces.

## Decisão

O overlay continua sendo **janela única**, mas o frame da janela passa de "a união inteira"
para "**a tela onde está o ponto de feedback atual**":

1. Antes de cada feedback ser aplicado a um ponto DIP global (movimento do ponteiro, ondulação
   de clique, focus-rect, alteração da configuração de tela), calcula-se primeiro a `NSScreen`
   à qual o ponto pertence; se ela diferir do frame atual da janela, faz-se `setFrame` para
   aquela tela.
2. Na troca de frame, mantém-se a lógica de preservação de posição de `ScreenParamsChanged`:
   primeiro lê-se de volta a posição de dot/bloom em DIP globais a partir do frame antigo; depois
   da troca de frame, remapeia-se para as novas coordenadas locais de conteúdo.
3. Quando o ponto não cai em nenhuma tela (corrida de tempo em que a tela acabou de ser
   desconectada, por exemplo), recorre-se à tela mais próxima e, em seguida, à tela principal,
   sem lançar erro.
4. O sistema de coordenadas não muda: as escritas no layer continuam passando por
   `GlobalDipToContent` (calculadas a partir da origem de `g_window.frame`), e a base de
   inversão das coordenadas globais CG → NS continua sendo a altura da tela principal.

### Custo conhecido

Um glide entre telas dá um salto na borda: depois que a janela muda para a nova tela, o trecho
daquela animação na tela antiga está fora da janela. As ações da CUA normalmente caem dentro de
uma única janela alvo; movimento entre telas é raro, portanto é aceitável.

## Segundo causa raiz: a base de inversão usa a tela da key window por engano

Depois de corrigir o acompanhamento da janela, o problema ainda reproduzia na máquina real:
"clicar no campo de busca no monitor externo não mostra o cursor, mas rolar na área do mapa
mostra". A causa é que, na conversão entre coordenadas globais CG (origem no canto superior
esquerdo) e coordenadas globais NS (origem no canto inferior esquerdo), a altura usada como base
de inversão era `NSScreen.mainScreen`. A semântica dela é **a tela onde está a key window**, e não
o monitor principal da origem (0,0): com o foco no monitor externo, ela retorna 2560×1440, e a
base passa de 982 (tela principal) para 1440, deslocando todo o feedback 458px para baixo. O
trecho no topo do monitor externo cai fora da janela do overlay, então o clique no campo de busca
no topo fica invisível e a área do mapa, mais abaixo, aparece.

Decisão: todas as inversões, as leituras de frame de retorno e os frames de fallback usam
`PrimaryScreenFrame()` (a primeira tela de `[NSScreen screens]`, isto é, o monitor principal).
As coordenadas globais CG já têm como origem o canto superior esquerdo do monitor principal.
Esse problema depende de qual tela tem o foco; o caso live passar antes se deve apenas ao fato de
o foco estar na tela principal naquele momento.

### Alternativa não escolhida

"um overlay por tela" preservaria a animação entre telas, mas a exibição/ocultação, o
z-order e a exclusão da própria janela no probe de oclusão (`g_window_server_id`) e o interruptor
de capture teriam de passar a operar sobre múltiplas janelas — uma superfície de mudança e um
risco claramente maiores.

## Invariantes

- A tela do ponto de feedback e o frame da janela do overlay coincidem: `ghostState().windowFrame`
  é igual ao frame da tela à qual o ponto pertence (DIP global CG, origem no canto superior
  esquerdo).
- A posição do dot na tela não muda na troca de frame (não há salto).
- A identidade da janela do overlay (window number) não muda, portanto a lógica de exclusão da
  própria janela no probe de oclusão não precisa ser alterada.

## Verificação

- Contrato de código-fonte: o frame da janela não vem mais de `ComputeDisplayUnion()`;
  `MoveGhostTo` / ondulação / focus-rect / `ScreenParamsChanged` passam antes por
  `EnsureWindowOnScreenForGlobalDip`.
- live (`ZCODE_CUA_LIVE_NATIVE=1`): para o ponto central de cada monitor ativo, executar
  `ghostMove` e afirmar que `windowFrame` é igual aos bounds desse monitor.
- Em máquina real: com múltiplos monitores e a configuração padrão de Spaces, o cursor deve ser
  visível a olho nu nas duas telas (a captura de tela da janela não funciona, pois o padrão é
  `NSWindowSharingNone`).
