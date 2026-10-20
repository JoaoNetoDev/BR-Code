# Comando Bootstrap

`pnpm bootstrap` é a entrada padrão de inicialização local. Ele primeiro obtém o submodule `apps/zcode-cli`, depois instala as dependências, prepara os recursos de runtime local do desktop e executa o build de bootstrap; por padrão não prepara os recursos remotos `mock-cdn`.

`pnpm bootstrap:with-remote` mantém o fluxo completo de inicialização necessário para a depuração remota. Ele primeiro obtém o submodule `apps/zcode-cli`, depois instala as dependências, prepara os recursos de runtime local do desktop e executa o build de bootstrap, e por fim gera `source-server-release.json` e os archives das quatro plataformas por meio de `@zcode/server-cli stage:remote-assets`. Ele não gera mais o manifest/components legado.

Se for necessário apenas preparar os recursos do Source Server separadamente, execute `pnpm prepare:remote-assets`.

A validação de desenvolvimento SSH no Linux usa `pnpm prepare:remote-assets:linux`, que constrói apenas `linux-x64` e `linux-arm64`, sem executar a inicialização do submodule, a instalação de dependências ou o build de bootstrap de outros workspaces.
Esse comando reutiliza o staging do Source Server: constrói uma única vez o Server CLI/Core, o primeiro alvo constrói o Agent e o runtime de plugins necessário, e o segundo alvo reaproveita o Agent da mesma rodada; cada alvo continua carregando os recursos completos de Node, ferramentas, dependências e plugins.
Pressupõe que o workspace já tenha as dependências instaladas. Ele não inicia o Desktop e não conecta nem atualiza o remoto automaticamente.

A entrada exclusiva para Linux gera somente os dois archives completos necessários para a instalação SSH em pacote único, e não gera arquivos de componentes independentes.
O staging continua calculando `paths`, `sha256` e `sizeBytes` de cada componente e gravando-os no manifest dentro do pacote; apenas omite o `archivePath` do componente, pulando a segunda hash, a cópia temporária e a compressão dos componentes. A entrada de todas as plataformas continua gerando os arquivos de componentes.
Ao refazer o staging, os arquivos antigos de componentes desse alvo são limpos, para que arquivos históricos não sejam confundidos com o produto desta rodada; a montagem completa dos recursos, a validação do runtime de plugins e das declarações de licença, o SHA/tamanho do pacote e as regras de publicação do descriptor permanecem com o comportamento original.

Quando `ZCODE_ENV` não está definido ou está em branco no novo comando, o padrão é `production`, igual a `pnpm dev:desktop`;
valores explícitos têm os espaços das pontas removidos e são convertidos para minúsculas, aceitando apenas `test` / `production`, e valores inválidos falham antes da construção e de qualquer mudança nos artefatos.
O ambiente de teste usa `ZCODE_ENV=test pnpm prepare:remote-assets:linux`, e depois inicia
`pnpm dev:desktop:test`. O `prepare:remote-assets` e o `bootstrap:with-remote` originais continuam construindo as quatro plataformas.

```text
Revogar o descriptor antigo → Construir o Server CLI/Core → Linux x64 (construir o Agent)
                  → Linux arm64 (reaproveitar o Agent) → Publicar o descriptor de dupla arquitetura Linux
Cada alvo: montagem e validação dos recursos → uma hash dos componentes → manifest → compressão do pacote completo (sem arquivos de componentes independentes)
```

Os dois archives são gravados em `packages/desktop/mock-cdn/releases/<version>/` da versão atual, e o `source-server-release.json` contém apenas os dois alvos Linux desta rodada com seus SHA/tamanhos, sem mesclar entradas antigas de macOS.
Se qualquer alvo falhar, nenhum descriptor novo é publicado; os arquivos de archive de macOS já existentes não são apagados ativamente, mas não são referenciados por esse descriptor.
Para voltar a validar o macOS, execute novamente a entrada de todas as plataformas. O comando de build não pode escrever concorrentemente no diretório de publicação do mesmo workspace.
Os testes de regressão cobrem a seleção de alvos do CLI real, os parâmetros de reaproveitamento do Agent, a passagem de ambiente, a interrupção por falha, e a publicação de archive/descriptor de dupla arquitetura e o descarte de entradas antigas; um build remoto completo ou uma verificação em máquina SSH real não substituem esses testes.
A otimização dos arquivos de componentes também precisa cobrir: a entrada Linux passa o parâmetro de skip, a entrada de todas as plataformas mantém o comportamento original, o pacote completo é instalável, a hash dos componentes é consistente com o empacotamento padrão, os arquivos de componentes antigos são limpos, e a ausência de recursos obrigatórios continua falhando.

