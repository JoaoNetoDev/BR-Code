# Design do Runtime de Desenvolvimento a partir do Código-fonte do Windows CUA

> Data: 2026-07-28
>
> Status: confirmado
>
> Escopo: ambiente de desenvolvimento de código-fonte do desktop local no Windows
>
> Repositórios relacionados: `z-code`, `C:\Users\dev\zcode-cua`

## 1. Contexto

A cadeia atual de produto Computer Use do ZCode é centrada no macOS:

```text
ZCode Host
  -> instala, verifica e inicia um Helper.app independente
  -> gera socket + bearer token
  -> injeta credenciais no plugin oficial zcode-cua
  -> o plugin expõe ferramentas ao Agent via MCP
  -> o Helper.app executa via AX / ScreenCaptureKit / CGEvent
```

O repositório externo `@zcode/zcode-cua` já contém UIA do Windows, named pipe, cliques/teclado básicos com `SendInput` e parte das ações semânticas de elemento, mas ainda não forma uma cadeia completa de execução para o desktop local do ZCode:

- O Product Helper padrão do ZCode só permite `darwin`;
- O standalone do Windows entra incorretamente na lógica de inicialização do Helper do macOS;
- A instalação atual não tem `ax_native.node` carregável;
- Captura de tela, área de transferência, lançamento de aplicativo e ações completas de mouse no Windows não formam um ciclo fechado;
- A coleta por UIA ainda pode bloquear a thread principal do V8 de forma síncrona;
- As coordenadas de entrada são calculadas principalmente pelo monitor principal, sem cobrir totalmente desktop virtual e DPI misto;
- Os testes do Windows ainda misturam suposições de caminho POSIX, Unix socket e modo de arquivo.

Este design resolve primeiro o "ambiente de desenvolvimento a partir do código-fonte realmente executável", e não resolve no mesmo milestone pacote instalador, binário pré-compilado, assinatura de código, atualização automática ou lançamento oficial.

## 2. Princípios de Processo e Validação de Alvo

O Computer Use no Windows segue os seguintes princípios de processo, captura de tela e validação de alvo:

- O Helper do Windows é um processo nativo independente, iniciado pelo host sob demanda;
- O Helper monitora `--parent-pid`;
- O nome do pipe contém um UUID aleatório;
- Depois que o último cliente fecha, o Helper e o pipe saem juntos;
- A captura de tela usa Windows Graphics Capture, capaz de obter janelas ocluídas;
- A entrada é vinculada a uma janela explícita e valida janela, bounds, captura e estado de entrada do usuário;
- O índice de elemento UIA é vinculado ao snapshot de observação atual;
- O Escape físico pode interromper o turn de Computer Use atual.

A implementação não reutiliza nenhum binário proprietário de terceiros nem protocolo não publicado.

## 3. Objetivos

O primeiro milestone precisa alcançar:

1. Na área de trabalho interativa do usuário Windows conectado, compilar e carregar `ax_native.node` a partir do código-fonte.
2. O Host local do ZCode inicia, sob demanda, um Helper de Computer Use do Windows independente.
3. O Host gera um named pipe aleatório e um bearer token, injetando-os somente no plugin CUA oficial.
4. Só depois que o Helper está pronto o plugin oficial pode iniciar o servidor MCP; quando o Helper está indisponível, falha fechada.
5. O Agent consegue completar, em aplicativos de desktop comuns como o Bloco de Notas:
   - enumeração de aplicativos e janelas;
   - observação da árvore UIA;
   - ativação de janela;
   - clique por coordenada de elemento ou de janela;
   - entrada de texto e teclas de atalho;
   - ações semânticas UIA já suportadas.
6. Quando o Helper crasha, sai, o ZCode fecha ou o cliente fecha, não sobra processo órfão capaz de continuar aceitando requisições.
7. Uma falha do desenvolvimento no Windows a partir do código-fonte precisa dar um motivo diagnosticável; falhas de compilação ou carregamento nativo não podem ser silenciosamente falsificadas como sucesso.

