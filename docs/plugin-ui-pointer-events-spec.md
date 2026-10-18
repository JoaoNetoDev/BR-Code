# Correção de clique-atravessamento na camada hospedeira de páginas de plugin

## Causa e regra

Após o timeout do handshake, o webview já foi removido, mas o contêiner hospedeiro da barra lateral ainda mantém a área de sobreposição e `pointer-events: auto`; um contêiner vazio bloqueia o botão de recarregamento do host.

A camada hospedeira compartilhada de páginas é responsável apenas pelo posicionamento e sempre usa `pointer-events: none`; o webview dentro dela usa explicitamente `pointer-events: auto`. Nenhum estado de ciclo de vida, timer ou ramo de erro novo é adicionado.

```text
Com webview: mouse → webview → conteúdo do plugin
Sem webview: mouse atravessa o contêiner vazio → botão de recarregamento do host
```

A alteração envolve apenas os estilos de reset do contêiner e os estilos de criação do webview em `pluginUiPagePlane.ts`. Como MCP Apps e Gen UI compartilham essa camada hospedeira, as prévias inline, da barra lateral e em popover seguem a mesma regra. A migração de âncoras existente, a limpeza de instâncias, o prazo do handshake e o fluxo de recarregamento permanecem inalterados.

## Verificação

- Em um Electron real, disparar o timeout de handshake de 15 segundos com uma página de teste cuja inicialização falha, esperar a remoção do webview e então clicar com o mouse no botão de recarregamento do host; deve disparar o callback uma única vez e recriar uma instância em execução.
- Para páginas normais, o teste de hit-testing do host deve cair no webview; confirmar com eventos de mouse e teclado do Chromium que os botões e campos do plugin são operáveis.
- Após alternar entre as prévias inline, da barra lateral e em popover, a interação continua funcionando, mantendo o mesmo guest.
- Não usar DOM `.click()` no lugar do teste de hit-testing com mouse. A página de falha é um fixture controlado e não representa o fato de que o problema de inicialização dos plugins originais dos usuários tenha sido resolvido.
- Nenhuma mudança de layout, tema, textos ou capacidades de plataforma; o fallback de não suporte em Web/móvel/remoto permanece como está, e a semântica das mensagens continuous/replayable não é modificada. As evidências de runtime valem para a plataforma efetivamente executada.

Entrada de regressão: `node packages/desktop/scripts/mcp-apps-host-e2e.mjs --managed-only` (recarregamento por timeout e ciclo de vida) e `--storage-only` (interação do guest real em inline, barra lateral e prévia).