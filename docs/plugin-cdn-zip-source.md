# Design de instalação de plugin Zip via CDN

## 1. Objetivos / não objetivos

### Objetivos

- Suportar que uma entrada de plugin do marketplace aponte para um pacote de plugin `.zip` hospedado em CDN, reutilizando o ciclo de instalação existente:
  `installMarketplacePlugin` -> `cacheMarketplacePlugin` -> `resolvePluginSourceRoot` -> cópia para
  `~/.zcode/cli/plugins/cache/{marketplace}/{plugin}/{version}/` -> gravação em
  `installed_plugins.json`.
- Adicionar um tipo explícito de artefato no `{ "source": "url" }` existente da entrada de plugin:
  `{ "source": "url", "type": "zip", ... }`. O `{ "source": "url" }` sem `type` continua com a
  semântica legada de git clone; não inferir zip pelo sufixo da URL.
- Após download, verificação e extração, continuar retornando uma árvore de diretórios simples. O produto final da instalação continua sendo um diretório contendo
  `.zcode-plugin/plugin.json`, `.claude-plugin/plugin.json` ou `.codex-plugin/plugin.json`,
  sem manter o zip archive em longo prazo.
- O caminho de download precisa estar alinhado à política de saída de rede existente de marketplace/git. O subprocesso git existente injeta ambiente de rede explícito como
  `ZCODE_HTTP_PROXY` por meio de `buildMarketplaceGitEnv()` e `applyNetworkEgressEnv()`;
  o download do zip deve usar a mesma semântica de saída de rede, em vez de contornar a
  configuração de proxy.
- Preservar a compatibilidade com o Git do Claude Marketplace. Esta Phase 1 originalmente não alterava `github`, `git`, `url`,
  `git-subdir`; a [spec pública de origem de plugins GitHub sem Git](./plugin-github-archive-source.md)
  posterior já convergiu as origens GitHub HTTPS com leitura anônima para o mesmo materializador ZIP seguro, e as demais origens continuam passando pelo Git do sistema.
  `npm` / `pip` continuam sendo caminhos de diagnóstico reconhecidos, mas não instalados.
- Sobre a base do spec-first, deixar para o coding agent seguinte arquivos, testes e checklist de rollout concretos.

### Não objetivos

- A Phase 1 não suporta o próprio marketplace distribuído como zip. O `"url"` das sources de marketplace existentes continua significando
  HTTP fetch de `marketplace.json`; isso é um eixo diferente do source de entrada de plugin.
- A Phase 1 não implementa instalação de package manager dentro do zip e não executa `npm install` / `pip install`.
- A Phase 1 não altera o runtime do plugin, o estado de habilitação nem a política de segurança de MCP/hook, e não empurra nenhum estado de negócio para o Electron
  main process, o relay ou a cadeia de web remote.
- A Phase 1 não implementa um daemon de update automático; apenas estende a capacidade de leitura de pin usada pela detecção de overview/update existente.
- A Phase 1 não introduz um novo layout de cache e não usa o arquivo zip como chave de cache de longo prazo nem como produto da instalação.

## 2. Schema de source

Novo tipo de artefato URL para entrada de plugin:

```json
{
  "name": "cdn-plugin",
  "version": "1.2.3",
  "description": "Install from CDN zip",
  "source": {
    "source": "url",
    "type": "zip",
    "url": "https://cdn.example.com/zcode/plugins/cdn-plugin-1.2.3.zip",
    "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "path": "packages/cdn-plugin",
    "stripRoot": true
  }
}
```

Semântica dos campos:

| Campo | Semântica na Phase 1 |
| --- | --- |
| `source` | Fixado como `"url"`. Este é o source de entrada de plugin, não o source de marketplace. |
| `type` | Obrigatório como `"zip"` para artefato zip. Ausente ou `"git"` mantém o git clone legado. Valor desconhecido gera diagnóstico/erro direto, sem fallback. |
| `url` | Obrigatório; o CDN remoto precisa ser uma URL `https://`. Testes/fixtures locais permitem HTTP de loopback (`localhost` / `127.0.0.1` / `::1`). |
| `sha256` | Obrigatório para source zip, hex de 64 dígitos em minúsculas. Após o download o digest precisa ser verificado primeiro, e a extração só é permitida se a verificação passar. |
| `path` | Opcional; subdiretório do plugin dentro do zip extraído. A semântica é alinhada ao `path` do source git: extrair com segurança para uma raiz temporária primeiro e depois localizar a raiz do plugin com `resolveInside(path)` dentro dessa raiz temporária. |
| `headers` | Opcional; apenas headers comuns de string são permitidos; headers sensíveis como `Authorization` e `Cookie` são proibidos no marketplace JSON. A Phase 1 recomenda suportar apenas CDN público, sem escrever credenciais no marketplace. |
| `stripRoot` | Booleano opcional. `true` indica que todas as entradas do zip compartilham um mesmo diretório de topo seguro, que pode ser removido ao localizar a root; o padrão recomendado é `true`, mas a implementação precisa ser mutuamente exclusivas com `path` ou ter uma prioridade bem definida. |

