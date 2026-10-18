# Especificação de Compatibilidade de Testes Unitários no Windows

## Contexto

Na máquina de desenvolvimento Windows, `pnpm test` chegou a falhar em grande escala (56 arquivos / 161 casos) e a sair intermitentemente com um crash `0xC0000005` (ACCESS_VIOLATION). Depois da qualificação caso a caso, cerca de 97% eram problemas de compatibilidade do ambiente Windows, distribuídos em 8 classes de causa raiz; esta especificação registra como cada causa foi corrigida e quais regras os novos testes precisam seguir.
Branch: `fix/windows-unit-test-compat`.

## Estado após o rebase (2026-08-24, baseline origin/staging c8c15b8d02)

Após o rebase no staging mais recente, a suíte completa ficou com **9 falhas / 12444 aprovações**, sem crash. Composição restante:

| Categoria                                                  | Quantidade | Explicação                                                                                             |
| --------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------ |
| Resíduo de reciclagem da árvore de processos do Windows     | 3         | `zcodeAgentProcessManager`; o trabalho nos fixtures de lifecycle reduziu esse item de 8 para 3            |
| Drift já existente no staging (falha em qualquer plataforma) | 3         | Asserções de `formatCanonicalPluginName` do badge de scope MCP/skill/subagent das settings; `a9263f3d03` removeu a chamada do componente de lista sem sincronizar os testes, exigindo qualificação de negócio |
| Drift entre plataformas                                    | 2         | `feedbackHttpClient`, `stdioDesktopPresentationSurface` (ver abaixo)                                     |
| Flaky (timeout por carga)                                  | 1         | `appUsagePanel`, passa quando executado isoladamente                                                       |

Tratamento adicional junto com o rebase: o merge de pacote único de CUA do staging (51 arquivos do broker incorporados ao `@zcode/zcode-cua`)
removeu `launchSocketPath` / `reservedTransport` (mecanismo de cessão de rendezvous via `.pending`); o
windowsCuaDevHelperHost / node.ts local e os testes relacionados foram alinhados à nova API (no Windows, named pipe
não tem semântica de cessão por fs, então socketPath é a única fonte de verdade; caller_timeout é sempre warming up fail-closed).

## Fatos de ambiente (leia esta seção antes)

| Fato                                                                                                          | Impacto                                                                                                     |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| O repositório tem `core.autocrlf=true`, e o texto do workspace é CRLF                                          | Todo teste que “lê um trecho de código-fonte para asserir” precisa normalizar as quebras de linha            |
| O Git Bash injeta `/usr/bin` (GNU tar 1.35) no início do PATH                                                   | O GNU tar interpreta o `C:` dos parâmetros de arquivamento como host remoto; comandos como `zip`/`ditto` do macOS/Linux estão ausentes |
| No PATH real do usuário do Windows, System32 vem antes (bsdtar)                                                | O produto na máquina da pessoa usuária usa bsdtar; o ambiente de teste precisa restaurar a mesma ordem em vitest.setup.ts |
| O NTFS não preserva o bit de exec POSIX (0o111 é sempre 0)                                                     | As asserções do bit exec só valem em host POSIX                                                             |
| No Windows é impossível deletar o diretório cwd de qualquer processo; renomear o mesmo alvo com handle aberto dá EPERM | A ordem de teardown dos testes de ciclo de vida de subprocesso tem uma restrição rígida                     |
| `node:fs` globSync no Windows devolve caminhos com barra invertida                                             | O resultado do glob precisa ser normalizado antes do filtro por prefixo                                      |
| O endpoint de controle do produto usa named pipe `\\.\pipe\...` no Windows                                      | Os testes de IPC precisam construir o endpoint por plataforma; é proibido pular a cadeia do produto por causa de EACCES de um fixture de socket POSIX no Windows |

## As 8 causas raiz corrigidas e as regras

1. **CRLF (16 casos / 12 arquivos)**: novo `packages/{ui,desktop}/test/readSourceText.ts`
   (faz `\r\n → \n` após a leitura). Regra: testes de contrato que leem código-fonte passam sempre por `readSourceText` /
   `readSourceTextAsync`; é proibido usar `readFileSync + toContain(trecho multilinha)` puro.
