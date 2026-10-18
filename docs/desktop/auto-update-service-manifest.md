# Atualização automática do desktop via manifest do servidor

## Contexto

A versão antiga do desktop deixava o `electron-updater` ler diretamente o `latest*.yml` do CDN. Essa forma serve para publicação estática e integral, mas não serve para rollout por dispositivo, para distinguir stable / preview nem para promover preview em stable no servidor. O novo cliente passa a consultar primeiro a interface de manifest do servidor ZCode e entrega ao `electron-updater` o conteúdo `latest.yml` devolvido pelo servidor, no mesmo formato, para que ele execute o download, a verificação e a instalação.

O CDN continua guardando o pacote de instalação, o blockmap e o arquivo de manifesto de atualização, mas esses arquivos passam apenas a entrar em diretórios versionados e não são mais sobrescritos globalmente pelo CI no feed stable. O manifest do servidor escolhe a versão conforme o estado stable / preview na release API e entrega URLs absolutas de CDN apontando para o diretório versionado da plataforma.

## Interface de manifest

Ao verificar atualizações o cliente requisita:

```text
GET /api/v1/releases/electron/manifest
```

O cliente passa os parâmetros de escolha da atualização tanto por query quanto por header:

| query | header | Valores |
| --- | --- | --- |
| `platform` | `X-Platform` | Nome da plataforma de publicação, como `darwin-aarch64`; o servidor também aceita nomes de plataforma no estilo Node, como `win32-x64` |
| `channel` | `X-Release-Channel` | Canal padrão `1`; canal antecipado/preview `3` |
| `device_mid` | `X-Device-Mid` | ID de dispositivo uuidv4 reutilizado pela telemetria do desktop |

O corpo da resposta mantém o formato `latest*.yml` gerado pelo electron-builder, por exemplo:

```yaml
version: 3.4.0
files:
  - url: https://cdn.example.com/zcode/electron/releases/3.4.0/macos-arm64/ZCode-3.4.0-mac-arm64.zip
    sha512: ...
    size: 123456
path: https://cdn.example.com/zcode/electron/releases/3.4.0/macos-arm64/ZCode-3.4.0-mac-arm64.zip
sha512: ...
releaseDate: "2026-07-09T00:00:00.000Z"
```

Para a URL do arquivo baixado, o servidor deve entregar uma URL absoluta de CDN. Se o servidor entregar um caminho relativo, o cliente usa a origin do endpoint como base URL de fallback; portanto, a resposta de produção não deve depender do diretório do feed CDN antigo como base implícita.

Os artefatos de publicação do Electron ficam em diretórios versionados no OSS, sempre segmentados por plataforma e arquitetura:

```text
<path-prefix>/<version>/macos-arm64/
<path-prefix>/<version>/macos-x64/
<path-prefix>/<version>/windows-x64/
<path-prefix>/<version>/windows-arm64/
<path-prefix>/<version>/linux-x64/
<path-prefix>/<version>/linux-arm64/
```

Dentro do diretório versionado da plataforma usa-se uniformemente um `latest.yml` que contém `releaseNotesByLocale`, e o pacote de instalação e o `.blockmap` são enviados junto com a plataforma/arquitetura correspondente. O `manifest-*.json` de remote continua na raiz `<path-prefix>/<version>/`, e `components/...` continua no diretório entre versões, para evitar mudanças desnecessárias nas URLs de assets do runtime remote. O CI atual não gera mais cópias do manifesto de atualização por locale ou do feed generic para clientes antigos.

## Canais de publicação

- stable: voltado a usuários finais. Na fase integral do CI, depois que o estado na release API é definido como `status=1`, o manifest do servidor devolve essa versão para stable.
- preview: voltado a usuários que ligaram ativamente as atualizações de preview. Na fase de rollout do CI, depois que o estado na release API é definido como `status=3`, o servidor decide, pela estratégia de rollout por `device_mid`, se o manifest de preview devolve essa versão.
- preview pode ser marcado/promovido a stable pelo servidor. Depois da promoção não é preciso reenviar o pacote de instalação: o manifest stable devolve o mesmo conjunto de artefatos de CDN.

O cliente só passa channel e device_mid; a proporção de rollout e o julgamento de promoção de canal não são implementados localmente.

## Duas fases no CI

A esteira de publicação é dividida em duas fases explícitas:

1. Fase de rollout: reaproveita o upload existente do pacote de instalação, o pré-aquecimento do CDN e os artefatos de release metadata, enviando `status=3` na chamada à release API. Esta fase não sobrescreve o `latest*.yml` do feed stable do CDN.
2. Fase integral: após disparo manual ou por regra, reaproveita o mesmo lote de release metadata, enviando `status=1` na chamada à release API. A fase integral não envia mais o feed stable do CDN; o manifest do servidor devolve diretamente os arquivos do mesmo lote de diretórios versionados por plataforma.

