# Política de Rede de Assets Remotos

Política de rede atual do Desktop para downloads de release do Source Server. O layout de runtime,
a instalação, o handshake e a propriedade são definidos na
[especificação R3](../architecture/r3-source-server-remote-architecture.md) e na
[especificação Server CLI/daemon](../architecture/r2-server-cli-and-daemon.md).
O processo antigo do Remote Host, o layout de arquivos soltos e a transação `deployServer` não são
o caminho R3.

### Política de rede do lado desktop

Todas as requisições HTTP(S) emitidas pelo Desktop Window Host ao resolver assets remotos precisam
usar o mesmo transporte de rede imutável do Host que as requisições de API gerenciadas pelo App. As
requisições R3 são o descritor de release e o arquivo completo do Source Server. O adaptador legado
retido também usa esta porta para metadados de componente e requisições `HEAD` opcionais de
progresso.

- `AppSettings.httpProxy`, `httpProxyNoProxy` e `httpProxyCaCertPath` permanecem como a única
  autoridade do Desktop para esse transporte. Variáveis de proxy e CA do shell ambiente não são uma
  fonte implícita.
- Uma falha explícita de proxy ou de CA é fail-closed para requisições obrigatórias de manifesto e
  de componente; elas não devem tentar novamente por `globalThis.fetch`. O `HEAD` opcional de
  progresso do download remoto mantém seu comportamento de falha best-effort atual, mas não pode
  recorrer a uma requisição direta.
- Requisições de assets remotos reutilizam o snapshot de ciclo de vida e o pool de dispatchers
  pertencentes à coleção de serviços locais base do Window Host. Elas não podem criar uma fonte
  extra de política de proxy específica para download nem um pool de dispatchers extra; as coleções
  de serviços remotos anexados ao desktop existentes mantêm sua propriedade de transporte de API
  inalterada.
- Chamadores de servidor standalone que não recebem o transporte pertencente ao Desktop mantêm seu
  comportamento direto atual.
- No modo `remote-download`, apenas as requisições de manifesto e de metadados de progresso do lado
  desktop usam essa política. O arquivo de componente em si continua sendo baixado pelo `curl` ou
  `wget` da máquina remota e, portanto, segue a configuração de rede da máquina remota.

```text
setting.json
  httpProxy / noProxy / CA
            |
            v
Window Host base-service network transport (lifecycle snapshot)
       |                         |
       v                         v
NodeApiClient             RemoteAssetNetworkPort
                              |        |
                              v        v
                         manifest   archive / HEAD
                              |
                              v
                    local cache -> SSH upload
```

### Downloads de release do Source Server no R3 (B-04)

A mesma política de rede do Desktop se aplica a `source-server-release.json` e ao arquivo do Source
Server. Os callbacks de resolução de conexão e de management/update devem passar ambos pela
`RemoteAssetNetworkPort` já existente do Window Host; requisições de descritor e de arquivo não podem
contorná-la pelo fetch global. Arquivos locais preparados mantêm seu caminho de verificação
existente. No modo `remote-download` o Desktop busca apenas o descritor; o download remoto do
arquivo mantém sua política de rede remota. Nenhum comportamento de dispatcher global, protocolo de
task, identidade de workspace ou entrega `continuous`/`replayable` muda.

Verificação: um teste de resolução isolado proíbe o fetch global e observa ambas as requisições
pela porta injetada. `SSH-P0-CONN-04` usa um alvo remoto limpo, um Desktop frio com configurações
de proxy explícitas, um cache local vazio e um hostname de CDN disponível apenas através do proxy
local ao caso. Ele afirma as requisições de descritor e de arquivo, o SHA correspondente do arquivo
remoto, a conexão bem-sucedida e um único Window Host. Falha de proxy deve falhar sem recorrer a
requisição direta.

### Contrato de falha do instalador de componentes retido

O `RemoteDownloadAssetInstaller` retido deve parar na primeira etapa falha de preparação em
foreground, download, checksum, extração ou publicação de cache. Sua transação de shell executa
comandos sequenciais sob `set -eu`; comandos compostos de progresso e de limpeza não podem quebrar
uma cadeia `&&` e transformar falha em sucesso. A limpeza remove apenas a preparação e o lock
desta transação, preserva o status de falha e o diagnóstico, e não deve publicar `.ready` para um
componente que falhou. `installFile`/`installDirectory` devem rejeitar antes de copiar daquele
componente que falhou. Uma tentativa subsequente precisa conseguir baixar e instalar esse
componente.

```text
download / checksum / extraction fails
  -> transaction exits nonzero -> owner cleanup
  -> installer rejects with original diagnostic -> no component copy
```

A cobertura de regressão executa o script real gerado pelo instalador em um shell POSIX, com
resultados de downloader controlados, e verifica rejeição, limpeza, retentativa e instalação com
sucesso. Este contrato não altera o fluxo de conexão R3 do Desktop: o R3 executa o download do
arquivo separadamente e já verifica o status de saída daquele comando antes da instalação. Seu
construtor compartilhado de comandos de download, o modo local-upload e a política de compatibilidade
de plataforma permanecem inalterados.

## Referência histórica de implantação

O layout, a serialização e a investigação de rollback anteriores ao R3 permanecem disponíveis no
snapshot fixo do documento:

```bash
git show a17a875588b8d66c2bee49236292e174df651363:docs/remote/zcode-agent-remote-deployment.md
```

O código legado retido está sujeito ao limite de remoção/rollback do R3; este documento não autoriza
a exclusão dele.