Quando `bootstrap:with-remote` prepara o runtime dos plugins oficiais do desktop, ele precisa limpar antes o `dist` antigo desse plugin; quando a raiz do plugin tem `tsconfig.json`, a compilação TypeScript é executada primeiro, e só então a execução do empacotamento do runtime e a validação dos artefatos.
O código-fonte dos plugins de documentação fica no `office-runtime` compartilhado; sem tsconfig próprio, o script de build declarado é executado diretamente. A API de sistema de arquivos usada na limpeza precisa ser importada explicitamente; quando a limpeza ou a construção falha, o erro continua sendo propagado para a entrada, sem reaproveitar artefatos antigos. A aceitação de regressão executa a função de limpeza real, cobrindo plugins com e sem tsconfig, e os casos em que o `dist` antigo existe e não existe, confirmando que a limpeza acontece antes do comando de construção.

## Ambiente de produto da inicialização remota

`bootstrap:with-remote` seleciona de forma unificada o ambiente de produto na entrada: um `ZCODE_ENV` não definido ou em branco seleciona por padrão `production`, em coerência com o `pnpm dev:desktop` executado em seguida; valores explícitos `test` / `production` são repassados, após remoção dos espaços das pontas e conversão para minúsculas, a todos os subprocessos de build. Valores inválidos precisam gerar erro antes de instalar dependências, limpar ou construir.
O runtime local, o Source Server Core e o Agent remoto devem usar a mesma seleção, sem voltar ao ambiente de teste dentro de um sub-build.

```text
Antes da correção: bootstrap:with-remote -> ambiente não especificado -> pacote remoto test
        dev:desktop           -> production -> credenciais de produção enviadas para o endereço de modelos de teste -> 401
Depois da correção: bootstrap:with-remote -> a entrada seleciona production -> artefatos local e remoto no mesmo ambiente
        dev:desktop           -> production -> credenciais de produção compatíveis com o endereço dos modelos
```

Na integração em ambiente de teste, execute primeiro `bootstrap:with-remote` com `ZCODE_ENV=test` e depois rode
`pnpm dev:desktop:test`. Depois de escolher explicitamente o ambiente de teste, o `dev:desktop` comum continua significando production e não reconstrói nem converte automaticamente o pacote de instalação remoto. Para mudar um archive já existente no ambiente de teste para produção, é preciso reconstruí-lo e atualizar o remoto.

O `bootstrap` comum, o `prepare:remote-assets` independente e o construtor genérico mantêm as regras originais de seleção de ambiente;
esta restrição da entrada não altera a autoridade da configuração embutida do Provider Provisioning, o protocolo de runtime ou a semântica de recuperação de tasks.
A aceitação de regressão cobre o valor padrão, o valor em branco, os dois ambientes explícitos, a falha antecipada de valores inválidos e o comportamento original do bootstrap comum; intercepta os subcomandos de build e verifica o ambiente repassado pela entrada real e o endereço de modelos do Provider Built-in realmente selecionado.

## Limites de construção do módulo de migração compartilhado do Agent

O CLI, o agent do Desktop e o SEA reutilizam a configuração de alias de `apps/zcode-cli/packages/cli/scripts/build.mjs`.
O `@zcode/shared/sqlite-migrations` precisa resolver com precisão para
`packages/shared/src/node/sqliteMigrations.ts` e ser incluído no bundle do Agent; caso contrário, o alias genérico de `@zcode/shared` concatena o subpath depois de `src/index.ts`, o que faz a construção do bootstrap falhar.
O teste de regressão da construção usa a entrada real de session migration e o esbuild, verificando que a implementação compartilhada é inline e que não resta dependência externa daquele subpath. Esta correção ajusta apenas a resolução da construção e não altera o SQL de migração, o checksum, o ledger ou a ordem de execução.
