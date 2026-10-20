# A página de configurações não posiciona o foco no projeto em "Mostrar no painel lateral"

Status: ready-for-human

Baseline de negócio `d31e735905cf744e75a0a93548a80acabe871ae5`, patch de teste 07.
O `settings-safeguards` do lote `r3-server-20261011125749338-152f05` falhou depois de 153,1 segundos.

Um projeto SSH real já está conectado. Depois que o cartão de dispositivo da página de configurações retorna à tela principal por "Mais → Mostrar no painel lateral", o foco não é entregue ao projeto correspondente por 10 segundos seguidos. O teste já usa o `data-project-workspace-identity` atual para ler o projeto ao qual o foco pertence; a falha não vem de continuar procurando um seletor de teste antigo.

O `onShowInSidebar` de `SettingsPage.tsx` ainda consulta `[data-remote-project-identity]` e `dataset.remoteProjectIdentity` e então chama focus em `[role="button"]` dentro deles.
O `ProjectNode.tsx` atual emite `data-project-workspace-identity`, e o título do projeto é um button nativo com `data-testid="virtual-project-toggle"`. A consulta antiga não obtém a nova linha de projeto, de modo que a rolagem e o foco posteriores não são executados.

O [contrato de configurações do dispositivo](../../architecture/remote-device-connection-ux-spec.md) exige que esta operação posicione um projeto existente, sem depender do estado online do dispositivo. O posicionamento deve ser feito a partir do identificador atual da entrada de projeto e do controle focalizável. Nesta rodada não se altera a implementação de negócio, preservando o posicionamento e as asserções de foco do caso; a etapa posterior de remoção da confirmação, que vem depois desta falha, ainda não foi coberta.

Diretório de evidências: `packages/desktop/.e2e-artifacts/r3-server-20261011125749338-152f05-settings-safeguards/`.
