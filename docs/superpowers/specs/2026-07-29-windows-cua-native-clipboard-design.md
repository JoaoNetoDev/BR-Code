# Design da Área de Transferência Nativa do CUA no Windows

## Objetivo

Preencher, para o source Helper no Windows, as implementações reais de texto de `read_clipboard` e
`write_clipboard`, de modo que `broker_info.capabilities.clipboard` seja `true` somente quando a
cadeia completa de leitura e escrita nativa existir. A implementação deve usar o
`CF_UNICODETEXT` do Win32 e não pode chamar PowerShell, shell, comandos externos nem o clipboard do
Electron.

Esta etapa cobre apenas o source Helper na sessão do usuário local logado no Windows. macOS, Linux,
SSH, WSL, Docker, remote workspace, `/remote` no celular e a cadeia de assinatura de empacotamento
do produto permanecem inalterados.

## Solução Confirmada

Adotar uma ABI nativa assíncrona aditiva:

- `readClipboardTextAsync(): Promise<NativeClipboardReadOutcome>`
- `writeClipboardTextAsync(text): Promise<NativeClipboardWriteOutcome>`

O `ax_native.node` do Windows executa operações de clipboard do Win32 limitadas em um worker
libuv; `createNodeAutomationAdapter` as usa se, e somente se, as duas exportações existirem. Quando
o addon antigo do Windows não tiver qualquer uma das exportações, ele continua reportando
`clipboard=false`; não é permitido implementação parcial nem fallback síncrono.

Soluções não adotadas:

1. Injetar o clipboard nativo em `WindowsNodeSystemSurface`: isso ampliaria os parâmetros de
   construção do factory do Helper e do SystemSurface, e o adapter já possui tanto o nativo quanto o
   system — adicionar um intermediário não traz benefício.
2. FFI em TypeScript: adicionaria dependências de runtime e riscos de ABI, além de duplicar a
   capacidade de isolamento de plataforma que o N-API já oferece.
3. PowerShell / `Get-Clipboard` / `Set-Clipboard`: violaria a restrição de que o source Helper não
   depende de comandos externos, e também introduziria diferenças de codificação, ciclo de vida de
   processo e política de comandos.

## Limites e Não Objetivos

Incluído:

- Ler e escrever o `CF_UNICODETEXT` do Windows;
- Semântica real de texto vazio e de clipboard vazio/sem texto;
- Conversão estrita UTF-8 ↔ UTF-16;
- Worker limitado, serialização interna do Helper, retentativa sob ocupação externa;
- Atualização de capability, erro de broker, delivery-state e do runbook do source;
- Round-trip real de broker com opt-in explícito, restaurando o texto original no `finally`.

Não incluído:

- Imagens, HTML, RTF, lista de arquivos, renderização diferida ou histórico do clipboard;
- Preservar formatos de clipboard não-textuais antes da escrita;
- Sincronização de clipboard entre dispositivos ou remota;
- WGC, captura de pixels da janela ou isolamento de worker UIA;
- Adicionar, remover ou renomear ferramentas MCP.

A semântica de produto de `write_clipboard` é substituir o clipboard atual por texto puro. O smoke
test explícito em máquina real também executa essa ação por um instante; ele consegue restaurar o
texto original, mas não os formatos adicionais que existiam junto, como HTML e imagens. Portanto o
smoke é desativado por padrão e só roda após um opt-in dedicado.

## Arquitetura e Fluxo de Dados

```text
read_clipboard
  │  READ_ONLY
  ▼
broker handler ──await──> Node automation adapter
                              │
                              ├─ win32 + dois exports nativos async
                              │       │
                              │       ▼
                              │   ClipboardReadWorker
                              │       │
                              │       ├─ mutex de clipboard do Helper
                              │       ├─ retentativa limitada de OpenClipboard
                              │       ├─ CF_UNICODETEXT / GlobalLock
                              │       └─ CloseClipboard → outcome UTF-8
                              │
                              └─ SystemSurface existente em macOS/Linux

write_clipboard
  │  T1_INPUT + possibly_sent
  ▼
broker handler ──await──> Node automation adapter
                              │
                              ▼
                         ClipboardWriteWorker
                              │
                              ├─ UTF-8 → UTF-16 + HGLOBAL pré-alocado
                              ├─ mutex de clipboard do Helper
                              ├─ retentativa limitada de OpenClipboard
                              ├─ EmptyClipboard
                              ├─ SetClipboardData(CF_UNICODETEXT)
                              └─ em caso de sucesso, a propriedade do HGLOBAL passa ao sistema
```