2. **Injeção de fixture com caminho do Windows gerando JSON inválido (7 casos)**: a substituição de placeholder precisa trocar
   também as aspas, pelo produto de `JSON.stringify(path)`; é proibido fazer `replaceAll` de um caminho cru dentro de uma string JSON.
3. **GNU tar / zip / ditto (21 casos)**:
   - vitest.setup.ts coloca System32 à frente no PATH (no Windows, quando há tar.exe em System32);
   - o `stageRelease` do produto usa `tar -a` para escrever zip no Windows (**correção real de bug do produto**,
     já que a máquina Windows não tem o comando `zip`); o host POSIX mantém `zip`;
   - fixtures de zip criados em teste usam `tar -acf` no Windows; casos que dependem de `ditto` fazem skip em win32.
4. **Unix socket / caminhos exclusivos do macOS (cerca de 50 casos)**: o broker de permissões do CUA é exclusivo de macOS/Linux
   (.app / LaunchServices / codesign / ps+SIGTERM), e os describe/it relacionados usam
   `describe.skipIf(process.platform === "win32")` com o motivo anotado; os grupos de lógica pura, independentes de plataforma,
   continuam rodando. O canal de controle do ZCode Server não é desse tipo: a implementação do produto no Windows usa named
   pipe, e os testes devem cobrir com `resolveServerLayout(...).controlEndpoint` ou um helper de endpoint por plataforma equivalente.
   Regra: todo skip precisa explicar “por que o produto não suporta Windows”; é proibido skip sem comentário.
5. **Separador de caminho (cerca de 20 casos)**: casos que fazem mock de entrada em estilo POSIX devem construir a expectativa
   a partir da mesma origem do produto (`join` / `resolve` / `path.delimiter`) e validar a semântica de concatenação em vez da
   forma gráfica do separador. Exceção: literais POSIX hardcoded no produto (por exemplo, o caminho de exportação do flatpak)
   mantêm o literal na expectativa.
6. **Asserções do bit exec (3 pontos)**: envolvidas em `if (process.platform !== "win32")`.
7. **cMapUrl do pdfjs (1 caso, possível origem do 0xC0000005)**: a factory do Node usa fs.readFile para ler o caminho montado de
   cMapUrl; a única forma viável entre plataformas é um caminho de fs com barra normal + "/".
   URL `file://` e caminho com barra invertida não funcionam (já medido).
8. **EPERM no teardown**: o rm do teardown dos testes recebe `maxRetries/retryDelay` (mecanismo oficial de lock de arquivo do
   Node no Windows). Atenção: **retry não salva um handle mantido por muito tempo** (ver abaixo).

## Não Corrigido e Conhecido (exige trabalho dedicado; não use gambiarras às cegas)

### Reciclagem incompleta da árvore de processos do Windows (maior fonte de falha restante)

Sintoma: `zcodeAgentProcessManager` (8 casos) reporta
`runtime process tree cleanup incomplete; remaining pid=...`; como efeito derivado,
`zcodeAgentService(.v4)` / `localServicesRemoteAuthority` / `daemonRegistration`
(cerca de 32 casos) dão EPERM ao remover o diretório temporário no afterEach — **quando o subprocesso do agent não
saiu por completo, o cwd ocupa o diretório e o Windows não consegue deletar o diretório cwd de processo algum**
(validado com um repro mínimo: processo vivo → EPERM falha sempre; depois de sair → a deleção tem sucesso).

O ramo Windows de `processTreeTerminator.ts` (taskkill /T /F + verificação de identidade fail-closed) tem uma semântica de
projeto que precisa ser investigada por completo antes de mexer; é proibido usar gambiarras como “sleep sem critério antes
de deletar o diretório” ou “pular a verificação de identidade”. Ponto de entrada da investigação:
`cleanupManagedProcessForShutdown` → `forceTerminateWindowsProcessTree`
→ o relato de resíduos do `processTreeWaiter`, capturando a saída real do taskkill e a ordem de saída.

