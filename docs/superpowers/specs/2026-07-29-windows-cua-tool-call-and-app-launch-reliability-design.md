# Design de confiabilidade de chamadas de ferramentas CUA e de lançamento de apps no Windows

> Data: 2026-07-29 (2026-07-30, revisão do esquema de nomes de ferramenta)
>
> Estado: confirmado
>
> Escopo: cadeia de desenvolvimento de código-fonte do desktop continuous local no Windows
>
> Repositórios relacionados: `z-code`, `C:\Users\dev\zcode-cua`

## 1. Evidência de runtime e causa raiz

As sessões com falha `sess_4acdf746-a6c2-4518-8ed9-bd9f587a6cea` e
`sess_f89ac19d-ceb1-4bf5-bcdd-07504d226bb2`, junto com os logs de I/O do modelo e do Agent, provam em conjunto que:

- o MCP oficial `zcode-cua` está conectado, com as 30 ferramentas registradas; o Helper e o plugin-host não
  são a causa raiz desta falha;
- a linha de base remota atual gera, pelo descriptor MCP genérico, o nome provider-visible canônico
  `mcp__plugin_zcode-cua_computer-use__*`; os nomes injetados na requisição preservam os dois trechos com
  hífen de `zcode-cua` e `computer-use`;
- o provider/model devolveu `mcp__plugin_zcode_cua_computer_use__*`, que não foi declarado no conjunto de
  ferramentas da requisição, com os dois trechos de hífen trocados por sublinhado;
- o registry faz a busca pelo nome exato da ferramenta, então retornou `Tool not found` antes de permission,
  hook e dispatch do MCP;
- o alias adicionado na portabilidade para Windows depois de `e04766f2a9` assume que o nome canônico é
  `mcp__computer-use__*`, o que não corresponde ao descriptor namespaced completo atual, além de não receber do
  runtime de produção o conjunto de autoridades que ele exige — portanto esse ramo é código morto inativo;
- o mantenedor upstream já usou o nome curto `mcp__computer-use__*` em `babdbd5e4c`, mas essa implementação
  pertence ao stabilization merge que foi explicitamente revertido depois por `9a80589fbd`; a linha de base
  atual é `0b0a27f92a` e os commits remotos posteriores, e esta revisão não extrai o caso especial do descriptor
  antigo a partir de um commit revertido;
- `open_application({app:{name:"calc"}})` realmente iniciou a calculadora, mas a janela visível correspondente ao
  PID do launcher acabou sendo hospedada por `ApplicationFrameHost.exe`; o resolver atual do Windows só permite
  que a identidade completa do executable do launcher seja exatamente igual ao candidato de GUI, e por isso
  recusou com segurança a rebind incorreta;
- `Microsoft.WindowsCalculator_8wekyb3d8bbwe!App` é um AUMID que pode ser usado com precisão, mas a superfície de
  sistema do Windows atual aceita apenas `name` e ainda não há ativação nativa por AUMID nem evidência de
  identidade de HWND.

Isto não é uma falha de conexão do MCP, e sim duas lacunas independentes:

1. o provider/model devolveu um nome de ferramenta fora do contrato da requisição, enquanto o limite atual de
   resposta do modelo só valida "não vazio" e não valida "tem de ser exatamente um nome declarado nesta
   requisição";
2. o Windows packaged app não tem ramo de lançamento por AUMID nem de resolução exata de janela.

## 2. Objetivos

1. Tomar a implementação remota upstream atual como única linha de base: o nome provider-visible continua sendo
   gerado pelo descriptor genérico, e o nome CUA oficial atual é `mcp__plugin_zcode-cua_computer-use__*`.
2. Remover o alias de registry de nome curto/sublinhado adicionado na portabilidade para Windows; nenhum nome
   que não esteja exatamente declarado no conjunto de ferramentas desta requisição pode entrar em permission,
   hook, event, history ou dispatch do MCP.