O upload do pacote, do blockmap e do `latest*.yml`, bem como o pré-aquecimento do CDN, acontecem só para os diretórios versionados por plataforma. A visibilidade de stable / preview é controlada pelo estado na release API e pelo manifest do servidor; o CI não expressa mais o estado de publicação sobrescrevendo o feed do CDN.

## Máquina de estados do cliente

A nova interação separa "descobrir a atualização" de "baixar a atualização":

```text
idle -> checking -> update-available -> download-progress -> update-downloaded
```

- `update-available`: apenas mostra a entrada de atualização, sem baixar automaticamente. O menu e o botão da barra de título mostram que há uma nova versão. A entrada de texto da barra de título no canto superior esquerdo usa o nível de badge de `font-medium text-ui-xs`; o botão usa altura mínima em vez de altura fixa, e a largura no estado expandido é determinada naturalmente pelo texto curto localizado; depois de ajustar o tamanho de fonte da UI o texto não pode ser cortado, no tamanho padrão continua sendo uma cápsula compacta, e a entrada de ícone do estado de download continua visível.
- Depois que o usuário clica na entrada de atualização, abre-se uma janela de atualização independente. Essa janela hospeda apenas a UI de atualização e não inicia Local/Remote Host nem Agent runtime de workspaceKey; dentro dela continuam sendo reutilizados o conteúdo e o controlador de estado do antigo diálogo de atualização, garantindo que todos os botões, textos, barras de progresso e a lógica de cache de release notes antes, durante e depois do download sejam estritamente iguais aos do Dialog original. A entrada da interface principal serve apenas para mostrar o estado atual da atualização e abrir a janela independente; só quando o ambiente não tem IPC de janela de desktop é que há fallback para o Dialog embutido.
- O conteúdo da janela de atualização usa uma estrutura em três trechos — área de título, progresso do download e área de ações — com largura compacta e um pouco estreita e `16px` de padding lateral; a área de título usa um layout flex horizontal de `logo | título + data de publicação`, reaproveitando à esquerda o ícone de produto `public/icon_512@2x.png`, exatamente a mesma origem do Dock do macOS, fixado em `56px` (`size-14`), e à direita o título e a data de publicação como um grupo de informação vertical centralizado em relação ao logo; o ícone de produto preserva o arredondamento, o respiro transparente e a proporção da imagem original, sem recorte, escala, borda ou sombra extras, e também funciona como imagem decorativa que não é lida pelo leitor de tela; a janela não exibe badge de canal stable / preview, evitando que o usuário perceba o canal atual da atualização no diálogo; a data de publicação fica abaixo da linha do título e mostra apenas a data formatada; o dado Markdown do changelog continua podendo ser usado em outras exibições, como o hover da entrada, mas a janela não expande mais o corpo, o título, o controle de recolhimento ou o cartão de fundo das release notes. O visual da janela usa apenas tokens neutros de surface / border / foreground, sem introduzir cor de sucesso, cor de marca ou fundo de accent; os botões dentro da janela usam apenas texto, e a entrada de fechamento mantém "Mais tarde" na parte inferior; a entrada de atualização no canto superior esquerdo da interface principal mantém o bloco verde de success original, tratado à parte do visual neutro da janela.
- A janela de atualização é renderizada por fases explícitas, sem dedução por combinação de vários booleanos:
  - Antes do download (`update-available`): exibe a data de publicação e não exibe badge de canal; na parte inferior mostra "Ignorar esta versão", "Mais tarde" e "Baixar atualização".
  - Durante o download (`download-progress`): esconde "Ignorar esta versão" e "Mais tarde" e mostra apenas o progresso e "Cancelar download"; a área de progresso ganha mais `8px` de margem esquerda dentro do padding principal do diálogo; à direita da barra de progresso mostra-se preferencialmente o tamanho baixado/total, no formato `1.0MB / 10.0MB`, mantendo uma casa decimal; quando o dado de bytes está ausente, o texto à direita não é exibido, evitando sobras de uma métrica de porcentagem como `0%`; a entrada de atualização da interface principal mostra um loading spinner e nenhum texto. `download-progress.version` é um campo opcional do protocolo, e o renderer precisa identificar o estado de download por `kind`: mesmo que um quadro esteja sem o número da versão, a entrada de atualização e o diálogo já aberto devem ser mantidos, sem desmontar o componente nem fechar o diálogo. Depois que o usuário clica em "Baixar atualização", o renderer precisa entrar primeiro localmente na exibição downloading de "download solicitado"; o retorno do IPC de `downloadUpdate()` significa apenas que o comando foi recebido pelo lado main, e não que o estado de download já começou. Se em seguida chegar brevemente um estado de transição sem versão como `checking` / `idle`, o renderer precisa reutilizar o modelo de atualização visível do quadro anterior para manter o diálogo até o fechamento em `download-progress` / `update-downloaded`. Se o download não conseguir iniciar no lado main, a convergência da falha precisa voltar a `update-available`, deixando a falha visível e permitindo nova tentativa, e não pode simplesmente transmitir `idle` fazendo a entrada principal e o diálogo desaparecerem juntos.
  - Depois do download (`update-downloaded` / legacy `UpdateReady` ready): exibe a data de publicação e não exibe badge de canal; na parte inferior mostra "Mais tarde" e "Reiniciar para atualizar", sem "Ignorar esta versão".
