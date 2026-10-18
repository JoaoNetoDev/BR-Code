# ZCode Lite Static Distribution

## Contexto

O ZCode Lite é a forma Web local que não instala o Desktop App. A fonte de download da intranet hospeda apenas os recursos estáticos da publicação, e a máquina do usuário fica responsável por executar o Node.js, o servidor HTTP local, os serviços do ZCode e o agent runtime.

Atualmente a fonte de download da intranet é um serviço comum de arquivos estáticos e não oferece a API de metadados de registro npm:

```text
http://intranet.example.invalid:12345/zcode/deps/
  -> /Users/dev/shared/zcode/deps/
```

Por isso o ZCode Lite não depende de `npx --registry`. Os artefatos de publicação ficam no diretório `zcode-lite`, e o ponto de entrada de instalação prioriza `install.sh`, com o tarball como artefato alternativo para download direto.

## Objetivos

- O script de build gera localmente um conjunto de diretórios de publicação do ZCode Lite que possa ser enviado à fonte de download estática.
- O diretório de publicação contém script de instalação, manifest de versão, pacote compactado e arquivo de checksum.
- A máquina do usuário só precisa ter Node.js; o runtime Node não é empacotado com o ZCode Lite.
- `zcode-lite serve` escolhe por padrão uma porta disponível ao acaso, faz bind em `127.0.0.1` e abre o navegador automaticamente.
- Quando o usuário passa explicitamente `--host 0.0.0.0`, o acesso pela rede local é permitido e o token de acesso é habilitado por padrão.

## Não objetivos

- Não embutir push/upload no script de build. O destino do upload é temporário, e os artefatos de build devem poder ser publicados em qualquer fonte estática.
- Não implementar um registro npm.
- Não reutilizar o relay de controle remoto Web do celular, nem alterar a semântica de recuperação replayable de `/remote`.
- Não suportar um único server compartilhado servindo múltiplos usuários isolados; a execução ocorre na própria máquina ou servidor de quem instala.

## Arquitetura

```text
内网静态下载源
  /zcode/deps/zcode-lite/
    install.sh
    latest.json
    releases/<version>/
      zcode-lite-<version>.tar.gz
      sha256.txt

用户机器
  ~/.zcode/lite/releases/<version>
  ~/.zcode/lite/current -> releases/<version>
  ~/.local/bin/zcode-lite

运行时
  zcode-lite serve [--host <host>] [--port <port>]
      |
      v
  Node local server
    |-- packages/web/dist 静态资源
    |-- /ws RPC
    |-- createLocalServices()
    |-- bundled zcode.cjs app-server --stdio
      |
      v
  浏览器访问 Web UI
```

O ZCode Lite usa o `/ws` de mesma origem do modo Web comum, e não o controle remoto do celular:

```text
Lite Web:
browser -> local server -> local services -> local agent runtime

Mobile Remote:
mobile browser -> relay -> desktop main -> existing host/services -> existing runtime
```

## Limite atual do Web comum

Aqui "Web comum" significa o navegador conectando diretamente ao `/ws` de mesma origem do `@zcode/server`, incluindo a entrada Web do ambiente de desenvolvimento e a página do ZCode Lite aberta por `zcode-lite serve`; não inclui o `/remote` do celular.

Atualmente o Web comum não tem o processo Local Host de nível de janela do Desktop, e portanto também não tem o Window Host Controller. A lista global de tarefas do lado esquerdo, que depende do Window Host Controller para agregar sources locais e remotos, ainda não é suportada no Web comum / ZCode Lite; quando o Controller não está disponível, não se implementa no renderer Web uma lógica adicional de agregação ou fallback.

```text
当前普通 Web / ZCode Lite：
browser
  -> @zcode/server /ws
     -> createLocalServices()
        -X-> Window Host Controller
        -X-> 基于 Controller 的左侧全局任务列表

当前 Desktop 与手机 /remote：
Desktop renderer -----------------------+
                                        v
mobile /remote -> relay/main 透传 -> Desktop Window Local Host
                                        |
                                        v
                                Window Host Controller
                                        |
                                        +-> 本地 source
                                        +-> SSH / WSL / Docker / Server source
```

Esse limite restringe apenas a lista global de tarefas dependente do Window Host Controller e a agregação de múltiplos sources; não significa que as capacidades existentes do `/ws` do Web comum, como páginas estáticas, arquivos, terminal e sessões, estejam indisponíveis, e também não altera as cadeias existentes do Desktop local, do workspace remoto do Desktop ou do `/remote` do celular.

O suporte à lista global de tarefas no Web comum só volta a existir depois que o Lite / Browser Controller Runtime (ou uma fronteira equivalente de Controller no servidor confirmada pela arquitetura) for implementado e depois de completar a regressão no Web comum, no Desktop e no `/remote` do celular. A arquitetura-alvo está em `docs/architecture/unified-zcode-lite-server-multi-server-plan.md`.

## Comportamento do comando

Comando padrão:

```bash
zcode-lite serve
```

Comportamento padrão:

- `--host` tem como padrão `127.0.0.1`.
- Quando `--port` é omitido, encontra-se uma porta disponível ao acaso.
- Ao fazer bind no endereço local, o navegador é aberto automaticamente por padrão.
- Com `--host 0.0.0.0`, o navegador não é aberto automaticamente por padrão.
- Com `--host 0.0.0.0`, um token de acesso é gerado por padrão e `?token=...` é impresso na URL.

Inicialização comum do servidor:

```bash
zcode-lite serve --host 0.0.0.0 --port 3030 --no-open
```

## Limites de segurança

A execução local em `127.0.0.1` não exige token. Ao fazer bind em `0.0.0.0`, um token deve ser gerado por padrão, e o server faz validação de token em `/api/*` e `/ws`. Quando o navegador acessa pela primeira vez com `?token=...`, o server grava um cookie de mesma origem e, depois disso, o WebSocket de mesma origem já envia o cookie automaticamente.

Os recursos estáticos podem ser lidos pela rede local; os pontos de entrada RPC que realmente leem e escrevem arquivos, executam comandos e acessam o agent precisam estar protegidos por token.

## Diretório de publicação

O script de build gera apenas um diretório local, por exemplo:

```text
dist/zcode-lite/
  install.sh
  latest.json
  releases/<version>/
    zcode-lite-<version>.tar.gz
    sha256.txt
```

O upload é uma ação temporária e não fica em script. O destino atual de upload na intranet é:

```text
/Users/dev/shared/zcode/deps/zcode-lite/
```

## Verificação

Após a conclusão, verificar no mínimo:

- `pnpm --filter @zcode/server test -- serverInfoHttp.test.ts` cobre os recursos estáticos e a proteção por token.
- `pnpm --filter @zcode/web build` confirma que o bootstrap Web consegue ler `/api/server-info`.
- `node scripts/build-zcode-lite.mjs --skip-build` consegue gerar o diretório de publicação e o tarball.
- Depois de extrair o tarball, `node bin/zcode-lite.mjs serve --port 0 --no-open` consegue iniciar o server e imprimir a URL.
- Executar `pnpm typecheck` e `pnpm lint` antes do commit.