3. Permitir uma única tentativa de retry corretivo, sem submeter nenhum evento visível de model/tool, somente
   quando o nome incorreto corresponder de forma única a um nome canônico por meio de uma "comparação usada
   apenas para diagnóstico"; a resposta do retry ainda precisa acertar exatamente o conjunto de ferramentas da
   requisição.
4. Em caso de correspondência não única, de ter já cruzado a fronteira de submissão de streaming, ou de a segunda
   resposta ainda estar errada, falhar de forma fechada (fail closed) como resposta de modelo inválida
   recuperável, sem roteamento por alias.
5. Fazer o `open_application` do Windows aceitar AUMID, ativando packaged apps de forma nativa via
   `IApplicationActivationManager`.
6. Resolver o HWND/PID alvo de forma exata pelo `PKEY_AppUserModel_ID` da janela; falhar de forma fechada quando
   não houver candidato ou houver candidatos com múltiplos PIDs.
7. No Windows, fornecer aliases de nome exato insensíveis a maiúsculas/minúsculas para um pequeno conjunto de
   packaged apps integrados; o primeiro lote contém apenas `Calculator`, `Windows Calculator`, `calc`, `calc.exe`
   e `计算器` da Calculadora, todos convergindo uniformemente para
   `Microsoft.WindowsCalculator_8wekyb3d8bbwe!App` antes de entrar na mesma cadeia de ativação por AUMID e de
   leitura de retorno.
8. Preservar a inicialização por nome de executable Win32 existente, a validação de caminho completo, o
   prelaunch snapshot, a revalidação live e a regra de novo candidato único.
9. Corrigir o texto da skill do Windows: o AUMID é a identidade de lançamento de um packaged app; as ações
   seguintes devem preferir o PID retornado por `open_application`, e não se pode tratar `ApplicationFrameHost.exe`
   como um AUMID.

## 3. Não objetivos

- Não mudar o nome canônico de `computer-use` para `computer_use`;
- Não fazer normalização global de hífen/linha-underscore para qualquer servidor MCP;
- Não reescrever diretamente um nome incorreto com sublinhado para o nome canônico e então executá-lo;
- Não modificar o renderer CUA do mantenedor upstream em `packages/ui`, o Core result display, o descriptor MCP
  genérico atual, o manifest ou o desenho de autoridade em runtime;
- Não adivinhar aplicações por título de janela, nome de exibição de app em execução, basename, estado ativo ou
  ordem de enumeração; nomes de packaged app integrados só podem passar por uma tabela de alias exatos
  mantida explicitamente em código, mapeando alias → AUMID, e nomes desconhecidos não são adivinhados;
- Não mudar o manifest de 30 ferramentas, o schema MCP, nem a semântica de lançamento de macOS ou Linux;
- Não introduzir shell, PowerShell, `explorer.exe shell:AppsFolder` nem fallback por atalho da área de trabalho;
- Não modificar SSH, WSL, Docker, remote workspace, `/remote` do celular ou a cadeia replayable;
- Não fazer pacote de instalação, assinatura, atualização automática nem ciclo completo de publicação.

## 4. Escolha da abordagem

### 4.1 Nomes de ferramenta

#### Opção A: manter o alias de registry da portabilidade para Windows

Não adotada. O alias existente se apoia na premissa de nome curto `mcp__computer-use__*`, que não acerta o
`mcp__plugin_zcode-cua_computer-use__*` remoto atual; e o runtime de produção também não passou o conjunto de
autoridades que ele exige. Mesmo que a correspondência fosse completada, um alias direto no registry ainda
transformaria uma saída de modelo fora do contrato da requisição em uma chamada executável, mascarando um
erro de contrato do provider/model.

#### Opção B: restaurar o descriptor upstream de nome curto que foi revertido