O action delivery-state do broker não muda: assim que `write_clipboard` entra na região
possibly-sent, erros de transporte não devem ser repetidos automaticamente. O nativo garante que,
ao falhar antes de `EmptyClipboard`, o estado do sistema não foi modificado; ao falhar depois de
`EmptyClipboard`, devolve uma falha explícita de escrita e o chamador continua tratando como
possibly-sent.

## ABI Nativa e Propriedade de Memória

### Outcome

Resultado de leitura:

```ts
type NativeClipboardReadOutcome =
  | { ok: true; text: string }
  | {
      ok: false;
      error: "busy" | "unavailable" | "invalid_data" | "too_large";
    };
```

Resultado de escrita:

```ts
type NativeClipboardWriteOutcome =
  | { ok: true }
  | {
      ok: false;
      error: "busy" | "unavailable" | "too_large" | "write_failed";
    };
```

O outcome não contém texto do clipboard, pipe, token, caminho de processo ou mensagens de erro
brutas do Win32.

### Serialização e Limites de Tempo

- Usar um `std::timed_mutex g_clipboardMutex` independente para serializar leitura e escrita deste
  Helper, sem reutilizar o lock de sequência de entrada;
- O worker espera no máximo 250ms para obter o mutex do Helper; em caso de timeout retorna `busy`, e
  nesse período não há efeito colateral no clipboard;
- Depois de obter o mutex, `OpenClipboard(nullptr)` é tentado no máximo 8 vezes, com intervalo de
  10ms;
- O limite normal do worker é inferior a 500ms, portanto o encerramento gracioso do Helper pode
  aguardar o término das operações já recebidas;
- Após o freeze do broker, nenhuma nova operação de clipboard é aceita, portanto não é necessário
  conectar o worker de clipboard à trava de parada de entrada.

O clipboard do Win32 só tem API síncrona; colocá-lo em um `Napi::AsyncWorker` é condição necessária
para esta etapa não bloquear as threads do broker/N-API, e não é permitido fazer polling ou sleep na
thread principal do JS.

### Leitura

1. Depois de abrir o clipboard com sucesso, garantir via RAII que todas as saídas chamem
   `CloseClipboard`;
2. Quando `CF_UNICODETEXT` não existir, retornar `{ok:true,text:""}`, indicando que o clipboard
   atualmente não tem texto;
3. Quando o formato existe mas `GetClipboardData` / `GlobalLock` falha, retornar `invalid_data`;
4. Usar `GlobalSize` para limitar a faixa legível, procurando o primeiro NUL UTF-16 dentro da faixa; é
   proibido `wcslen` sem limite;
5. Quando o texto exceder 8 Mi unidades de código UTF-16, retornar `too_large`;
6. Converter estritamente para UTF-8; em caso de falha de conversão, retornar `invalid_data`.

### Escrita

1. A thread N-API apenas lê os parâmetros e copia a string UTF-8, sem chamar o clipboard do Win32;
2. O worker converte estritamente UTF-8 para UTF-16, com no máximo 8 Mi unidades de código,
   incluindo o NUL final;
3. Concluir a alocação do `HGLOBAL` e a cópia do conteúdo antes de `OpenClipboard` /
   `EmptyClipboard`;
4. Depois do sucesso de `SetClipboardData`, o Windows assume o `HGLOBAL` e o worker não o libera
   mais;
5. Qualquer falha anterior é liberada pelo worker sobre o seu próprio `HGLOBAL`;
6. Se `SetClipboardData` falhar depois de `EmptyClipboard`, retornar `write_failed`; não é permitido
   reportar sucesso falsamente.

## Adapter, Capability e Semântica de Erros

`HelperNativeAddon` ganha dois métodos assíncronos opcionais e os tipos de outcome.

Os métodos de clipboard de `ElectronAutomationAdapter` permitem retorno síncrono ou Promise; os
dois handlers do backend passam a `async` e unificam o `await`, de modo que o SystemSurface
síncrono de macOS/Linux permanece compatível.

