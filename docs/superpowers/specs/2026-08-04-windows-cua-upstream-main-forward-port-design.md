# Design de migração direta do Windows CUA sobre o main do upstream

> Data: 2026-08-04
>
> Estado: confirmado
>
> Repositórios relacionados: `C:\Users\dev\zcode-cua`、`C:\Users\dev\z-code`

## 1. Objetivo

Tomando como única linha de base a implementação já mergeada no upstream no `origin/main` mais recente do `zcode-cua`, migrar diretamente para essa linha de base as capacidades de Windows UIA, WGC, ponteiro, área de transferência, AUMID e runtime de Helper que já foram verificadas no branch de portabilidade para Windows; em seguida, fazer com que o branch atual do `z-code` consuma o novo commit de producer por meio de um caminho explícito de producer local, restaurando a cadeia de produto Windows CUA que pode gerar, validar, fazer staging e empacotar em uma consumer tree limpa. O usuário exigiu que não haja push nesta rodada, de modo que o pin de SHA do remoto e a clean install em qualquer máquina só fecham o ciclo depois que o commit de producer puder ser obtido do remoto; nesta rodada não é permitido commitar SHA inacessíveis nem caminhos locais `file:`.

Esta fase resolve somente o ciclo P0 producer/consumer. A página de configurações do Windows, a animação do aviso de status de operação no topo, a interrupção por Esc, a detecção de invalidação da entrada do usuário, o PiP e o modo em background apenas UIA-only pertencem a marcos posteriores e independentes.

## 2. Repositórios e fronteiras de histórico confirmados

- `z-code` continua sendo modificado no branch atual `feat/cua-helper-app`, sem criar um novo branch de feature.
- A linha de base de trabalho do `zcode-cua` é o `origin/main` mais recente; o `main` local é alinhado a essa linha de base e então gera diretamente um novo commit.
- O branch atual de portabilidade para Windows `codex/windows-cua-pointer-foundation` é mantido como fonte de migração e backup de segurança.
- Os commits Windows forked do branch de portabilidade a partir da linha de base comum são mesclados em um novo commit, colocado no topo do `main` mais recente.
- Não reescrever, não rebasing e não sobrescrever nenhum commit já existente no upstream.
- Os dois repositórios criam apenas commits locais, sem push.

```text
zcode-cua

共同基线 f285ccd8
      |\
      | +-- 上游后续实现 -----------------------> 最新 origin/main
      |
      `---- Windows 移植 49 commits ------------> 迁移来源分支

目标：

最新 origin/main
      |
      `---- 一个新的 Windows forward-port commit


z-code

当前 feat/cua-helper-app
      |
      `---- 消费上述 producer commit，并修复 staging/package contract
