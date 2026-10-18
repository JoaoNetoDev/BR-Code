# Design da base de ponteiro completo e da área de trabalho virtual no Windows CUA

> Data: 2026-07-29
>
> Status: confirmado
>
> Escopo: cadeia de desenvolvimento de código-fonte Windows local desktop continuous
>
> Repositórios relacionados: `z-code`, `C:\Users\dev\zcode-cua`

## 1. Contexto

A Fase 1 do Windows CUA já fechou o seguinte ciclo no ambiente de desenvolvimento por código-fonte:

- O Host local do ZCode inicia um Helper do Windows independente sob demanda;
- O Helper usa named pipe aleatório e bearer token;
- O plugin oficial do CUA obtém credenciais de broker via a autoridade do Host;
- A UIA consegue enumerar aplicativos e janelas, observar a árvore de elementos e executar ações semânticas já suportadas;
- `open_application`, clique por elemento/coordenada e entrada de teclado funcionam no link real com o Bloco de Notas;
- A parada e o restart do Helper e a saída do ZCode não deixam pipes antigos que continuem aceitando requisições.

Dos 30 ferramentas MCP existentes, o addon nativo do Windows ainda não exporta `moveTo`, `scrollAt`, `drag`, `mouseDown` e `mouseUp`, então `mouse_move`, `scroll`, `left_click_drag`, `left_mouse_down` e `left_mouse_up` ainda falham de forma fechada no Windows. O clique por coordenada existente também usa as dimensões do monitor principal para calcular as coordenadas absolutas do `SendInput` e não cobre área de trabalho virtual, coordenadas negativas e monitor secundário.

Existe ainda uma lacuna de contrato multiplataforma na camada de ferramentas: embora as ferramentas de ponteiro acima exijam escopo `app_ref` ou `state_image` na descrição da ferramenta, ao enviar a requisição ao broker apenas as coordenadas são mantidas, sem o `app_ref` resolvido. Assim, no Windows só é possível executar um `SendInput` global sem prova de qual é a identidade da janela alvo, o que é inconsistente com o design existente de que "janela em primeiro plano, PID e estado observado precisam casar".

Além disso, a superfície system do Windows atualmente representa a leitura de clipboard não implementada como string vazia e a escrita como sucesso no-op; o `screenCaptureStatus()` nativo também reporta `granted` quando ainda não existe implementação de WGC. Esses valores de retorno fazem o modelo confundir "capacidade não implementada" com "operação real bem-sucedida", e é preciso restaurar antes a semântica real de capacidade.

## 2. Objetivo desta etapa

Esta etapa completa a base de entrada de ponteiro do Windows, sem mudar a quantidade nem os nomes das ferramentas MCP:

1. Fazer as cinco ferramentas existentes funcionarem de verdade no Helper do Windows por código-fonte:
   - `mouse_move`
   - `scroll`
   - `left_click_drag`
   - `left_mouse_down`
   - `left_mouse_up`
2. Fazer o clique por coordenada existente e as novas ações de ponteiro usarem uniformemente as coordenadas da área de trabalho virtual do Windows.
3. Verificar, antes de qualquer `SendInput` global, que o aplicativo alvo continua sendo o único aplicativo em primeiro plano; quando não for possível provar, falhar de forma fechada.
4. Preservar a restrição de session holder de `left_mouse_down` / `left_mouse_up`.
5. Não deixar botão de mouse pressionado pelo CUA após qualquer falha parcial, parada do Helper ou desaparecimento do processo pai.
6. Capacidades não implementadas de captura de tela e clipboard precisam relatar explicitamente unavailable/unknown, sem retornar valor vazio nem sucesso no-op.
7. macOS e Linux continuam reaproveitando a implementação existente, sem mudar a semântica de dispatch nativo deles.

## 3. Não objetivos

Esta etapa não inclui:

- Windows Graphics Capture, D3D11, revisão de screenshot ou fechamento de pixel de `state_image`;
- Worker MTA de UIA, cancelamento de UIA ou isolamento de travamento de UIA;
- A implementação real do clipboard nativo do Windows;
- Pacote de instalação do produto, SEA, addon pré-compilado, assinatura, SmartScreen ou atualização automática;
- SSH, WSL, Docker, remote workspace, `/remote` do celular oulink replayable;
- Novos nomes de ferramentas MCP específicos do Windows ou canais de entrada que contornem o broker;
- Modificação do Helper do macOS, do AT-SPI do Linux ou do manifesto existente de 30 ferramentas.

## 4. Escolha de abordagem

### Opção A: adicionar ferramentas específicas do Windows na camada de ferramentas

Por exemplo, adicionar ferramentas como `windows_scroll` e `windows_drag` e deixar a camada de ferramentas chamar a implementação do Windows diretamente.

Não adotada. Isso reintroduziria bifurcação de plataforma e conflito de semântica entre ferramentas, e também contornaria as restrições existentes de delivery-state, session holder e ciclo de vida do broker.

### Opção B: apenas acrescentar cinco exports ao addon

Manter a camada de ferramentas e o broker intactos e implementar somente `moveTo`, `scrollAt`, `drag`, `mouseDown` e `mouseUp`.

Não adotada. Hoje a camada de ferramentas não repassa o `app_ref` resolvido ao broker; acrescentar sozinho exports nativos transformaria requisições que eram explicitamente unavailable em entradas globais sem verificação de identidade de alvo.

### Opção C: completar de ponta a ponta o seam neutro de plataforma já existente

Essa é a opção adotada:

- A camada de ferramentas mantém a coordenada e o `app_ref` resolvido;
- O broker aplica um portão estrito de PID em primeiro plano para as requisições globais de ponteiro do Windows;
- O adapter Node continua expondo a capacidade por meio da ABI nativa opcional;
- O addon do Windows implementa as cinco ABIs existentes e as coordenadas da área de trabalho virtual;
- O ciclo de vida do Helper é responsável por liberar o estado de entrada mantido pelo CUA no encerramento;
- Capacidades de sistema não implementadas passam a falhar de forma fechada explicitamente.

Ela não muda a superfície MCP nem exige que o Agent fique ciente dos casos especiais do Windows.

## 5. Cadeia de execução

```text
MCP pointer tool
  |
  | resolve target -> screen point + app_ref
  | reject missing/mismatched scope
  v
official zcode-cua plugin
  |
  | broker action RPC
  | { point/start/end, app_ref, session_key, ... }
  v
Windows Computer Use Helper broker
  |
  | resolve live app identity
  | verify exactly one frontmost app and expected pid
  | verify no-focus policy + holder state
  v
NodeAutomationAdapter
  |
  | existing optional native ABI
  v
ax_native.node
  |
  | virtual desktop mapping
  | SendInput move / wheel / drag / down / up
  | guaranteed release on partial failure or terminal shutdown
  v
interactive Windows desktop
```

As seguintes cadeias são proibidas:

```text
tool -> Windows API
renderer -> native addon
remote Host -> local Windows Helper
missing app scope -> unchecked global SendInput
failed drag -> mouse button remains down
```

## 6. Contrato de escopo da camada de ferramentas

### 6.1 Operação de ponto único

`mouse_move`, `scroll` e `left_mouse_down`, depois de resolver o target, precisam obter simultaneamente:

```text
ResolvedPointerTarget {
  point
  appRef
}
```

Um `app_ref` explícito de topo nível pode sobrescrever o `app_ref` que veio no próprio target, mas o valor sobrescrito continua sendo resolvido ao vivo pelo broker. A requisição não pode enviar apenas `point`.

No Windows, se a fonte de acessibilidade estiver disponível mas não for possível obter um escopo de aplicativo resolvível, a requisição precisa falhar antes de qualquer input nativo. Não é permitido voltar silenciosamente a uma entrada global sem restrição só porque a ABI com escopo por pid não existe.