Entrada mínima recomendada de CDN público:

```json
{
  "name": "superpowers-cdn",
  "source": {
    "source": "url",
    "type": "zip",
    "url": "https://cdn.example.com/plugins/superpowers.zip",
    "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }
}
```

Entrada zip de monorepo com subdiretório:

```json
{
  "name": "atomic-agents",
  "source": {
    "source": "url",
    "type": "zip",
    "url": "https://cdn.example.com/archives/agents-bundle.zip",
    "sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "path": "claude-plugin/atomic-agents"
  }
}
```

Por que não adotar `{ "source": "url", "url": "https://...zip" }` sem `type`:

- Atualmente o `{source:"url"}` da entrada de plugin entra em
  `resolvePluginSourceRoot()` e cai em
  `resolveGitPluginSource()`, que faz clone de `source.url`.
- Atualmente o `{source:"url"}` do source de marketplace é em
  `loadMarketplaceFromSource()` que há `fetch(source.url)` e parsing de JSON. Os dois `"url"` pertencem a níveis diferentes; continuar misturando quebraria a compatibilidade do
  marketplace do Claude e o modelo mental do usuário.
- Portanto o zip precisa ser escrito explicitamente como `{source:"url", type:"zip"}`. É proibido adivinhar o tipo pelo
  sufixo `.zip`, porque URLs assinadas de CDN e URLs de artefato sem sufixo são muito comuns.

### Contrato de nome de arquivo e JSON do marketplace URL

- O nome de arquivo da URL do marketplace não participa da decisão de tipo. `marketplace.json`, `index.json` ou URL sem
  extensão são baixados e interpretados como JSON pelo caminho de fetch de URL de marketplace existente.
- O conteúdo da resposta continua usando o formato de manifest de marketplace existente, com `name` e `plugins` válidos no
  topo; campos de extensão como `description`, `owner` e `description_i18n` podem ser mantidos no raw manifest conforme as
  regras de parsing permissivo atuais.
- Não adicionar compatibilidade de envelope `{ "marketplace": { "name": "..." }, "plugins": [...] }`. O lado de publicação
  do CDN precisa emitir o formato existente, evitando que o cliente mantenha dois schemas sinônimos.
- O nome de arquivo zip do artefato do plugin também não participa da decisão. O cliente apenas despacha com base em
  `{ "source": "url", "type": "zip" }` da entrada de plugin e usa `sha256` para verificar o conteúdo baixado.

O marketplace CDN oficial pode usar diretamente:

```json
{
  "name": "zcode-plugins-official",
  "description": "Official ZCode plugins marketplace",
  "plugins": [
    {
      "name": "example-plugin",
      "version": "0.1.1",
      "source": {
        "source": "url",
        "type": "zip",
        "url": "https://cdn-zcode.z.ai/zcode/official-plugin/plugins/example-plugin/0.1.1/plugin.zip",
        "sha256": "5e93c44a9a3c292d6c59688d76874d9035ff740486390612c5daf13566d4049b",
        "path": "example-plugin"
      }
    }
  ]
}
```

A URL de entrada é `https://cdn-zcode.z.ai/zcode/official-plugin/index.json`. A versão e o digest
do exemplo representam apenas um snapshot de publicação; o smoke test do cliente deve ler a versão
live a partir do overview, evitando drift hardcoded causado por publicação incremental no CDN.

## 3. Etapas do pipeline de instalação

Fatos atuais do caminho de instalação:

- `installMarketplacePlugin()` primeiro garante que o manifest do marketplace está disponível e então resolve o closure de dependências.
- Cada entrada entra em `cacheMarketplacePlugin()`.
- `cacheMarketplacePlugin()` chama `resolvePluginSourceRoot()` obtendo `{ path, cleanup? }`.
- Depois lê a versão do manifest da raiz do plugin, calcula o diretório de cache, executa `rm target` e depois `cp sourceRoot.path`
  para o cache e, por fim, grava o registro de instalação.
- `validateMarketplacePlugin()`, `describeMarketplacePlugin()` e a validação de source do marketplace também
  chamam `resolvePluginSourceRoot()`; portanto o resolver de zip precisa ser um contrato de diretório temporário com cleanup, e não pode atender apenas ao caminho de instalação.

Etapas de instalação de zip da Phase 1:

1. `installMarketplacePlugin({ marketplace, name })` permanece inalterado e encontra o `PluginMarketplaceEntry` alvo.
2. `cacheMarketplacePlugin()` permanece inalterado e chama `resolvePluginSourceRoot({ entry, ... })`.
3. `resolvePluginSourceRoot()` despacha pelo `source.type` no ramo `sourceKind === "url"`:
   - Se `url` estiver ausente, não for string ou estiver vazio, erro imediatamente; erros de campo de object source explícito não podem continuar pelo
     fallback `localByName`.
   - `type` ausente ou `"git"`: continua chamando o `resolveGitPluginSource()` existente.
   - `type === "zip"`: entra no caminho de instalação por download/extração do zip.
   - Outros `type`: reporta source unsupported/invalid.
   - Valida o shape de `url` / `sha256` / `path` / `headers` / `stripRoot`.
   - Chama `resolveZipPluginSource({ url, sha256, path, headers, stripRoot, signal })`.
4. `resolveZipPluginSource()` cria um diretório temporário, por exemplo `mkdtemp(join(tmpdir(), "zcode-plugin-zip-"))`.
5. Baixa o zip para um arquivo temporário ou escreve em streaming para um arquivo temporário:
   - Usa o mesmo AbortSignal das operações de marketplace.
   - Alinha a configuração de saída de rede `ZCODE_HTTP_PROXY` / `ZCODE_HTTPS_PROXY` / `ZCODE_NO_PROXY` / CA etc.
   - Registra os bytes acumulados de download e aborta e apaga o diretório temporário imediatamente ao ultrapassar o limite.
6. Calcula o SHA-256 do conteúdo baixado:
   - Se a entrada fornecer `sha256`, o digest real precisa ser exatamente igual.
   - Se a política permitir `sha256` ausente, ainda calcula o digest e o usa apenas para log/diagnóstico/update pin.
7. Extrai o zip com segurança para uma raiz temporária de extração:
   - Valida o caminho de cada entrada e rejeita caminhos absolutos, `..`, barra invertida, drive do Windows, path vazio e path com NUL.
   - Rejeita symlink, device, socket e outros arquivos que não sejam arquivo/diretório comum.
   - Conta bytes descomprimidos, número de arquivos, número de diretórios e tamanho de arquivo único por entrada, falhando ao ultrapassar o limite.
8. Localiza a raiz do plugin:
   - Se `path` existir: usa `resolveInside(extractRoot, path)`, exigindo que o diretório exista.
   - Caso contrário, se `stripRoot === true` ou a detecção de root padrão estiver ativa: quando todas as entradas extraídas compartilham um único diretório de topo, usa esse diretório de topo.
   - Caso contrário usa `extractRoot`.
   - A raiz localizada é entregue ao `validatePluginRoot()` / `resolveInstalledPluginVersion()` existentes e precisa encontrar um manifest de plugin válido, a menos que a entrada com `strict:false` siga as regras existentes de manifest sintético.
9. `resolveZipPluginSource()` retorna `{ path: pluginRoot, cleanup }`. O cleanup usa retentativas limitadas; o caminho de falha precisa preservar o
   erro original de download, verificação ou extração e tratar a falha de cleanup como diagnóstico adicional.
10. `cacheMarketplacePlugin()` continua copiando o diretório simples para, pela lógica existente:

```text
~/.zcode/cli/plugins/cache/{marketplace}/{plugin}/{version}/
```

11. O cleanup da source depois de uma cópia de cache bem-sucedida é best-effort; a falha de cleanup não pode bloquear a construção do registro de instalação nem o
    `saveInstalledPlugins()`, evitando a divergência entre cache e `installed_plugins.json`.
12. `ensureMarketplaceEntryManifest()`, a reescrita do `source` no registro de instalação e `saveInstalledPlugins()` seguem a lógica atual. O `source` no registro de instalação deve preservar o object de source zip completo, facilitando a comparação de update pin por `sha256` mais adiante.

## 4. Requisitos de segurança

### HTTPS

- Na Phase 1 o CDN remoto permite por padrão apenas `https://`. `http://` só é permitido para hosts de loopback (`localhost`, `127.0.0.1`, `::1`), usado em fixtures e
  validação de desenvolvimento que simulam uma URL real.
- A URL precisa ser parseável por `new URL()`, e `file://`, `data:`, `blob:` e `ftp:` são proibidos.
- Ao seguir redirects, a URL final também precisa ser `https://`; há um limite para o número de redirects.

### Headers

- `headers` só aceita pares de chave/valor de string comuns.
- Headers sensíveis são recusados por padrão: `authorization`, `cookie`, `proxy-authorization`, `set-cookie`.
- Em redirect, os `headers` customizados continuam sendo enviados apenas se a URL de destino tiver a mesma origin da URL atual; um redirect
  cross-origin precisa limpar todos os `headers` customizados, sem depender de uma denylist de headers sensíveis para evitar vazamento de informação.