```

## 3. Abordagens não adotadas

### 3.1 Rebase um a um os 49 commits do port para Windows

Não adotada. As modificações posteriores do upstream e o branch Windows tocam simultaneamente broker, limpeza de entrada, estado de observação, native adapter e artefatos gerados. Um rebase commit a commit exigiria resolver repetidamente o mesmo conflito semântico e poderia restaurar como implementação antiga correções de segurança posteriores do upstream.

### 3.2 Reverter a dependência para `0.3.28`

Não adotada. Isso perderia as correções de segurança, de estado incremental, de PiP e de Helper de produto do upstream em `0.4.x` e `0.5.x`, além de violar a restrição de “as modificações do upstream prevalecem”.

### 3.3 Alterar apenas a constante de versão no z-code

Não adotada. O producer `0.5.2` atual não publica `dist/windows-helper.js` e não tem a ABI completa de WGC, ponteiro e clipboard do Windows; afrouxar a verificação no consumer transformaria capacidades ausentes em recursos de produto falsamente disponíveis.

## 4. Design do Producer: zcode-cua

### 4.1 Princípios de migração

A migração é reimplementada por fronteira de capacidade, sem sobrescrever arquivos mecanicamente:

1. Escrever primeiro, no `main` mais recente, os testes de falha da semântica atual;
2. Ler do branch de portabilidade para Windows o comportamento Windows verificado e as implementações Win32/WGC;
3. Ligar o comportamento ao broker, ao estado incremental, à limpeza de entrada e ao native loader atuais do upstream;
4. Em todos os conflitos, a implementação atual do upstream prevalece e apenas o branch Windows é complementado;
5. Regerar `dist/`, sem copiar os artefatos gerados do branch antigo.

### 4.2 Contrato de runtime pertencente ao producer

A entrada e os artefatos obrigatórios do Windows Helper são declarados pelo producer no `package.json` raiz. Recomenda-se usar os seguintes campos legíveis por máquina:

```json
{
  "zcodeCuaRuntime": {
    "schema": 1,
    "windows": {
      "entry": "dist/windows-helper.js",
      "nativeAddon": "build/Release/ax_native.node"
    }
  }
}
```

Restrições:

- `schema` precisa ser exatamente `1`; um schema desconhecido falha de forma fechada.
- Os caminhos precisam ser canonical relative path separados por `/`, sem `.`/`..`, sem caminho absoluto e sem escape por link simbólico.
- O nome do package precisa continuar sendo `@zcode/zcode-cua`.
- A versão do package é informação de provenance, lida pelo package de producer real, e não é hardcoded novamente no consumer.
- O commit de producer continua sendo fixado pelo Git SHA completo em `pnpm-workspace.yaml`; o contrato de runtime não pode substituir o Git pin.
- `pnpm build` precisa gerar a entrada do Helper; `pnpm pack --dry-run` precisa incluir a entrada, o código-fonte do build nativo e as dependências JS exigidas pelo runtime.

### 4.3 Capacidades Windows

Migrar diretamente as seguintes capacidades já verificadas no branch Windows antigo:

- UIA de aplicação, janela, árvore de elementos e ações semânticas;
- identidade canônica de executável de aplicativos comuns no Win32;
- ativação por AUMID e resolução única de HWND/PID de packaged apps;
- captura WGC de display/janela e o mapeamento dos bounds do screenshot para `state_image`;
- move, scroll, drag, mouse down/up em coordenadas de desktop virtual;
- leitura e escrita nativa assíncrona da área de transferência com `CF_UNICODETEXT`;
- entrada do Windows Helper, named pipe, parent PID, ready/health e limpeza na terminação;
- artefato de package, unit focado e live smoke opcional.

Não se altera a superfície canônica de 30 ferramentas e não se adicionam ferramentas MCP exclusivas de Windows.

### 4.4 Semântica do upstream que precisa ser preservada

- observação incremental/full e propriedade de `state_id`;
- isolamento de state por janela e re-resolução de elementos ao vivo;
- delivery-state de leitura/ação, sem repetir ações `possibly_sent`;
- warmup limitado, refresh marker e semântica de cancelamento;
- input hold registry e limpeza de input pertencente após stop/cancel;
- comportamento de macOS AX, ScreenCaptureKit, input por PID, PiP e Helper assinado;
- comportamento de Linux AT-SPI;
- superfície canônica plana de 30 ferramentas.

## 5. Design do Consumer: z-code

### 5.1 Staging

`packages/desktop/scripts/windows-cua-helper-assets.mjs` lê a entrada e o native addon do `package.json.zcodeCuaRuntime.windows` da dependência Git fixada, sem manter mais uma verdade independente de `0.3.28`/`dist/windows-helper.js`.

O staging continua responsável por:

- validação de nome de package, schema, caminho canônico e arquitetura suportada;
- validação de runtime do Electron, machine do PE e tipo de arquivo;
- inventário SHA-256;
- publicação atômica após a construção em diretório temporário;
- rejeição de links, de estouro de caminho, de arquivo ausente e de corrida de alteração do arquivo de origem.

O `runtime-manifest.json` gerado mantém a versão real do package, a entrada, o native addon, a versão do Electron, o target triplet e o digest de todos os arquivos.

### 5.2 Resolver de runtime

`windowsCuaDevRuntime.ts` valida o diretório de desenvolvimento e o recurso de produto usando o mesmo schema de contrato/manifesto do producer. O runtime de produto confia apenas em `resources/tools/cua-helper` do app; `ZCODE_CUA_DEV_ROOT` serve apenas como override explícito de desenvolvimento local, sem varrer diretórios vizinhos e sem baixar recursos.

### 5.3 Clean checkout

`prepare-runtime-assets.mjs` precisa incorporar o staging do Windows CUA ao fluxo de preparação de recursos tanto do build local do Windows quanto do build oficial, sem depender dos arquivos históricos de `bundled-tools` ignorados pelo `.gitignore`.

```text
pnpm install（固定 producer SHA）
        |
        v
读取 producer runtime contract
        |
        +-- build/source artifacts 缺失 --> fail closed
        |
        v
校验 native / Electron / target arch
        |
        v
生成带 digest 的 staged runtime
        |
        v
electron-builder -> resources/tools/cua-helper
        |
        v
Desktop local Host 按需启动 Windows Helper
```

## 6. Ciclo de vida e fronteiras de modo

```text
desktop-local + win32 + official plugin enabled
        |
        v