- A entrada de atualização e a janela independente no renderer devem primeiro passar o `UpdateStatePayload` por um modelo de estado puro para virar view model, e só então renderizar a UI. O modelo de estado produz uniformemente `phase`, `displayVersion`, `progressValue`, `progressLabel`, `skippableVersion`, `updateChannel` e a determinação de conclusão da ação; os componentes cuidam apenas de ação do usuário, gravação de configuração e renderização. Os limites de hábito do usuário precisam ficar concentrados no modelo de estado: o estado de download é julgado por `kind` e não por `version`; durante o download a janela não fecha sozinha; só os estados normais idle/checking/error permitem desmontar a entrada de atualização; a ação de download libera o bloqueio do botão ao entrar no próximo estado, e cancelar/pular libera o bloqueio ao sair do estado de download.
- No início da execução do renderer coexistem um snapshot único `getUpdateState()` e o evento contínuo `onUpdateStateChanged`. O resultado do snapshot pode chegar depois do retorno do evento, então é preciso usar a revision para impedir que um snapshot antigo sobrescreva um evento novo; em especial, não se pode deixar um `idle` antigo sobrescrever um `update-available` / `download-progress` já recebido, sob pena de o botão de atualização da home desaparecer.
- Antes do download o usuário pode clicar em "Ignorar esta versão". A versão ignorada é persistida por canal; uma versão maior no mesmo canal voltará a ser sugerida. Depois que o download começa o diálogo esconde "Ignorar esta versão"; quem não quiser continuar deve usar "Cancelar download"; cancelar o download não equivale a pular a versão.
- Só depois que o usuário clica em "Baixar atualização" é que se chama `downloadUpdate()`, entrando em `download-progress` e mostrando a barra de progresso; a entrada de atualização no canto superior esquerdo da interface principal volta ao estilo de loading, indicando continuamente que o download está em curso, e o spinner do estado de download precisa ser visível tanto no botão estreito quanto no estado de texto expandido.
- Durante o download o usuário pode clicar em "Cancelar download". O cliente interrompe a transferência atual pelo cancellation token do `electron-updater`, limpa o estado de download e volta a `update-available`, preservando os mesmos version / channel / release notes, para que o usuário possa tentar de novo mais tarde ou fechar o diálogo; cancelar o download não equivale a pular a versão.
- Depois de concluído o download entra-se em `update-downloaded`. Se não houver verificação em voo, consulta-se o manifest mais uma vez de imediato; se já houver uma verificação em voo, entrega-se a ela um polling curto de 2 minutos. Se o download falhar, volta-se a `update-available` e consulta-se de novo; se a falha ocorrer antes de a verificação atual fechar, espera-se o fechamento e só então consulta-se. A atualização forçada só reporta o erro e não reconfirma. Quando o usuário clica em "Reiniciar para atualizar", o `quitAndInstall()` só é chamado se o pacote ready continuar com a versão igual ao alvo atual; se o alvo já for maior, o pacote antigo não é instalado.
- Depois da verificação inicial, quando não há atualização visível a checagem é refeita a cada 15 minutos; enquanto `update-available` ou `update-downloaded` continuam sendo exibidos, a checagem é refeita a cada 2 minutos. Se a checagem encontra uma versão maior, o alvo atual é substituído e a entrada já exibida não muda para `checking`. O item de menu "Verificar atualizações" também faz nova requisição ao encontrar o estado, sem reproduzir o alvo antigo.
- Se o usuário reiniciar o aplicativo com o download concluído e ainda não instalado, o processo main, durante o hydrate de inicialização, restaura `update-downloaded` com as release notes pending persistidas; isso só acontece quando a versão pending é maior que o `app.getVersion()` atual, evitando que um pacote já em cache mostre de novo "Baixar atualização". Somente depois que a versão pending for de fato igual à versão atual do aplicativo é que ela é sincronizada ao renderer como release notes pós-instalação.
- O gate de atualização forçada ainda pode reutilizar o mesmo atualizador, mas em `update-available` ele inicia o download imediatamente, preservando a semântica de bloqueio da atualização.