- A Phase 1 recomenda suportar apenas CDN público. Para CDN privado, o design da integração com o credential store precisa vir primeiro; não se escreve token no marketplace JSON.

### Saída de rede

- O download do ZIP precisa usar a semântica de saída de rede do web-fetch dos adapters: `ZCODE_HTTP_PROXY` / `ZCODE_NO_PROXY` explícitos
  têm prioridade, com fallback para os `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` do usuário armazenados em `ZCODE_TOOL_ENV_PASSTHROUGH_JSON`.
- Não se pode usar diretamente o HTTP resolver padrão, que reconhece apenas o proxy explícito da ZCode; caso contrário, depois que o agente limpa as variáveis de proxy padrão, o git source
  pode instalar enquanto o ZIP source tentaria uma conexão direta.
- CA, timeout, limite de tamanho de download e AbortSignal continuam sendo tratados pelo HTTP adapter compartilhado, sem implementação duplicada na camada de plugin.

### Integridade

- `sha256` é obrigatório como padrão seguro, no formato hex de 64 dígitos, com comparação unificada em minúsculas.
- Sem `sha256`, a instalação é bloqueada e o validate retorna um diagnóstico explícito, indicando que o manifest precisa fornecer `sha256`.
- A verificação precisa acontecer antes da extração. Em caso de digest mismatch não é permitido extrazir, escrever cache nem escrever registro de instalação.
- Em caso de falha de download, de verificação ou de extração, o diretório temporário precisa ser limpo.
- A remoção do diretório temporário precisa ter pelo menos um número limitado de retentativas. Se ainda assim falhar, o erro de negócio original permanece como erro principal; o caminho de instalação bem-sucedido não pode ser revertido nem pular o installed record por causa de
  falha de cleanup.

### Zip Slip / entrada insegura

- A normalização do caminho de entradas zip pode seguir a ideia de `packages/services/src/skill-sync/skillSyncPath.ts`:
  rejeitar caminhos absolutos, `..`, barra invertida, drive do Windows e segmentos vazios, e usar `relative(targetRoot, targetPath)`
  para confirmar que o alvo continua dentro da raiz de extração.
- Não se pode depender apenas da string de path do yauzl; o próprio containment precisa ser feito antes de escrever os arquivos.
- Entradas de diretório e de arquivo do zip são tratadas separadamente. Symlink e arquivos especiais são rejeitados; se a biblioteca não expõe attrs externos de forma confiável,
  a estratégia conservadora da Phase 1 é escrever apenas entradas de arquivo comum e de diretório, falhando para os demais tipos.

### Limites de tamanho

Constantes sugeridas dentro do helper de zip do plugin em adapters:

```ts
const ZIP_DOWNLOAD_MAX_BYTES = 100 * 1024 * 1024;
const ZIP_EXTRACT_MAX_BYTES = 250 * 1024 * 1024;
const ZIP_MAX_ENTRIES = 20_000;
const ZIP_MAX_SINGLE_FILE_BYTES = 50 * 1024 * 1024;
```

Os valores padrão podem ser ajustados pelo produto, mas é obrigatório ter:

- limite de download comprimido;
- limite de bytes extraídos não comprimidos;
- limite de contagem de entradas;
- limite por arquivo;
- cleanup do diretório temporário.

### Rede / proxy

- O git clone existente usa `execGitCommand()`, cujo env vem de `buildMarketplaceGitEnv()` ->
  `sanitizeZCodeRuntimeEnv()` -> `applyNetworkEgressEnv()`.
- O download do zip não passa por um subprocesso git e portanto não herda naturalmente esse env; a implementação deve adicionar um ponto de adaptação de fetch dispatcher/proxy-agent,
  ou extrair um helper de network egress compartilhado, para que o download HTTP do zip fique consistente com a política de rede de marketplace/git.
- `@zcode/adapters` já depende de `proxy-agent` e pode usá-lo prioritariamente para construir o dispatcher de fetch do Node; a API concreta precisa ser validada na
  fase de coding com os tipos atuais de Node/undici, sem assumir assinaturas de chamada inexistentes nesta spec.

## 5. Mudanças na detecção de update

Fatos atuais da detecção de update:

- `apps/zcode-cli/packages/bootstrap/src/plugins.ts` ao construir `latestPinByPluginId` lê
  `entry.version` e `readPluginSourceSha(entry.source)`.
- A prioridade de `comparePluginUpdate()` é:
  1. existe latest version -> comparação de semver/version;
  2. senão existe latest sha -> comparação de identidade por sha;
  3. senão -> `none`.
