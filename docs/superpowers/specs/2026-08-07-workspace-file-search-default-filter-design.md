# Filtro Padrão da Busca de Arquivos do Workspace

> Status: design confirmado em 2026-08-07. Em 2026-09-15 foi acrescentada a seção de fonte única de
> verdade do `.zcodeignore` (ZCT-2096811705629528064).

## Desativação Temporária da Criação Automática em 2026-09-28

A entrada de gerenciamento das regras de busca do workspace na interface foi ocultada temporariamente, e o
código de criação automática do `.zcodeignore` e seus logs foram comentados/desativados nesta mesma
ocasião, preservando a implementação para uma restauração posterior.
O comportamento de criação automática da seção de 2026-09-15 abaixo não é executado nesse período; o
restante das regras de casamento e da API de salvamento explícito permanece inalterado.

```text
搜索 → 工作区 File Service → 已有 .zcodeignore：读取规则
                         └→ 文件不存在：.gitignore + 默认规则，仅内存使用
```

Desktop e workspaces remotos compartilham este caminho de carregamento de regras, sem alterar as
fronteiras de session/task stream ou continuous/replayable.
Aceitação: a busca não cria `.zcodeignore`, as regras em memória continuam filtrando diretórios de
build/dependências, e um `.zcodeignore` fornecido manualmente continua valendo.

## Contexto

Os candidatos de arquivo `@` do Composer, a busca de arquivos do workspace no Command Center e o estado
de busca do Workspace File Tree à esquerda chamam todos `IFileService.listWorkspaceFiles`. A implementação
atual fixa a blacklist padrão diretamente como função booleana e poda por completo qualquer diretório
iniciado por `.`, o que impede que arquivos de usuário em diretórios como `.github/workflows` e `.vscode`
sejam encontrados por busca de nome de arquivo.
Alguns nomes de diretório genéricos e sufixos de arquivo também são filtrados em excesso, como `build`,
`vendor`, `*.map` e `*.min.js`.

