# Correção de clique-atravessamento na camada hospedeira de páginas de plugin

## Causa e regra

Após o timeout do handshake, o webview já foi removido, mas o contêiner hospedeiro da barra lateral ainda mantém a área de sobreposição e `pointer-events: auto`; um contêiner vazio bloqueia o botão de recarregamento do host.

A camada hospedeira compartilhada de páginas é responsável apenas pelo posicionamento e sempre usa `pointer-events: none`; o webview dentro dela usa explicitamente `pointer-events: auto`. Nenhum estado de ciclo de vida, timer ou ramo de erro novo é adicionado.

```text
Com webview: mouse → webview → conteúdo do plugin
Sem webview: mouse atravessa o contêiner vazio → botão de recarregamento do host
```

Como MCP Apps e Gen UI compartilham essa camada hospedeira, as prévias inline, da barra lateral e em popover seguem a mesma regra de clique. A migração de âncoras existente, a limpeza de instâncias, o prazo do handshake e o fluxo de recarregamento permanecem inalterados.

## Limites de exibição da barra lateral mantida viva

A página do plugin é pendurada em uma camada flutuante independente sob o body e não pode herdar a opacidade, o recorte ou o estado de página oculta dos ancestrais da barra lateral do host. Quando recolhida, ela trava a largura e, ao trocar de aba, mantém o DOM, de modo que a âncora continua conectada e tem tamanho; não é possível decidir pela simples interseção geométrica se a exibição deve ocorrer.

A única fonte do estado de exibição é o host: workspace visível, chat na vista principal, barra lateral expandida e aba atual precisam valer simultaneamente. `WorkspaceShellLayout` projeta a visibilidade da página, `AnimatedSidePanePanel` combina a aba atual, e o valor percorre `PluginUiSidePane` → model → view → card. O card desvincula a âncora oculta de forma síncrona no layout effect, sem esperar animação ou callback de observer, e sem remover a tab nem o owner da instância.

```text
workspace visível ∧ página de chat ∧ barra lateral expandida ∧ aba atual → vincular a âncora de exibição
Qualquer condição fechada → desvinculação síncrona → superfície de fundo inert → o mesmo guest continua em execução
Condições restauradas → vincular de novo → o mesmo guest e o estado de edição em memória são exibidos novamente
```

A superfície de fundo com tamanho não zero depois de oculta segue o [contrato de execução em segundo plano](plugin-ui-background-execution.md): a página MCP não é pausada nem recolhida por estar oculta, e não se exige que o plugin reporte estado privado. A reexibição não repete o handshake.

## Verificação

- Em um Electron real, disparar o timeout de handshake de 15 segundos com uma página de teste cuja inicialização falha, esperar a remoção do webview e então clicar com o mouse no botão de recarregamento do host; deve disparar o callback uma única vez e recriar uma instância em execução.
- Para páginas normais, o teste de hit-testing do host deve cair no webview; confirmar com eventos de mouse e teclado do Chromium que os botões e campos do plugin são operáveis.
- Após alternar entre as prévias inline, da barra lateral e em popover, a interação continua funcionando, mantendo o mesmo guest.
- Em um Electron real, recolher a barra lateral com o mouse, trocar de aba, sair da página de chat e trocar de workspace. Mantendo o DOM real do card, afirmar que a superfície de fundo não é atingida pelo hit test, está inert e a página não está mais visível; o trabalho em segundo plano continua sendo concluído, o estado de edição e a identidade do guest são preservados, e a interação é restaurada sem novos registros. Cobrir os temas claro e escuro.
- Uma barra lateral inicialmente oculta não vincula âncora; o estado de página oculta é repassado à barra lateral tanto no shell de desktop quanto no de celular. O fallback de capacidades de Web/remote continua sendo verificado.
- Não usar DOM `.click()` no lugar do teste de hit-testing com mouse. A página de falha é um fixture controlado e não representa o fato de que o problema de inicialização dos plugins originais dos usuários tenha sido resolvido.
- Nenhuma mudança de layout, tema, textos ou capacidades de plataforma; o fallback de não suporte em Web/móvel/remoto permanece como está, e a semântica das mensagens continuous/replayable não é modificada. As evidências de runtime valem para a plataforma efetivamente executada.

Entrada de regressão: `node packages/desktop/scripts/mcp-apps-host-e2e.mjs --managed-only` (recarregamento por timeout e ciclo de vida) e `--storage-only` (interação do guest real em inline, barra lateral e prévia).