O clipboard nativo do Windows só é habilitado quando todas as condições abaixo são satisfeitas:

```text
platform == win32
AND typeof native.readClipboardTextAsync == "function"
AND typeof native.writeClipboardTextAsync == "function"
```

Regras de capability:

- Windows com as duas exportações presentes: `supportsClipboard=true`;
- Windows faltando qualquer uma delas: mantém `WindowsNodeSystemSurface.supportsClipboard=false`;
- macOS/Linux: continua usando a capability existente do seu SystemSurface, sem ler a ABI do
  Windows.

Mapeamento de erros:

- `busy` → `timeout` do broker, indicando que falhou antes da mutação;
- `too_large` → `invalid_request`;
- `unavailable` / `invalid_data` → `internal` do broker, porque o Windows não tem uma opção de
  permissão de clipboard que o usuário precise concedes; não se deve induzir o usuário a alterar
  permissões;
- `write_failed` → `internal` do broker, preservando possibly-sent e sem permitir repetição
  automática.

Nenhum log ou erro pode conter o conteúdo do clipboard. Chamadas frequentes não adicionam logs
`info`.

## Ciclo de Vida e Segurança

- Em Session 0, desktop não interativo ou quando o preflight de startup do addon falha, o clipboard
  nativo não é exposto;
- Tela de bloqueio não equivale a Session 0. O Windows permite acessar o clipboard na mesma sessão
  de login, mas o gate de foco do pointer continua falha fechada de forma independente;
- O mutex do clipboard e o mutex de estado de entrada são independentes entre si; é proibido manter
  travas cruzadas;
- O worker não mantém objetos COM de UIA e não precisa entrar no apartment UIA;
- A parada do Helper congela primeiro a admissão do broker, depois drena os workers já recebidos; em
  timeout continua valendo a evidência existente de morte do processo do Helper, com falha fechada;
- Nomes das ferramentas de leitura e escrita, tier, annotation, manifesto de 30 ferramentas e
  nomes de método do broker permanecem inalterados.

## Estratégia de Testes

Adotar TDD:

1. Testes de source/ABI nativos: primeiro travar worker, retentativa limitada, fechamento por RAII,
   guarda de tamanho, propriedade do HGLOBAL e as duas exportações;
2. Testes do adapter: cobrir habilitação com as duas exportações, rejeição com uma só, fallback de
   system em macOS/Linux e o mapeamento de cada outcome nativo para o broker;
3. Testes de veracidade de capability: addon antigo do Windows continua false, novo com as duas
   exportações é true;
4. Testes do broker: `read_clipboard` devolve string vazia real, `write_clipboard` aguarda o sucesso
   nativo, e busy/too-large/write-failed não forjam sucesso;
5. Rebuild com MSVC e verificação de exportações do addon compilado;
6. Smoke real do source Helper, desativado por padrão:
   - ler o texto original;
   - escrever um marker aleatório e não sensível;
   - reler e comparar exatamente;
   - restaurar o texto original no `finally` e verificar novamente;
   - a saída contém apenas booleanos e plataforma, sem texto original, marker, token ou pipe;
7. Gates completos do zcode-cua, gates focados do CUA do ZCode, typecheck e lint.

Se o smoke real falhar na fase de restauração, ele deve retornar código de saída diferente de zero e
avisar o usuário de que o clipboard atual pode ainda ser o marker de teste; não é permitido reportar
aprovação quando não foi possível restaurar.

## Critérios de Aceitação

- `broker_info.capabilities.clipboard === true` no source Helper do Windows;
- `read_clipboard` distingue texto vazio real de implementação ausente;
- `write_clipboard` grava texto Unicode que pode ser lido de volta exatamente pelo mesmo broker real;
- O smoke ao vivo restaura exatamente o texto original e, sem opt-in padrão, não lê nem modifica o
  clipboard;
- O addon antigo do Windows continua em falha fechada quando a ABI aditiva está ausente;
- O comportamento de clipboard em macOS/Linux e a superfície de 30 ferramentas permanecem inalterados;
- Não há PowerShell, shell, comandos externos nem polling síncrono de clipboard na thread principal;
- Build nativo, testes focados, testes completos do zcode-cua e typecheck/lint dos dois repositórios
  atendem às respectivas exigências de gate já existentes.