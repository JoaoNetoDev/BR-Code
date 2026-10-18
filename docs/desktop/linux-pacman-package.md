# Pacote pacman do Linux Arch

## Objetivo

Construir pacotes de instalação nativos adicionais do Arch Linux no formato `.pkg.tar.zst` para Linux x64/arm64, reaproveitando o conteúdo de app existente do Electron Builder; o AppImage continua sendo o produto principal de atualização automática no Linux, e deb/rpm permanecem inalterados.

## Limites

- Nesta fase não são publicadas receitas de origem PKGBUILD/AUR; o `.pkg.tar.zst` é gerado diretamente pelo Electron Builder.
- Não alterar o runtime do aplicativo, o protocolo, o Agent, o controle remoto ou o protocolo de atualização automática.
- O pacote pacman é um produto de distribuição para download/instalação, não o artefato principal de atualização do `latest.yml`.

## Cadeia de build e publicação

```text
CI Linux x64/arm64
        |
        v
electron-builder
  |       |       |       |
AppImage deb     rpm     pacman (.pkg.tar.zst)
  |       |       |       |
  +-------+-------+-------+--> coleta de artefatos -> upload -> validação de release
        |
        +--> caminho principal do latest.yml permanece AppImage
```

## Contrato do pacote

- O nome de arquivo segue a convenção existente: `ZCode-<version>-linux-<arch>.pkg.tar.zst`.
- O package name usa o mesmo nome de isolamento de flavor que deb/rpm, evitando que Preview e Production se sobrescrevam.
- As dependências do pacote pacman são geradas a partir da lista de dependências de runtime dos repositórios oficiais do Arch na configuração (gtk3, nss, libxss, libxtst, libnotify, alsa-lib, mesa, xdg-utils); está planejado executar smoke test de instalação, inicialização e desinstalação em Arch x64/arm64.
- O `.pkg.tar.zst` entra no manifesto de artefatos do CI, no upload do OSS e nos metadados de release, mas não substitui o caminho de atualização do AppImage.

## Contrato de atualização automática do cliente (revisão de 2026-09-16)

ZCT-2100231841920471040: ao baixar 3.12.2 na forma de instalação deb do Ubuntu a partir do 3.12.1, o filtro antigo removia o deb e deixava apenas o AppImage; o DebUpdater não encontrava o arquivo e lançava exceção ao ler `fileInfo.info`. A convenção antiga de que "apenas AppImage tem atualização automática no Linux" estava errada e é substituída aqui.

- macOS, Windows e todas as formas de instalação no Linux seguem o mesmo fluxo de download, verificação e instalação do electron-updater; no Linux não se remove mais deb/rpm/pacman de forma unificada.
- A instância atual do updater é a única fonte de verdade do tipo de instalação; o ManifestUpdateProvider apenas escolhe o produto do mesmo tipo para o updater do Linux, sem ler o package-type à parte e sem manter um segundo estado de plataforma. AppImageUpdater corresponde a `.AppImage`, DebUpdater a `.deb`, RpmUpdater a `.rpm` e PacmanUpdater a `.pkg.tar.zst` (compatível com `.pacman`).
- Quando o manifesto não tem o tipo de instalação atual, a falha é explícita na fronteira de parsing, proibindo que o fallback do updater escolha outro formato por engano. A falta de um pacote é uma publicação incompleta e não significa que aquela forma de instalação não suporta atualização.
- A URL tem o sufixo determinado pelo pathname, com suporte a endereços absolutos e relativos, query parameters e variações de maiúsculas/minúsculas; a URL real de download e o valor de verificação são preservados.
- O PacmanUpdater continua gerando o caminho de cache pelo sufixo antigo `.pacman`; o `info.url` de `.pkg.tar.zst` usa o nome de arquivo real, evitando juntar a URL completa ao caminho de cache; a URL de download de rede não muda.
- macOS/Windows mantêm a semântica original de parsing do manifesto, e o downloader fica responsável por escolher zip/exe; não mudam canal de atualização, temporização do download, permissões, comando de instalação, UI ou cadeia de controle remoto pelo celular.

```text
manifesto completo do servidor → a instância atual do updater decide o tipo de instalação → arquivo do mesmo tipo → download/verificação → instalador da plataforma
                                             └─ falta pacote do mesmo tipo: falha explícita, sem fallback entre formatos
```

Aceitação: os testes devem rodar a matriz de tipos de instalação do Linux em qualquer máquina de desenvolvimento, cobrindo manifesto misto, manifesto de tipo único, tipo ausente, URL absoluta/relativa, query, valor de verificação e caminho de cache do Pacman; regressão do comportamento de parsing original de macOS/Windows. Log de campo e testes com falha vêm antes da correção; não se permite afirmar apenas o filtro. A instalação real com elevação de privilégio ainda exige smoke verification do pacote de distribuição do sistema correspondente.

## Riscos e aceitação

- A coleta de artefatos, a limpeza de diretórios compartilhados, o glob do OSS e a validação de release precisam reconhecer o sufixo composto `.pkg.tar.zst`.
- Não incluir código-fonte, source maps, segredos ou credenciais de CI no pacote; manter a política atual de corte do app.asar.
- É preciso validar a arquitetura e as dependências do pacote pacman, o desktop entry, o registro do protocolo `zcode://` e a package identity ao coexistir com deb/rpm.