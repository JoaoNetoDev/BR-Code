# BR Code

<div align="center">
  <img src="public/logo/br-code.png" alt="BR Code" width="128" height="128" />
</div>
<p align="center">
  Português (Brasil) | <a href="README.en.md">English</a>
</p>

BR Code é um workbench de programação com IA — adaptado brasileiro do [ZCode](https://github.com/zai-org/ZCode), da Z.ai — com aplicativo desktop, interface web e agente de terminal. Este repositório contém o cliente, os serviços de backend, a UI compartilhada e o código-fonte do Agent CLI e do runtime.

> **Créditos:** este projeto é um fork do [ZCode](https://github.com/zai-org/ZCode), mantido pela [Z.ai](https://z.ai), distribuído sob a licença Apache-2.0. Todos os créditos pela base original pertencem aos autores do upstream; as adaptações deste fork são mantidas pela comunidade.

## Atualizações

- 2026-10-19: sincronizado com o ZCode v3.16.2.
- 2026-10-16: sincronizado com o ZCode v3.16.1.
- 2026-10-10: sincronizado com o ZCode v3.15.1.
- 2026-09-23: sincronizado com o ZCode v3.14.3.

## Inicialização

Prepare Git, Node.js **24.14.0** e pnpm **10.33.2**; as versões de referência estão em [mise.toml](mise.toml). Os comandos de desenvolvimento e empacotamento abaixo são executados na raiz do repositório.

```bash
pnpm bootstrap
```

O `pnpm bootstrap` instala as dependências dos workspaces, prepara os recursos locais de execução do desktop e roda `build:bootstrap`.

O código do Agent CLI e do runtime fica em [apps/zcode-cli/](apps/zcode-cli/), como um diretório comum clonado junto com o repositório — não é preciso puxar ou inicializar submodule Git separado.

Outros pontos de entrada de inicialização e build, conforme a necessidade:

| Comando                        | Finalidade                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------- |
| `pnpm install`                 | Instala dependências                                                              |
| `pnpm prepare:desktop-runtime` | Prepara os recursos de execução do desktop, incluindo por padrão os remotos       |
| `pnpm prepare:remote-assets`   | Prepara separadamente os recursos remotos                                         |
| `pnpm bootstrap:with-remote`   | Inicializa dependências e recursos locais/remotos e constrói os pacotes em série; pula o bundle do desktop |
| `pnpm build`                   | Executa recursivamente os scripts de build de cada pacote do workspace, incluindo as etapas de preparação de recursos |

Por padrão o `bootstrap` pula a preparação dos recursos remotos — adequado para o desenvolvimento desktop local. Ao usar workspaces remotos ou validar artefatos de distribuição remota, rode o comando de preparação correspondente.

## Desenvolvimento e execução

### Desktop

```bash
pnpm dev:desktop

# Usando ambiente de teste
pnpm dev:desktop:test
```

O `pnpm dev:desktop` equivale por padrão ao `pnpm dev:desktop:prod`, usando a configuração de serviços de produção. O script de inicialização prepara os recursos locais, constrói o agente desktop e então inicia o Electron e o modo de observação do código-fonte.

Para usar um diretório de dados independente durante o desenvolvimento, defina `ZCODE_DATA_BASE_DIR`. Por exemplo, no macOS / Linux:

```bash
ZCODE_DATA_BASE_DIR="$HOME/.zcode-dev-home" pnpm dev:desktop:test
```

### Recursos remotos (SSH/WSL)

Antes, rode `pnpm bootstrap:with-remote` para preparar os recursos remotos (mock-cdn); depois `pnpm dev:desktop`. Ao conectar a um projeto remoto, selecione "download local e upload" nos recursos. No estado de desenvolvimento, os recursos vêm do `packages/desktop/mock-cdn` local e dos artefatos de build locais, enviados via SFTP ao host remoto — sem acessar CDN.

### Desenvolvimento Web

Ao alterar o código do Web ou do backend, use o modo de desenvolvimento:

```bash
pnpm dev:web

# Especifica o workspace do backend (macOS / Linux)
ZCODE_SERVER_WORKSPACE=/caminho/do/projeto pnpm dev:web
```

O comando inicia o servidor de desenvolvimento Web (padrão `http://localhost:5173`) e o backend (padrão `http://localhost:3030`); o acesso pelo navegador é no primeiro. As requisições `/ws` e `/api` em geral são encaminhadas ao backend local; `/api/v1/oauth/token` é encaminhado separadamente ao serviço de produto configurado.

Após alterar o código do agente, execute `pnpm --filter @zcode/cli... build` e reinicie o serviço. Para validar o pacote completo de distribuição, siga a seção de empacotamento "BR Code linha de comando" abaixo.

### BR Code linha de comando

O pacote de distribuição de linha de comando inclui TUI, Web e o agente, todos iniciados pelo comando `zcode`: sem parâmetros abre a TUI; com `--web` como primeiro parâmetro inicia a versão web; os demais parâmetros vão para o Agent CLI existente. Nos dois modos tudo roda localmente, sem Electron.

```bash
# Abre a interface interativa no terminal (padrão)
zcode

# Inicia a interface web
zcode --web

# Especifica projeto e porta, sem abrir o navegador
zcode --web --workspace /caminho/do/projeto --port 3030 --no-open

# Ver os parâmetros da CLI ou do modo web
zcode --help
zcode --web --help
```

No modo web, o diretório de trabalho padrão é o atual, escutando em `127.0.0.1`, sem token de acesso por padrão, escolhendo uma porta livre e abrindo o navegador. Acesse o endereço exibido no terminal e pare o serviço com `Ctrl+C`. Para acesso pela rede local, use `--host 0.0.0.0`; ao escutar em endereço não local, um token de acesso é gerado por padrão — use o link com token exibido no terminal. É possível definir o token com `--token` ou desativar a autenticação com `--no-token`.

Ao iniciar diretamente a entrada HTTP do serviço web genérico, a autenticação de API/WebSocket é configurada por `ZCODE_SERVER_AUTH_TOKEN`; ao criar o serviço pela API de programação, use a opção `authToken`.

O build é detalhado na seção de empacotamento. O `pnpm build:zcode` apenas gera o pacote de distribuição; ele não substitui um `zcode` já existente no `PATH`. Se o comando ainda apontar para uma instalação antiga, verifique com `command -v zcode` (macOS / Linux) ou `where.exe zcode` (Windows).

### Desenvolvimento do código da CLI

A configuração de modelos do CLI, as chamadas não interativas, as ferramentas e extensões, a avaliação em lote e o registro de trajetórias estão no [guia de uso da CLI](apps/zcode-cli/docs/usage/README.md).

Para desenvolver diretamente a TUI ou o agente, rode a entrada a partir do código-fonte:

```bash
pnpm --filter @zcode/cli dev --help
pnpm --filter @zcode/cli dev

# Constrói a CLI e suas dependências de workspace
pnpm --filter @zcode/cli... build
node apps/zcode-cli/packages/cli/dist/zcode.cjs --help
```

Essa entrada roda o Agent CLI diretamente, sem passar pelo roteamento `--web` do pacote de distribuição. Para desenvolver o web, use `pnpm dev:web`; para validar o comando unificado `zcode`, use o `bin/zcode.mjs` após extrair o pacote.

### Desenvolvimento de UI Plugin

Veja [UI Plugin: capacidades, API e depuração](UI_PLUGIN.md), começando pelo exemplo de colaboração em canvas do Excalidraw, para entender instalação/atualização de plugins, APIs de página e pontos de integração com o host.

## Configuração

O [.env.example](.env.example) na raiz traz exemplos de endereços de serviço e configuração de build; copie para `.env` conforme a necessidade, com sobrescritas locais em `.env.local`. O ambiente de desenvolvimento do desktop é escolhido por `dev:desktop:test` / `dev:desktop:prod`.

| Configuração                         | Finalidade                                                        |
| ------------------------------------ | ----------------------------------------------------------------- |
| `ZCODE_DATA_BASE_DIR`                | Diretório base dos dados da aplicação; os dados vão em `.zcode/`  |
| `ZCODE_SERVER_WORKSPACE`             | Caminho do workspace do backend web                               |
| `ZCODE_BUILTIN_PROVIDER_CONFIG_FILE` | Caminho do arquivo local de configuração de providers; sem ele, usa-se a configuração embutida |
| `ZCODE_DIST_BASE_URL`                | URL raiz de download usada pelo script de instalação da CLI       |

Variáveis de runtime podem ser definidas explicitamente no ambiente do comando de inicialização. A configuração padrão distribuída com o cliente está em [config/README.md](config/README.md).

## Empacotamento

Geração das declarações de terceiros, processo de verificação de distribuição e localização das declarações nos artefatos: [third-party/README.md](third-party/README.md).

### Desktop

```bash
pnpm bundle:desktop

# Define plataforma e arquitetura de CPU alvo
pnpm bundle:desktop -- --os win --arch x64

pnpm bundle:desktop -- --help
```

O alvo padrão é macOS arm64 e o diretório de saída padrão é `packages/desktop/dist/`. O `--os` aceita `mac`, `win` e `linux`; o `--arch` aceita `x64` e `arm64`. Empacotar e assinar de fato requer as ferramentas e a configuração da plataforma alvo.

Instalação: abra o DMG gerado e arraste o BR Code para "Aplicativos". Builds locais não são assinados; se o macOS bloquear a primeira abertura, execute:

```bash
sudo xattr -rd com.apple.quarantine /Applications/BRCode.app
```

### BR Code linha de comando

O ponto de entrada do build é `pnpm build:zcode`. O script constrói em sequência CLI/TUI, backend e web, coleta as bibliotecas nativas, workers e dependências de runtime da TUI e monta o pacote de distribuição; para executá-lo ainda é preciso Node.js, na versão de referência do `mise.toml`.

Antes de empacotar, é obrigatório definir a URL raiz de download `ZCODE_DIST_BASE_URL` (em `.env`, `.env.local` ou variável de ambiente), ou passá-la via `--base-url`. Os endereços abaixo são exemplos de preenchimento — substitua pelo endereço real de hospedagem na publicação:

```bash
pnpm build:zcode --base-url https://downloads.example.com/brcode/

# Com ZCODE_DIST_BASE_URL já configurado
pnpm build:zcode

# Apenas remonta o pacote, reaproveitando builds existentes do agente, backend e web
pnpm build:zcode --skip-build

# Ver versão, diretório de saída e outros parâmetros
pnpm build:zcode --help
```

A versão padrão vem do `package.json` da raiz; a saída fica em `dist/zcode/`:

- `releases/<versão>/zcode-<versão>.tar.gz`: pacote de execução.
- `releases/<versão>/sha256.txt`: resumos de verificação.
- `latest.json`, `install.sh`: índice de versões e script de instalação.

O diretório completo pode ser enviado para a URL raiz de download configurada. O script de instalação baixa o pacote de lá, instala por padrão em `~/.zcode/runtime` e cria o comando `zcode` em `~/.local/bin`. O diretório de instalação pode ser alterado com `ZCODE_DIST_HOME` e o diretório do comando com `ZCODE_DIST_BIN_DIR`.

Para depurar o artefato localmente, basta extrair e executar, sem upload nem instalação:

```bash
zcode_version=$(node -p "require('./dist/zcode/latest.json').version")
mkdir -p dist/zcode/debug
tar -xzf "dist/zcode/releases/$zcode_version/zcode-$zcode_version.tar.gz" \
  -C dist/zcode/debug
# Inicia a TUI (padrão)
node dist/zcode/debug/zcode/bin/zcode.mjs

# Inicia o modo web
node dist/zcode/debug/zcode/bin/zcode.mjs --web \
  --workspace "$PWD" --port 3030 --no-open
```

Abra `http://127.0.0.1:3030` no navegador para validar a cadeia completa: o mesmo backend servindo as páginas web e o agente. A porta precisa estar livre; se o `pnpm dev:web` estiver rodando, use outra `--port`.

## Estrutura do repositório

| Diretório                                             | Responsabilidade                                             |
| ----------------------------------------------------- | ------------------------------------------------------------ |
| `packages/desktop`                                    | Electron Main, Host, Renderer e empacotamento desktop        |
| `packages/web`                                        | Cliente web                                                  |
| `packages/server`                                     | Serviço HTTP / WebSocket e conexões remotas                  |
| `packages/zcode-server-cli`                           | Inicialização independente do server e gestão de processos   |
| `packages/ui`                                         | Componentes React compartilhados, hooks e estado (Zustand)   |
| `packages/services`                                   | Serviços de negócio e persistência                           |
| `packages/shared`, `packages/rpc`, `packages/client`  | Protocolos e tipos compartilhados, framework RPC, SDK cliente do agente |
| `packages/provider`, `packages/provider-node`         | Capacidades comuns de providers e implementação Node         |
| `apps/zcode-cli`                                      | Agent CLI, TUI, runtime e ferramentas                        |
| `scripts`, `config`, `third-party`                    | Scripts de build, configuração embutida e materiais de terceiros |

## Avisos do projeto

Escopo de funcionalidades e ofertas, regras de manutenção, riscos de execução e dados, além das notas de licença e copyright de terceiros: [NOTICE.md](NOTICE.md).

## Licença

Este projeto é distribuído sob a [Apache License 2.0](LICENSE), herdada do upstream ZCode. Este fork **não** envia contribuições de volta ao repositório original — é uma adaptação independente mantida em [JoaoNetoDev/BR-Code](https://github.com/JoaoNetoDev/BR-Code).
