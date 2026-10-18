# Runtime de desenvolvimento com mise

## Contexto

A raiz do repositório e `apps/zcode-cli` dependem de consistência entre as versões de Node / pnpm. Até agora a raiz só marcava `>=24.0.0` em `engines.node` do `package.json`, enquanto o subprojeto do Agent fixava Node `24.14.0` e pnpm `10.33.2` via `.node-version` e `packageManager`. Em uma máquina nova ou um worktree novo é fácil instalar o runtime errado primeiro e só perceber o problema nas etapas de build do Electron, do Vite ou do Agent.

## Objetivo

- Depois de entrar no repositório, preparar o runtime de desenvolvimento com `mise install`.
- `mise run dev` inicia por padrão o ambiente de testes do desktop, facilitando o desenvolvimento local.
- `mise run dev` usa uma raiz de dados separada, evitando compartilhar credenciais de conta, configurações e índice de tarefas com o pacote de produção instalado.
- Os comandos mais usados de Web, desktop de produção, depuração de controle remoto e verificação têm aliases estáveis.
- Não alterar a lógica real de execução dos scripts pnpm existentes; o mise cuida apenas da orquestração de versões e pontos de entrada.
- O mise é uma entrada de desenvolvimento opcional e o Git pre-push não exige mise instalado; o push usa o Node / pnpm do ambiente atual, veja [Pre-push Hook](testing/pre-push-hook.md#开发环境与版本管理工具).

## Convenções

- Node é fixado em `24.14.0`, consistente com `apps/zcode-cli/.node-version`.
- pnpm é fixado em `10.33.2`, consistente com o `packageManager` de `apps/zcode-cli/package.json`.
- A etapa de instalação do Electron baixa por `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`, evitando timeout na conexão direta ao GitHub release ao instalar as dependências pela primeira vez.
- Os pontos de entrada das tarefas continuam chamando scripts já existentes no `package.json` da raiz, evitando divergência de semântica de inicialização entre desktop / web / agent.
- A tarefa `dev` chama `pnpm dev:desktop:test` e injeta `ZCODE_DATA_BASE_DIR=$HOME/.zcode-dev-home`; os dados reais do app ficam em `$HOME/.zcode-dev-home/.zcode/`.
- O diretório de dados Dev não copia automaticamente credenciais, configurações, histórico de tarefas ou estado de plugins do ambiente de produção; no primeiro arranque é preciso logar e configurar de novo.
- O `pnpm dev:desktop:test` em si mantém a semântica original de diretório de dados; o isolamento pertence apenas à entrada `mise run dev`.
- O início do desktop em produção usa `dev-desktop-prod`, que não herda a variável de diretório de dados da tarefa `dev`.
- Se um `dataBaseDir` customizado estiver configurado em `$HOME/.zcode/v2/setting.json`, ele sobrescreve esta variável por `applyEarlyDataBaseDirBootstrap()` (`setDataBaseDir()` tem prioridade sobre o env); para isolar, remova antes esse campo.
- O isolamento do diretório de dados não altera o protocolo de callback OAuth. O pacote de produção e o Dev continuam usando `zcode://`, portanto ao fazer login no Dev é preciso antes sair de outras instâncias do ZCode, para evitar que o callback seja recebido pelo processo errado.

## Relação com o rollback de 3996dcbdb3

`3996dcbdb3` (revert da série storage-profile) removeu do Desktop a capacidade de escolher automaticamente `$HOME/.zcode-dev/` com base em `app.isPackaged=false` e, junto, removeu o isolamento desta entrada. Como o storage profile não participa mais, a injeção de `ZCODE_DATA_BASE_DIR` pela entrada mise é o único meio de isolamento; `$HOME/.zcode-dev/` é um diretório obsoleto e não é mais usado por nenhum caminho de inicialização.

## Verificação

- `mise install`
- `mise run bootstrap`
- `mise run dev`
- `mise run typecheck`
- `mise run lint`