Host resolves verified packaged runtime
        |
        v
spawn Electron Node child
  argv: entry / socket / parent-pid
  env : bearer token（不进入 argv/日志）
        |
        v
ready + health exact PID evidence
        |
        v
Agent receives broker credentials
        |
        v
30-tool continuous local CUA

SSH / WSL / Docker / remote workspace / mobile /remote
        |
        `--> 不安装、不暂存、不启动独立 Windows Helper
```

Esta fase não altera a semântica de `continuous` do desktop nem de `replayable` do web remote, e não adiciona runtime, snapshot, queue ou owner command de remote.

## 7. Semântica de erros

| Cenário                                        | Comportamento                                          |
| ---------------------------------------------- | ------------------------------------------------------ |
| contrato do producer ausente ou schema não suportado | build/staging falha de forma fechada                   |
| entry/native addon ausente                    | build/staging falha de forma fechada                   |
| digest staged, arch PE ou Electron divergente | o resolver de runtime recusa a inicialização           |
| WGC não suportado, tela bloqueada, alta integridade ou janela minimizada | unavailable explícito, sem retornar sucesso em branco |
| AUMID/identidade de exe não resolvível de forma única | rejeição antes da action, sem adivinhar PID           |
| alvo do raw input não é um único PID em foreground | rejeição antes da action, sem ativação automática e sem replay |
| clipboard fora da área de interação ou ocupado além do timeout | falha limitada, sem adicionar fallback em PowerShell |
| stop do Helper ou saída do pai                  | interrompe a admissão, libera o input pertencente e fecha o pipe |

## 8. Estratégia de testes

A implementação segue estritamente RED → GREEN → REFACTOR.

### 8.1 zcode-cua

Adicionar primeiro, no main mais recente, os testes de falha que provam as lacunas atuais:

- contrato de package e export/artefato de `windows-helper`;
- combinação do broker do current-main com a entrada do Windows Helper;
- capacidade de captura WGC de janela/display e estado fail-closed;
- gate de PID em foreground do ponteiro, desktop virtual e cleanup;
- capacidade de clipboard, retry limitado e round-trip Unicode exato;
- ativação por AUMID, HWND/PID único e identidade de executável Win32;
- regressão do estado incremental, cancelamento, delivery-state e limpeza de input do upstream.