### 6.2 Arrastar

`left_click_drag` precisa resolver origem e destino separadamente:

```text
from_target -> { startPoint, startAppRef }
to          -> { endPoint, endAppRef }
```

Regras:

- Quando existe um `app_ref` explícito de topo nível, ele restringe uniformemente as duas pontas;
- Caso contrário, as duas pontas precisam resolver para a mesma identidade de aplicativo;
- Quando as duas pontas explicitamente pertencem a PID/identidade diferentes, a requisição é rejeitada antes da chamada ao broker;
- Não se executa o arrasto quando não é possível provar que é o mesmo aplicativo;
- Não é permitido adivinhar a ponta que falta usando o "aplicativo atualmente em primeiro plano".

### 6.3 Operação de limpeza

`left_mouse_up` continua não aceitando alvo arbitrário. Ele só libera o `left_mouse_down` que a mesma sessão MCP já enviou com sucesso ou que poderia ter enviado com sucesso.
Essa é uma limpeza de segurança e não re-resolve a identidade do aplicativo; mesmo que o usuário troque de janela entre down/up, o CUA precisa conseguir liberar o botão que ele mesmo pressionou.

## 7. Portão de primeiro plano do broker

O Windows não tem equivalente ao `CGEventPostToPid` do macOS, e `SendInput` sempre atua sobre a área de trabalho interativa atual. Portanto:

1. O broker resolve um PID live único a partir do `app_ref`;
2. Imediatamente antes do dispatch nativo, ele reenciona os aplicativos live;
3. A ação só é permitida quando há exatamente um aplicativo com `active=true` e o PID dele é igual ao PID alvo;
4. Zero ou mais de um aplicativo ativo, alvo já encerrado, ambiguidade de identidade ou PID de primeiro plano diferente falham de forma fechada;
5. O erro exige que o usuário reative o alvo e reobserve, sem ativação automática e sem replay automático da ação;
6. `mouse_up` é a única ação de ponteiro que não executa o portão de primeiro plano, porque só libera um holder de CUA já registrado.

O portão reaproveita a lógica existente de verificação de primeiro plano do raw click e estende a mensagem de erro de click-specific para um método genérico.
Os caminhos pid-scoped e globais já existentes de macOS/Linux permanecem como estão.

```text
SCOPED
  |
  | resolve live identity
  v
FRONTMOST_CHECK
  | expected pid == unique active pid
  |------------------------------ no -> REFUSED (no input sent)
  v yes
NATIVE_DISPATCH
  |------------------------------ transport lost after send -> possibly_sent
  v
DONE
```

## 8. Contrato de entrada nativa do Windows

### 8.1 Coordenadas da área de trabalho virtual

Todas as entradas de mouse absolutas leem uniformemente:

- `SM_XVIRTUALSCREEN`
- `SM_YVIRTUALSCREEN`
- `SM_CXVIRTUALSCREEN`
- `SM_CYVIRTUALSCREEN`

A conversão usa o canto superior esquerdo da área de trabalho virtual como origem:

```text
normalizedX = (x - virtualLeft) * 65535 / (virtualWidth  - 1)
normalizedY = (y - virtualTop)  * 65535 / (virtualHeight - 1)
```

Requisitos:

- Rejeitar coordenadas não finitas e dimensões inválidas de área de trabalho virtual;
- O ponto de entrada pode ser uma screen coordinate negativa;
- Pontos fora da área de trabalho virtual falham de forma fechada, sem clamp silencioso;
- O movimento absoluto precisa definir simultaneamente `MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK`;
- O `clickAtPoint` existente e as novas operações move/drag compartilham a mesma função de conversão;
- Não usar constantes de fallback da tela principal para forjar sucesso.

### 8.2 Primitivas de ponteiro

O addon do Windows completa a ABI opcional já existente:

```text
moveTo(x, y)
scrollAt(x, y, amount, direction)
drag(fromX, fromY, toX, toY, button)
mouseDown(button)
mouseUp(button)
```

Comportamento:

- `moveTo`: um movimento absoluto na área de trabalho virtual;
- `scrollAt`: primeiro move até o ponto alvo e depois envia a wheel vertical ou horizontal;
- `amount=0`: no-op legítimo, sem gerar evento de wheel;
- `drag`: move até a origem, pressiona, interpola até o destino em um número finito de movimentos e solta;
- `mouseDown` / `mouseUp`: suportam apenas botões já declarados; a superfície de ferramentas atual só expõe o esquerdo;
- Qualquer escrita parcial de `SendInput` é considerada falha;
- Qualquer falha de drag depois do down precisa enviar um up de forma best-effort;
- O down/up de modificadores continua sendo gerenciado pelo `withSyntheticModifiers` do broker.

### 8.3 Estado de entrada e parada

O addon do Windows mantém o estado de entrada sintética mantido por este processo de Helper. O requisito mínimo é rastrear os botões do mouse; o estado de teclas gerado pelo `keyDownGlobal` / `keyUpGlobal` existentes também entra no mesmo ponto de limpeza de encerramento.

```text
IDLE
  |
  | mouseDown succeeds
  v
HELD
  | mouseUp succeeds ----------------------> IDLE
  |
  | drag/input failure/helper stop/parent gone
  v
RELEASING
  | best-effort synthetic up for owned inputs
  v
TERMINAL
```

Restrições:

- O terminal shutdown fecha primeiro a nova admission do broker e só então chama a limpeza de entrada nativa;
- A limpeza só libera entradas já registradas pelo Helper e não trata nenhuma tecla física pressionada pelo usuário como estado do CUA;
- Depois do terminal latch, novos hold/down são recusados;
- Falha na limpeza precisa registrar diagnóstico anonimizado, e o Helper não pode reportar clean shutdown;
- Esta etapa não move as chamadas de UIA para um worker, para não misturar dois milestones independentes.

## 9. Veracidade das capacidades de screenshot e clipboard

Antes da implementação de WGC e do clipboard nativo:

- `screenCaptureStatus()` do Windows retorna `unknown` e não pode retornar `granted`;
- `captureScreenPng` / `captureWindowPng` continuam retornando sem imagem, e a chamada de ferramenta final falha explicitamente;
- `get_app_state(include_screenshot=true)` pode retornar um state apenas de UIA, mas precisa deixar explícito que não há imagem;
- `read_clipboard` retorna explicitamente um erro de unavailable e não usa string vazia para representar um clipboard realmente vazio;
- `write_clipboard` retorna explicitamente um erro de unavailable e não pode fazer no-op devolvendo sucesso;
- Não adicionar PowerShell, `System.Drawing`, BitBlt ou fallback com comandos externos.

Esta etapa só corrige a declaração de capacidade e não implementa clipboard do Windows nem WGC.

## 10. Semântica de erros e retry

| Cenário | Resultado |
| --- | --- |
| Falta a ABI nativa de ponteiro | `not_authorized` |
| Target sem escopo de aplicativo | fail closed antes da action |
| Drag com identidade diferente ou incerta nas duas pontas | fail closed antes da action |
| Alvo não é o único PID em primeiro plano | `element_unavailable`, exigindo reativação e reobservação |
| Coordenada fora da área de trabalho virtual | `invalid_request` ou um permission error estável; sem input |
| `SendInput` retorna 0/escrita parcial | `permission_denied` |
| Drag falha depois do down | reenvia up e depois devolve falha |
| Broker desconecta depois de a action ser escrita | mantém `possibly_sent`, sem replay automático |
| Parada terminal do Helper | congela a admission, libera as entradas registradas e fecha o pipe |
| WGC/clipboard não implementados | unavailable explícito, sem pseudo-sucesso |