Não adotada. O descriptor de nome curto de `babdbd5e4c` pertence ao stabilization merge revertido explicitamente
por `9a80589fbd`; a linha de base upstream atual `0b0a27f92a` não reintroduziu esse caso especial. Um
cherry-pick apenas do descriptor contornaria a fronteira da reversão e criaria duas versões contraditórias de
fato sobre nomes dentro da mesma linha de base remota.

#### Opção C: validação exata do contrato da requisição e um retry corretivo sem efeito colateral

Adotada. O adapter do modelo já possui, ao montar a requisição, o conjunto exato de `tools[].name` desta
requisição; cada tool name da resposta precisa ser idêntico byte a byte a um membro do conjunto. A comparação
de hífen contra sublinhado é usada só para verificar se existe um único candidato de correção, e não pode mudar a
tool call, não pode consultar o Registry e não pode formar permissão nem nome persistido.

Se a primeira resposta acertar o único candidato antes de qualquer submissão de texto visível, de reasoning, de bloco
de tool ou de fronteira de retry do provider, abortar e limpar a requisição física original e refazer uma única
requisição com uma instrução corretiva de sistema que não é persistida. A instrução corretiva lista apenas os
nomes canônicos exatos permitidos e não contém parâmetros de ferramenta. A segunda resposta não tem mais
orçamento de correção ortográfica e precisa acertar exatamente; caso contrário, falha com `InvalidModelResponse`.

Se a resposta em streaming já tiver submetido um evento não replayável, não há retry automático e a chamada
falha direto, evitando duplicação de texto ou de bloco de tool. Uma resposta não-streaming que ainda não foi
exposta externamente pode usar a mesma regra corretiva de uso único.

```text
上游当前 descriptor
    |
    +-- mcp__plugin_zcode-cua_computer-use__list_apps
    |
provider request tools[]（精确名称集合）
    |
model/provider response
    |
    +-- 精确命中 --------------------------> tool event -> permission -> MCP
    |
    +-- 请求外名称
            |
            +-- 唯一拼写候选且尚未提交事件
            |       |
            |       +-- 丢弃本次响应，零 tool 副作用
            |       +-- 临时纠正指令，最多重试一次
            |       +-- 第二次精确命中才允许执行
            |
            +-- 歧义 / 已提交 / 第二次仍错误
                    |
                    +-- InvalidModelResponse，fail closed

上游 UI/result-display 名称比较
    |
    +-- 只处理已经接受的规范 tool event，不参与路由，保持不变
```

### 4.2 Packaged app no Windows

#### Opção A: casar por name/title/basename após o lançamento

Não adotada. O título da janela pode ser localizado, pode se repetir e pode ser controlado pelo app alvo;
além disso, `ApplicationFrameHost.exe` hospeda vários packaged apps ao mesmo tempo, então não serve como
identidade estável da Calculadora.

#### Opção B: aceitar diretamente o PID do launcher ou o primeiro candidato ativo

Não adotada. O launcher pode sair, passar a responsabilidade ou ser reutilizado; e o primeiro item
ativo da enumeração não prova que pertence a esta chamada.

#### Opção C: ativação nativa por AUMID e busca exata por propriedade de HWND

Adotada. O addon nativo acrescenta duas ABIs internas exclusivas do Windows:

- `activateApplicationByAumid(aumid)`: chama
  `IApplicationActivationManager::ActivateApplication`;
- `applicationInfoByAumid(aumid)`: enumera HWNDs top-level visíveis, lê
  `PKEY_AppUserModel_ID`, faz correspondência exata e insensível a maiúsculas/minúsculas por AUMID e
  deduplica por PID.

Um único app visível já com o mesmo AUMID pode ser devolvido diretamente; caso contrário, faz-se polling com
orçamento limitado após a ativação. Com 0 candidatos, continua esperando; com candidatos de múltiplos PIDs ou
com o orçamento esgotado, retorna falha. Esse ramo não confunde AUMID com caminho de executable.

