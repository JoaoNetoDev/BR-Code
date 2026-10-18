# MCP Platform Boundary

O gerenciamento nativo do diretório do usuário para MCP é uma capacidade de plataforma, não uma capacidade da camada de
UI. O pacote `packages/ui` pode renderizar e coordenar as configurações de MCP para desktop, web e mobile, mas não deve
chamar APIs de preload do Electron diretamente.

## Limite

- `packages/ui` depende de `IPlatformService` para as operações nativas de MCP.
- O desktop implementa os métodos de plataforma de MCP encaminhando para a ponte de preload existente.
- O `/remote` do mobile encaminha as requisições de plataforma de MCP pelo caminho já existente de app-payload de attachment do shared host até a janela do desktop que possui o host.
- Web simples, sem attachment de desktop, retorna fallbacks vazios/não suportados e não deve criar um runtime de Agent independente nem um host local.

## Métodos

A abstração de plataforma é dona destas operações:

- `loadMcpFromUserDirectory`
- `saveMcpToUserDirectory`
- `migrateLegacyCommonMcp`

Isso mantém o acesso a `window.zcode`, específico do Electron, dentro do código de bootstrap do renderer do desktop e
preserva o reuso da UI entre desktop, web e controle remoto mobile.

## Limite de runtime MCP 2026-07-28

- MCP clients comuns de stdio / Streamable HTTP usam por padrão o dual-era `auto`: tenta primeiro o `server/discover`
  moderno e só recorre a `initialize` diante de evidência legada específica do transport; a configuração legada explícita
  continua pulando a sondagem.
- O `node_repl` embutido usa fixamente o MCP `2026-07-28`; cada `js` usa um kernel de execução descartável, sem usar
  `Mcp-Session-Id` e sem adicionar handle de Browser context visível ao modelo.
- `_meta` é o contexto de requisição fornecido pelo client, não um fato de autorização; o host deve revalidar usando o
  token stdio/pipe privado, o session registry atual e o handle binding.
- Dentro do mesmo Agent runtime, o processo `node_repl` sem estado pode ser compartilhado por `workspaceKey`; servers de
  terceiros mantêm session isolation por padrão.
- O `/remote` do mobile apenas reaproveita o runtime de Agent/MCP já existente no attachment de shared host do desktop; o
  relay e o desktop main não guardam estado de tool/kernel de MCP nem estado de conversa.
- Os limites de entrega de mensagens do `desktop-continuous` (desktop) e do `web-remote-replayable` (mobile) não mudam por
  causa do compartilhamento de processo MCP.

O contrato completo está em `docs/mcp-stateless-node-repl.md`.
O contrato geral de negociação do client está em `docs/mcp-dual-era-version-negotiation.md`.