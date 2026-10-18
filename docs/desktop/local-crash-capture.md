# Arquivamento Local de Crash do Desktop

O processo principal do Desktop configura o caminho dos crash dumps no início do startup e mantém duas cadeias simultaneamente:

- O ARMS recebe crashes nativos e exceções do Electron main, usados para monitoramento em produção (`appARMSBootstrap.ts`)
- Localmente, uma cópia extra do minidump original é arquivada, facilitando a investigação pelo usuário ou pelo desenvolvedor (`desktopCrashCapture.ts`)

O crash collector do ARMS varre todos os dumps do diretório `live`. Para evitar que processos filhos ou programas externos, ao herdarem o Crashpad, misturem dumps de `hdc`, `plugin-container`, `chrome-headless-shell` etc. na saúde do ZCode,
o `beforeReport` preserva primeiro os eventos cujo `binary_images` contém o executável do produto ZCode atual; mas apenas acerto em binário não prova que foi um crash do processo principal. Dumps sem `native_dump_process_role=main` explícito são marcados como
`native_dump_unattributed`, continuando a preservar o evento diagnóstico original, mas não entram em App Crash / Crash-Free, evitando que
crash loops de helpers/utilities que compartilham executável entre Linux/Windows poluam as métricas de estabilidade do produto.
A origem do papel precisa ser a anotação estruturada do dump do Crashpad: o crash collector do `@arms/rum-electron`
deve localizar o info do Crashpad a partir do stream directory do minidump e, seguindo a referência RVA da anotação, ler
`process_type` / `ptype` e repassá-los como o `meta.process_type` do evento; no lado da aplicação, `browser` é normalizado para
`main`. Não se pode varrer o dump inteiro adivinhando bytes de key/value vizinhos; bytes homônimos não referenciados pela estrutura de anotação do Crashpad são ignorados.
O `meta.process` no evento é apenas o nome do aplicativo e não pode servir de fallback para o papel do processo; quando o papel está ausente ou não pode ser resolvido, é preciso manter
`native_dump_unattributed`.
Os nomes de executáveis confiáveis são obtidos simultaneamente do nome do aplicativo do produto e de `basename(process.execPath)`: em pacotes de produção ambos normalmente são iguais;
em desenvolvimento local o processo real usa `Electron`, e no Linux Preview usa-se `zcode-preview`, portanto não se pode comparar apenas `app.getName()` com o nome do módulo do dump.
O `archive` local continua preservando o arquivo original, e o filtro das métricas em produção não altera a cadeia de diagnóstico local.

## Estrutura de Diretórios

```
<appConfigDir>/crash/
  ├── live/        ← diretório de escrita em tempo real do Electron / Crashpad (`app.setPath("crashDumps")`)
  └── archive/     ← cópia local adicional mantida pelo ZCode
```

O `appConfigDir` tem como padrão `~/.zcode/v2/`; quando o usuário configura um `dataBaseDir` customizado, o caminho é `<dataBaseDir>/.zcode/v2/crash/` (depende de `desktopEarlyDataBaseDirBootstrap` injetar `dataBaseDir` antes da inicialização do crash).

## Política de Retenção do Arquivo Local

`archive/` é usado apenas para preservar minidumps originais, para investigação offline quando os eventos de produção não bastam para localizar o problema; ele não participa da coleta do Crashpad nem do envio ao ARMS. Para evitar que dumps históricos ocupem indefinidamente o disco do usuário, o arquivo local segue estas regras:

- Manter no máximo os 5 `.dmp` mais recentes
- Exceto pelo mais recente, o tamanho total do arquivo não pode ultrapassar 100 MiB
- O `.dmp` mais recente é sempre mantido, mesmo que ele próprio exceda 100 MiB
- Ao remover `.dmp` antigos, remover também os metadados `.dmp.json` de mesmo nome; se a remoção dos metadados falhar temporariamente, a limpeza seguinte identifica e tenta novamente remover metadados órfãos que não têm mais um `.dmp` comum de mesmo nome, sem mexer em outros arquivos JSON
- A limpeza afeta apenas `archive/`; `live/` continua totalmente gerenciado pelo Electron Crashpad / ARMS

A limpeza é executada após cada arquivamento concluído, preservando os `.dmp` do mais novo para o mais antigo por data de modificação. Assim, limita-se o acúmulo de arquivos históricos,
como também garante que o crash nativo mais recente ainda tenha uma cena local original para análise. Se o dump mais recente for isoladamente enorme, o diretório pode
temporariamente ultrapassar 100 MiB; essa é uma exceção intencional para preservar a capacidade de diagnóstico do crash mais recente, e não uma cota rígida de disco.

## Ordem de Inicialização

1. `desktopEarlyDataBaseDirBootstrap`: leitura síncrona do `dataBaseDir` em `setting.json`
2. `appCrashCaptureBootstrap`: configura `crashDumps` e arquiva os `.dmp` remanescentes da rodada anterior
3. `appARMSBootstrap`: inicializa o ARMS (`collectors.crash: true`)
4. `index.ts`: `app.setPath("userData")` / `sessionData` etc.
5. `registerCrashEventMonitor`: arquivamento atrasado após crash do renderer / de subprocessos (evita ficar sem cópia local depois que o SDK limpa o diretório live)

## Arquivos Relacionados

- `packages/desktop/src/main/desktopDataBaseDirBootstrap.ts`
- `packages/desktop/src/main/desktopEarlyDataBaseDirBootstrap.ts`
- `packages/desktop/src/main/appCrashCaptureBootstrap.ts`
- `packages/desktop/src/main/desktopCrashCapture.ts`
- `packages/desktop/src/main/appARMSBootstrap.ts`
- `packages/desktop/src/main/index.ts`