```text
open_application({bundle_id: AUMID})
    |
exact HWND PKEY_AppUserModel_ID lookup
    |
    +-- unique live PID --> optional explicit activation --> return PID
    |
    +-- none/ambiguous
            |
            +-- native IApplicationActivationManager
            |
            +-- bounded poll exact AUMID
                    |
                    +-- unique live PID --> return PID
                    |
                    +-- none/ambiguous --> fail closed

open_application({name: "notepad.exe"})
      |
existing Win32 full-executable identity path remains unchanged
```

#### Aliases de nome exato da Calculadora

Adota-se uma tabela limitada de aliases exatos, em vez de adivinhar a janela depois do lançamento.
`Calculator`, `Windows Calculator`, `calc`, `calc.exe` e `计算器` são normalizados para o AUMID da Calculadora
antes de qualquer efeito colateral no broker do Windows; depois disso, a opção C é totalmente reaproveitada.
Isso corrige tanto a primeira falha, em que o modelo trata o nome de exibição como executable, quanto evita o
falso relatório de falha quando `calc.exe` já está com uma janela aberta, mas o executable do launcher
difere de `ApplicationFrameHost.exe`.

A comparação de aliases faz apenas trim e dobra de caixa; não há substring, distância de edição, busca por
título de janela nem fallback por ordem de enumeração. Nomes desconhecidos continuam indo para o ramo normal de
executable Win32 e mantêm as validações existentes.

## 5. Limites dos componentes

### `z-code`

- O descriptor MCP e o contrato provider-visible mantêm o nome namespaced com hífen do upstream atual;
- `registerMcpTools` não define alias para erros de digitação do modelo;
- allow/deny continuam decidindo pelo nome canônico do descriptor;
- o adapter valida tool calls de streaming e não-streaming contra o conjunto exato de tools da requisição;
- o prompt corretivo de uso único existe apenas na requisição física do retry e não é gravado no histórico de
  conversa;
- a lógica de comparação do renderer de UI e do Core result display do upstream não participa do roteamento de
  execução e permanece inalterada.

### `zcode-cua`

- `windowsSystemSurface` é responsável por distinguir nome de executable de AUMID;
- o broker do Windows normaliza, antes do lançamento, os aliases de nome exato de packaged apps integrados
  suportados para AUMID; essa tabela não lê estado de janela nem muda a semântica fora do Windows;
- `helperMain` apenas injeta no system surface as ABIs nativas do Windows já carregadas pelo processo atual;
- o addon nativo responde pela ativação COM do Windows e pelas consultas ao property store do HWND;
- backend/resolver continuam responsáveis pela espera limitada, unicidade, revalidação live e resultado
  unificado;
- o schema MCP público não ganha campo exclusivo do Windows; o AUMID continua entrando por `app.bundle_id`.

## 6. Invariantes de segurança e compatibilidade

- Nenhum CUA ou MCP de terceiros tem alias de execução por hífen/linha-underscore;
- Nomes fora do contrato da requisição não entram em allow/deny, permission, hook, scheduler, event, history ou
  MCP;
- Quando a comparação de diagnóstico apresenta múltiplos candidatos, não se pode adivinhar: é preciso falhar;
- O retry corretivo acontece no máximo uma vez, e apenas em um attempt que ainda não submeteu evento não
  replayável;
- Os logs registram apenas o nome incorreto, o candidato único e os identificadores de requisição/trace, nunca
  tool input ou credenciais;
- O AUMID precisa ser um único identificador não vazio e sem caracteres de controle; ele não pode ser
  concatenado em um comando de shell;
- Um alias de nome exato só pode mapear para um AUMID fixo em código; a identidade não pode ser deduzida por
  título de janela, app ativo atual ou `ApplicationFrameHost.exe`;
- A busca por AUMID só aceita evidência exata de propriedade; o caminho `ApplicationFrameHost.exe` em si não
  conta como evidência de sucesso;