O evento antigo `UpdateReady` é preservado, para compatibilidade com a sincronização do estado já baixado; a nova UI assina principalmente o estado contínuo `UpdateStateChanged`.

## Configurações

`AppSettings` ganha:

```ts
receivePreviewUpdates?: boolean;
skippedElectronUpdateVersions?: Partial<Record<"stable" | "preview", string>>;
```

- `receivePreviewUpdates` tem padrão `false` e afeta apenas a verificação de atualização automática do desktop; Web e controle remoto do celular não leem essa configuração.
- Depois que a página de configurações alterna `receivePreviewUpdates`, o renderer notifica o processo main imediatamente via `syncAppSettings`. Se o main estiver num estado trocável como `update-available` / `idle` / `checking`, ele limpa a versão disponível do canal antigo e requisita o manifest do servidor de novo; por exemplo, se o preview `3.3.3` já estava sendo sugerido e a chave for desligada, deve buscar de novo `channel=stable` e exibir o stable `3.3.2`. Durante o download ou com o pacote baixado aguardando instalação, o fluxo de instalação atual não é interrompido.
- `skippedElectronUpdateVersions` é mantido pelo processo main, e o renderer só pede via IPC para pular a versão atual, evitando que a UI escreva diretamente a semântica de canal.

## Compatibilidade e migração

- Se um pacote antigo ainda verificar atualizações pelo `app-update.yml` embutido no pacote contra o feed stable do CDN, esse feed não é mais atualizado automaticamente pela fase integral do CI atual. Para compatibilizar pacotes antigos, isso deve ficar por conta da estratégia de migração do manifest no servidor, de uma ação de publicação de emergência separada ou do processo operacional do feed antigo, evitando vincular de novo o estado da nova release a uma sobrescrita de feed estático pelo CI.
- O pacote novo usa por padrão o provider de manifest do servidor; `ZCODE_UPDATE_FEED_URL` permanece como entrada de diagnóstico/emergência, e o valor deve ser a URL completa da interface de manifest. Mesmo quando configurado explicitamente, ele continua passando pelo provider de manifest do servidor, e o cliente sobrescreve os query params `platform` / `device_mid` / `channel` e os headers correspondentes, sem voltar ao feed generic antigo.
- Release notes pós-update, o estado baixado aguardando instalação e a lógica de liberação de recursos antes da instalação no Windows continuam usando a implementação atual.
- A saída do processo do `quitAndInstall()` até o NSIS, o atalho e o limite de lançamento da página de conclusão no Windows estão em
  `docs/desktop/windows-update-install-handoff.md`.

## Início para depuração local

Ao testar localmente a atualização automática via manifest do servidor, confirme primeiro que a interface de manifest do serviço de publicação está acessível, por exemplo:

```bash
curl "http://intranet.example.invalid:3011/api/v1/releases/electron/manifest?platform=darwin-aarch64&channel=stable&device_mid=00000000-0000-4000-8000-000000000000"
```

Depois inicie o desktop na raiz do repositório. `ZCODE_UPDATE_FEED_URL` deve receber a URL completa da interface de manifest, e o cliente sobrescreve na requisição os query params `platform`, `channel`, `device_mid` e os headers correspondentes; `ZCODE_AUTO_UPDATE_DEV=1` serve para abrir a cadeia de atualização dentro do Electron de dev, e `ZCODE_AUTO_UPDATE_DEV_VERSION` serve para rebaixar a versão local do aplicativo abaixo da versão do servidor, facilitando disparar a "descoberta de atualização":

```bash
ZCODE_UPDATE_FEED_URL="http://intranet.example.invalid:3011/api/v1/releases/electron/manifest" \
ZCODE_AUTO_UPDATE_DEV=1 \
ZCODE_AUTO_UPDATE_DEV_VERSION=3.3.3 \
pnpm dev:desktop:prod
```

Para testar o canal preview, basta ligar "atualizações antecipadas/preview" na página de configurações e verificar atualizações de novo; não fixe o channel dentro de `ZCODE_UPDATE_FEED_URL`, senão fica fácil ficar inconsistente com o estado de configuração do renderer.

## Requisitos de verificação

- Testes unitários cobrindo os parâmetros de requisição do manifest provider, a escolha de canal stable/preview, pular versão, descobrir sem baixar, baixar depois do clique e a atualização forçada continuar baixando automaticamente.
- Testes de configuração do CI cobrindo os dois jobs, rollout `status=3` e integral `status=1`, e testes do script de upload cobrindo os diretórios versionados por plataforma/arquitetura e o fato de o feed stable não ser mais enviado.
- É obrigatório executar `pnpm typecheck` e `pnpm lint`.
- Se não for possível concluir a verificação de upgrade do instalador real no ambiente atual, liste na descrição do commit os itens de verificação de upgrade do pacote empacotado que ficaram pendentes.