- `readPluginSourceSha()` hoje lê apenas `source.sha`, com compatibilidade com `source.commit`.

Design do zip:

- Manter a version como primária: quando a entrada do marketplace tem `version`, a version continua sendo o eixo de update.
- Quando a entrada não tem `version` mas o source zip tem `sha256`, usar o `sha256` como pin de integridade de conteúdo e identidade de update.
- Para evitar misturar o commit sha do git com o sha256 do zip como um único significado, recomenda-se adicionar um helper mais genérico:

```ts
readPluginSourcePin(source): { kind: "git-sha" | "zip-sha256"; value: string } | undefined
```

Para uma mudança mínima na Phase 1, também é possível estender o `readPluginSourceSha()` existente:

- Para git/url/github/git-subdir, retorna `sha` / `commit`;
- Para zip, retorna `sha256`;
- O comentário deixa explícito que o valor é um "source identity pin" e não mais apenas um git sha.

Nome final recomendado: `readPluginSourceIdentityPin()`, atualizando em conjunto os nomes de parâmetro de
`bootstrap/src/plugins.ts` e `version-compare.ts` para reduzir leituras erradas depois.

Registro de instalação:

- `cacheMarketplacePlugin()` hoje grava `input.entry.source` como está em `InstalledPluginRecord.source`.
  Portanto, após a instalação de zip o record pode preservar `source.sha256`, para a comparação no overview seguinte.
- Se for permitido `sha256` ausente, o registro de instalação pode gravar o digest real baixado como campo interno, mas isso muda o schema do record.
  A Phase 1 recomenda não adicionar campo persistido: entradas sem `sha256` não fornecem update pin e só podem depender de `version`.

## 6. Arquivos/módulos a tocar

Obrigatórios:

- `docs/plugin-cdn-zip-source.md`
  - Esta spec, atualizada com a implementação, as decisões e os resultados de aceitação.
- `docs/claude-code-marketplace-plugin-compat.md`
  - Adicionar `{source:"url", type:"zip"}` à matriz de source de entrada de plugin.
  - Deixar explícito que o `{source:"url"}` sem `type` continua sendo um caminho compatível de git clone e não representa HTTP zip.
- `apps/zcode-cli/packages/adapters/package.json`
  - `@zcode/adapters` hoje não tem `yauzl`; se for adotado yauzl, a dependency precisa ser declarada nos próprios adapters.
  - O repositório já tem `yauzl`: `packages/desktop/package.json` e `packages/services/package.json` dependem de
    `yauzl` / `@types/yauzl`, mas isso não pode ser usado implicitamente entre packages.
- `apps/zcode-cli/packages/adapters/src/plugins/marketplace.ts`
  - `PluginMarketplaceEntry.source` continua sendo `unknown`, mas `sourceKind === "url"` precisa despachar pelo `source.type`.
  - Adicionar `readPluginSourceIdentityPin()` ou estender/renomear `readPluginSourceSha()`.
  - `validateMarketplaceEntryShape()` recebe o shape de zip e o diagnóstico de integridade.
  - `getMarketplaceSourceValidationDeferral()` pode tratar zip também como source de plugin remota, fazendo deferral no
    validate em nível de marketplace para evitar baixar centenas de zips em lote.
- `apps/zcode-cli/packages/adapters/src/plugins/zip-source.ts` (arquivo novo sugerido)
  - `resolveZipPluginSource()`, download, sha256, extração segura, localização da root.
  - Manter o tamanho de marketplace.ts controlável.
- `apps/zcode-cli/packages/adapters/src/plugins/index.ts`
  - Se for adicionado um helper público ou necessário para os testes, atualizar o barrel.
- `apps/zcode-cli/packages/adapters/src/network/subprocess-env.ts` ou o network helper adjacente
  - Extrair a lógica de alinhamento de HTTP fetch/proxy, evitando que o download do zip contorne a política de rede `ZCODE_HTTP_PROXY` etc.
- `apps/zcode-cli/packages/bootstrap/src/plugins.ts`
  - A leitura de latest/installed pin do update overview vai de git sha para zip sha256.
- `apps/zcode-cli/packages/adapters/src/plugins/version-compare.ts`
  - Se o pin continuar sendo string, a lógica pode ficar igual, mas nomenclatura/comentários precisam ser atualizados; se houver distinção de pin kind, atualizar tipos e testes.

Testes obrigatórios novos/atualizados:

- `apps/zcode-cli/packages/adapters/tests/plugins.test.ts`
- `apps/zcode-cli/packages/adapters/tests/version-compare.test.ts`
- Se o helper de rede/proxy for extraído: o teste unitário de network correspondente em adapters.

Possivelmente precisam mudar:

- `pnpm-lock.yaml`
  - Será atualizado depois que os adapters ganharem a dependency `yauzl`.
- `apps/zcode-cli/packages/bootstrap/tests/plugins.test.ts`
  - Se o schema do overview ou a semântica do helper for exposta na camada de bootstrap, é preciso adicionar cobertura.

Não devem mudar:

- O estado de negócio do Electron main process / relay.
- A semântica realtime de task/session do web remote.
- O layout do cache de plugin e a semântica de leitura do produto de instalação pelo runtime loader.

## 7. Plano de testes

### Unit: parsing / validação de source

- shape de source zip válido:
  - `source:"url"`, `type:"zip"`, url HTTPS ou HTTP de loopback, sha256 válido, path opcional, stripRoot opcional.
- source zip inválido:
  - url ausente;
  - `http://` que não seja loopback;
  - `file://`;
  - sha256 que não seja hex de 64 dígitos;
  - headers que não seja object;
  - headers sensíveis;
  - `path` com `..` / drive do Windows / barra invertida.
- O validate em nível de marketplace retorna `plugin_validation_deferred` para source zip remota, sem download em lote.

### Unit: download / integridade

- Baixa o zip, o sha256 bate e o fluxo continua.
- sha256 mismatch: erro, limpeza do diretório temporário, sem escrita de cache e sem installed record.
- Download acima do limite comprimido: erro e abort.
- Suporte a AbortSignal: abort durante o download limpa o diretório temporário.
- Falha de cleanup: o caminho de falha preserva o erro original e anexa o diagnóstico de cleanup; quando o cache já foi copiado com sucesso, o installed record
  ainda é gravado.
- Teste de configuração de proxy: com o `HTTP_PROXY` do usuário fornecido apenas em `ZCODE_TOOL_ENV_PASSTHROUGH_JSON` e sem `ZCODE_HTTP_PROXY`
  definido, afirmar que a requisição ZIP ainda passa pelo proxy local; o teste não pode acessar a internet.
- Teste de segurança de redirect: rejeitar redirecionamento para URL não HTTPS e não loopback; no salto cross-origin os `headers` customizados
  não são encaminhados, enquanto no salto de mesma origin headers comuns podem ser mantidos.

### Unit: fixtures de extração segura

- zip normal: o diretório raiz contém diretamente `.claude-plugin/plugin.json`.
- zip com um único diretório de topo: `plugin-1.0.0/.claude-plugin/plugin.json`, com a detecção de root padrão/`stripRoot:true`
  a instalação tem sucesso.
- zip com subdiretório: `bundle/claude-plugin/atomic-agents/.claude-plugin/plugin.json` + `path` instala com sucesso.
- Zip Slip:
  - `../escape.txt`;
  - `/absolute.txt`;
  - `C:\escape.txt`;
  - `nested/../../escape.txt`;
  - caminho com barra invertida.
- Entradas especiais:
  - symlink;
  - device/socket ou type desconhecido;
  - mistura de diretório/arquivo.
- limites:
  - contagem de entradas acima do limite;
  - bytes extraídos acima do limite;
  - arquivo único acima do limite.

### Unit: comportamento de instalação/cache

- Após `installMarketplacePlugin()` instalar um source zip, o caminho de cache continua sendo:

```text
cache/{marketplace}/{plugin}/{version}/
```

- O `source` do registro de instalação preserva `{source:"url", type:"zip", url, sha256, ...}`.
- A regra existente de que a versão do manifest do plugin zip tem prioridade sobre a versão da entrada do marketplace permanece inalterada.
- `describeMarketplacePlugin()` pode baixar/extrair/enumerar componentes temporariamente para um plugin zip não instalado, e fazer cleanup.
- `validateMarketplacePlugin()` faz varredura profunda da root de um único plugin zip.

### Unit: detecção de update

- Entrada com `version` e `sha256`: o eixo version tem prioridade; sha256 muda com a mesma version -> `none`.
- Entrada sem `version`, sha256 de installed/source diferente do sha256 de latest/source -> `update-available`.
- Latest com sha256, installed sem sha256 -> `version-changed`.
- Sem version e sem sha256 -> `none` ou warning, fixado por decisão de produto.
- Os testes existentes de git `sha` / `commit` continuam passando, provando que o caminho git oficial do Claude não foi quebrado.

### Desktop E2E: startup seed + instalação pelo serviço + descoberta

- spec de manual-review pendente:
  `packages/desktop/test/e2e/plugins/manual-review/pending/plugin-cdn-zip-marketplace-install.test.ts`.
- O `beforeSession` do WDIO sobe um servidor de fixture zip de loopback antes do Electron iniciar e faz seed do marketplace zip em
  `<E2E_HOME>/.zcode/cli/plugins/known_marketplaces.json` e
  `<E2E_HOME>/.zcode/cli/plugins/marketplaces/{marketplace}/marketplace.json`.