## 11. Estratégia de testes

A implementação segue TDD, escrevendo primeiro os testes que falham.

### 11.1 Testes unitários em TypeScript

- Cada ferramenta de ponteiro repassa ao broker o `app_ref` resolvido;
- Um `app_ref` explícito de topo nível sobrescreve o escopo do target;
- Drag na mesma aplicação passa, entre aplicações é recusado e com identidade ausente é recusado;
- O broker do Windows aplica o portão de PID de primeiro plano único em move/scroll/drag/down;
- O `mouse_up` do Windows limpa apenas por session holder e não exige PID de primeiro plano;
- A ausência da ABI nativa continua sendo `not_authorized`;
- A leitura/escrita de clipboard não volta a ser valor vazio/sucesso no-op;
- O status de captura de tela não volta a reportar granted indevidamente;
- O comportamento e os testes dos handlers existentes de macOS/Linux permanecem iguais.

### 11.2 Testes de código-fonte nativo/bindings

- O addon exporta as cinco ABIs de ponteiro;
- A fórmula da área de trabalho virtual usa `SM_*VIRTUALSCREEN` e `MOUSEEVENTF_VIRTUALDESK`;
- Coordenadas negativas, limites, valores fora dos limites e dimensão zero têm cobertura de teste por função pura;
- As quatro direções de scroll e `amount=0`;
- Liberação normal do drag e liberação em falha parcial;
- A limpeza terminal só libera as entradas rastreadas;
- Sessão não interativa e terminal latch continuam falhando de forma fechada.

### 11.3 Testes em máquina real no Windows

Usando a área de trabalho interativa local, sem iniciar nem se anexar a SSH/WSL/Docker/remote:

1. Compilar `ax_native.node` e `dist/windows-helper.js` a partir do código-fonte;
2. Iniciar o desktop de código-fonte e o plugin oficial do CUA;
3. Validar move, scroll vertical e horizontal, drag e down/up em uma janela de teste claramente em primeiro plano;
4. Depois de trocar para outro aplicativo em primeiro plano, repetir a requisição scoped antiga e confirmar que ela é recusada sem mover/rolar/pressionar;
5. Parar o Helper depois do down e confirmar que o mouse não fica pressionado;
6. Validar a posição absoluta com um monitor secundário de coordenadas negativas; se a máquina atual não tiver essa topologia, manter o teste automatizado da fórmula e registrar explicitamente o item de máquina real pendente;
7. Confirmar que não há órfãos de Helper/plugin-host/pipe.

Este milestone não depende de provider/model para ser concluído; o aceite dirigido por modelo entra como evidência adicional quando houver provider disponível e não pode substituir a verificação em máquina real com o official plugin.

## 12. Verificação obrigatória

`zcode-cua`:

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm rebuild:native
pnpm build
```

`z-code`:

```powershell
pnpm typecheck
pnpm lint
pnpm exec vitest run packages/services/test/cua
pnpm test:unit:affected
```

Se `pnpm test:unit:affected` ainda tiver falhas de baseline conhecidas do Windows sem relação com o CUA, é preciso preservar o exit code completo, o conjunto de falhas e a comparação com o baseline limpo; não se pode passar um verde focado como se fosse aprovação total.

## 13. Milestones seguintes

Depois de concluir esta etapa, seguir nesta ordem, mantendo a mesma arquitetura de Helper/broker:

1. Worker MTA de UIA, deadline, cancelamento e isolamento de travamento;
2. Windows Graphics Capture, revisão de window/screenshot e coordenadas de `state_image`;
3. Clipboard nativo;
4. Matriz em máquina real de chinês, emoji, teclas de combinação, DPI misto e múltiplas telas;
5. Fechamento de produto: SEA/addon pré-compilado/assinatura/instalação/atualização.

Enquanto esses itens seguintes não forem verificados, não se pode afirmar que o Windows CUA atingiu um estado completo de lançamento de produto.