Depois de concluir o primeiro milestone, continuar na mesma arquitetura completando:

- Windows Graphics Capture;
- snapshot de janela e proteção contra ações stale;
- ações completas de mouse;
- múltiplos monitores, coordenadas negativas e DPI misto;
- área de transferência e lançamento de aplicativo;
- worker de UIA, cancelamento e timeout;
- validação de Chinês, emoji, teclas de combinação e disputa de foco.

## 4. Não objetivos

Esta fase exclui explicitamente:

- SSH, WSL, Docker ou qualquer CUA de remote workspace;
- controle remoto Web pelo celular ou cadeia realtime replayable;
- pacote instalador do Windows, addon pré-compilado, assinatura de código, SmartScreen, atualização automática;
-Reformulação da instalação, TCC, assinatura ou notarização do Helper do macOS;
-Redesenho do AT-SPI do Linux ou do broker host do Linux;
- UI de configuração de permissões do Windows ou UI de autorização por aplicativo;
- reuso, chamada ou redistribuição de binários Computer Use proprietários de terceiros;
- mudar os nomes dos 30 ferramentas MCP existentes;
- criar um novo roteador de capability do Host que contorne o Broker.

## 5. Decisões Centrais

### 5.1 Helper independente do Windows

O Windows usa um subprocesso Helper independente e não roda o backend UIA/native em:

- o processo de negócio do ZCode Host;
- o processo principal do Agent;
- o processo do plugin CUA MCP oficial.

Motivos:

- Um crash nativo não derruba serviços do Host como session, terminal e file;
- O bloqueio de UIA não bloqueia o stdio MCP do Agent;
- O ciclo de vida e a injeção de credenciais podem reutilizar o plano de controle do macOS;
- Mais adiante, ao migrar de um Helper em Node para SEA ou executável nativo, o protocolo da camada superior não muda.

Na primeira fase a forma do Helper é:

```text
Node.js child process
  + @zcode/zcode-cua broker/server
  + ax_native.node
```

Na fase de produto oficial ela pode ser substituída por:

```text
SEA / signed native executable
```

Mas o plugin MCP ou o Agent não podem ser obrigados a perceber essa substituição.

### 5.2 O Host gerencia apenas ciclo de vida e credenciais

O ZCode Host é responsável por:

- determinar se o modo de desenvolvimento local do Windows está habilitado;
- resolver a raiz de código-fonte local e controlada de `zcode-cua`;
- iniciar, parar e fazer health check do Helper;
- gerar pipe, token e generation de capability;
- injetar credenciais somente na authority do plugin CUA oficial;
- bloquear credenciais antigas de continuarem entrando em um novo Agent depois que o Helper generation fica inválido;
- usar as fronteiras existentes de active-turn e de recycle do Agent para uma recuperação segura.

O ZCode Host não é responsável por:

- coleta da árvore UIA;
- captura de tela ou de janela;
- injeção de mouse e teclado;
- gestão de HWND, element token ou screenshot revision;
- interpretação dos parâmetros das ferramentas CUA em ações de plataforma.

Todas essas capacidades de negócio ficam no Helper/backend do `zcode-cua`.

### 5.3 Windows Graphics Capture

A implementação oficial de captura de tela no Windows usa:

```text
Windows.Graphics.Capture
  -> Direct3D11CaptureFramePool.CreateFreeThreaded
  -> ID3D11Texture2D / SoftwareBitmap
  -> BGRA buffer or encoded image
  -> existing zcode-cua image pipeline
```

`BitBlt`, `System.Drawing` do PowerShell ou comandos externos de captura de tela não são o caminho principal oficial.

Se o WGC ainda não estiver concluído, o primeiro milestone permite que o ciclo fechado de UIA com `includeScreenshot=false` passe primeiro,
mas a capability de screenshot precisa relatar de verdade que está unavailable, sem devolver resultado forjado ou de sucesso em branco.