- A spec chama o `zcodeAgentService.installPlugin()` real via `window.__testActions` no renderer, cobrindo a cadeia de instalação
  desktop renderer -> services -> agent protocol -> bootstrap -> adapters.
- Escopo de asserções:
  - antes da instalação o overview mostra o marketplace seed e o plugin zip;
  - depois da instalação `cache/{marketplace}/{plugin}/{version}` está materializado;
  - `installed_plugins.json` preserva `{source:"url", type:"zip", url, sha256}`;
  - `config.json#plugins.enabledPlugins[id] === true`;
  - `listPlugins()` descobre os componentes command/skill.

### Desktop E2E: smoke do CDN oficial

- spec de manual-review pendente:
  `packages/desktop/test/e2e/plugins/manual-review/pending/plugin-cdn-zip-official-cdn-smoke.test.ts`.
- Esses dois casos validam a instalação de plugin e não envolvem a máquina de estados de conversation/session, portanto são registrados no diretório específico de plugin e não entram no
  conversation case catalog nem na coverage matrix.
- Adiciona o `index.json` oficial pela `addPluginMarketplace()` real e depois usa as entradas reais de serviço
  `installPlugin()` e `listPlugins()`.
- A versão é lida dinamicamente do overview após o add, sem fixar a versão de publicação do CDN no teste; a instalação bem-sucedida prova ao mesmo tempo que o manifest
  é parseável e que o `sha256` do zip bate com o conteúdo baixado.
- Asserir cache, `installed_plugins.json`, enabled config e a descoberta de command/skill.
- Este caso depende da internet pública e do conteúdo atual do CDN oficial, servindo apenas como manual smoke e não entrando no pacote estável de
  replay offline/CI; a cobertura determinística de CI fica por conta dos casos de seed de loopback.

### Estratégia de fixtures

- Os zips de teste são criados dinamicamente por um helper de teste, sem depender de CDN externo.
- Se for adotada a extração somente-leitura do `yauzl`, o zip pode ser gerado com as dependências de teste existentes; se não houver um zip writer, o teste pode introduzir um dev helper leve ou usar o archive builder já existente no repositório, mas o helper de produção não pode depender de uma API exclusiva de teste.
- Todos os fixtures zip precisam ser estáveis na semântica de caminho de macOS/Linux/Windows.

## 8. Phases de rollout

### Phase 1 mínima

- Nova entrada de plugin `{source:"url", type:"zip"}`.
- CDN remoto apenas com HTTPS; fixture local permite HTTP de loopback.
- `sha256` obrigatório.
- Download seguro, verificação sha256, extração segura, localização da root.
- Reutilização de `resolvePluginSourceRoot()` -> `{ path, cleanup? }` -> `cacheMarketplacePlugin()`.
- Atualização da matriz de sources em `docs/claude-code-marketplace-plugin-compat.md`.
- Testes unitários cobrindo install, validate, describe, update detection, zip slip e limites.
- Não mudar marketplace-as-zip.
- Não mudar a semântica de negócio de runtime e UI; a UI apenas exibe naturalmente os resultados existentes de install/diagnostic.

### Phase 2 de hardening

- Esquema de credencial para CDN privado: headers não são escritos diretamente no marketplace JSON, passando por credential store ou policy de confiança do marketplace.
- Trust policy mais fina: marketplaces oficiais/empresariais podem configurar se permitem sha256 ausente e quais hosts de CDN são permitidos.
- Cache temporário de download endereçado por conteúdo: reuso de curto prazo do mesmo `{url, sha256}`, mas materializando no final no diretório de cache existente.
- Suportar source de marketplace `.zip` exige uma spec separada: marketplace-as-zip é outro eixo e não pode ser misturado com o plugin zip source.
- Verificação de assinatura do zip ou do manifest.
- Exibir o estado de integridade, diagnósticos de digest mismatch e tamanho de download na UI.
- Completar a integração de proxy de rede com e2e ou teste de integração, cobrindo proxy corporativo/CA auto-assinado.

## 9. Perguntas em aberto / decisões para o owner de produto

1. O `sha256` é obrigatório de forma rígida?
   - Padrão recomendado: obrigatório em marketplaces de terceiros; warning permitido em fixtures oficiais/de desenvolvimento.
   - Impacto: obrigatoriedade rígida é a opção mais segura, mas bloqueia mercados temporários que só fornecem a URL do CDN.

2. Qual é o valor padrão de `stripRoot`?
   - Padrão recomendado: detectar automaticamente um único diretório de topo e usá-lo; com `stripRoot:false` explícito, usar a extract root.
   - Impacto: a maioria dos zips de release do GitHub tem um diretório de topo, e o stripping automático por padrão reduz a configuração necessária do author do manifest.