- O ramo de caminho Win32 não reduz as proteções existentes de caminho completo, snapshot, unicidade e TOCTOU;
- A ativação de AUMID no Windows pode fazer o sistema operacional trazer a janela para o primeiro plano; a
  implementação não envia eventos extras de mouse, teclado ou foco, nem promete um lançamento em background
  equivalente ao `open -g` do macOS;
- O mapeamento de parâmetros entre `urls` e AUMID não é adivinhado nesta fase; quando os dois aparecem
  juntos, falha de forma fechada;
- A validação de nome de ferramenta pertence ao adapter de modelo compartilhado, e desktop continuous,
  subagent e web remote replayable devem manter o mesmo contrato exato; esta mudança não modifica as
  semânticas de snapshot, queue, owner, lease, workspace identity ou remote transport.

## 7. Testes

### RED: contrato exato de nome de ferramenta do modelo

- O descriptor upstream atual continua gerando
  `mcp__plugin_zcode-cua_computer-use__list_apps`, e esta mudança não altera essa implementação;
- Os nomes exatos do conjunto de ferramentas da requisição passam normalmente na validação de respostas de
  streaming e não-streaming;
- `mcp__plugin_zcode_cua_computer_use__list_apps` é rejeitado antes de Registry, permission, hook, event,
  history e chamada do MCP;
- Com candidato único e sem evento já submetido, há exatamente um retry, e depois de a segunda resposta devolver
  o nome exato a execução acontece uma única vez;
- Em caso de segunda resposta ainda errada, ausência de candidato, múltiplos candidatos ou evento não
  replayável já submetido, falha de forma fechada;
- MCP de terceiros também é validado de forma exata, sem ganhar caso especial nem alias do CUA;
- main agent e subagent usam a mesma validação, e desktop continuous e web remote replayable não recebem novo
  estado de sincronização.

### RED: AUMID no Windows

- `windowsSystemSurface` aceita bundle ID/AUMID e chama o activator nativo injetado;
- Os cinco aliases de nome exato da Calculadora entram no mesmo ramo de AUMID e não chamam o
  `openRunner(["calc"])` do Win32;
- Maiúsculas/minúsculas e espaços nas pontas podem ser normalizados; substring, nomes desconhecidos e outros
  nomes parecidos não podem acertar;
- AUMID + URLs, AUMID vazio e activator nativo ausente falham explicitamente;
- O backend prioriza reaproveitar o app live único de AUMID exato;
- Após uma nova ativação, só se aceita o PID único de AUMID exato;
- 0 candidatos, múltiplos PIDs e falha de leitura de propriedade falham de forma fechada;
- Os testes existentes de full executable identity do Win32 continuam passando;
- As exportações do addon compilado são coerentes com o contrato do source.

## 8. Aceitação

- Os aliases CUA inválidos, os usos de constantes de nome curto e os testes de erro correspondentes
  adicionados na portabilidade para Windows são removidos;
- Os testes direcionados dos dois repositórios, `pnpm typecheck` e `pnpm lint` passam;
- O addon nativo do Windows do `zcode-cua` é reconstruído localmente;
- Após subir o desktop a partir do source, a requisição mais recente ao modelo declara apenas os nomes
  namespaced com hífen do upstream; se a primeira resposta devolver o nome incorreto com sublinhado, o log
  mostra um retry corretivo sem efeito colateral, e o resultado não cai mais no `Tool not found` do Registry;
- Um smoke test direto do broker consegue abrir ou reaproveitar a calculadora pelo AUMID da Calculadora e ler
  `get_app_state` com sucesso usando o PID retornado;
- A limpeza encerra apenas os processos de teste iniciados nesta rodada, sem afetar as aplicações originais do
  usuário;
- Nada de SSH, WSL, Docker, remote workspace ou controle remoto do celular é iniciado ou modificado.