### 5.4 Entrada no nível da janela

A ação no Windows deixa de expressar apenas "enviar entrada global para a janela em primeiro plano atual". Cada ação no nível da janela precisa ser resolvida em:

```text
WindowIdentity {
  pid
  hwnd
  processPath?
  title?
  bounds
}
```

Antes de executar a ação, é preciso validar pelo menos:

- o HWND ainda existe;
- o HWND ainda pertence ao mesmo pid;
- o alvo não é a tela de bloqueio, uma área de trabalho não interativa ou um processo de alta integridade que já recusou;
- os bounds da janela não saíram do permitido pela observação atual;
- as coordenadas são mapeadas corretamente do espaço da janela para o espaço do desktop virtual;
- a janela alvo pode ser ativada com segurança ou já é a janela em primeiro plano esperada.

Uma falha de validação precisa exigir nova observação; a entrada não pode ser enviada para "outro aplicativo que por acaso está em primeiro plano".

### 5.5 Snapshot de observação

Reforçar gradualmente o `state_id` atual como uma revisão de observação do Windows:

```text
ObservationSnapshot {
  stateId
  revision
  windowIdentity
  accessibilityRevision?
  screenshotId?
  screenshotBounds?
  capturedAt
}
```

Regras:

- O índice de elemento só é válido dentro da accessibility revision que o gerou;
- As coordenadas de screenshot/state-image só são válidas dentro da screenshot revision que as gerou;
- Depois de qualquer action capaz de mudar o layout da janela, o foco ou o estado modal, a revision antiga deixa de ser usada para a próxima action;
- Em caso de stale, unknown ou janela incompatível, falha fechada e retorna o diagnóstico "observar novamente";
- Uma falha de transporte pós-escrita continua preservando `possibly_sent`; não é permitido reenviar a action automaticamente só porque é preciso observar novamente.

## 6. Arquitetura de Execução

```text
ZCode renderer / Agent request
             |
             v
ZCode local Host Process
  WindowsCuaHelperHost
    - local-only admission
    - child lifecycle
    - pipe/token generation
    - health + generation
             |
             | spawn
             v
Windows Computer Use Helper (Node child)
    - CuaPermissionBrokerServer
    - named pipe server
    - ax_native.node
    - UIA worker
    - WGC capture worker
    - SendInput actuator
             ^
             | authenticated broker RPC
             |
official zcode-cua MCP plugin
             ^
             | MCP stdio
             |
ZCode Agent
```

É proibido formar os seguintes caminhos:

```text
UI -> native addon
UI -> Repo
Host service -> concrete UIA implementation
remote Host -> local Windows Helper
ordinary MCP server -> broker credentials
```

## 7. Sequência de Inicialização

```text
ZCode local Host starts
  |
  |-- platform == win32?
  |-- ZCODE_CUA_PRODUCT_HELPER enabled?
  |-- local host only?
  |-- official CUA plugin enabled for workspace?
  |-- ZCODE_CUA_DEV_ROOT resolves to allowed source root?
  |
  | no -> no Helper, no credentials, no CUA MCP injection
  |
  ` yes
      -> build/runtime preflight
           - dist Helper entry exists
           - ax_native.node exists and loads
           - interactive user desktop available
      -> mint random pipe + token
      -> spawn Helper with parent pid and controlled environment
      -> Helper reads token without exposing it in logs
      -> Helper binds pipe
      -> Host authenticates and calls broker_info
      -> validate pid/platform/capabilities/version
      -> publish credential generation
      -> official plugin host receives canonical broker argv/env
      -> MCP server starts
      -> Agent sees CUA tools
```

Antes de o Helper passar pelo health check, não se pode expor ao Agent um servidor CUA que até inicia mas não consegue se conectar.

## 8. Máquina de Estados do Ciclo de Vida

```text
DISABLED
   |
   | enable + local Windows admission
   v