3. `headers` é suportado na Phase 1?
   - Padrão recomendado: suportar headers públicos não sensíveis e recusar headers sensíveis.
   - Impacto: permite headers de cache/controle do CDN, sem abrir uma porta para token em texto puro.

4. Como exibir a detecção de update de entrada sem `sha256`?
   - Padrão recomendado: não fornecer identity pin e depender apenas de `version`; se também não houver version, mostrar que não há update comparável.
   - Impacto: evita gravar o digest real de download no installed record, o que exigiria migração de schema.

5. Como tratar múltiplos plugin manifests na root do zip?
   - Padrão recomendado: sem `path`, aceitar apenas um plugin root na extract root ou sob um único diretório de topo; com vários candidatos, dar erro e exigir `path` na entrada do marketplace.
   - Impacto: evita instalar o plugin errado.

6. Fontes de teste em `http://localhost` são permitidas?
   - Decisão: permitir HTTP de loopback, usado para simular o pull de uma URL ZIP real; HTTP não loopback continua proibido.
   - Impacto: os testes conseguem cobrir a cadeia de download por URL HTTP real sem liberar CDN remoto em texto puro.

## 10. Checklist de tarefas de implementação

- [ ] Ler e manter esta spec consistente com `docs/claude-code-marketplace-plugin-compat.md`.
- [ ] Adicionar a dependency de zip nos adapters: avaliar `yauzl` primeiro e declará-la explicitamente em `apps/zcode-cli/packages/adapters/package.json`,
  sem depender da dependency transitiva de desktop/services.
- [ ] Criar `apps/zcode-cli/packages/adapters/src/plugins/zip-source.ts`:
  - [ ] `resolveZipPluginSource(input): Promise<ResolvedPluginSourceRoot>`;
  - [ ] validação de URL HTTPS e de redirect;
  - [ ] allow/deny list de headers;
  - [ ] limite de bytes de download + AbortSignal;
  - [ ] digest sha256;
  - [ ] extração segura de entradas do yauzl de forma lazy;
  - [ ] rejeição de Zip Slip / path do Windows / symlink / entradas especiais;
  - [ ] limite de tamanho extraído / contagem de entradas / arquivo único;
  - [ ] localização de root: `path`, single top-level, extract root;
  - [ ] cleanup em todo caminho de falha.
- [ ] Extrair ou adicionar um helper de HTTP network egress, alinhando a semântica do download de zip com `buildMarketplaceGitEnv()`.
- [ ] Modificar `marketplace.ts`:
  - [ ] `resolvePluginSourceRoot()` despacha por `type` no ramo `sourceKind === "url"`;
  - [ ] `validateMarketplaceEntryShape()` ganha os diagnósticos de shape de zip;
  - [ ] `getMarketplaceSourceValidationDeferral()` classifica zip como remote deferral;
  - [ ] renomear/estender `readPluginSourceSha()` para um helper de identity pin.
- [ ] Modificar `bootstrap/src/plugins.ts` para usar o helper de identity pin, garantindo que o sha256 do zip entre no update overview.
- [ ] Modificar comentários/tipos de `version-compare.ts`, mantendo version como primária e identity pin como secundária.
- [ ] Atualizar a matriz de plugin source em `docs/claude-code-marketplace-plugin-compat.md`.
- [ ] Adicionar testes unitários nos adapters:
  - [ ] instalação de zip válido;
  - [ ] instalação com `path` de zip;
  - [ ] detecção de root de diretório de topo único;
  - [ ] sha256 mismatch;
  - [ ] variantes de Zip Slip;
  - [ ] limites de tamanho/entradas;
  - [ ] cleanup de validate/describe;
  - [ ] update detection via sha256;
  - [ ] regressão do comportamento existente de url/sha git.
- [ ] Executar a validação estreita:
  - [ ] `pnpm --filter @zcode/adapters test -- plugins.test.ts`
  - [ ] `pnpm --filter @zcode/adapters test -- version-compare.test.ts`
  - [ ] `pnpm --filter @zcode/adapters typecheck`
  - [ ] `pnpm --filter @zcode/adapters lint`
- [ ] Executar o global conforme exigido pelo repositório:
  - [ ] `pnpm typecheck`
  - [ ] `pnpm lint`
- [ ] Enviar um Conventional Commit, explicando no corpo do commit:
  - [ ] superfície de impacto: plugin marketplace install/validate/describe/update overview;
  - [ ] limites de segurança: HTTPS, sha256, Zip Slip, limites de tamanho;
  - [ ] itens não cobertos: marketplace-as-zip, credencial de CDN privado, exibição de integridade na UI.