Contexto acrescentado em 2026-09: depois que a blacklist liberou diretórios de build como `bin`/`obj`, o
índice de arquivos `@` de workspaces .NET passou a percorrer inteiros `obj/` e `bin/Debug` (dezenas de
milhares de arquivos), a varredura ficou lenta em segundos e a cardinalidade de candidatos amplificou o
custo de filtragem da camada de render (feedback do usuário ZCT-2096811705629528064: "`@` referenciando
arquivo é muito lento e trava o app"). A causa raiz é que o índice não tem ciência da semântica de ignore
do repositório — artefatos de build quase sempre são declarados no `.gitignore`, e o lado da ferramenta deve
respeitá-la (comportamento padrão de ripgrep/fd/VS Code Quick Open). Este repositório optou por convergir
isso para uma fonte única de verdade em nível de workspace, o `.zcodeignore`, tratado em seção própria
abaixo.

## Objetivos desta Fase

- Encapsular a blacklist de arquivos do workspace como uma interface estável de filtro dentro do service.
- Fornecer uma implementação de filtro padrão que corrija as regras padrão amplas demais.
- O `fileService` depende apenas do filtro finalmente injetado; quando nada é injetado, usa a implementação
  padrão.
- Preservar uma entrada de substituição para regras personalizadas futuras, mas esta fase não define a
  origem nem o formato das regras personalizadas.

O que não é implementado nesta fase:

- ~~leitura de arquivo ignore ou semântica de git ignore~~ (em 2026-09-15 entregue pela seção do
  `.zcodeignore`);
- ~~página de Settings, schema de configuração ou persistência~~ (em 2026-09-05 entregue a página de
  edição das regras de ignore de busca do workspace);
- ~~dependência de glob/matcher~~ (em 2026-09-15 introduzido o pacote npm `ignore`, ver seção dedicada);
- passagem de regras por renderer/RPC;
- estratégia de mesclagem entre regras padrão e personalizadas (o `.zcodeignore` é o único arquivo de
  regras, então não há problema de mesclagem).

As regras personalizadas futuras podem vir de um arquivo, de uma página de configurações ou de outra
configuração. A camada de configuração é responsável por compilar as regras na mesma interface de filtro e
por substituir a implementação padrão ao criar o file service. Como é uma substituição completa e não uma
união com a blacklist padrão, a implementação futura pode reincluir caminhos antes excluídos por padrão,
como `node_modules` e `.env`.

```text
当前
createFileService()
    └─ DefaultWorkspaceFileSearchFilter
          └─ 默认黑名单

未来
自定义规则来源（文件 / 设置页面 / 其他）
    └─ CustomWorkspaceFileSearchFilter
          └─ 注入 createFileService，完整替换默认实现
```

## Contrato do Filtro

O filtro recebe o contexto completo de uma entry do workspace:

- `name`
- `path`
- `relativePath`
- `type`

O filtro decide separadamente:

- `include`: se a entry atual é devolvida ao chamador da busca;
- `traverse`: quando a entry atual é um diretório, se a varredura continua nos descendentes.

Separar as duas decisões é o前提 para o comportamento correto de diretórios ocultos:

```text
普通目录 src/                 include=true   traverse=true
隐藏目录 .github/             include=false  traverse=true
默认排除目录 node_modules/    include=false  traverse=false
普通文件 App.tsx              include=true   traverse=false
```

Tratamento de erros próprios do sistema de arquivos, como diretório ilegível ou path desaparecendo, não
faz parte do filtro de conteúdo e continua sendo responsabilidade do `fileService`. Soft links de
diretório e Junctions do Windows são entregues ao filtro primeiro conforme o tipo do alvo, mas o índice não
continua a recursão pelo link, evitando ciclos de link e varredura que ultrapassa a raiz do workspace.

## Regras Padrão

### Diretórios Excluídos por Padrão

O filtro padrão continua excluindo e parando a travessia de diretórios explicitamente grandes de
dependências, cache, relatórios ou internos de ferramentas, incluindo:

- `.git`, `.hg`, `.svn`;
- `node_modules`, `bower_components`, `jspm_packages`;
- `__pycache__`, `site-packages`, `venv`;
- `coverage`, `htmlcov`, `lcov-report`;
- `CMakeFiles`, `cmake-build-*`, `bazel-*`, `Pods`, `DerivedData`;
- `storybook-static`, `playwright-report`, `test-results`, `allure-results`, `allure-report`, `cdk.out`;
- `eggs`, `pip-wheel-metadata`, `wheels`, `*.egg-info`, `*.dist-info`.

Essas regras são apenas a implementação padrão e não são uma fronteira de segurança que um futuro filtro
personalizado não possa sobrescrever.

### Caminhos Ocultos

- Um diretório oculto comum em si não entra como candidato, mas a varredura de descendentes continua.
- `.github/workflows/release.yml` pode ser encontrado buscando `release`, mas `.github` não ocupa a
  vaga de diretório de uma query vazia.
- Arquivos ocultos comuns como `.gitignore` entram como candidatos.
- `.env` e `.env.*` são excluídos pelo filtro padrão, incluindo arquivos com o mesmo nome dentro de
  diretórios ocultos.
- `.git`, `.hg`, `.svn` continuam parando a travessia por meio das regras explícitas de diretório.

### Conteúdo que Deixa de Ser Excluído por Padrão

Os nomes a seguir podem conter código, scripts ou configuração mantidos pelo usuário e são removidos da
blacklist padrão de diretórios nesta fase:

- `vendor`, `env`, `dist`, `build`, `out`, `target`;
- `bin`, `obj`, `classes`, `_build`, `deps`, `dist-newstyle`, `renv`.

Os seguintes sufixos de arquivo também deixam de ser excluídos por padrão:

- `*.map`;
- `*.min.js`;
- `*.min.css`.

Esta fase não introduz pesos de ordenação; o conteúdo restaurado participa como candidato comum da busca e
da ordenação existentes.

### Arquivos que Continua Excluídos por Padrão

Caches de compilação, binários e artefatos de pacote explicitamente identificados continuam excluídos por
padrão, como `.pyc`, `.class`, `.dll`, `.exe`, `.o`, `.jar`, `.so`, `.tsbuildinfo`, além de
`coverage.out` e `lcov.info`.

## `.zcodeignore`: fonte única de verdade do ignore da busca do workspace (2026-09-15)

### Posicionamento e Fluxo de Dados

O `.zcodeignore` é o **único arquivo de regras** que controla o índice de busca de arquivos deste workspace
na raiz do workspace (sintaxe gitignore).
Ele não é uma segunda camada de regras paralela ao `.gitignore` — na primeira vez em que regras forem
necessárias e o arquivo não existir, o Host cria automaticamente um `.zcodeignore` cujo conteúdo é "cópia
do `.gitignore` da raiz + segmento de exclusões padrão embutido separado por comentários"; depois disso, a
busca segue apenas o `.zcodeignore`, e mudanças posteriores no `.gitignore` não afetam a busca (quem quiser
sincronizar pode reconstruir explicitamente pela página de configurações com "sincronizar novamente a
partir do .gitignore"). O segmento padrão anexado (node_modules/ etc.) é um requisito de compatibilidade de
comportamento: em repositórios cujo `.gitignore` não declara esses diretórios, uma cópia pura abriria a
varredura de diretórios de dependências por completo e reintroduziria o problema de performance; o usuário
pode apagar esse segmento para liberar o diretório correspondente, mantendo a promessa de que o arquivo de
regras é a única fonte de verdade de diretórios, sem união feita em código. O próprio arquivo
`.zcodeignore` é configuração da ferramenta e não entra nos candidatos de `@`.

```text
workspace root
  ├─ .gitignore ──(仅首次拷贝)──┐
  │                             ▼
  └─ .zcodeignore <──自动创建── Host: listWorkspaceFiles 扫描前
        ▲                       │ 不存在→原子创建（gitignore 拷贝+默认排除段；
        │                       │   无 .gitignore→说明注释+默认排除段）
        │                       │ 读/建失败→fail-open：内存用同等内容执行，不阻塞扫描
        │                       ▼
        │            ignore 包解析（gitignore spec 2.22 参考实现）
        │                       ▼
        │            目录命中 → 不遍历整棵子树；文件命中 → 不进入候选
        │
  Settings「工作区搜索」section
        ├─ fileService.readWorkspaceFileSearchIgnore（走 workspace 服务解析，远程=远端 Host）
        ├─ textarea 编辑 → writeWorkspaceFileSearchIgnore（原子写，下次扫描生效）
        ├─ 「从 .gitignore 同步」按钮（分区操作：只重写 gitignore 同步区）
        └─ 「恢复默认规则」按钮（分区操作：只重置默认排除段）
```

### Semântica das Regras

- A análise é delegada ao pacote npm `ignore` (o mesmo do ESLint, implementação de referência da spec do
  gitignore), cobrindo declaração posterior sobrepondo anterior, desseleção com `!` (inclusive a restrição
  nativa do git de que um arquivo filho não pode ser ressuscitado por desseleção depois que o diretório
  pai foi excluído), casamento anchored e por basename, `**` entre níveis, sufixo de diretório `/`, classes
  de caracteres e escapes. É proibido escrever um parser próprio (a implementação privada do repo-wiki não
  satisfaz essa semântica).
- Existe apenas um `.zcodeignore` na raiz do workspace, sem mesclar `.gitignore`/`.zcodeignore` de
  subdiretórios (semântica transparente e editável como um todo; é uma simplificação deliberada em
  relação à semântica aninhada do ripgrep).
- As regras só valem para o "índice de busca" (candidatos de `@` / Command Center / busca do File Tree) e
  não afetam outras capacidades de arquivo, como navegação da árvore de arquivos, upload e acesso a
  arquivos pelo Agent.
- O `defaultWorkspaceFileSearchFilter` embutido mantém as regras de nível de arquivo (`.env`/sufixos de
  binário) e a semântica de busca em descendentes de diretórios ocultos, e é executado em conjunto com as
  regras do `.zcodeignore`; sua parte de blacklist de diretórios se aposenta como "conteúdo inicial do
  template padrão + fallback fail-open", deixando de ser uma regra de união no caminho regular.

### Criação Automática e Fail-open

- Na primeira varredura, ao descobrir que o `.zcodeignore` não existe, ele é criado por escrita atômica
  (arquivo temporário no diretório de destino + rename, com conteúdo determinístico idêntico, e criações
  concorrentes sobrescrevendo uma à outra de forma inofensiva); conteúdo = cópia do `.gitignore` da raiz +
  segmento de exclusões padrão embutido separado por comentários; sem `.gitignore` → comentários
  explicativos + segmento de exclusões padrão (comportamento igual à antiga blacklist padrão).
- Se a criação ou a leitura falhar (sistema de arquivos somente leitura, permissões) → a execução ocorre
  em memória com o conteúdo equivalente (se o `.gitignore` for legível, "cópia + segmento padrão"; caso
  contrário, apenas o segmento padrão). A degradação precisa gerar log de warn e não pode interromper a
  varredura (o painel de `@` não pode falhar por indisponibilidade do arquivo de regras).
- Eventos de criação/degradação são eventos de ciclo de vida de baixa frequência, usam logs de nível
  info/warn e não poluem o caminho quente da varredura.

### Fronteira Multiplataforma (seguindo os princípios já existentes desta seção)

A leitura, a criação e o casamento do `.zcodeignore` acontecem no file service Host da máquina onde está o
workspace (local = utility process do Local Host da janela; remoto = processo zcode-server remoto). A
página de configurações acessa o mesmo Host pelo serviço do workspace, escrevendo naturalmente na máquina
certa. A UI não mantém uma segunda cópia das regras nem faz pré-julgamento local.

## Fronteira Multiplataforma e de Chamadas

A filtragem acontece no Host do file service do workspace correspondente: workspace local usa o Local Host e
workspace remoto usa o Remote Host. A UI não lê paths locais para inferir o resultado da filtragem remota e
não mantém uma segunda blacklist.

Esta fase não modifica a semântica de session/task stream, continuous/replayable, remote attachment ou
workspace identity. O `@` do Composer, o Command Center e a busca do Workspace File Tree, por compartilharem
`listWorkspaceFiles`, usam o mesmo filtro padrão de forma síncrona. A busca do File Tree reutiliza apenas o
índice de candidatos, a filtragem do Host e a ordenação por fuzzy match; após a busca, o comportamento
próprio da árvore de arquivos continua valendo, como abrir o `PreviewPane` ou localizar/expandir
diretórios, sem inserir menção no Composer.

## Aceitação

- Os descendentes de diretórios ocultos comuns como `.github` podem ser encontrados por nome de arquivo,
  e o diretório oculto em si não entra como candidato.
- `.git` e `node_modules` por padrão não entram como candidatos e não têm descendentes varridos.
- `.env` e `.env.*` por padrão não entram como candidatos; `.gitignore` pode entrar como candidato.
- Arquivos antes filtrados por nome de diretório genérico ou por `.map`, `.min.js` e `.min.css` voltam a
  ser candidatos comuns.
- Após injetar um filtro substituto, as regras padrão deixam de ser executadas adicionalmente; a
  implementação substituta pode incluir `node_modules` e `.env`.
- A tolerância a diretórios ilegíveis, a estrutura de retorno e a ordenação existente permanecem
  inalteradas.
- A busca do Workspace File Tree e os candidatos de arquivo `@` usam o mesmo conjunto de candidatos e a
  mesma ordenação de casamento para o mesmo workspace e a mesma query; a diferença está apenas no
  comportamento de UI após a busca.

Aceitação adicional do `.zcodeignore` (2026-09-15):

- A primeira varredura cria automaticamente o `.zcodeignore`, com conteúdo de cópia do `.gitignore` +
  segmento de exclusões padrão embutido; sem `.gitignore`, comentários explicativos + segmento de exclusões
  padrão (comportamento igual à antiga blacklist embutida). O próprio `.zcodeignore` não entra como
  candidato.
- Diretórios atingidos pelo `.zcodeignore` não são percorridos por completo e arquivos atingidos não entram
  como candidatos; a semântica de `!`, anchored, `**` e sufixo de diretório `/` é igual à do git
  (garantida pelo pacote ignore).
- Editar o `.gitignore` não afeta os resultados de busca de um `.zcodeignore` já existente; após "sincronizar
  a partir do .gitignore" na página de configurações, o novo conteúdo passa a valer.

Operações por seção (complemento de 2026-09-15): internamente o `.zcodeignore` é dividido por duas linhas
de comentário marcadores — região de sincronização do gitignore (acima do marcador SYNC), segmento de
exclusões padrão (entre os dois marcadores) e região de regras personalizadas (abaixo do marcador DEFAULTS).
"Sincronizar a partir do .gitignore" reescreve apenas a região de sincronização do gitignore; "restaurar
regras padrão" redefine apenas o segmento de exclusões padrão; edições do usuário no segmento padrão (como
liberar node_modules) e o conteúdo da região de regras personalizadas não são sobrescritos por nenhum dos
botões.
Quando as linhas de marcador são removidas (formato antigo/limpeza manual), as seções não podem ser
localizadas estruturalmente e os botões degradam para uma reconstrução do conteúdo inicial completo.
Os dois botões apenas preenchem o campo de edição com o resultado, e só o salva grava em disco.
- Em caso de sistema de arquivos somente leitura ou falha de permissão, a varredura não é interrompida, e a
  cadeia de degradação (.zcodeignore → .gitignore → blacklist embutida) gera log de warn.
- A leitura/criação/casamento de regras de workspace remoto acontece no Host remoto, com comportamento
  idêntico ao local.