STARTING ---- preflight/spawn/health failure ----> FAILED
   |                                            |
   | health verified                            | explicit retry/restart
   v                                            |
READY ------------------------------------------+
   |
   | app exit / manual restart / credential invalidation
   v
DRAINING
   |
   | stop admission -> settle admitted calls -> close pipe -> child exit
   v
STOPPED
```

Restrições:

- No máximo uma generation de Windows Helper por ciclo de vida do Host;
- STARTING/READY usam singleflight;
- FAILED não mantém tuples antigas injetáveis;
- Só READY pode retornar credenciais do resolver;
- Após DRAINING, novas actions são recusadas;
- Se a conexão cair depois que a action já foi escrita no broker, ela continua sendo tratada como `possibly_sent`;
- Quando o ZCode Host sai, ele primeiro para a admission e só então encerra o Helper;
- O Helper monitora o pid do processo pai e sai sozinho quando o pai desaparece;
- Ao parar ou reiniciar, é preciso liberar todas as teclas e botões de mouse que este Helper estiver segurando.

## 9. Diretório de Origem no Modo de Desenvolvimento

Nova configuração explícita de desenvolvimento:

```text
ZCODE_CUA_DEV_ROOT=C:\Users\dev\zcode-cua
```

Semântica:

- Só é lida em `win32` + Host local + Product Helper explicitamente habilitado;
- Precisa resolver para um diretório absoluto e existente;
- Precisa conter o `package.json`, a entrada do Helper e o artefato de build nativo esperados;
- O caminho é usado apenas para resolução de código/artefatos de build e não como workspace identity;
- Não é gravado na configuração de workspace do usuário;
- Não pode ser repassado por um remote host;
- Quando não configurado ou inválido, retorna um diagnóstico de desenvolvimento explícito, sem fazer fallback para o Helper do macOS;
- O build de produto oficial não depende dessa variável.

Comandos de desenvolvimento sugeridos:

```text
cd C:\Users\dev\zcode-cua
pnpm install
pnpm build
pnpm rebuild:native