### Lacuna de design do produto: leitura estável do Project Memory vs rename no Windows

A premissa de `projectMemoryStableRead` — “a parte que lê mantém um handle O_RDONLY e a parte concorrente atualiza com um
rename atômico” — não vale no Windows: durante um handle aberto, o rename do mesmo alvo necessariamente dá EPERM (repro
mínimo já validado). O lado de teste passou a usar a ordem “rename primeiro, open depois”, consistente nas duas plataformas,
mas **o produto ainda vai encontrar isso no cenário real de concorrência no Windows**; é preciso projetar um ramo para
Windows (por exemplo, cair para copy+truncate quando o rename falha, ou retry do lado de escrita). Depois da correção,
restaurar a ordem original de mock como regressão.

### 3 falhas reais entre plataformas (não são problema do Windows; exigem qualificação de negócio)

- `stdioDesktopPresentationSurface`: espera que a montagem receba `presentationSurface: "desktop"`,
  mas `packages/server/src` não tem esse campo (a camada de services tem);
- `feedbackHttpClient`: com ZCODE_ENV=test espera a base `zcode.z.ai`, mas obtém `zcode.z.ai`;
- `useCodingPlanQuotaResetUi`: o mock recebe `builtin:personal-granted` e a expectativa é `builtin:team`.

### 0xC0000005 intermitente

Em execuções completas o worker do vitest sofre ocasionalmente um crash nativo (nesta rodada reproduzido uma vez, antes da
correção do caso CMap do pdfjs). Não reproduziu depois da correção do pdfjs, mas não há conclusão; se reproduzir, investigar
primeiro esse caso e a ordem de carregamento dos módulos nativos.

## Nota de Segurança

(Registro histórico) Quando `changelogAiClient` falhava, o vitet imprimia no output do teste o conjunto completo de variáveis
de ambiente reais (incluindo API key e JWT); esse teste foi removido junto com o pipeline customizado de changelog no
staging `b232f93ab1`, mas o comportamento de “assertion failure do vitest imprime o objeto inteiro com os parâmetros do
mock” continua — qualquer teste que faça asserção sobre options de spawn deve evitar colocar env real em um objeto diffável.
Logs de debug local precisam ser limpos com pontualidade, e credenciais que já vazaram devem ser rotacionadas.

## Novas Restrições de Regressão após o Rebase (2026-08-21)

- Um service descriptor do Windows em formato JSON precisa passar por `JSON.parse` antes da asserção de campos; é proibido casar o caminho cru com barra invertida diretamente no texto serializado.
- Caminhos temporários de teste precisam ser construídos com `join`; o PATH dentro de fixtures precisa ser construído com `path.delimiter`.
- Os testes de CUA do macOS se dividem em duas categorias: testes de lógica pura que podem injetar a plataforma passam explicitamente `platform: "darwin"`;
  grupos de testes que dependem da ABI nativa real do Darwin fazem skip explícito no Windows, e os testes de política independentes de plataforma continuam rodando.
- O estado JSON do Repo Wiki precisa passar pela ferramenta compartilhada de escrita atômica, evitando que um cancel/generate concorrente leia um JSON pela metade.
- A deduplicação de history/read do Coding Plan precisa incluir o escopo de provider/organization/project; é proibido usar apenas
  `usedAt`, senão o mesmo timestamp faz com que planos diferentes engulam o relato um do outro.
- Quando um teste simula escrita de ciclo de vida em background via timer, ele precisa manter essa Promise e aguardá-la antes do teardown;
  o nome do arquivo temporário precisa ser único, e é proibido fazer escrita fire-and-forget em um `.test.tmp` fixo.
- O cenário de substituição atômica “renomear sobre o arquivo alvo com um handle somente-leitura aberto” só vale em POSIX; no Windows
  o retorno é `EPERM` conforme o modo de compartilhamento de arquivo, e esses testes de semântica POSIX precisam ser isolados explicitamente, sem se disfarçarem de contrato entre plataformas.