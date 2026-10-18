# Release Notes no Hover do Botão de Atualização

## Contexto

Depois que o download da atualização automática do desktop termina, o botão de atualização no canto
superior esquerdo oferece apenas a entrada "atualização instalável". A cadeia de publicação já
injeta o changelog de versão única no `releaseNotes` do update feed, mas o renderer atualmente não
exibe esse conteúdo quando o usuário passa o mouse sobre o botão.

## Objetivo

- Exibir o changelog da versão que está sendo baixada ou que está pronta para instalação ao passar
  o mouse sobre o botão de atualização.
- O conteúdo acompanha o idioma da interface: `zh-CN` prioriza o changelog em chinês e `en-US`
  prioriza o changelog em inglês.
- Não alterar o fluxo principal de verificação automática, download e instalação da atualização.
- Não adicionar requisições de rede no hover, evitando que o estado do update feed/CDN afete a
  responsividade da UI.

## Design

Ao coletar os artefatos do desktop, a CI continua mantendo os campos `releaseName` /
`releaseNotes` compatíveis com o electron-updater e, ao mesmo tempo, acrescenta `releaseNotesByLocale`
ao update YAML. Esse campo contém título e Markdown de `zh-CN` e `en-US`, para que clientes das
novas versões leiam diretamente do payload do evento `update-downloaded`.

O processo principal já normaliza as release notes multilíngues em
`PostUpdateReleaseNotesPayload.releaseNotesByLocale` no momento de `update-available` e as transmite
ao renderer junto dos estados `update-available` / `download-progress`; após o download, continua
transmitindo-as junto do estado `update-downloaded` e as persiste para o uso no pop-up pós-
instalação. O evento antigo `onUpdateReady(version)` permanece apenas por compatibilidade; a
exibição do conteúdo detalhado no botão segue `UpdateStatePayload.releaseNotes`.

O processo principal usa como conteúdo de `zh-CN` o manifest atualmente lido pelo electron-updater;
quando for necessário completar a descrição em inglês, ele busca novamente pela mesma interface de
manifest do servidor e mescla como conteúdo de `en-US`. Essa requisição complementar reaproveita os
parâmetros de consulta `platform` / `device_mid` / `channel` e os headers `X-Platform` /
`X-Release-Channel` / `X-Device-Mid`. Essa leitura complementar afeta apenas o payload de release
notes e não participa da decisão de versão, da resolução da URL de download nem da validação do
pacote de instalação, evitando alterar o fluxo principal da atualização automática.

A camada de UI reaproveita a capacidade de tooltip e de renderização Markdown já existente: sem
release notes, mantém o tooltip curto original; com release notes, ao passar o mouse sobre o botão
de download em andamento ou sobre o botão de atualização, exibe um popover compacto cujo título
mostra sempre `v{version} 更新日志` / `v{version} Release Notes` no idioma atual; abaixo do título
mostra apenas a data `releaseDate` do feed formatada no idioma atual, sem adicionar o prefixo
"更新日期" ou "Release date"; e o corpo renderiza o Markdown correspondente. Se o idioma atual não
tiver conteúdo correspondente, ocorre fallback para o Markdown padrão do payload. O texto curto
visível do botão, o aria label, o pop-up de confirmação e o aviso de download em andamento passam
todos por i18n.

## Verificação

- O teste de injeção do YAML cobre `releaseNotesByLocale`.
- Os testes de atualização automática do processo principal cobrem os estados `update-available`,
  `download-progress` e `update-downloaded` carregando release notes.
- Os testes unitários de UI cobrem o tooltip de hover escolhendo o Markdown em chinês ou em inglês
  conforme o locale atual.
- Os testes do processo principal cobrem a mesclagem do feed padrão com o feed sibling em inglês e a
  sua transmissão ao renderer junto com o estado.