set ZCODE_CUA_PRODUCT_HELPER=1
set ZCODE_CUA_DEV_ROOT=C:\Users\dev\zcode-cua
pnpm dev:desktop
```

Os nomes reais dos scripts podem ser ajustados na implementação, mas os limites de configuração e a semântica de fail-closed não podem mudar.

## 10. Design do Backend Nativo do Windows

### 10.1 Thread de UIA

- COM/UIA roda em uma thread de trabalho MTA independente;
- A thread principal Node/V8 faz apenas validação de parâmetros, enfileiramento e conclusão de Promise;
- Cada requisição carrega um deadline ou sinal de cancelamento;
- Árvores UIA grandes precisam ter limites de número de nós, profundidade, tamanho de texto e orçamento de tempo;
- Ao fechar o Helper, é preciso aguardar ou cancelar o worker para que ele não use handles N-API já destruídos;
- Os element tokens de UIA são vinculados a snapshot/revision e têm limite de capacidade e política de descarte.

### 10.2 Execução de Entrada

- Usar coordenadas de desktop virtual:
  - `SM_XVIRTUALSCREEN`
  - `SM_YVIRTUALSCREEN`
  - `SM_CXVIRTUALSCREEN`
  - `SM_CYVIRTUALSCREEN`
  - `MOUSEEVENTF_VIRTUALDESK`
- As coordenadas são convertidas explicitamente nas fronteiras entre espaço físico e lógico;
- Validar o HWND/PID alvo antes de cada entrada;
- Falha de ativação, recusa por UIPI ou sessão não interativa resultam em fail closed;
- `hold_key`, drag e mouse-down/up precisam de limpeza de término;
- Quando o usuário ou um stop signal interrompe, o estado de entrada é liberado primeiro.

### 10.3 Superfície de sistema do Windows

A superfície de sistema do Windows é responsável por:

- lançamento de aplicativo;
- leitura/escrita da área de transferência;
- captura de tela de janela;
- informações de tela/monitor;
- informações de cursor.

Não se pode deixar o Windows cair por padrão no caminho de comandos `screencapture`, `pbcopy` e `open` do macOS.

## 11. Broker e Fronteiras de Segurança

A fase de desenvolvimento a partir do código-fonte ainda mantém:

- named pipe aleatório;
- bearer token de alta entropia;
- comparação do token em tempo constante;
- authority limitada ao plugin oficial;
- sanitização de env dos sub-processos de ferramentas comuns;
- mascaramento de token nos logs;
- generation do Helper;
- estado de entrega da action;
- verificações de interactive-session e de UIPI.

A fase de desenvolvimento a partir do código-fonte não declara como concluídos:

- DACL de named pipe somente current-user;
- assinatura de executável do Windows;
- verificação de identidade do pacote instalador;
- SmartScreen;
- autorização de usuário no nível do aplicativo.

Esses itens incompletos precisam ficar explícitos nos diagnósticos e na documentação; não podem ser descritos como "Windows security complete".

O bearer token não pode aparecer em:

- logs;
- mensagens de erro;
- telemetria;
- título do processo;
- texto de UI copiável.

Prioriza-se reutilizar o token one-shot existente ou um mecanismo de herança controlada; o token não deve aparecer como argv comum.

## 12. Semântica de Erro e Recuperação

| Cenário                              | Comportamento obrigatório                                            |
| ------------------------------------ | --------------------------------------------------------------------- |
| Visual Studio C++ toolchain ausente  | O build falha com uma dica explícita de dependência                   |
| `ax_native.node` ausente             | O preflight de dev falha, sem `available=false` silencioso            |
| ABI do addon incompatível            | Saída com o ABI do Node, o caminho do addon e a dica de rebuild       |
| Sessão não interativa / tela de bloqueio | Helper unavailable, sem injeção de entrada                        |
| Timeout na inicialização do Helper   | Encerrar este child, limpar o pipe, não publicar o tuple              |
| Falha no health check                | Não injetar credenciais no plugin oficial                            |
| Queda de conexão após action do Helper | `possibly_sent`, sem retry automático                                 |
| HWND/PID/revision stale              | Retornar diagnóstico de observar novamente, sem executar entrada     |
| UIPI recusa aplicação privilegiada   | permission denied explícito, sem elevação automática                  |
| Crash do Helper                      | generation fica inválida, recuperação pelas fronteiras existentes de active-turn/recycle |
| Fechamento do ZCode                  | Parar a admission, liberar a entrada, fechar o pipe, encerrar o child |

## 13. Responsabilidades dos Repositórios

### `z-code`

- admission de Helper local do Windows;
- implementação do ciclo de vida de `WindowsCuaHelperHost`;
- resolver de dev root;
- injeção de credenciais;
- integração de active-turn/restart/recycle;
- testes unitários e de integração do Host no Windows;
- instruções de inicialização para desenvolvimento.

### `zcode-cua`

- CLI/entrada do Helper do Windows;
- broker host de named pipe do Windows;
- build e carregamento estrito de `ax_native.node`;
- worker de UIA;
- screenshot por WGC;
- window identity / revision;
- superfície de sistema do Windows;
- entrada do Windows e coordenadas multi-monitor;
- correções de testes multiplataforma;
- aceitação nativo e no desktop real.

### Plugin `zcode-cua-plugin` oficial

- continua sendo uma casca fina broker-only;
- continua falhando fechada quando falta socket/token;
- não inicia um segundo broker do Windows dentro do plugin;
- só corrige nomes de artefato do Windows e testes quando realmente necessário.

## 14. Implementação por Fases

### Fase 0: baseline de build e teste

- Completar a documentação e as verificações de pré-requisitos de build C++ no Windows;
- Fazer a falha de build nativo falhar explicitamente nos comandos de desenvolvimento;
- Corrigir dependências de lint não declaradas;
- Corrigir suposições de caminho POSIX/Unix socket nos testes do Windows;
- Quando o addon nativo faltar, os testes devem fazer skip ou fail explícito, sem null dereference;
- Manter inalterada a semântica dos testes de macOS/Linux.

### Fase 1: ciclo fechado de execução no modo de desenvolvimento

- Nova entrada do Helper do Windows;
- O Host inicia um child independente sob demanda;
- named pipe + token + health;
- injeção de credenciais no plugin oficial;
- list/capture de UIA;
- clique com vínculo de janela, entrada, teclas e ações semânticas já suportadas;
- smoke live no Bloco de Notas;
- stop/restart/limpeza de órfãos.

### Fase 2: visual e ponteiro completo

- captura de janela por WGC;
- screenshotId/revision;
- mapeamento de coordenadas de `state_image`/janela;
- move, scroll, drag, mouse-down, mouse-up;
- desktop virtual, múltiplos monitores, coordenadas negativas, DPI;
- clipboard, launch app.

### Fase 3: confiabilidade

- worker MTA de UIA, deadline, cancel;
- LRU de tokens stale;
- guard de foreground/bounds/user-input;
- Escape físico ou interrupção explícita equivalente;
- CJK, emoji, dead key, layout de teclado;
- janela modal, minimizada, ocluída;
- comportamento de aplicativo de alta integridade e da tela de bloqueio;
- DACL de named pipe.

### Fechamento de produto posterior

- artefatos pré-compilados x64/arm64;
- SEA ou Helper nativo;
- staging do pacote instalador;
- assinatura, versão, hash e verificação de identidade;
- CI de release e portão em máquina Windows real;
- configurações de usuário e UI de readiness.

## 15. Critérios de Aceitação

### Automatizado

`zcode-cua`:

- `pnpm typecheck`
- `pnpm lint`
- testes direcionados de plataforma/path/pipe/nativo no Windows
- testes de delivery-state do broker
- testes de ciclo de vida do Helper
- testes de contrato de screenshot/entrada do Windows

`z-code`:

- `pnpm typecheck`
- `pnpm lint`
- testes do Host de Helper do Windows nos services
- testes de injeção de credenciais do plugin oficial
- testes de regressão de recycle/generation do Agent

Os testes específicos de plataforma precisam ser classificados explicitamente. Testes de POSIX mode, Unix socket ou `.app` do macOS podem ser pulados no Windows por um motivo explícito, mas testes neutros de plataforma não podem ser pulados inteiros só para obter um resultado verde.

Os testes de transporte live do Broker precisam usar um endereço realmente suportado na plataforma atual: no Windows, um named pipe `\\.\pipe\zcode-cua-test-<random>` único por caso; no macOS/Linux, um Unix socket em um diretório temporário controlado. Contratos neutros de plataforma como autenticação, NDJSON, dispatch, timeout e graceful-stop precisam continuar sendo executados no named pipe do Windows; somente as asserções que dependem do nó de arquivo de socket — `0600/0700`, symlink, stale-file e unlink — podem ser puladas no Windows, e a fronteira de "não tocar em nós do sistema de arquivos POSIX" é protegida por testes de branch separados, específicos do Windows named pipe.

### Máquina Windows real

Validar na Session de um usuário conectado:

1. Iniciar o ZCode; o Helper aparece sob demanda.
2. O Agent enxerga as ferramentas CUA oficiais.
3. Enumerar a janela do Bloco de Notas.
4. Obter a árvore UIA.
5. Clicar na área de edição e confirmar o HWND alvo.
6. Digitar Chinês, inglês e emoji.
7. Executar `Ctrl+A`, substituir texto e Enter/Tab.
8. Operar um botão ou menu por ação UIA.
9. Após reiniciar o Helper, restabelecer a generation.
10. Depois de fechar o ZCode, não sobra Helper.
11. Depois da Fase 2, validar screenshot de janela ocluída.
12. Depois da Fase 2, validar monitor secundário, coordenadas negativas e DPI diferente.

Cada aceitação em máquina real precisa registrar:

- versão do Windows;
- versão do Node e ABI;
- arquitetura de build do addon;
- commit do ZCode;
- commit do zcode-cua;
- aplicativo de teste;
- se é uma sessão local interativa;
- caminho dos logs de falha;
- cenários não cobertos.

## 16. Restrições de Compatibilidade

- A cadeia principal `desktop-continuous` do macOS permanece inalterada;
- A cadeia Web remote replayable não entra neste design;
- A decisão local/remote precisa ser concluída antes da admission do Helper;
- Não introduzir mistura de `workspaceIdentity` com `workspacePath`;
- Não modificar o `@zcode/protocol` entre Agent e App, a menos que apareça de fato um novo protocolo de produto entre processos;
- Mudanças de método/schema do broker são validadas estritamente dentro de `@zcode/zcode-cua` e mantêm compatibilidade com as chamadas antigas;
- IO usa APIs assíncronas;
- Logs de services usam `createServiceLogger(scope)`;
- A UI não está incluída nesta fase; se `packages/ui` for modificado depois, é preciso ler `DESIGN.md` antes da implementação.

## 17. Riscos

1. **Risco de toolchain**: a máquina atual não tem o Visual Studio C++ workload, e a validação nativa em máquina real fica bloqueada.
2. **Risco de ABI**: o Node do sistema, o Node empacotado do ZCode e o ABI do Electron podem ser diferentes. O Helper em Node independente precisa definir explicitamente qual runtime de Node usa e ser compilado para esse ABI.
3. **Risco de bloqueio de UIA**: a BFS síncrona atual pode travar o Helper, exigindo torná-la worker.
4. **Complexidade da captura**: o WGC envolve WinRT, D3D11, fechamento de janela e reconstrução de dispositivo, e não deve ser tratado como um patch pequeno.
5. **Risco de disputa de foco**: chamar apenas `SetForegroundWindow` não prova que o alvo de entrada está correto.
6. **Dívida de testes**: uma grande quantidade de testes atuais fixa suposições de macOS/POSIX, então a baseline verde no Windows precisa ser classificada antes.
7. **Drift de versão**: o `@zcode/zcode-cua` em tempo de compilação do ZCode, o alias de runtime do Helper e a versão do plugin não estão hoje completamente alinhados; o ciclo de desenvolvimento precisa registrar as versões reais de servidor/cliente.

## 18. Itens Confirmados e Itens Abertos

O item 1 foi confirmado pelo contrato de resolver desta rodada; as demais questões ficam para serem fechadas no plano de implementação com spike/testes, sem alterar as fronteiras de processo deste design:

1. **Confirmado: o Helper dev do Windows usa o runtime Node do processo atual.** O resolver fixa o retorno de `command = process.execPath` e define `ELECTRON_RUN_AS_NODE = "1"` no ambiente do child. O Desktop Host já usa o mesmo padrão para o zcode-agent; o `process.execPath` do host CLI/test aponta naturalmente para o Node. `ax_native.node` é um addon N-API e precisa ser reconstruído na máquina Windows alvo para esse runtime. Essa fase de resolver não injeta o broker token.
2. Se a camada nativa do WGC devolve um buffer BGRA ou devolve diretamente JPEG/PNG.
3. Se o `state_id` existente pode ser estendido de forma compatível para virar revision, ou se é preciso adicionar um campo novo.
4. Qual implementação mínima de ACL é usada para o arquivo de token one-shot na fase de dev do Windows.
5. Se o Escape físico fica na Fase 2 ou na Fase 3.

O princípio padrão é escolher a implementação mínima que ainda possa serLevada adiante como produto, e fechar os itens abertos só depois de obter evidência de runtime via TDD/spike.