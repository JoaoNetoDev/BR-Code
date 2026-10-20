# Estilos unificados do Gen UI

## Objetivos e limites

O `DESIGN.md` é a especificação de referência, e os componentes nativos do App são a
referência de tamanho e estado. Modifica-se apenas a projeção de tema do Gen UI e os
recursos base do visualize; não se modificam os componentes nativos do App nem a
projeção padrão do MCP App de terceiros. Os nomes de classe dos trechos já existentes
continuam utilizáveis, e a exportação HTML independente compartilha o CSS base com o
conteúdo inline.

## Contrato de estilos

- Corpo de texto, botões e formulários usam a posição de documento base do host;
  h1/h2/h3–h6 usam corpo +4/+2/+0; texto auxiliar -2, tooltip -1, código em linha -2.
  Rótulos de autor de gráficos podem manter o limite mínimo de legibilidade do conteúdo.
- Cantos arredondados usam tokens sm/md/lg/xl independentes (padrão 4/6/8/12px), sem
  derivação proporcional. card/widget começam em xl, e o aninhamento desce nível a
  nível para lg/md/sm; um wrapper comum não acrescenta níveis. Controles usam lg em xl
  ou em contêiner pai sem raio, md dentro de lg e sm dentro de md/sm.
- card usa card/card-border; o controle primary usa App primary, e o accent de links e
  gráficos preserva a cor de marca de forma independente. O botão comum selecionado usa
  a superfície selected, sem virar cor de marca.
- btn tem outline como padrão; primary/secondary/ghost usam respectivamente as
  cores semânticas correspondentes. A altura mínima padrão é 28px, e as variantes
  xs/sm/lg têm alturas mínimas de 20/24/32px; a opacidade de disabled é 0.5. As
  variantes de tamanho usam altura de linha compacta 1, e a altura pode crescer com o
  tamanho de fonte e o conteúdo; os limites do texto devem permanecer dentro do botão,
  sem que uma altura fixa corte o texto ampliado. A regressão cobre fontes de 14/18px,
  a borda entre botões adjacentes e o contorno de foco visível.
- input/select comuns têm altura de 36px; sm/xs compactos têm 28/24px. Usa-se o fundo
  de input, input-border/hover/focused e o fundo focused, e o placeholder usa o
  terceiro nível de foreground. O Textarea tem mínimo de 64px e padding de 8px,
  preservando a capacidade nativa de ajuste vertical.
- Checkbox de 16px, com suporte a checked/indeterminate; Switch de 32×18px, com thumb
  de 16px. O hover do estado indeterminado mantém o fundo primary e a marca de
  contraste, sem aplicar o hover do estado não selecionado. Quando a exportação
  independente não tem o token focused do host, usa-se a borda ring, garantindo que o
  foco se distinga do hover. Range mantém o comportamento e a geometria nativos
  atuais, unificando cor e disabled; não se introduz uma nova implementação de Slider.
- Preservam-se o foco visível por teclado, o comportamento de expansão do select
  nativo, o alvo de 44px para coarse-pointer e a regra mínima de 16px para editable
  field, que evita o zoom. A isomorfia completa dos menus está fora do escopo desta
  rodada.

## Fonte única e sincronização de tema

```text
App styles.css → Gen UI 专用变量映射 → 既有 HostContext → guest 根 CSS 变量
                                                   ↓
                                      visualize.css → 作者 HTML 控件
独立导出：同一 visualize.css → light/dark 默认值
```

Tamanho de fonte e raio usam as variáveis padrão do MCP; as cores dedicadas usam a extensão
`zcode/genUiStyles` do HostContext, validada pelo shared schema como chave de variável
CSS do Gen UI e valor de string. O objeto de variáveis padrão do SDK é uma enumeração
estrita, e não é permitido inserir chaves customizadas nele. As novas variáveis
existem apenas na projeção do Gen UI. A troca de tema/fonte reaproveita a observação
de propriedades raiz e o caminho de HostContext já existentes, sem adicionar cache,
timer ou nova fonte de estado. Não se modificam o protocolo de tamanho, o registro do
sandbox, a workspace identity, o desktop continuous ou a cadeia replayable do celular;
enquanto o celular não tiver sandbox de Gen UI, mantém-se o estado de não suportado, e
as regras de tela estreita e de toque continuam valendo na camada de conteúdo.

## Verificação

### Corte de cantos arredondados da prévia expandida

No estado de carregamento, exibe-se o ícone de loading giratório e "正在加载…"
(Loading… em inglês), com o texto usando text-ui-base e o ícone oculto para
tecnologias assistivas. Estados offline, de erro e similares não exibem o ícone de
loading.

Na barra de ferramentas expandida, o lado esquerdo exibe o DialogTitle já existente,
mostrado quando há título de conteúdo; o título padrão serve apenas para acessibilidade
e "交互视图" não é exibido. O título é elidido em uma única linha e oferece o title
completo, preservando a associação aria-labelledby do Dialog; os botões de ação do
lado direito permanecem alcançáveis, sem modificar os componentes nativos do App nem a
barra de ferramentas inline.

O conteúdo expandido usa um popover de top-layer, que não pode ser recortado pelo
overflow-hidden do Dialog externo. A âncora da prévia do Gen UI deve herdar os cantos
arredondados inferiores esquerdo e direito do Dialog, com a camada portadora existente
sincronizando o raio e aplicando overflow-hidden por conta própria; o topo encosta na
barra de ferramentas e permanece reto. Quando o painel Tweak está visível, o fundo do
conteúdo encosta no painel e também permanece reto. Fechar o painel restaura os cantos
arredondados inferiores, sem reconstruir o webview. A regressão verifica, em Electron
real, os quatro cantos da camada portadora, o corte e a preservação da instância após
abrir e fechar o painel. O Dialog nativo do App e o comportamento da camada portadora
compartilhada permanecem inalterados.

- Testes unitários de mapeamento: tokens de controles dedicados, tamanhos de fonte e raio
  completos, variação de fonte, fallback para itens ausentes; a projeção padrão do MCP
  permanece inalterada.
- Regressão em Electron real: temas claro e escuro, 390/1100px, computed style após
  mudança de fonte; wrappers aninhados não alteram a hierarquia de raios; variantes de
  botão, foco/hover/disabled de input, checked/indeterminate de checkbox, switch, select
  nativo e textarea; estilos padrão da exportação independente.
- Os E2E existentes do Gen UI continuam válidas para ampliação/recolhimento, cópia,
  estados de interação, medição de altura e rolagem.
- architecture, typecheck, lint, consistência de hash de recursos e focused unit tests.

macOS é o ambiente de execução desta rodada; a aparência do menu do select nativo em
Windows/Linux ainda é determinada pelo sistema e exige aceitação visual adicional na
plataforma correspondente.

## Evidências de verificação desta rodada

Testes unitários de tema/protocolo/montagem/recursos somam 16 casos; os testes vendor
da exportação independente somam 3 casos. A regressão em Electron real cobre os temas,
tamanhos de fonte, larguras e estados de controle citados acima; os estilos de foco foram
verificados forçando pseudo-classes via CDP no iframe ativo, e os estilos de toque
foram verificados por simulação de toque em iframe de exportação independente, o que
não equivale à aceitação em aparelho real. As regressões existentes de ampliação,
cópia, medição de altura, preservação de estado e exportação offline reaproveitam o
mesmo teste executado. Não estão incluídos o teste em aparelho Windows/Linux, o
suporte a Gen UI no Web do celular nem a validação de produção da conta de login.