Portão automatizado mínimo:

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm rebuild:native
pnpm build
pnpm pack --dry-run
```

O Windows live smoke roda depois do portão automatizado e cobre WGC, ponteiro, clipboard e a superfície de 30 ferramentas; eles não substituem os testes de unit/integration.

### 8.2 z-code

Modificar primeiro os testes para que esperem o contrato pertencente ao producer e o staging limpo, e observar a falha da implementação antiga:

- `windows-cua-helper-assets.test.ts`: versão/contrato reais do package, caminhos e digest;
- `windowsCuaDevRuntime.test.ts`: manifesto e contrato do producer, sem fixar mais `0.3.28`;
- `runtime-asset-scripts.test.ts`: a preparação do Windows realmente chama o staging do CUA;
- integração do Helper de produto: child real, named pipe, ready/health e parada limpa;
- coerência de provenance/versão: os dois alias de dependência fixados no mesmo commit completo.

Portão automatizado mínimo:

```powershell
pnpm exec vitest run packages/desktop/test/windows-cua-helper-assets.test.ts
pnpm exec vitest run packages/services/test/windowsCuaDevRuntime.test.ts
pnpm exec vitest run packages/services/test/windowsCuaDevHelperHost.test.ts
pnpm --filter @zcode/zcode-cua-plugin test
pnpm typecheck
pnpm lint
```

Antes de concluir, também é preciso executar a preparação de recursos e o package smoke a partir de um diretório temporário sem `bundled-tools` histórico.

## 9. Impact Brief

| Campo          | Conclusão                                                          |
| -------------- | ------------------------------------------------------------------ |
| Capability     | Computer Use / desktop-local CUA                                   |
| Change layer   | validation, commit-effect, persistence/build artifact             |
| Modo de operação        | planning                                                          |
| Entrada principal        | desktop local Host, official CUA plugin, Windows packaged runtime |
| Fora de escopo      | UI de configurações, conversation stream, mobile replay, remote runtime      |

### 9.1 Superfície/owner

| Cenário                   | Entrada                               | Authority                                    | Commit/efeito colateral | Limite de modo         |
| ------------------------- | ------------------------------------- | -------------------------------------------- | ----------------------- | ---------------------- |
| Windows desktop local CUA | official plugin + Host                | pinned producer contract + packaged manifest | inicia o Helper child local | desktop-continuous only |
| macOS desktop local CUA   | Computer Use settings + signed Helper | signed Helper/TCC                            | instala ou inicia o Helper.app | permanece inalterado |
| mobile remote             | `/remote` shared-host attachment      | desktop Host já existente                    | apenas repassa/anexa   | não cria Helper         |

### 9.2 Graduação das relações

| Nível          | Relação                                         | Razão                                         |
| -------------- | ----------------------------------------------- | --------------------------------------------- |
| must-inspect   | zcode-cua package -> staging/resolver do z-code | mesmo contrato de runtime producer/consumer    |
| must-inspect   | ciclo de vida do Host -> credenciais do official plugin | a autoridade só é projetada após o Helper ready |
| should-inspect | electron-builder/preparação de runtime          | o clean checkout precisa ser reproduzível      |
| invariant-only | Helper/TCC/PiP do macOS                         | a migração Windows não pode alterar a semântica macOS do upstream |
| invariant-only | web remote shared-host                          | não adicionar runtime independente            |
| evidence-only  | Windows live smoke                              | prova o comportamento real, não define fronteiras de produto |

### 9.3 Graph drift

O feature graph existente descreve `boundary.cua-desktop-local` como macOS-only, mas o código real já contém o branch de Host para Windows. Na fase de planejamento ele é corrigido para macOS/Windows desktop-local e completado com seeds de código de runtime/Host do Windows; se está “pronto para publicação” continua sendo decidido pelo gate de clean-package deste spec.

## 10. Poda de casos de uso e aceite

| ID      | Setup                                      | Action                 | Assertions                                  | Estado               |
| ------- | ------------------------------------------ | ---------------------- | ------------------------------------------- | ------------------ |
| WCFR-01 | clean zcode-cua latest main                | build/package          | contract, entry e native source estão no pack | accepted           |
| WCFR-02 | clean z-code checkout + SHA de producer fixado | prepare runtime        | não depende de arquivo ignorado e gera manifest com digest | accepted           |
| WCFR-03 | packaged Windows local desktop             | enable official plugin | Helper ready, 30 tools chamáveis e sem órfãos ao sair | accepted           |
| WCFR-04 | janela de teste ocluída e não minimizada    | capture                | WGC devolve imagem não vazia vinculada ao HWND | accepted           |
| WCFR-05 | alvo minimizado/bloqueado/high-IL           | capture/action         | fail closed, sem sucesso falsificado        | accepted           |
| WCFR-06 | alvo em foreground muda antes do raw input  | dispatch               | a action é rejeitada e nenhuma entrada é enviada | accepted           |
| WCFR-07 | marcador de clipboard Unicode               | write/read/restore     | leitura exata e restauração do valor original | accepted           |
| WCFR-08 | AUMID de Calculator empacotada             | open/observe           | HWND/PID único e state posterior ligado ao mesmo app | accepted           |
| WCFR-09 | build/testes de macOS/Linux                 | regression             | comportamento existente e superfície de 30 tools inalterados | accepted           |
| WCFR-10 | workspace mobile/remote                    | initialize             | não faz staging nem inicia Helper independente | pruned: invariante de arquitetura |

## 11. Estratégia de commits

- `zcode-cua/main`: um commit `feat(windows): forward-port CUA runtime onto current main`.
- `z-code/feat/cua-helper-app`: o commit de spec do design e os commits de implementação posteriores são separados; a implementação usa Conventional Commits.
- Sem push, sem MR e sem criação de tag.

## 12. Definição de conclusão

O marco da página de configurações do Windows só é alcançado quando todas as condições abaixo forem satisfeitas simultaneamente:

1. o main mais recente do `zcode-cua` mais um único commit de forward-port do Windows passa por todos os portões obrigatórios;
2. o novo commit de producer pode ser consumido pelo `z-code` pelo caminho explícito de producer local;
3. a clean consumer tree consegue gerar os assets de runtime do Windows sem depender de arquivo ignorado histórico;
4. o resolver de runtime empacotado consegue validar e iniciar um Helper real;
5. as evidências focadas/live de WGC, ponteiro, clipboard, AUMID e das 30 ferramentas são preservadas;
6. não há regressão nos invariantes de macOS/Linux e desktop/mobile/remote;
7. ambos os repositórios têm commit local e nenhum push foi feito;
8. o pin de SHA remoto, a atualização do lockfile e a clean install em qualquer máquina ficam explicitamente adiados até depois do push do commit de producer e não podem ser falsificados como aprovados nesta rodada.